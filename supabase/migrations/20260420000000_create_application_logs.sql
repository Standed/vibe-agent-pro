-- Application logs table for client-side operational logging
-- Fixes PostgREST 404 on /rest/v1/application_logs when table is missing.

CREATE TABLE IF NOT EXISTS public.application_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS application_logs_created_at_idx
  ON public.application_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS application_logs_category_idx
  ON public.application_logs (category, created_at DESC);

CREATE INDEX IF NOT EXISTS application_logs_user_id_idx
  ON public.application_logs (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.application_logs TO authenticated;
GRANT SELECT ON public.application_logs TO service_role;

ALTER TABLE public.application_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'application_logs'
      AND policyname = 'Users can insert own application logs'
  ) THEN
    CREATE POLICY "Users can insert own application logs"
      ON public.application_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'application_logs'
      AND policyname = 'Users can view own application logs'
  ) THEN
    CREATE POLICY "Users can view own application logs"
      ON public.application_logs
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

