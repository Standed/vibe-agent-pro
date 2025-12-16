--第一步：创建用户
--  - 访问 Supabase → Authentication → Users → Add User
--  - 邮箱：540606145@qq.com
--  - 密码：17600123764
--  - 勾选 "Auto Confirm User"

-- 直接在 Supabase SQL Editor 中执行这个脚本（会自动创建用户并充值）：


  -- =============================================
  -- 一键创建用户并充值 1000 积分
  -- 邮箱: 540606145@qq.com
  -- 密码: 17600123764
  -- 手机: 17600123764
  -- =============================================

  DO $$
  DECLARE
    target_email TEXT := '540606145@qq.com';
    target_phone TEXT := '17600123764';
    initial_credits INTEGER := 1000;
    user_role TEXT := 'user';  -- 可改为 'admin' 或 'vip'
    target_user_id UUID;
  BEGIN
    -- 步骤1: 从 auth.users 获取用户 ID
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE email = target_email;

    -- 步骤2: 如果用户不存在，提示先创建
    IF target_user_id IS NULL THEN
      RAISE EXCEPTION '❌ 用户不存在: %

  请先在 Supabase Dashboard 创建用户：
  1. 访问 Authentication > Users > Add User
  2. 邮箱: %
  3. 密码: 17600123764
  4. 勾选 "Auto Confirm User"
  5. 创建后再执行此脚本', target_email, target_email;
    END IF;

    -- 步骤3: 创建或更新 Profile
    INSERT INTO public.profiles (
      id,
      email,
      role,
      credits,
      total_credits_purchased,
      metadata,
      full_name
    ) VALUES (
      target_user_id,
      target_email,
      user_role,
      initial_credits,
      initial_credits,
      jsonb_build_object('phone', target_phone),
      target_email
    )
    ON CONFLICT (id) DO UPDATE
    SET
      role = user_role,
      credits = initial_credits,
      total_credits_purchased = public.profiles.total_credits_purchased + initial_credits,
      metadata = jsonb_build_object('phone', target_phone),
      updated_at = NOW();

    -- 步骤4: 记录充值交易
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
      'admin_grant',
      initial_credits,
      0,
      initial_credits,
      '管理员初始充值',
      'manual-recharge',
      FORMAT('新用户初始积分：%s 分', initial_credits)
    );

    -- 步骤5: 输出结果
    RAISE NOTICE '==================================';
    RAISE NOTICE '✅ 用户创建成功！';
    RAISE NOTICE '==================================';
    RAISE NOTICE '📧 邮箱: %', target_email;
    RAISE NOTICE '🔐 密码: 17600123764';
    RAISE NOTICE '📱 手机: %', target_phone;
    RAISE NOTICE '👤 角色: %', user_role;
    RAISE NOTICE '💰 积分: % 分', initial_credits;
    RAISE NOTICE '🆔 用户ID: %', target_user_id;
    RAISE NOTICE '==================================';
    RAISE NOTICE '🌐 登录地址: http://localhost:3000';
    RAISE NOTICE '==================================';
  END $$;



