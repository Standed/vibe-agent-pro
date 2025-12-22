-- Video Agent Pro - Supabase Database Schema
-- =============================================
-- 此文件用于在 Supabase SQL Editor 中执行，创建所有必要的表和策略

-- =============================================
-- 1. 启用必要的扩展
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 2. 用户表（扩展 Supabase Auth）
-- =============================================
-- Supabase Auth 已经提供了 auth.users 表
-- 我们创建一个 public.profiles 表来存储额外的用户信息

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- 积分相关
  credits INTEGER DEFAULT 0 NOT NULL CHECK (credits >= 0),
  total_credits_purchased INTEGER DEFAULT 0 NOT NULL,

  -- 角色和权限
  role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin', 'vip')),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  is_whitelisted BOOLEAN DEFAULT FALSE NOT NULL,

  -- 频率限制 (Rate Limiting)
  last_chat_at TIMESTAMP WITH TIME ZONE,
  chat_count_in_min INTEGER DEFAULT 0,
  last_image_at TIMESTAMP WITH TIME ZONE,
  image_count_in_min INTEGER DEFAULT 0,

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- 为常用查询创建索引
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON public.profiles(created_at DESC);

-- =============================================
-- 3. 积分交易记录表
-- =============================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,

  -- 交易类型: 'purchase'(购买), 'consume'(消费), 'admin_grant'(管理员赠送), 'refund'(退款)
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'consume', 'admin_grant', 'refund')),

  -- 积分数量（正数为增加，负数为减少）
  amount INTEGER NOT NULL,

  -- 交易前后余额
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,

  -- 描述和元数据
  description TEXT,
  operation_type TEXT, -- 例如: 'generate-grid', 'generate-video', 'chat'
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 管理员操作记录
  admin_id UUID REFERENCES public.profiles(id),
  admin_note TEXT,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON public.credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON public.credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS credit_transactions_created_at_idx ON public.credit_transactions(created_at DESC);

-- =============================================
-- 4. 项目表
-- =============================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- 基本信息
  title TEXT NOT NULL,
  description TEXT,
  art_style TEXT,

  -- 项目设置
  settings JSONB DEFAULT '{}'::jsonb,

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 统计信息
  scene_count INTEGER DEFAULT 0,
  shot_count INTEGER DEFAULT 0,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON public.projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_created_at_idx ON public.projects(created_at DESC);
CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON public.projects(updated_at DESC);

-- =============================================
-- 5. 场景表
-- =============================================
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,

  -- 基本信息
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,

  -- Grid 历史记录
  grid_history JSONB DEFAULT '[]'::jsonb,
  saved_grid_slices JSONB DEFAULT '[]'::jsonb,

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS scenes_project_id_idx ON public.scenes(project_id, order_index);
CREATE INDEX IF NOT EXISTS scenes_created_at_idx ON public.scenes(created_at DESC);

-- =============================================
-- 6. 镜头表
-- =============================================
CREATE TABLE IF NOT EXISTS public.shots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE NOT NULL,

  -- 基本信息
  order_index INTEGER NOT NULL DEFAULT 0,
  shot_size TEXT, -- 例如: 'Close-up', 'Medium Shot', 'Wide Shot'
  camera_movement TEXT,
  duration NUMERIC(10, 2), -- 秒数，保留2位小数

  -- 描述和对白
  description TEXT,
  dialogue TEXT,
  narration TEXT,

  -- 媒体资源（存储 Cloudflare R2 URL）
  -- 实际文件存储在 Cloudflare R2，数据库仅存储访问 URL
  reference_image TEXT,      -- 参考图片 URL
  video_clip TEXT,           -- 生成视频 URL
  video_prompt TEXT,         -- 视频生成提示词

  -- Grid 图片（URL 数组，存储在 R2）
  grid_images JSONB DEFAULT '[]'::jsonb,

  -- 生成历史
  generation_history JSONB DEFAULT '[]'::jsonb,

  -- 状态: 'draft', 'generating', 'done', 'failed'
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'done', 'failed')),

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS shots_scene_id_idx ON public.shots(scene_id, order_index);
CREATE INDEX IF NOT EXISTS shots_status_idx ON public.shots(status);
CREATE INDEX IF NOT EXISTS shots_created_at_idx ON public.shots(created_at DESC);

-- =============================================
-- 7. 角色表
-- =============================================
CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,

  -- 基本信息
  name TEXT NOT NULL,
  description TEXT,
  appearance TEXT,
  personality TEXT,

  -- 角色图片（存储 Cloudflare R2 URL）
  -- 实际文件存储在 Cloudflare R2，数据库仅存储访问 URL
  turnaround_image TEXT,                    -- 三视图 URL
  reference_images JSONB DEFAULT '[]'::jsonb,  -- 参考图片 URL 数组

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS characters_project_id_idx ON public.characters(project_id);

