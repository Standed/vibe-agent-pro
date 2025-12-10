# 配置指南 - Cloudflare R2 和 Supabase

本指南将帮助你完成 Cloudflare R2 和 Supabase 的完整配置，为生产环境做好准备。

---

## 📋 前置准备

- ✅ Cloudflare 账号（免费即可）
- ✅ Supabase 账号（免费即可）
- ✅ 本项目代码已克隆到本地
- ✅ Node.js 18+ 已安装

---

## 🗄️ 步骤 1: 配置 Supabase

### 1.1 创建 Supabase 项目

1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 点击 "New Project"
3. 填写项目信息：
   - **Project Name**: `vibe-agent-pro`
   - **Database Password**: 设置一个强密码（请妥善保存）
   - **Region**: 选择离你最近的区域（推荐：Tokyo 或 Singapore）
   - **Pricing Plan**: Free（免费版）
4. 点击 "Create new project"
5. 等待 2-3 分钟项目创建完成

### 1.2 获取 API 密钥

1. 在项目首页，点击左侧菜单的 "Settings" → "API"
2. 复制以下信息：
   - **Project URL**: `https://your-project.supabase.co`
   - **anon public key**: `eyJhbGc...`（公开密钥，用于前端）
   - **service_role key**: `eyJhbGc...`（服务端密钥，保密！）

### 1.3 执行数据库 Schema

1. 在 Supabase Dashboard，点击左侧 "SQL Editor"
2. 点击 "New Query"
3. 打开本地项目的 `supabase/schema.sql` 文件
4. 将**完整内容**复制粘贴到 SQL 编辑器
5. 点击 "Run" 执行
6. 确认没有错误，应该看到：
   ```
   Success. No rows returned
   ```

### 1.4 创建 Storage Buckets（可选，主要用 R2）

1. 点击左侧 "Storage"
2. 点击 "Create bucket"
3. 创建以下 buckets：
   - `media`（公开）- 备用存储
   - `avatars`（公开）- 用户头像
   - `audio`（公开）- 音频文件

> **注意**: 由于我们主要使用 Cloudflare R2 存储媒体文件，这些 buckets 主要作为备用。

### 1.5 配置 Row Level Security (RLS)

RLS 策略已在 `schema.sql` 中定义，执行后自动生效。验证方法：

1. 在 "Authentication" → "Policies" 中
2. 确认所有表都有对应的 RLS 策略

### 1.6 创建管理员账号（测试用）

1. 在 "Authentication" → "Users" 中
2. 点击 "Add user"
3. 填写邮箱和密码
4. 用户创建后，复制用户的 `id`
5. 在 "SQL Editor" 中执行：
   ```sql
   UPDATE profiles
   SET is_admin = true, credits = 1000
   WHERE id = 'your-user-id-here';
   ```

---

## ☁️ 步骤 2: 配置 Cloudflare R2

### 2.1 启用 R2

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击左侧 "R2"
3. 如果是首次使用，点击 "Purchase R2"（免费，只需绑定信用卡）
4. 阅读并接受条款

### 2.2 创建 R2 Bucket

1. 在 R2 页面，点击 "Create bucket"
2. 填写 Bucket 信息：
   - **Bucket Name**: `vibe-agent-media`
   - **Location**: Automatic（自动选择最优位置）
3. 点击 "Create bucket"

### 2.3 配置 CORS 策略

1. 点击刚创建的 bucket
2. 点击 "Settings" 标签
3. 滚动到 "CORS Policy"
4. 点击 "Add CORS policy"
5. 粘贴以下配置：

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> **生产环境注意**: 将 `AllowedOrigins` 改为你的实际域名，例如 `["https://your-domain.com"]`

### 2.4 生成 R2 API Token

1. 回到 R2 首页，点击右上角 "Manage R2 API Tokens"
2. 点击 "Create API Token"
3. 填写 Token 信息：
   - **Token Name**: `vibe-agent-api`
   - **Permissions**: Object Read & Write
   - **TTL**: Never expires（永不过期）
   - **Apply to specific buckets only**: 选择 `vibe-agent-media`
