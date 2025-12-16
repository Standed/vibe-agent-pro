-- =============================================
-- Video Agent Pro - 用户和积分管理 SQL 脚本
-- =============================================
-- 此文件包含常用的用户管理和积分充值操作
-- 在 Supabase SQL Editor 中执行

-- =============================================
-- 1. 创建新用户（需要手动在 Supabase Auth 面板创建，这里仅供参考）
-- =============================================
-- 注意：Supabase 的 auth.users 表由系统管理，不建议直接 INSERT
-- 请通过 Supabase Dashboard > Authentication > Users > Add User 创建
-- 或通过 API 注册
--
-- 创建用户后，Profile 会自动创建（参见 schema.sql 的触发器）

-- =============================================
-- 2. 查询用户信息
-- =============================================

-- 2.1 查询所有用户（包含积分和角色）
SELECT
  id,
  email,
  full_name,
  role,
  credits,
  total_credits_purchased,
  is_active,
  created_at,
  last_login_at
FROM public.profiles
ORDER BY created_at DESC;

-- 2.2 查询指定邮箱的用户
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
WHERE email = 'user@example.com';  -- 替换为目标邮箱

-- 2.3 查询管理员用户
SELECT
  id,
  email,
  full_name,
  credits,
  created_at
FROM public.profiles
WHERE role = 'admin'
ORDER BY created_at DESC;

-- 2.4 查询 VIP 用户
SELECT
  id,
  email,
  full_name,
  credits,
  created_at
FROM public.profiles
WHERE role = 'vip'
ORDER BY created_at DESC;

-- =============================================
-- 3. 创建 Profile（如果用户已在 auth.users 但没有 profile）
-- =============================================

-- 3.1 为现有用户创建 Profile（指定邮箱）
INSERT INTO public.profiles (id, email, role, credits, full_name)
SELECT
  id,
  email,
  'user',  -- 默认角色：'user', 'vip', 'admin'
  60,      -- 默认积分
  COALESCE(raw_user_meta_data->>'full_name', email)
FROM auth.users
WHERE email = 'user@example.com'  -- 替换为目标邮箱
ON CONFLICT (id) DO NOTHING;

-- 3.2 批量为所有缺失 Profile 的用户创建
INSERT INTO public.profiles (id, email, role, credits, full_name)
SELECT
  u.id,
  u.email,
  'user',  -- 默认普通用户
  60,      -- 默认 60 积分
  COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- =============================================
-- 4. 充值积分
-- =============================================

-- 4.1 给指定邮箱的用户充值积分（带交易记录）
-- 方式1：使用事务（推荐）
DO $$
DECLARE
  target_user_id UUID;
  target_email TEXT := 'user@example.com';  -- 👈 修改目标邮箱
  add_amount INTEGER := 100;                 -- 👈 修改充值积分数
  admin_user_id UUID := NULL;                -- 👈 可选：操作的管理员 ID
  note TEXT := '管理员手动充值';              -- 👈 充值备注
  old_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- 获取用户 ID 和当前积分
  SELECT id, credits INTO target_user_id, old_balance
  FROM public.profiles
  WHERE email = target_email;

  -- 检查用户是否存在
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION '用户不存在: %', target_email;
  END IF;

  -- 计算新余额
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
    operation_type,
    admin_id,
    admin_note
  ) VALUES (
    target_user_id,
    'admin_grant',
    add_amount,
    old_balance,
    new_balance,
    note,
    'manual-recharge',
    admin_user_id,
    note
  );

  -- 输出结果
  RAISE NOTICE '✅ 充值成功: % (+% 积分) %->%', target_email, add_amount, old_balance, new_balance;
END $$;