-- =============================================
-- 8. 音频资源表
-- =============================================
CREATE TABLE IF NOT EXISTS public.audio_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,

  -- 基本信息
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('music', 'voice', 'sfx')) NOT NULL,

  -- 文件信息（存储 Cloudflare R2 URL）
  -- 实际文件存储在 Cloudflare R2，数据库仅存储访问 URL
  file_url TEXT NOT NULL,        -- 音频文件 R2 URL
  file_size INTEGER,             -- 字节数
  duration NUMERIC(10, 2),       -- 秒数

  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS audio_assets_project_id_idx ON public.audio_assets(project_id);
CREATE INDEX IF NOT EXISTS audio_assets_category_idx ON public.audio_assets(category);

-- =============================================
-- 9. 对话消息表（Chat Messages）
-- =============================================
-- 独立存储项目/场景/分镜级别的 AI 对话历史
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- 关联关系（三级层级）
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE,  -- 场景级对话
  shot_id UUID REFERENCES public.shots(id) ON DELETE CASCADE,    -- 分镜级对话

  -- 对话范围标识: 'project'(项目级), 'scene'(场景级), 'shot'(分镜级)
  scope TEXT NOT NULL CHECK (scope IN ('project', 'scene', 'shot')),

  -- 消息内容
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- AI 推理过程（仅 assistant 消息）
  thought TEXT,

  -- 扩展数据（JSONB 格式）
  -- 可能包含: gridData, images, model, toolResults 等
  metadata JSONB DEFAULT '{}'::jsonb,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS chat_messages_project_idx ON public.chat_messages(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_scene_idx ON public.chat_messages(scene_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_shot_idx ON public.chat_messages(shot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS chat_messages_scope_idx ON public.chat_messages(scope);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON public.chat_messages(created_at DESC);

-- =============================================
-- 10. 管理员操作日志表
-- =============================================
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES public.profiles(id) NOT NULL,

  -- 操作信息
  action TEXT NOT NULL, -- 例如: 'grant_credits', 'ban_user', 'delete_project'
  target_user_id UUID REFERENCES public.profiles(id),

  -- 详细信息
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS admin_logs_admin_id_idx ON public.admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_logs_target_user_idx ON public.admin_logs(target_user_id);
CREATE INDEX IF NOT EXISTS admin_logs_created_at_idx ON public.admin_logs(created_at DESC);

-- =============================================
-- 11. 错误反馈表 (Error Reports)
-- =============================================
CREATE TABLE IF NOT EXISTS public.error_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- 错误信息
  type TEXT NOT NULL, -- 'bug', 'feedback', 'ai_error'
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}'::jsonb, -- 包含 project_id, shot_id, browser_info 等
  
  -- 状态
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'ignored')),
  admin_note TEXT,
  
  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS error_reports_user_id_idx ON public.error_reports(user_id);
CREATE INDEX IF NOT EXISTS error_reports_status_idx ON public.error_reports(status);
CREATE INDEX IF NOT EXISTS error_reports_created_at_idx ON public.error_reports(created_at DESC);

-- =============================================
-- 12. 启用行级安全策略 (RLS)
-- =============================================

-- 用户信息表
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的信息，管理员可以查看所有
CREATE POLICY "Users can view own profile, admins can view all"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 用户只能更新自己的基本信息（不能修改积分和角色）
CREATE POLICY "Users can update own profile (limited fields)"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()) -- 不能修改自己的角色
    AND credits = (SELECT credits FROM public.profiles WHERE id = auth.uid()) -- 不能修改自己的积分
  );

-- 积分交易记录表
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions, admins can view all"
  ON public.credit_transactions FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 只有系统可以插入交易记录（通过 RPC 函数）
CREATE POLICY "Only system can insert transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (FALSE); -- 默认禁止，通过 RPC 函数绕过

-- 项目表
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own projects"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 场景表
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scenes"
  ON public.scenes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = scenes.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 镜头表
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own shots"
  ON public.shots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scenes
      JOIN public.projects ON projects.id = scenes.project_id
      WHERE scenes.id = shots.scene_id
      AND projects.user_id = auth.uid()
    )
  );

-- 角色表
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own characters"
  ON public.characters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = characters.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 音频资源表