4. 点击 "Create API Token"
5. **重要**: 复制并保存以下信息（关闭后无法再查看）：
   - **Access Key ID**: `xxx`
   - **Secret Access Key**: `xxx`
   - **Endpoint**: `https://xxx.r2.cloudflarestorage.com`

### 2.5 配置公开访问域名

有两种方式：

#### 方式 A: 使用 R2.dev 域名（推荐测试环境）

1. 在 Bucket 页面，点击 "Settings"
2. 找到 "Public R2.dev Bucket URL"
3. 点击 "Allow Access"
4. 复制生成的公开 URL：`https://pub-xxxxx.r2.dev`

#### 方式 B: 使用自定义域名（推荐生产环境）

1. 确保你有一个域名托管在 Cloudflare
2. 在 Bucket 页面，点击 "Settings"
3. 滚动到 "Custom Domains"
4. 点击 "Connect Domain"
5. 输入子域名，例如：`media.your-domain.com`
6. 等待 DNS 记录自动配置（1-2 分钟）
7. 使用这个自定义域名作为 `NEXT_PUBLIC_R2_PUBLIC_URL`

---

## 🔧 步骤 3: 配置环境变量

### 3.1 创建 .env.local 文件

在项目根目录，复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

### 3.2 填写配置信息

打开 `.env.local`，填入你在前面步骤获取的信息：

```bash
# ===================================
# Supabase 配置
# ===================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # 从步骤 1.2 获取
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...      # 从步骤 1.2 获取（保密！）

# ===================================
# Cloudflare R2 配置
# ===================================
R2_BUCKET_NAME=vibe-agent-media
R2_ACCESS_KEY_ID=xxx                      # 从步骤 2.4 获取
R2_SECRET_ACCESS_KEY=xxx                  # 从步骤 2.4 获取
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com  # 从步骤 2.4 获取
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-xxxxx.r2.dev  # 从步骤 2.5 获取

# ===================================
# Gemini API (视频多视图生成)
# ===================================
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here

# ===================================
# Volcano Engine API (视频生成)
# ===================================
NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_api_key_here
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
NEXT_PUBLIC_SEEDREAM_MODEL_ID=your_model_id
NEXT_PUBLIC_SEEDANCE_MODEL_ID=your_model_id
NEXT_PUBLIC_DOUBAO_MODEL_ID=your_model_id
```

### 3.3 验证配置

创建测试脚本 `scripts/test-config.js`：

```javascript
// scripts/test-config.js
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

async function testSupabase() {
  console.log('🧪 测试 Supabase 连接...');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.from('profiles').select('count');

  if (error) {
    console.error('❌ Supabase 连接失败:', error.message);
  } else {
    console.log('✅ Supabase 连接成功！');
  }
}

async function testR2() {
  console.log('🧪 测试 R2 配置...');

  const required = [
    'R2_BUCKET_NAME',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_ENDPOINT',
    'NEXT_PUBLIC_R2_PUBLIC_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ R2 配置缺失:', missing.join(', '));
  } else {
    console.log('✅ R2 配置完整！');
  }
}

testSupabase();
testR2();
```

运行测试：

```bash
node scripts/test-config.js
```

---

## 🚀 步骤 4: 本地测试

### 4.1 安装依赖

```bash
npm install
```

### 4.2 启动开发服务器

```bash
npm run dev
```

### 4.3 测试功能

1. **测试用户注册/登录**
   - 访问 `http://localhost:3000/auth/register`
   - 注册一个新账号
   - 登录成功后应该看到项目列表

2. **测试积分系统**
   - 访问 `http://localhost:3000/admin`
   - 使用管理员账号登录
   - 为用户充值积分

3. **测试项目创建**
   - 回到首页，创建一个新项目
   - 检查是否保存到 Supabase（应该在 `projects` 表中看到数据）

4. **测试文件上传**
   - 在项目编辑器中，尝试上传一张图片
   - 检查是否上传到 R2（在 Cloudflare Dashboard 的 R2 bucket 中查看）