-- 4.2 给多个用户批量充值（带交易记录）
DO $$
DECLARE
  user_record RECORD;
  add_amount INTEGER := 50;  -- 👈 修改充值积分数
  note TEXT := '活动赠送';     -- 👈 充值备注
  old_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- 遍历所有普通用户（role='user'）
  FOR user_record IN
    SELECT id, email, credits
    FROM public.profiles
    WHERE role = 'user' AND is_active = TRUE
  LOOP
    old_balance := user_record.credits;
    new_balance := old_balance + add_amount;

    -- 更新积分
    UPDATE public.profiles
    SET
      credits = new_balance,
      total_credits_purchased = total_credits_purchased + add_amount,
      updated_at = NOW()
    WHERE id = user_record.id;

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
      user_record.id,
      'admin_grant',
      add_amount,
      old_balance,
      new_balance,
      note,
      'batch-recharge'
    );

    RAISE NOTICE '✅ 充值: % (+% 积分) %->%', user_record.email, add_amount, old_balance, new_balance;
  END LOOP;
END $$;

-- =============================================
-- 5. 扣除积分
-- =============================================

-- 5.1 扣除指定用户积分（带交易记录）
DO $$
DECLARE
  target_user_id UUID;
  target_email TEXT := 'user@example.com';  -- 👈 修改目标邮箱
  deduct_amount INTEGER := 10;               -- 👈 修改扣除积分数
  reason TEXT := '管理员手动扣除';            -- 👈 扣除原因
  old_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- 获取用户 ID 和当前积分
  SELECT id, credits INTO target_user_id, old_balance
  FROM public.profiles
  WHERE email = target_email;

  -- 检查用户是否存在
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION '用户不存在: %', target_email;
  END IF;

  -- 检查积分是否足够
  IF old_balance < deduct_amount THEN
    RAISE EXCEPTION '积分不足: 当前 % 积分，需要扣除 % 积分', old_balance, deduct_amount;
  END IF;

  -- 计算新余额
  new_balance := old_balance - deduct_amount;

  -- 更新积分
  UPDATE public.profiles
  SET
    credits = new_balance,
    updated_at = NOW()
  WHERE id = target_user_id;

  -- 记录交易（amount 为负数）
  INSERT INTO public.credit_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    operation_type,
    admin_note
  ) VALUES (
    target_user_id,
    'consume',
    -deduct_amount,
    old_balance,
    new_balance,
    reason,
    'manual-deduct',
    reason
  );

  -- 输出结果
  RAISE NOTICE '✅ 扣除成功: % (-%d 积分) %->%', target_email, deduct_amount, old_balance, new_balance;
END $$;

-- =============================================
-- 6. 修改用户角色
-- =============================================

-- 6.1 将用户设置为管理员
UPDATE public.profiles
SET
  role = 'admin',
  updated_at = NOW()
WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- 6.2 将用户设置为 VIP
UPDATE public.profiles
SET
  role = 'vip',
  updated_at = NOW()
WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- 6.3 将用户降级为普通用户
UPDATE public.profiles
SET
  role = 'user',
  updated_at = NOW()
WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- 6.4 批量设置多个管理员
UPDATE public.profiles
SET
  role = 'admin',
  updated_at = NOW()
WHERE email IN (
  'admin1@example.com',
  'admin2@example.com'
  -- 添加更多邮箱
);

-- =============================================
-- 7. 禁用/启用用户
-- =============================================

-- 7.1 禁用用户
UPDATE public.profiles
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- 7.2 启用用户
UPDATE public.profiles
SET
  is_active = TRUE,
  updated_at = NOW()
WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- =============================================
-- 8. 查询积分交易记录
-- =============================================

-- 8.1 查询指定用户的所有交易记录
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
WHERE p.email = 'user@example.com'  -- 👈 替换为目标邮箱
ORDER BY t.created_at DESC
LIMIT 50;

-- 8.2 查询所有充值记录
SELECT
  t.id,
  p.email AS user_email,
  t.amount,
  t.balance_after,
  t.description,
  t.created_at
FROM public.credit_transactions t
JOIN public.profiles p ON t.user_id = p.id
WHERE t.transaction_type = 'admin_grant'
ORDER BY t.created_at DESC
LIMIT 100;

-- 8.3 查询所有消费记录
SELECT
  t.id,
  p.email AS user_email,
  t.amount,
  t.balance_after,
  t.operation_type,
  t.description,
  t.created_at
