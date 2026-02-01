-- =============================================
-- 视频任务表扩展迁移 (Video Tasks Extension)
-- =============================================
-- 版本: 1.0.0
-- 日期: 2026-01-31
-- 描述: 在现有 sora_tasks 表基础上添加 provider 字段，支持多视频提供商
-- 
-- 设计原则：
-- 1. 向后兼容：现有 Sora 逻辑无需修改，provider 默认为 'sora'
-- 2. 可扩展：新增提供商只需在 check 约束中添加值
-- 3. 分库分表友好：使用 project_id + created_at 作为潜在分片键
-- 4. 查询优化：提供商+状态组合索引，支持高效过滤
-- =============================================

-- =============================================
-- 1. 添加 provider 字段（核心扩展）
-- =============================================
ALTER TABLE public.sora_tasks 
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'sora';

-- =============================================
-- 2. 添加提供商特定参数字段（JSONB，保持表结构简洁）
-- =============================================
ALTER TABLE public.sora_tasks 
  ADD COLUMN IF NOT EXISTS generation_params JSONB DEFAULT '{}'::jsonb;

-- =============================================
-- 3. 数据回填：将现有记录标记为 sora
-- =============================================
UPDATE public.sora_tasks 
SET provider = 'sora' 
WHERE provider IS NULL;

-- =============================================
-- 4. 更新状态约束（添加 cancelled 状态）
-- =============================================
ALTER TABLE public.sora_tasks 
  DROP CONSTRAINT IF EXISTS sora_tasks_status_check;

ALTER TABLE public.sora_tasks 
  ADD CONSTRAINT sora_tasks_status_check CHECK (
    status = ANY (ARRAY[
      'queued',
      'processing', 
      'generating',
      'completed',
      'failed',
      'in_progress',
      'registering',
      'cancelled'
    ])
  );

-- =============================================
-- 5. 添加 provider 约束
-- =============================================
ALTER TABLE public.sora_tasks 
  ADD CONSTRAINT sora_tasks_provider_check CHECK (
    provider = ANY (ARRAY[
      'sora',
      'vidu',
      'jimeng',
      'volcano',
      'runway'
    ])
  );

-- =============================================
-- 6. 创建复合索引（支持按提供商+状态高效查询）
-- =============================================
CREATE INDEX IF NOT EXISTS sora_tasks_provider_status_idx 
  ON public.sora_tasks(provider, status);

CREATE INDEX IF NOT EXISTS sora_tasks_provider_project_idx 
  ON public.sora_tasks(provider, project_id);

CREATE INDEX IF NOT EXISTS sora_tasks_user_provider_idx 
  ON public.sora_tasks(user_id, provider, created_at DESC);

-- 时间分区友好索引（未来分库分表预留）
CREATE INDEX IF NOT EXISTS sora_tasks_created_at_brin_idx 
  ON public.sora_tasks USING BRIN(created_at);

-- =============================================
-- 7. 添加完整字段注释
-- =============================================
COMMENT ON TABLE public.sora_tasks IS '视频生成任务表，支持多个视频提供商（Sora, Vidu, Jimeng 等）。设计支持按 project_id 水平分片或按 created_at 时间分区。';

-- 核心字段
COMMENT ON COLUMN public.sora_tasks.id IS '任务唯一ID，由各提供商返回（如 Sora: video_xxx, Vidu: task_xxx）。作为主键，需保证跨提供商唯一。';
COMMENT ON COLUMN public.sora_tasks.user_id IS '任务所有者用户ID，用于 RLS 权限校验和归属验证。外键关联 profiles.id。';
COMMENT ON COLUMN public.sora_tasks.project_id IS '关联项目ID，分片键候选。外键关联 projects.id，级联删除。';
COMMENT ON COLUMN public.sora_tasks.scene_id IS '关联场景ID（可选）。外键关联 scenes.id，级联删除。';
COMMENT ON COLUMN public.sora_tasks.shot_id IS '关联分镜ID（可选）。外键关联 shots.id，级联删除。任务完成后更新 shots.video_clip。';

-- 提供商相关
COMMENT ON COLUMN public.sora_tasks.provider IS '视频提供商标识：sora (OpenAI), vidu (快手), jimeng (即梦), volcano (火山), runway (RunwayML)。默认 sora。';
COMMENT ON COLUMN public.sora_tasks.status IS '任务状态机：queued(排队) -> processing(处理中) -> generating(生成中) -> completed(完成) / failed(失败) / cancelled(已取消)。registering 用于 Sora 角色注册，in_progress 为兼容旧状态。';
COMMENT ON COLUMN public.sora_tasks.progress IS '任务进度百分比 0-100。queued=0, processing=1-50, generating=51-99, completed=100。';
COMMENT ON COLUMN public.sora_tasks.type IS '任务类型：shot_generation(单分镜视频), scene_video(场景合并视频), character_reference(角色参考视频)。';