5. **测试 Grid 生成（需要 Gemini API）**
   - 创建一个场景
   - 生成 2x2 或 3x3 Grid
   - 检查是否消耗积分
   - 检查日志是否记录（在 `application_logs` 表中）

6. **测试数据迁移**
   - 登出，创建一个本地项目（游客模式）
   - 登录，查看是否提示迁移本地数据

---

## 📦 步骤 5: 部署到 Vercel

### 5.1 连接 GitHub

1. 将代码推送到 GitHub
2. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
3. 点击 "Add New" → "Project"
4. 导入你的 GitHub 仓库

### 5.2 配置环境变量

在 Vercel 项目设置中，添加所有环境变量：

1. 点击 "Settings" → "Environment Variables"
2. 逐个添加 `.env.local` 中的所有变量
3. **重要**: 不要添加以 `#` 开头的注释行

### 5.3 部署

1. 点击 "Deploy"
2. 等待部署完成（约 2-3 分钟）
3. 访问生成的 URL 测试功能

### 5.4 配置自定义域名（可选）

1. 在 Vercel 项目设置中，点击 "Domains"
2. 添加你的自定义域名
3. 按照提示配置 DNS 记录

---

## 🔐 安全检查清单

部署前请确认：

- ✅ `.env.local` 已添加到 `.gitignore`（不要提交到 Git）
- ✅ `SUPABASE_SERVICE_ROLE_KEY` 只在服务端使用（API Routes）
- ✅ R2 API Token 只在服务端使用
- ✅ Supabase RLS 策略已启用
- ✅ R2 CORS 配置已限制为你的域名（生产环境）
- ✅ 所有密钥都已在 Vercel 环境变量中设置

---

## 📊 成本预估

### 免费额度

- **Supabase Free**:
  - 500 MB 数据库
  - 1 GB 文件存储（备用）
  - 50,000 月活跃用户

- **Cloudflare R2**:
  - 10 GB 存储免费
  - 免费 Class A 操作：100万次/月
  - 免费 Class B 操作：1000万次/月
  - **无限出站流量（完全免费）**

### 超出免费额度后

假设 100 用户，每人 10 个项目，每项目 50 MB 媒体文件：

- **存储需求**: 50 GB
- **R2 成本**: $0.75/月（50 GB × $0.015）
- **Supabase**: 免费版足够（文本数据 < 100 MB）
- **总计**: **约 $1/月**

---

## 🆘 常见问题

### Q1: Supabase 连接失败

**A**: 检查：
1. 项目 URL 是否正确（需要包含 `https://`）
2. API Key 是否完整复制（长度约 100+ 字符）
3. 是否执行了 `schema.sql`

### Q2: R2 上传失败

**A**: 检查：
1. API Token 权限是否包含 "Object Read & Write"
2. CORS 配置是否正确
3. Endpoint URL 是否正确（需要包含 account ID）

### Q3: 图片无法显示

**A**: 检查：
1. R2 公开访问是否已启用
2. `NEXT_PUBLIC_R2_PUBLIC_URL` 是否正确
3. 浏览器控制台是否有 CORS 错误

### Q4: 积分系统不工作

**A**: 检查：
1. RLS 策略是否已启用
2. 用户是否已登录
3. `consume_credits` RPC 函数是否已创建

### Q5: 本地测试正常，部署后失败

**A**: 检查：
1. Vercel 环境变量是否都已设置
2. 是否有语法错误导致构建失败
3. 查看 Vercel 部署日志

---

## 📚 下一步

配置完成后，你可以：

1. ✅ 查看 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 了解部署最佳实践
2. ✅ 查看 [STORAGE_ARCHITECTURE.md](./STORAGE_ARCHITECTURE.md) 了解存储架构
3. ✅ 查看 [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) 了解代码集成
4. ✅ 开始邀请用户测试你的应用！

---

## 💡 提示

- 定期备份 Supabase 数据库（Pro 版自动备份）
- 监控 R2 使用量（Cloudflare Dashboard）
- 设置 Supabase 邮件通知（用户注册、密码重置等）
- 考虑添加 Sentry 进行错误追踪

祝你部署顺利！🎉
