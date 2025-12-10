# 存储架构文档

## 📊 整体架构

```
┌──────────────────────────────────────────────────────┐
│                  Video Agent Pro                       │
└────────────────┬─────────────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌──────────┐          ┌──────────┐
│  Supabase │          │Cloudflare│
│ PostgreSQL│          │    R2    │
└──────────┘          └──────────┘
     │                     │
     ▼                     ▼
文字数据                媒体文件
- 项目信息              - 图片
- 场景数据              - 视频
- 镜头信息              - 音频
- 积分记录
- 用户数据
- 应用日志
```

---

## 🗄️ 数据存储策略

### 1. Supabase PostgreSQL（文本数据）

**存储内容：**
- ✅ 用户信息和认证数据
- ✅ 项目元数据（标题、描述、设置）
- ✅ 场景和镜头的文本描述
- ✅ 积分交易记录
- ✅ 应用日志（关键操作）

**优势：**
- 关系型数据库，适合结构化数据
- 自动备份和高可用
- 内置认证系统
- Row Level Security (RLS)
- 实时订阅功能

**成本：**
```
免费版: 500 MB 数据库
Pro版: 8 GB 数据库 (¥180/月)
```

**示例数据：**
```sql
-- projects 表
{
  id: "uuid",
  user_id: "uuid",
  title: "我的电影项目",
  description: "一部科幻电影",
  art_style: "赛博朋克",
  scene_count: 10,
  shot_count: 45
}

-- shots 表
{
  id: "uuid",
  scene_id: "uuid",
  shot_size: "Close-Up",
  description: "主角的特写镜头",
  reference_image: "https://r2.domain.com/xxx.jpg", // 指向 R2
  video_clip: "https://r2.domain.com/xxx.mp4"      // 指向 R2
}
```

---

### 2. Cloudflare R2（媒体文件）⭐推荐

**存储内容：**
- ✅ 所有图片（PNG, JPG, WebP）
- ✅ 所有视频（MP4, WebM）
- ✅ 所有音频（MP3, WAV, AAC）

**为什么选择 R2？**

1. **成本极低**
   ```
   存储: $0.015/GB/月 (约 ¥0.1/GB)

   对比 Supabase Storage:
   100 GB 视频
   - Supabase: ¥180/月 (包含在 Pro 套餐)
   - R2: $1.5/月 (约 ¥10/月)

   节省: ¥170/月！
   ```

2. **完全免费的出站流量**
   ```
   Supabase Storage: 250 GB/月 流量限制
   R2: 无限流量，完全免费！

   1 TB 视频播放流量:
   - Supabase: 超出部分需付费
   - R2: ¥0
   ```

3. **全球 CDN 加速**
   - 自动使用 Cloudflare 全球网络
   - 超低延迟
   - 自动缓存优化

4. **无限带宽**
   - 不限制并发请求
   - 适合视频流媒体

**文件组织结构：**
```
video-agent-media/  (R2 Bucket)
├── {userId}/
│   ├── projects/{projectId}/
│   │   ├── images/
│   │   │   ├── 1234567890.png
│   │   │   └── 1234567891.jpg
│   │   ├── videos/
│   │   │   ├── 1234567892.mp4
│   │   │   └── 1234567893.mp4
│   │   ├── grids/
│   │   │   └── 1234567894.png
│   │   └── audio/
│   │       ├── 1234567895.mp3
│   │       └── 1234567896.wav
│   └── characters/
│       └── 1234567897.png
```

**访问方式：**
```
公开 URL: https://media.your-domain.com/{userId}/projects/{projectId}/images/1234567890.png

或使用 R2.dev 域名: https://pub-xxxxx.r2.dev/{userId}/...
```

---

### 3. IndexedDB（本地模式）

**使用场景：**
- 游客模式（未登录用户）
- 离线编辑
- 临时存储

**存储内容：**
- 完整的 Project 对象
- Base64 编码的图片/视频

**优势：**
- 完全离线
- 无需登录
- 数据在本地浏览器