-- 生成参数
COMMENT ON COLUMN public.sora_tasks.model IS '使用的模型版本：Sora: sora-2/sora-2-pro, Vidu: viduq2-pro-fast 等。';
COMMENT ON COLUMN public.sora_tasks.prompt IS '生成提示词，包含场景描述、运镜信息等。';
COMMENT ON COLUMN public.sora_tasks.target_duration IS '目标视频时长（秒）。Sora: 10-25s, Vidu: 1-10s。';
COMMENT ON COLUMN public.sora_tasks.target_size IS '目标分辨率：720p, 1080p, 1280x720, 720x1280 等。';
COMMENT ON COLUMN public.sora_tasks.generation_params IS '提供商特定参数 JSONB。Vidu: {"mode": "img2video", "off_peak": false}, Sora: {"n_variants": 1}。';

-- 资源链接
COMMENT ON COLUMN public.sora_tasks.kaponai_url IS '提供商返回的临时视频URL（可能24小时过期）。任务完成后应尽快转存到 R2。';
COMMENT ON COLUMN public.sora_tasks.r2_url IS '持久化到 Cloudflare R2 后的永久URL。格式: https://{r2-domain}/projects/{projectId}/shots/{shotId}/videos/{provider}/...';

-- 积分管理
COMMENT ON COLUMN public.sora_tasks.point_cost IS '本次任务消耗的积分数。Sora: 按时长×分辨率, Vidu: 按秒×分辨率。';

-- 错误处理
COMMENT ON COLUMN public.sora_tasks.error_message IS '错误详情（仅 status=failed 时填充）。用于 debug 和用户提示。';

-- 批量任务
COMMENT ON COLUMN public.sora_tasks.shot_ids IS '批量任务关联的多个分镜ID数组。用于场景级合并视频。';
COMMENT ON COLUMN public.sora_tasks.shot_ranges IS '批量任务的分镜时间段映射 JSONB。格式: [{"shotId": "uuid", "start": 0, "end": 5}, ...]。';

-- 角色一致性（Sora 专用）
COMMENT ON COLUMN public.sora_tasks.character_id IS 'Sora 角色一致性功能关联的角色ID。外键关联 characters.id，SET NULL on delete。';

-- 时间戳
COMMENT ON COLUMN public.sora_tasks.created_at IS '任务创建时间。分片键候选，建议按月/季度分区。';
COMMENT ON COLUMN public.sora_tasks.updated_at IS '最后更新时间。由触发器自动维护。';

-- =============================================
-- 8. 验证迁移
-- =============================================
DO $$
BEGIN
  -- 检查 provider 字段是否存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sora_tasks' AND column_name = 'provider'
  ) THEN
    RAISE EXCEPTION 'Migration failed: provider column not created';
  END IF;
  
  -- 检查索引是否创建
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'sora_tasks' AND indexname = 'sora_tasks_provider_status_idx'
  ) THEN
    RAISE EXCEPTION 'Migration failed: provider_status index not created';
  END IF;
  
  RAISE NOTICE 'Migration completed successfully!';
END $$;

-- =============================================
-- 9. 未来优化预留
-- =============================================
-- 
-- 分库分表策略（数据量 > 1000万时考虑）：
-- 
-- 方案 A：按 project_id 水平分片
--   CREATE TABLE sora_tasks_shard_01 PARTITION OF sora_tasks
--   FOR VALUES WITH (MODULUS 4, REMAINDER 0);
--
-- 方案 B：按时间范围分区
--   CREATE TABLE sora_tasks_2026_01 PARTITION OF sora_tasks
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
--
-- 当前阶段建议：
-- 1. 保持单表，索引优化
-- 2. 归档冷数据：超过 90 天的已完成任务移至 sora_tasks_archive
-- 3. 使用 BRIN 索引降低存储成本

-- =============================================
-- 回滚脚本（如需回退）
-- =============================================
-- BEGIN;
-- ALTER TABLE public.sora_tasks DROP CONSTRAINT IF EXISTS sora_tasks_provider_check;
-- ALTER TABLE public.sora_tasks DROP COLUMN IF EXISTS provider;
-- ALTER TABLE public.sora_tasks DROP COLUMN IF EXISTS generation_params;
-- DROP INDEX IF EXISTS sora_tasks_provider_status_idx;
-- DROP INDEX IF EXISTS sora_tasks_provider_project_idx;
-- DROP INDEX IF EXISTS sora_tasks_user_provider_idx;
-- DROP INDEX IF EXISTS sora_tasks_created_at_brin_idx;
-- COMMIT;

-- =============================================
-- 执行说明
-- =============================================
-- 1. 执行前请备份数据：pg_dump -t public.sora_tasks > backup.sql
-- 2. 在 Supabase SQL Editor 中执行本脚本
-- 3. 现有 Sora 代码无需修改（provider 默认 'sora'）
-- 4. 新增 Vidu 代码使用 provider = 'vidu'
-- 5. 验证：SELECT provider, count(*) FROM sora_tasks GROUP BY provider;
