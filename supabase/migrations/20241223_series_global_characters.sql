-- ==========================================
-- Video Agent Pro - Schema Migration Script
-- 目标：添加 Series 支持 & 全局角色 (Global Characters)
-- 日期：2024-12-23
-- ==========================================

-- 1. Series (剧集) 系统支持
-- ------------------------------------------

-- 创建 series 表
CREATE TABLE IF NOT EXISTS public.series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS series_user_id_idx ON public.series(user_id);

-- 启用 RLS 并添加策略
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own series" ON public.series;
CREATE POLICY "Users can manage own series"
  ON public.series FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 更新 projects 表关联 series
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.series(id),
  ADD COLUMN IF NOT EXISTS episode_order INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS projects_series_id_idx ON public.projects(series_id);


-- 2. Global Characters (全局角色) 支持
-- ------------------------------------------

-- 2.1 给 characters 添加 user_id 字段
ALTER TABLE public.characters 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2.2 数据回填：将现有的角色归属到对应的项目拥有者
-- (这一步确保现有数据不会违反后续的 NOT NULL 约束)
UPDATE public.characters c
SET user_id = p.user_id
FROM public.projects p
WHERE c.project_id = p.id
AND c.user_id IS NULL;

-- 2.3 设置 user_id 为必填
-- 注意：如果你的数据库中有"孤儿"角色（没有关联项目的脏数据），这行可能会报错。
-- 如果报错，请先手动清理那些 project_id 无效的角色，或者通过 WHERE project_id IS NOT NULL 来删除它们。
ALTER TABLE public.characters ALTER COLUMN user_id SET NOT NULL;

-- 2.4 允许 project_id 为空 (代表全局角色)
ALTER TABLE public.characters ALTER COLUMN project_id DROP NOT NULL;

-- 2.5 为 user_id 添加索引
CREATE INDEX IF NOT EXISTS characters_user_id_idx ON public.characters(user_id);

-- 2.6 更新 Characters 的 RLS 策略
DROP POLICY IF EXISTS "Users can manage own characters" ON public.characters;

CREATE POLICY "Users can manage own characters"
  ON public.characters FOR ALL
  USING (
    -- 这里的逻辑涵盖了两种情况：
    -- 1. 全局角色：user_id = auth.uid() (project_id 为空)
    -- 2. 项目角色：user_id = auth.uid() (project_id 不为空，且因为 user_id 是从 project 继承/同步的，所以也成立)
    auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() = user_id
  );