**劣势：**
- 换浏览器数据丢失
- 不能跨设备访问
- 存储空间有限（几百 MB）

---

## 📂 日志存储策略

### 推荐方案：分层存储

#### 1. 关键业务日志 → Supabase 表

**存储内容：**
- 用户登录/注册
- 积分充值/消费
- AI 生成操作（成功/失败）
- 文件上传记录

**数据表设计：**
```sql
CREATE TABLE application_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL, -- 'info', 'warn', 'error'
  category TEXT NOT NULL, -- 'auth', 'credits', 'ai_generation', etc.
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化查询
CREATE INDEX logs_user_id_idx ON application_logs(user_id, created_at DESC);
CREATE INDEX logs_category_idx ON application_logs(category);
CREATE INDEX logs_level_idx ON application_logs(level);
```

**查询示例：**
```sql
-- 查看用户的所有积分操作
SELECT * FROM application_logs
WHERE user_id = 'xxx' AND category = 'credits'
ORDER BY created_at DESC;

-- 查看所有 AI 生成失败
SELECT * FROM application_logs
WHERE category = 'ai_generation' AND level = 'error'
ORDER BY created_at DESC LIMIT 100;
```

**数据保留策略：**
```sql
-- 定期清理旧日志（保留 90 天）
DELETE FROM application_logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

#### 2. 错误追踪 → Sentry（可选）

**功能：**
- 自动捕获 JavaScript 错误
- 堆栈跟踪
- 用户上下文
- 错误聚合和去重
- 邮件/Slack 通知

**成本：**
```
免费版: 5000 错误/月
团队版: $26/月
```

**集成方式：**
```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});
```

#### 3. 性能监控 → Vercel Analytics

**功能：**
- 页面加载时间
- Core Web Vitals
- 用户访问统计
- 流量分析

**成本：**
```
Hobby: 免费（有限功能）
Pro: 包含在 Vercel Pro ($20/月)
```

#### 4. 用户行为分析 → PostHog（可选）

**功能：**
- 用户行为追踪
- 漏斗分析
- Session 回放
- Feature Flags

**成本：**
```
免费版: 1M 事件/月
付费版: $0.000225/事件
```

---

## 🔄 数据流示例

### 场景 1：用户上传图片

```
1. 用户在前端选择图片
   ↓
2. storageService.uploadFile(file)
   ↓
3. 检查用户是否登录
   ├─ 未登录 → 转换为 Base64 Data URL → 存入 IndexedDB
   └─ 已登录 → 上传到 Cloudflare R2 → 返回公开 URL
   ↓
4. 将 URL 存入 Supabase shots 表的 reference_image 字段
   ↓
5. 记录日志：logger.logFileUpload('image', fileSize, 'r2', true)
```

### 场景 2：用户生成 Grid

```
1. 用户点击"生成 Grid"
   ↓
2. 检查积分是否足够
   ├─ 不足 → 提示充值 → 结束
   └─ 足够 → 继续
   ↓
3. 调用 consumeCredits(10, 'generate-grid-3x3')
   ├─ 扣除积分
   ├─ 记录 credit_transactions 表
   └─ 记录日志：logger.logCreditsOperation('consume', 10, balance)
   ↓
4. 调用 Gemini API 生成 Grid
   ├─ 成功 →
   │   ├─ 上传到 R2
   │   ├─ URL 存入 Supabase
   │   └─ logger.logAIGeneration('grid-3x3', 10, true)
   └─ 失败 →
       ├─ logger.logAIGeneration('grid-3x3', 10, false, { error })
       └─ （可选）退还积分
```

### 场景 3：数据迁移（游客 → 登录）

```
1. 游客创建了 5 个项目（存在 IndexedDB）
   ↓
2. 用户注册并登录
   ↓
3. 显示迁移提示："发现 5 个本地项目，是否迁移到云端？"
   ↓
4. 用户点击"迁移"
   ↓
