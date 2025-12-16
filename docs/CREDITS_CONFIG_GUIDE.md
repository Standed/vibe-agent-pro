# 积分系统配置与管理指南

> Video Agent Pro - 完整的积分系统配置和用户管理文档

---

## 📋 目录

1. [环境变量配置](#环境变量配置)
2. [SQL 脚本使用](#sql-脚本使用)
3. [常见操作示例](#常见操作示例)
4. [最佳实践](#最佳实践)

---

## 🔧 环境变量配置

### 1. 积分系统配置

所有积分相关配置都支持通过环境变量覆盖，配置文件位于：
- **代码配置**: `src/config/credits.ts` 和 `src/config/users.ts`
- **环境变量**: `.env.local` (参考 `.env.example`)

### 2. 初始积分配置

在 `.env.local` 中添加以下配置：

```bash
# 不同角色的初始积分
INITIAL_CREDITS_ADMIN=1000    # 管理员初始积分（默认 1000）
INITIAL_CREDITS_VIP=500       # VIP 初始积分（默认 500）
INITIAL_CREDITS_USER=60       # 普通用户初始积分（默认 60）
```

### 3. 用户角色配置

```bash
# 管理员邮箱列表（逗号分隔）
ADMIN_EMAILS=admin1@example.com,admin2@example.com,admin3@example.com

# VIP 用户邮箱列表（逗号分隔）
VIP_EMAILS=vip1@example.com,vip2@example.com

# VIP 折扣率（0.8 = 8折）
VIP_DISCOUNT_RATE=0.8

# 管理员是否免费（true/false）
ADMIN_FREE=true
```

### 4. AI 操作积分消耗配置

每种 AI 操作的积分消耗都可以单独配置：

```bash
# Gemini 系列
CREDITS_GEMINI_GRID=10          # Grid 图片生成
CREDITS_GEMINI_IMAGE=8          # 单张图片生成
CREDITS_GEMINI_TEXT=2           # 文本生成

# SeeDream 系列
CREDITS_SEEDREAM_GENERATE=12    # SeeDream 图片生成
CREDITS_SEEDREAM_EDIT=10        # SeeDream 图片编辑

# 火山引擎系列
CREDITS_VOLCANO_VIDEO=50        # 视频生成
```

**支持的所有配置项**:
- `CREDITS_GEMINI_GRID` - Grid 图片生成 (默认 3x3)
- `CREDITS_GEMINI_GRID_2X2` - 2x2 Grid
- `CREDITS_GEMINI_GRID_3X3` - 3x3 Grid
- `CREDITS_GEMINI_IMAGE` - 单张图片生成
- `CREDITS_GEMINI_TEXT` - 文本生成
- `CREDITS_GEMINI_ANALYZE` - 图片分析
- `CREDITS_GEMINI_EDIT` - 图片编辑
- `CREDITS_SEEDREAM_GENERATE` - SeeDream 图片生成
- `CREDITS_SEEDREAM_EDIT` - SeeDream 图片编辑
- `CREDITS_VOLCANO_GENERATE` - 火山引擎图片生成
- `CREDITS_VOLCANO_VIDEO` - 视频生成
- `CREDITS_UPLOAD_PROCESS` - 图片上传处理
- `CREDITS_BATCH_OPERATION` - 批量操作

---

## 📊 SQL 脚本使用

### 1. 打开 SQL 编辑器

1. 访问 Supabase Dashboard: https://supabase.com/dashboard
2. 选择你的项目
3. 点击左侧菜单 "SQL Editor"
4. 打开 `supabase/user_management.sql` 文件内容

### 2. 常用 SQL 操作

#### 查询所有用户

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

#### 给用户充值积分

```sql
DO $$
DECLARE
  target_email TEXT := 'user@example.com';  -- 👈 修改为目标用户邮箱
  add_amount INTEGER := 100;                 -- 👈 修改充值积分数
  note TEXT := '管理员手动充值';
  target_user_id UUID;
  old_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- 获取用户信息
  SELECT id, credits INTO target_user_id, old_balance
  FROM public.profiles
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION '用户不存在: %', target_email;
  END IF;

  new_balance := old_balance + add_amount;

  -- 更新积分
  UPDATE public.profiles
  SET
    credits = new_balance,
    total_credits_purchased = total_credits_purchased + add_amount,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- 记录交易
  INSERT INTO public.credit_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    operation_type
  ) VALUES (
    target_user_id,
    'admin_grant',
    add_amount,
    old_balance,
    new_balance,
    note,
    'manual-recharge'
  );

  RAISE NOTICE '✅ 充值成功: % (+% 积分) %->%', target_email, add_amount, old_balance, new_balance;
END $$;
```

#### 修改用户角色

```sql
-- 设置为管理员
UPDATE public.profiles
SET role = 'admin', updated_at = NOW()
WHERE email = 'user@example.com';

-- 设置为 VIP
UPDATE public.profiles
SET role = 'vip', updated_at = NOW()
WHERE email = 'user@example.com';

-- 设置为普通用户
UPDATE public.profiles
SET role = 'user', updated_at = NOW()
WHERE email = 'user@example.com';
```

#### 查询用户交易记录

```sql
SELECT
  t.id,
  t.transaction_type,
  t.amount,
  t.balance_before,
  t.balance_after,
  t.description,
  t.operation_type,
  t.created_at,
  p.email AS user_email
FROM public.credit_transactions t
JOIN public.profiles p ON t.user_id = p.id
WHERE p.email = 'user@example.com'  -- 👈 修改为目标用户邮箱
ORDER BY t.created_at DESC
LIMIT 50;
```

---

## 🎯 常见操作示例

### 场景1: 创建新用户并充值

**步骤1**: 在 Supabase Dashboard 创建用户
1. 访问 `Authentication` > `Users`
2. 点击 `Add User`
3. 填写邮箱和密码
4. 点击 `Create User`

**步骤2**: 执行 SQL 充值
```sql
DO $$
DECLARE
  target_email TEXT := 'newuser@example.com';  -- 👈 新用户邮箱
  initial_credits INTEGER := 100;               -- 👈 初始积分
  user_role TEXT := 'user';                     -- 👈 角色
  target_user_id UUID;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION '用户不存在: %', target_email;
  END IF;

  -- 创建 Profile
  INSERT INTO public.profiles (id, email, role, credits)
  VALUES (target_user_id, target_email, user_role, initial_credits)
  ON CONFLICT (id) DO UPDATE
  SET
    role = user_role,
    credits = initial_credits,
    updated_at = NOW();

  RAISE NOTICE '✅ 用户已创建/更新: % (角色: %, 积分: %)', target_email, user_role, initial_credits;
END $$;
```

### 场景2: 批量充值所有用户

```sql
DO $$
DECLARE
  user_record RECORD;
  add_amount INTEGER := 50;  -- 👈 每人充值 50 积分
  note TEXT := '新年活动赠送';
BEGIN
  FOR user_record IN
    SELECT id, email, credits
    FROM public.profiles
    WHERE role = 'user' AND is_active = TRUE
  LOOP
    UPDATE public.profiles
    SET
      credits = credits + add_amount,
      total_credits_purchased = total_credits_purchased + add_amount,
      updated_at = NOW()
    WHERE id = user_record.id;

    INSERT INTO public.credit_transactions (
      user_id,
      transaction_type,
      amount,
      balance_before,
      balance_after,
      description,
      operation_type
    ) VALUES (
      user_record.id,
      'admin_grant',
      add_amount,
      user_record.credits,
      user_record.credits + add_amount,
      note,
      'batch-recharge'
    );

    RAISE NOTICE '✅ 充值: % (+% 积分)', user_record.email, add_amount;
  END LOOP;
END $$;
```

### 场景3: 查看系统统计

```sql
SELECT
  COUNT(*) AS total_users,
  COUNT(CASE WHEN role = 'admin' THEN 1 END) AS admin_count,
  COUNT(CASE WHEN role = 'vip' THEN 1 END) AS vip_count,
  COUNT(CASE WHEN role = 'user' THEN 1 END) AS user_count,
  SUM(credits) AS total_credits,
  AVG(credits)::INTEGER AS avg_credits,
  SUM(total_credits_purchased) AS total_purchased
FROM public.profiles;
```

### 场景4: 查询消费排行榜

```sql
SELECT
  p.email,
  p.role,
  p.credits AS current_credits,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'consume' THEN ABS(t.amount) ELSE 0 END), 0) AS total_consumed,
  COUNT(CASE WHEN t.transaction_type = 'consume' THEN 1 END) AS consume_count
FROM public.profiles p
LEFT JOIN public.credit_transactions t ON p.id = t.user_id
GROUP BY p.id, p.email, p.role, p.credits
ORDER BY total_consumed DESC
LIMIT 20;
```

---

## 💡 最佳实践

### 1. 环境变量管理

- ✅ **推荐**: 使用环境变量配置（灵活、不需要修改代码）
- ❌ **不推荐**: 直接修改 `src/config/*.ts` 文件（代码变更会丢失）

### 2. 角色管理

- **管理员**: 使用 `ADMIN_EMAILS` 环境变量管理，支持免费使用（可配置）
- **VIP**: 使用 `VIP_EMAILS` 环境变量管理，享受 8 折优惠（可配置）
- **普通用户**: 默认角色，按标准价格扣费

### 3. 积分充值策略

- **新用户**: 给予初始积分（通过环境变量配置）
- **活动赠送**: 使用批量充值 SQL（见场景2）
- **VIP 用户**: 设置更高的初始积分 + 折扣率

### 4. 监控与维护

定期检查系统状态：

```sql
-- 每日统计
SELECT
  DATE(created_at) AS date,
  COUNT(*) AS new_users,
  SUM(credits) AS initial_credits
FROM public.profiles
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 低余额用户（可能需要充值）
SELECT
  email,
  role,
  credits
FROM public.profiles
WHERE credits < 10 AND is_active = TRUE
ORDER BY credits ASC;
```

### 5. 安全建议

- ⚠️ **重要**: `SUPABASE_SERVICE_ROLE_KEY` 仅用于服务器端，不要暴露给前端
- ⚠️ **重要**: 执行删除操作前务必备份数据
- ✅ 定期备份 `profiles` 和 `credit_transactions` 表
- ✅ 使用 RLS (Row Level Security) 保护用户数据

---

## 📚 相关文件

- **SQL 脚本**: `supabase/user_management.sql`
- **数据库 Schema**: `supabase/schema.sql`
- **积分配置**: `src/config/credits.ts`
- **用户配置**: `src/config/users.ts`
- **环境变量示例**: `.env.example`
- **认证中间件**: `src/lib/auth-middleware.ts`

---

## 🆘 常见问题

### Q1: 如何修改默认积分消耗？

**A**: 在 `.env.local` 中添加对应的环境变量，例如：
```bash
CREDITS_GEMINI_IMAGE=5  # 将单图生成改为 5 积分
```

### Q2: 如何批量设置管理员？

**A**: 在 `.env.local` 中配置：
```bash
ADMIN_EMAILS=admin1@example.com,admin2@example.com,admin3@example.com
```

或使用 SQL：
```sql
UPDATE public.profiles
SET role = 'admin', updated_at = NOW()
WHERE email IN ('admin1@example.com', 'admin2@example.com');
```

### Q3: 如何重置用户积分？

**A**: 使用 SQL 更新：
```sql
UPDATE public.profiles
SET credits = 100, updated_at = NOW()
WHERE email = 'user@example.com';
```

### Q4: 如何查看详细的消费记录？

**A**: 查询 `credit_transactions` 表（参见 SQL 脚本第 8 节）

---

**维护者**: Claude Code Assistant
**最后更新**: 2025-12-16
**版本**: v1.0