ALTER TABLE public.audio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own audio assets"
  ON public.audio_assets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = audio_assets.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 对话消息表
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 用户可以管理自己的聊天消息（直接检查 user_id）
CREATE POLICY "Users can manage own chat messages"
  ON public.chat_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 管理员日志表（只有管理员可以查看）
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view logs"
  ON public.admin_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 错误反馈表
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- 用户可以提交反馈，管理员可以查看所有
CREATE POLICY "Users can insert own error reports"
  ON public.error_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can view and update all error reports"
  ON public.error_reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- 13. RPC 函数
-- =============================================

-- 消费积分函数（原子操作）
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation_type TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- 以函数定义者身份运行，绕过 RLS
AS $$
DECLARE
  v_current_credits INTEGER;
  v_new_credits INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 锁定用户行，防止并发问题
  SELECT credits INTO v_current_credits
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- 检查积分是否足够
  IF v_current_credits < p_amount THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Insufficient credits',
      'current_credits', v_current_credits,
      'required_credits', p_amount
    );
  END IF;

  -- 扣除积分
  v_new_credits := v_current_credits - p_amount;

  UPDATE public.profiles
  SET credits = v_new_credits,
      updated_at = NOW()
  WHERE id = p_user_id;

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
    p_user_id,
    'consume',
    -p_amount,
    v_current_credits,
    v_new_credits,
    p_description,
    p_operation_type
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'transaction_id', v_transaction_id,
    'credits_before', v_current_credits,
    'credits_after', v_new_credits,
    'amount_consumed', p_amount
  );
END;
$$;

-- 管理员赠送积分函数
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_admin_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_credits INTEGER;
  v_new_credits INTEGER;
  v_is_admin BOOLEAN;
  v_transaction_id UUID;
BEGIN
  -- 验证操作者是否为管理员
  SELECT role = 'admin' INTO v_is_admin
  FROM public.profiles
  WHERE id = p_admin_id;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Unauthorized: Only admins can grant credits'
    );
  END IF;

  -- 锁定用户行
  SELECT credits INTO v_current_credits
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  -- 增加积分
  v_new_credits := v_current_credits + p_amount;

  UPDATE public.profiles
  SET credits = v_new_credits,
      total_credits_purchased = total_credits_purchased + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 记录交易
  INSERT INTO public.credit_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    admin_id,
    admin_note
  ) VALUES (
    p_user_id,
    'admin_grant',
    p_amount,
    v_current_credits,
    v_new_credits,
    '管理员手动充值',
    p_admin_id,
    p_admin_note
  ) RETURNING id INTO v_transaction_id;

  -- 记录管理员操作日志
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
  VALUES (
    p_admin_id,
    'grant_credits',
    p_user_id,
    jsonb_build_object(
      'amount', p_amount,
      'note', p_admin_note,
      'transaction_id', v_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'transaction_id', v_transaction_id,
    'credits_before', v_current_credits,
    'credits_after', v_new_credits,
    'amount_granted', p_amount
  );
END;
$$;

-- 获取用户积分余额
CREATE OR REPLACE FUNCTION public.get_user_credits(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  SELECT credits INTO v_credits
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN COALESCE(v_credits, 0);
END;
$$;

-- =============================================
-- 12. 触发器：自动更新 updated_at
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有表添加触发器
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shots_updated_at BEFORE UPDATE ON public.shots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_characters_updated_at BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_audio_assets_updated_at BEFORE UPDATE ON public.audio_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_error_reports_updated_at BEFORE UPDATE ON public.error_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 14. 触发器：新用户注册时自动创建 profile
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 注意：这个触发器需要在 Supabase Dashboard -> Database -> Triggers 中手动创建
-- 因为 auth.users 表在 auth schema 中，需要超级用户权限
--
-- 如果你有超级用户权限，可以直接执行：
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 为现有用户补充 profile 记录
INSERT INTO public.profiles (id, email, created_at, updated_at)
SELECT id, email, created_at, NOW()
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 14. 初始管理员账号（可选）
-- =============================================
-- 执行此脚本后，需要手动在 Supabase Dashboard -> Authentication 中创建管理员用户
-- 然后执行以下 SQL 将其设置为管理员：
--
-- UPDATE public.profiles
-- SET role = 'admin', credits = 10000
-- WHERE email = 'admin@vibeagent.com';

-- =============================================
-- 15. 启用 Realtime
-- =============================================
-- 启用 chat_messages 表的实时更新
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- 完成！
-- =============================================
-- 接下来的步骤：
-- 1. 在 Supabase Dashboard -> SQL Editor 中执行此文件
-- 2. 在 Storage 中创建 buckets: 'media', 'avatars', 'audio'
-- 3. 设置 Storage bucket 的访问策略
-- 4. 在 Authentication -> Triggers 中添加 on_auth_user_created 触发器
-- 5. 创建第一个管理员账号