5. migrationService.migrateToCloud()
   ├─ 遍历所有本地项目
   ├─ 上传所有 Base64 图片到 R2
   ├─ 保存项目数据到 Supabase
   └─ 显示进度："正在迁移项目 3/5..."
   ↓
6. 迁移完成
   ├─ logger.log('info', 'system', '数据迁移完成', { projectCount: 5 })
   └─ 提示用户："迁移成功！是否删除本地数据？"
```

---

## 💰 成本对比

### 假设：100 用户，每人 10 个项目，每项目 50 MB 媒体文件

**总存储需求：**
- 文本数据：~50 MB（Supabase）
- 媒体文件：50 GB（R2）

**方案 A：全用 Supabase**
```
Supabase Pro: ¥180/月
- 8 GB 数据库（够用）
- 100 GB 存储（够用）
- 250 GB 流量（可能不够）

预估成本: ¥180-¥300/月
```

**方案 B：Supabase + Cloudflare R2（推荐）**
```
Supabase Free: ¥0/月
- 500 MB 数据库（够用）
- 不存储媒体文件

Cloudflare R2: ¥3.5/月
- 50 GB × $0.015 = $0.75/月
- 无限流量

总成本: ¥3.5/月
节省: ¥176.5/月！
```

---

## 📋 部署清单

### Supabase 配置

- [ ] 创建 Supabase 项目
- [ ] 执行 `supabase/schema.sql` 创建表
- [ ] 配置 RLS 策略
- [ ] 创建 application_logs 表（日志）
- [ ] 创建管理员账号
- [ ] 获取 API keys

### Cloudflare R2 配置

- [ ] 注册 Cloudflare 账号
- [ ] 启用 R2
- [ ] 创建 bucket: `video-agent-media`
- [ ] 生成 R2 API Token
  - 权限：Object Read & Write
- [ ] 配置自定义域名（可选）
  - 或使用 R2.dev 公开域名
- [ ] 配置 CORS 策略

**CORS 配置示例：**
```json
[
  {
    "AllowedOrigins": ["https://your-domain.com"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 环境变量配置

- [ ] 复制 `.env.example` 为 `.env.local`
- [ ] 填入 Supabase URL 和 Keys
- [ ] 填入 R2 凭证和 Endpoint
- [ ] 填入 Gemini/Volcano API Keys
- [ ] （可选）配置 Sentry DSN

### 代码部署

- [ ] 更新 `app/layout.tsx` 添加 AuthProvider
- [ ] 替换数据访问代码使用 `dataService`
- [ ] 测试文件上传到 R2
- [ ] 测试积分系统
- [ ] 部署到 Vercel

---

## 🔐 安全建议

1. **R2 凭证安全**
   - ❌ 不要将 R2 API Key 暴露给前端
   - ✅ 通过 API Route 代理上传
   - ✅ 使用环境变量存储凭证

2. **文件访问控制**
   - 按用户 ID 组织文件夹
   - 检查上传者身份
   - 限制文件大小（例如：图片 10MB，视频 100MB）

3. **防止滥用**
   - 限制上传频率
   - 检查文件类型
   - 病毒扫描（生产环境）

4. **数据备份**
   - Supabase 自动备份（Pro 版）
   - R2 定期导出（可选）

---

## 📚 相关文档

- [Cloudflare R2 官方文档](https://developers.cloudflare.com/r2/)
- [Supabase Storage 文档](https://supabase.com/docs/guides/storage)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

---

## ✅ 总结

**推荐架构：**
```
文字数据 → Supabase PostgreSQL (免费/¥180)
媒体文件 → Cloudflare R2 (¥3-10/月)
日志 → Supabase 表 + Sentry (可选)
```

**优势：**
- 成本最低（可能仅 ¥3/月）
- 性能最优（全球 CDN）
- 扩展性强（无限流量）
- 易于维护（托管服务）

**实施建议：**
1. 先用免费版测试（Supabase Free + R2）
2. 有付费用户后升级 Supabase Pro
3. 媒体文件始终用 R2（成本优势明显）