FROM public.credit_transactions t
JOIN public.profiles p ON t.user_id = p.id
WHERE t.transaction_type = 'consume'
ORDER BY t.created_at DESC
LIMIT 100;

-- 8.4 统计用户消费情况
SELECT
  p.email,
  p.role,
  p.credits AS current_credits,
  p.total_credits_purchased,
  COUNT(CASE WHEN t.transaction_type = 'consume' THEN 1 END) AS consume_count,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'consume' THEN ABS(t.amount) ELSE 0 END), 0) AS total_consumed,
  COALESCE(SUM(CASE WHEN t.transaction_type = 'admin_grant' THEN t.amount ELSE 0 END), 0) AS total_granted
FROM public.profiles p
LEFT JOIN public.credit_transactions t ON p.id = t.user_id
GROUP BY p.id, p.email, p.role, p.credits, p.total_credits_purchased
ORDER BY total_consumed DESC;

-- =============================================
-- 9. 重置用户积分
-- =============================================

-- 9.1 重置指定用户积分为初始值
UPDATE public.profiles
SET
  credits = 60,  -- 👈 修改为目标积分数
  updated_at = NOW()
WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- 9.2 批量重置所有普通用户积分
UPDATE public.profiles
SET
  credits = 60,  -- 👈 修改为目标积分数
  updated_at = NOW()
WHERE role = 'user';

-- =============================================
-- 10. 删除用户（谨慎操作！）
-- =============================================

-- 10.1 删除指定用户的 Profile（会级联删除所有关联数据）
-- 警告：此操作不可逆！
-- DELETE FROM public.profiles
-- WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- 10.2 完全删除用户（包括 auth.users）
-- 警告：此操作不可逆！需要管理员权限
-- DELETE FROM auth.users
-- WHERE email = 'user@example.com';  -- 👈 替换为目标邮箱

-- =============================================
-- 11. 快速操作模板
-- =============================================

-- 11.1 创建测试用户并充值
-- 步骤1: 在 Supabase Dashboard > Authentication > Users 创建用户
-- 步骤2: 执行以下 SQL 充值
DO $$
DECLARE
  target_email TEXT := 'test@example.com';  -- 👈 修改测试用户邮箱
  initial_credits INTEGER := 100;            -- 👈 初始积分
  user_role TEXT := 'user';                  -- 👈 角色：'user', 'vip', 'admin'
  target_user_id UUID;
BEGIN
  -- 获取用户 ID
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION '用户不存在: %', target_email;
  END IF;

  -- 创建或更新 Profile
  INSERT INTO public.profiles (id, email, role, credits)
  VALUES (target_user_id, target_email, user_role, initial_credits)
  ON CONFLICT (id) DO UPDATE
  SET
    role = user_role,
    credits = initial_credits,
    updated_at = NOW();

  RAISE NOTICE '✅ 测试用户已创建/更新: % (角色: %, 积分: %)', target_email, user_role, initial_credits;
END $$;

-- 11.2 查看当前系统统计
SELECT
  COUNT(*) AS total_users,
  COUNT(CASE WHEN role = 'admin' THEN 1 END) AS admin_count,
  COUNT(CASE WHEN role = 'vip' THEN 1 END) AS vip_count,
  COUNT(CASE WHEN role = 'user' THEN 1 END) AS user_count,
  COUNT(CASE WHEN is_active = FALSE THEN 1 END) AS inactive_count,
  SUM(credits) AS total_credits,
  AVG(credits)::INTEGER AS avg_credits
FROM public.profiles;

-- =============================================
-- 使用说明
-- =============================================
-- 1. 在 Supabase SQL Editor 中打开此文件
-- 2. 根据需要选择对应的 SQL 语句
-- 3. 修改标记为 👈 的参数（邮箱、积分数、角色等）
-- 4. 选中并执行
--
-- 常用操作：
-- - 创建用户: Supabase Dashboard > Authentication > Users > Add User
-- - 充值积分: 使用 4.1 脚本
-- - 修改角色: 使用 6.1-6.4 脚本
-- - 查看记录: 使用 2.1-2.4 和 8.1-8.4 脚本
