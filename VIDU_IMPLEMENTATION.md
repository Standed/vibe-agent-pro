# Vidu 视频生成集成 - 完整实现文档

## 📋 实现总结

已完成 Vidu 视频生成的完整集成，**复用现有 sora_tasks 表**，通过 `provider` 字段区分不同提供商，保持架构一致性和可扩展性。

---

## 🏗️ 统一架构设计

### 设计原则

1. **向后兼容**：现有 Sora 代码无需修改，provider 默认 'sora'
2. **最小侵入**：在现有 sora_tasks 表上扩展，不创建新表
3. **分库分表友好**：使用 `project_id + created_at` 作为潜在分片键
4. **一致性**：Vidu/Sora 共享相同的任务管理模式

### 数据库扩展

在 `sora_tasks` 表上添加两个字段：
```sql
ALTER TABLE public.sora_tasks 
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'sora';

ALTER TABLE public.sora_tasks 
  ADD COLUMN IF NOT EXISTS generation_params JSONB DEFAULT '{}'::jsonb;
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | 任务ID，由提供商返回 |
| `user_id` | UUID | 所有者，用于归属校验 |
| `project_id` | UUID | 项目ID，分片键候选 |
| `provider` | TEXT | 提供商：sora, vidu, jimeng, volcano, runway |
| `status` | TEXT | 状态：queued, processing, completed, failed, cancelled |
| `type` | TEXT | 类型：shot_generation, scene_video, character_reference |
| `model` | TEXT | 模型：sora-2, viduq2-pro-fast 等 |
| `target_duration` | INTEGER | 视频时长（秒） |
| `target_size` | TEXT | 分辨率 |
| `generation_params` | JSONB | 提供商特定参数 |
| `kaponai_url` | TEXT | 临时视频URL |
| `r2_url` | TEXT | R2 持久化URL |
| `point_cost` | INTEGER | 消耗积分 |

---

## ✅ 已修复的问题

### [High] 级别
1. ✅ **Pro Chat 不触发 Vidu** - 添加 viduHandler 参数
2. ✅ **Agent 工具不可达** - 添加工具定义和分发

### [Medium] 级别
3. ✅ **积分计算脱节** - 使用 CREDITS_CONFIG
4. ✅ **参数校验缺失** - 添加 duration/resolution 校验
5. ✅ **积分扣减失败不阻断** - 前置扣除积分
6. ✅ **任务归属未校验** - 所有API添加归属校验
7. ✅ **任务持久化缺失** - 复用 sora_tasks 表 + R2 转存
8. ✅ **start-end2video 在 Agent 会失败** - 移除该选项

### [Low] 级别
9. ✅ **日志泄露** - 移除敏感参数打印

---

## 📁 核心文件

### 新增文件
```
supabase/migrations/002_extend_sora_tasks_provider.sql  # 表扩展迁移
src/services/ViduTaskManager.ts                         # Vidu 任务管理器
src/services/ViduService.ts                             # Vidu API 封装
src/types/vidu.ts                                       # 类型定义
src/app/api/vidu/generate/route.ts                      # 生成API
src/app/api/vidu/status/route.ts                        # 状态查询API
src/app/api/vidu/cancel/route.ts                        # 取消API
```

### 修改文件
```
src/services/agentToolDefinitions.ts    # 添加工具定义
src/services/agentTools.ts              # 添加工具分发
src/services/tools/generationTools.ts   # 实现工具逻辑
src/hooks/chat/useChatGeneration.ts     # 添加 viduHandler
src/config/credits.ts                   # 积分配置
```

---

## 🔄 数据库迁移

执行以下 SQL（在 Supabase SQL Editor 中）：
```bash
supabase/migrations/002_extend_sora_tasks_provider.sql
```

**迁移内容**：
- 添加 `provider` 字段（默认 'sora'）
- 添加 `generation_params` JSONB 字段
- 添加复合索引（provider + status, provider + project_id）
- 添加完整字段注释
- 回填现有数据为 sora

**验证**：
```sql
SELECT provider, count(*) FROM sora_tasks GROUP BY provider;
-- 应该看到: sora | N (现有数量)
```

---

## 🎯 后续扩展

### 添加新提供商（如 RunwayGen3）
1. 更新 provider 约束：添加 'runway' 到 CHECK 约束
2. 创建 `src/services/RunwayTaskManager.ts`
3. 添加 API 路由 `src/app/api/runway/*`
4. 添加 Agent 工具定义
5. **无需创建新表**

### 分库分表（数据量 > 1000万时）

**方案 A：按 project_id 水平分片**
```sql
CREATE TABLE sora_tasks_shard_01 PARTITION OF sora_tasks
FOR VALUES WITH (MODULUS 4, REMAINDER 0);
```

**方案 B：按时间范围分区**
```sql
CREATE TABLE sora_tasks_2026_01 PARTITION OF sora_tasks
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

## 📊 积分计算

```typescript
// src/config/credits.ts
VIDU_VIDEO_720P_PER_SECOND: 2   // 720p 每秒 2 积分
VIDU_VIDEO_1080P_PER_SECOND: 4  // 1080p 每秒 4 积分
```

---

## 🔒 安全性

- **认证**：所有 API 需登录
- **归属校验**：任务操作验证 user_id
- **积分前置**：先扣积分后创建任务
- **RLS**：数据库行级安全

---

**版本**: 1.0.0  
**状态**: ✅ 核心功能已完成
