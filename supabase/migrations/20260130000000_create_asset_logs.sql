-- Create asset_logs table for P0 asset safety
CREATE TABLE IF NOT EXISTS public.asset_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    operation_type TEXT NOT NULL, -- 'seedream', 'gemini', 'image_upload'
    original_url TEXT, -- The external URL (or base64 snippet)
    r2_url TEXT, -- The final R2 URL
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    metadata JSONB DEFAULT '{}'::jsonb, -- Store prompt, parameters, error message
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index for scanning
CREATE INDEX IF NOT EXISTS idx_asset_logs_status_created_at ON public.asset_logs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_asset_logs_user_id ON public.asset_logs(user_id);

-- Enable RLS
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own logs" ON public.asset_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all logs (assuming admin role check is handled via Service Role in API)
-- But for Client side admin dashboard:
CREATE POLICY "Admins can view all logs" ON public.asset_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );
