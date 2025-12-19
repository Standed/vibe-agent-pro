# Video Agent Pro - AGENTS 指南

AI 驱动的视频分镜生成与编辑工具 | Next.js 15.5.6 + React 19 + TypeScript 5.8.2

---

## 🚀 开发环境提示

### 启动与构建
- **开发模式**: `npm run dev` (启动 Turbopack，支持热重载，端口 3000)
- **⚠️ 不要在开发时运行 `npm run build`** - 这会切换到生产模式，破坏热重载
- **生产构建**: `npm run build` (仅在需要部署或类型检查时运行)
- **代码检查**: `npm run lint` (ESLint 规则检查)

### 核心架构速查

**🆕 请求取消与防重复提交**：
```typescript
// ✅ Agent 对话支持取消（通过 stop() 方法）
const { stop, sendMessage } = useAgent();

// ✅ 内部已集成防重复提交逻辑（2秒内相同消息哈希拦截）
// 实现于 src/hooks/useAgent.ts -> sendMessage
```

**数据操作必须通过 `dataService`**：
```typescript
// ✅ 正确：统一数据层，自动处理云端/本地同步
import { dataService } from '@/lib/dataService';
await dataService.saveProject(project);

// ❌ 错误：不要直接调用底层客户端
import { supabase } from '@/lib/supabase/client';
```

**🆕 认证与安全中间件 (src/lib/auth-middleware.ts)**：
```typescript
// 所有 AI API 路由必须调用 authenticateRequest
const authResult = await authenticateRequest(request);
if ('error' in authResult) return authResult.error;

// 该中间件会自动执行：
// 1. JWT Token 验证
// 2. 自动创建/关联 Profile
// 3. 白名单检查 (checkWhitelist)
// 4. 频率限制检查 (checkRateLimit)
```

**🆕 积分系统 (src/config/credits.ts)**：
```typescript
// ✅ 真实消耗标准（1 积分 ≈ 0.1 元）：
- GEMINI_GRID (所有尺寸): 20 积分
- GEMINI_IMAGE: 10 积分
- GEMINI_TEXT/ANALYZE: 3 积分
- SEEDREAM_GENERATE: 3 积分
- VOLCANO_VIDEO: 50 积分

// ✅ 角色策略：
- 管理员 (Admin): 免费 (ADMIN_FREE = true)
- VIP 用户: 8 折 (VIP_DISCOUNT_RATE = 0.8)
```

**🆕 管理员后台与白名单**：
```typescript
// ✅ 权限逻辑：
// 1. 优先检查 src/config/users.ts 中的 ADMIN_EMAILS（硬编码提权）
// 2. 其次检查数据库 profiles.role 字段

// ✅ 后台地址：/admin
// 包含：学员管理（白名单开关、手动充值）、反馈监控、全站统计
```

**🆕 反馈系统**：
```typescript
// ✅ 存储：error_reports 表
// ✅ 上下文：自动捕获 project_id, shot_id, browser_info, last_messages
```

### 关键设计决策
- **受控内测制**：默认注册用户无 AI 权限，需管理员在后台手动开启 `is_whitelisted`。
- **请求可取消**：所有长耗时 AI 请求（Grid/Video）必须支持 AbortSignal。
- **Grid 场景级**：Grid 生成是场景级别的，切片后手动分配给镜头。
- **状态自动保存**：Store 变更触发 800ms 防抖保存，无需手动 save。

### 文件快速定位
| 功能 | 文件路径 |
|------|---------|
| 状态管理 | `src/store/useProjectStore.ts` |
| 认证/白名单中间件 | `src/lib/auth-middleware.ts` |
| 积分配置 | `src/config/credits.ts` |
| 管理员后台 | `src/app/admin/page.tsx` |
| 数据服务层 | `src/lib/dataService.ts` |
| Agent 核心 | `src/hooks/useAgent.ts` & `src/services/agentService.ts` |
| 数据库结构 | `supabase/schema.sql` |
| 管理员名单 | `src/config/users.ts` |

---

## 📋 开发规范

### Commit 规范
- `feat`: 新功能 (如：添加白名单系统)
- `fix`: 修复 Bug (如：修复积分扣除延迟)
- `refactor`: 重构 (如：优化 Agent 思考链路)
- `docs`: 文档更新

### ⚠️ 严禁行为
- ❌ **严禁**在客户端直接暴露或使用 API Key。
- ❌ **严禁**跳过白名单检查直接调用 AI 接口。
- ❌ **严禁**直接修改 `project.chatHistory`（已迁移至云端 `chat_messages` 表）。
- ❌ **严禁**在 `useRequireAdmin` 中使用不稳定的对象引用（会导致无限请求循环）。

---

## 🎨 Jimeng Integration Details (即梦集成细节)

**参考来源**: `n8n-nodes-jimeng` (Reverse Engineered)

### 1. 核心依赖
- **crc-32**: 用于计算上传文件的 CRC32 校验和 (API 强制要求)。
- **image-size**: 用于获取上传图片的真实宽高 (API 强制要求)。
- **crypto**: Node.js 内置，用于 AWS V4 签名计算。

### 2. 图片上传流程 (必须步骤)
即梦不支持直接传入 URL，必须先将图片上传到其对象存储 (ImageX)。
流程如下：
1.  **下载**: 获取参考图 URL 的 Buffer 数据。
2.  **申请 (ApplyImageUpload)**: 调用 `/mweb/v1/get_upload_token` 获取 AWS V4 凭证，然后请求 `ApplyImageUpload` 获取上传地址 (`UploadHosts`, `StoreUri`, `Auth`)。
3.  **上传 (POST)**: 将二进制数据 POST 到上传地址，Header 需包含 `Authorization` 和 `Content-Crc32`。
4.  **提交 (CommitImageUpload)**: 调用 `CommitImageUpload` 确认上传，获取最终的 `Uri` (即 `uploadId`)。

### 3. 图生图 (Blend) 模式
当存在参考图时，必须使用 `blend` 模式构造请求，而非 `generate`。
- **Ability Key**: `"blend"`
- **Generate Type**: `"blend"`
- **Ability List**: 必须包含一个 `byte_edit` 类型的对象，其中 `image_uri_list` 和 `image_list` 指向上传后的 `uploadId`。
- **Prompt**: 插件逻辑会在 Prompt 后追加 `##`。

### 4. 签名算法
上传接口使用标准的 **AWS Signature Version 4** 算法。
- **Service**: `imagex`
- **Region**: `cn-north-1`
- **Headers**: 必须包含 `X-Amz-Date`, `X-Amz-Security-Token`, `X-Amz-Content-Sha256`。

**最后更新**: 2025-12-20
**版本**: v0.5.0 (Internal Beta Ready)
