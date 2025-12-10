# Supabase 配置指南

## 📋 快速开始

### 步骤 1: 创建 Supabase 项目

1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 点击 "New Project"
3. 填写信息：
   - Name: `video-agent-pro`
   - Database Password: 生成一个强密码并保存
   - Region: 选择离你最近的区域（推荐：Singapore 或 Tokyo）
4. 等待项目创建完成（约 2 分钟）

### 步骤 2: 执行数据库架构

1. 进入项目后，点击左侧菜单 **SQL Editor**
2. 点击 **New Query**
3. 复制 `supabase/schema.sql` 的全部内容
4. 粘贴到编辑器中
5. 点击 **Run** 执行

执行成功后，你会看到以下表格已创建：
- ✅ profiles (用户信息)
- ✅ credit_transactions (积分交易记录)
- ✅ projects (项目)
- ✅ scenes (场景)
- ✅ shots (镜头)
- ✅ characters (角色)
- ✅ audio_assets (音频资源)
- ✅ admin_logs (管理员日志)

### 步骤 3: 配置 Storage Buckets

1. 点击左侧菜单 **Storage**
2. 创建以下 buckets:

#### 3.1 创建 `media` bucket (存储图片和视频)

```sql
-- Bucket 名称: media
-- Public: true
```

**设置访问策略:**

进入 `media` bucket 的 Policies 标签，添加以下策略：

```sql
-- 策略名称: Users can upload to their own folder
-- 操作: INSERT
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 策略名称: Users can view own files
-- 操作: SELECT
CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 策略名称: Users can delete own files
-- 操作: DELETE
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 策略名称: Public read access
-- 操作: SELECT
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');
```

#### 3.2 创建 `avatars` bucket (存储用户头像)

```sql
-- Bucket 名称: avatars
-- Public: true
```

**设置访问策略:**

```sql
-- 用户可以上传自己的头像
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND name = auth.uid()::text || '.jpg' -- 或其他格式
);

-- 用户可以更新自己的头像
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND name = auth.uid()::text || '.jpg'
);

-- 公开读取
CREATE POLICY "Public avatar read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

#### 3.3 创建 `audio` bucket (存储音频文件)

```sql
-- Bucket 名称: audio
-- Public: true
```

**设置访问策略:**（同 media bucket）

### 步骤 4: 配置 Authentication

1. 点击左侧菜单 **Authentication** -> **Providers**
2. 启用 Email provider:
   - Enable Email provider: ✅
   - Confirm email: ✅ (推荐开启邮箱验证)
   - Secure email change: ✅
3. （可选）配置其他登录方式:
   - Google OAuth
   - GitHub OAuth
   - 微信登录（需要第三方服务）

### 步骤 5: 配置触发器（重要！）

1. 点击左侧菜单 **Database** -> **Triggers**
2. 点击 **Create a new trigger**
3. 配置：
   - Name: `on_auth_user_created`
   - Table: `auth.users`
   - Events: `INSERT`
   - Type: `After`
   - Orientation: `Row`
   - Function: `public.handle_new_user()`

这个触发器会在用户注册时自动在 `profiles` 表中创建记录。

### 步骤 6: 创建管理员账号

#### 方法 1: 通过 Dashboard

1. 点击 **Authentication** -> **Users**
2. 点击 **Add user**
3. 填写：
   - Email: `admin@vibeagent.com` (改成你的邮箱)
   - Password: 设置一个强密码
   - Auto confirm: ✅
4. 点击 **Create user**

#### 方法 2: 通过 SQL

```sql
-- 首先在 Authentication 中创建用户，然后执行：
UPDATE public.profiles
SET
  role = 'admin',
  credits = 100000, -- 给管理员一些测试积分
  full_name = '系统管理员'
WHERE email = 'admin@vibeagent.com';
```

### 步骤 7: 获取项目凭证

1. 点击左侧菜单 **Settings** -> **API**
2. 复制以下信息：
   - Project URL: `https://xxxxx.supabase.co`
   - `anon` `public` key: `eyJhbGc...` (公开密钥)
   - `service_role` `secret` key: `eyJhbGc...` (服务端密钥，保密！)

3. 创建 `.env.local` 文件：

```bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...你的anon key...

# 服务端密钥（用于 API Routes，不要暴露给前端）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...你的service role key...

# Gemini API（已有）
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_key

# Volcano Engine API（已有）
NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_key
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxx
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxx
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxx
```

### 步骤 8: 测试数据库连接

在 SQL Editor 中执行以下测试查询：

```sql
-- 查看所有表
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 查看 profiles 表
SELECT * FROM public.profiles;

-- 测试积分函数
SELECT public.get_user_credits('你的用户UUID');
```

## 🔧 常用管理 SQL

### 查看所有用户及其积分

```sql
SELECT
  id,
  email,
  full_name,
  role,
  credits,
  total_credits_purchased,
  is_active,
  created_at
FROM public.profiles
ORDER BY created_at DESC;
```

### 手动给用户充值积分

