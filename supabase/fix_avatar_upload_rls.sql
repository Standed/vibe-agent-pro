-- =============================================
-- 修复 Profiles 表 RLS 策略 - 允许用户更新头像
-- =============================================
-- 
-- 问题: 现有的 UPDATE 策略过于严格,导致用户无法更新 avatar_url
-- 解决: 删除旧策略,创建新策略,明确允许更新基本字段
--
-- 执行方式: 在 Supabase Dashboard 的 SQL Editor 中执行此脚本
-- =============================================

-- 1. 删除旧的限制性 UPDATE 策略
DROP POLICY IF EXISTS "Users can update own profile (limited fields)" ON public.profiles;

-- 2. 创建新的 UPDATE 策略 - 允许更新基本字段,保护敏感字段
CREATE POLICY "Users can update own basic profile fields"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  -- 确保不能修改敏感字段 (使用 SECURITY DEFINER 函数避免 RLS 递归)
  AND role = public.get_profile_role(auth.uid())
  AND credits = public.get_profile_credits(auth.uid())
  AND is_whitelisted = (
    SELECT is_whitelisted FROM public.profiles WHERE id = auth.uid()
  )
  -- ✅ 允许更新这些字段: avatar_url, full_name, metadata, last_login_at 等
);

-- 3. 验证策略已创建
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'profiles' 
AND policyname = 'Users can update own basic profile fields';

-- =============================================
-- 预期结果
-- =============================================
-- 
-- 执行完成后,用户应该能够:
-- ✅ 更新自己的 avatar_url
-- ✅ 更新自己的 full_name
-- ✅ 更新自己的 metadata
-- ✅ 更新自己的 last_login_at
--
-- 用户仍然无法:
-- ❌ 修改自己的 role
-- ❌ 修改自己的 credits
-- ❌ 修改自己的 is_whitelisted
-- ❌ 修改其他用户的任何信息
--
-- =============================================