```sql
-- 方法 1: 使用 RPC 函数（推荐）
SELECT public.grant_credits(
  '用户UUID'::uuid,
  1000, -- 充值数量
  '管理员UUID'::uuid,
  '微信转账充值 - 订单号: WX123456'
);

-- 方法 2: 直接更新（不推荐，缺少日志）
UPDATE public.profiles
SET
  credits = credits + 1000,
  total_credits_purchased = total_credits_purchased + 1000
WHERE email = 'user@example.com';
```

### 查看用户积分消费记录

```sql
SELECT
  ct.*,
  p.email,
  p.full_name
FROM public.credit_transactions ct
JOIN public.profiles p ON p.id = ct.user_id
WHERE ct.user_id = '用户UUID'
ORDER BY ct.created_at DESC;
```

### 查看所有充值记录

```sql
SELECT
  ct.created_at,
  p.email,
  ct.amount,
  ct.balance_after,
  admin.email as admin_email,
  ct.admin_note
FROM public.credit_transactions ct
JOIN public.profiles p ON p.id = ct.user_id
LEFT JOIN public.profiles admin ON admin.id = ct.admin_id
WHERE ct.transaction_type = 'admin_grant'
ORDER BY ct.created_at DESC;
```

### 查看管理员操作日志

```sql
SELECT
  al.created_at,
  admin.email as admin_email,
  al.action,
  target.email as target_user,
  al.details
FROM public.admin_logs al
JOIN public.profiles admin ON admin.id = al.admin_id
LEFT JOIN public.profiles target ON target.id = al.target_user_id
ORDER BY al.created_at DESC
LIMIT 50;
```

### 封禁/解封用户

```sql
-- 封禁用户
UPDATE public.profiles
SET is_active = FALSE
WHERE email = 'user@example.com';

-- 解封用户
UPDATE public.profiles
SET is_active = TRUE
WHERE email = 'user@example.com';
```

### 统计数据

```sql
-- 用户总数和积分统计
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
  COUNT(CASE WHEN role = 'vip' THEN 1 END) as vip_count,
  SUM(credits) as total_credits,
  SUM(total_credits_purchased) as total_purchased,
  AVG(credits) as avg_credits_per_user
FROM public.profiles
WHERE is_active = TRUE;

-- 今日新增用户
SELECT COUNT(*)
FROM public.profiles
WHERE created_at >= CURRENT_DATE;

-- 本月积分消费统计
SELECT
  DATE(created_at) as date,
  COUNT(*) as transaction_count,
  SUM(ABS(amount)) as total_consumed
FROM public.credit_transactions
WHERE
  transaction_type = 'consume'
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## 🔐 安全建议

### 1. Row Level Security (RLS)

已经为所有表启用了 RLS，确保用户只能访问自己的数据。

**测试 RLS:**

```sql
-- 以某个用户身份执行查询（在 SQL Editor 中模拟）
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO '用户UUID';

-- 尝试查询，应该只能看到自己的数据
SELECT * FROM public.projects;

-- 重置
RESET role;
```

### 2. API Keys 管理

- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` 可以暴露给前端
- ❌ `SUPABASE_SERVICE_ROLE_KEY` **绝对不能暴露**，仅在服务端使用

### 3. Storage 安全策略

- 文件按用户 ID 分文件夹存储：`media/{userId}/...`
- 用户只能访问自己的文件夹
- 公开文件使用公开 bucket

### 4. 定期备份

Supabase Pro 计划提供自动备份，免费版需要手动备份：

```bash
# 导出数据库
supabase db dump > backup.sql

# 或使用 pg_dump
pg_dump "postgres://postgres:[密码]@db.[项目ID].supabase.co:5432/postgres" > backup.sql
```

## 📊 监控和日志

### 在 Supabase Dashboard 中查看

1. **API Logs**: 查看 API 调用情况
2. **Database Logs**: 查看数据库查询
3. **Auth Logs**: 查看登录/注册记录
4. **Storage Logs**: 查看文件上传/下载

### 设置告警

在 **Settings** -> **Integrations** 中可以配置：
- Slack 通知
- Webhook
- Email 告警

## ❓ 常见问题

### Q1: 触发器没有自动创建 profile？

**解决方案:**
```sql
-- 检查触发器是否存在
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- 如果不存在，手动创建
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Q2: RLS 导致无法查询数据？

**解决方案:**
- 确保用户已登录（`auth.uid()` 有值）
- 检查策略是否正确
- 使用 `service_role` key 可以绕过 RLS（仅限服务端）

### Q3: Storage 上传失败？

**解决方案:**
- 检查 bucket 是否创建
- 检查文件路径是否符合策略
- 检查文件大小限制（免费版 50MB）

## 🎯 下一步

1. ✅ 数据库架构已创建
2. ⏭️ 安装 Supabase 客户端库
3. ⏭️ 实现用户认证
4. ⏭️ 实现积分系统
5. ⏭️ 创建管理员后台

继续查看 `IMPLEMENTATION_GUIDE.md` 了解如何在代码中集成 Supabase。
