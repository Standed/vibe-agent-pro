-- 1. Modify characters table for global support
-- Allow project_id to be NULL (indicating global character)
ALTER TABLE characters 
  ALTER COLUMN project_id DROP NOT NULL;

-- Add user_id to characters if it doesn't exist (it should, but just in case or for explicit linking)
-- Check if user_id exists first or just add it forcefully if we know the schema
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'characters' AND column_name = 'user_id') THEN 
        ALTER TABLE characters ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF; 
END $$;

-- Enforce user_id is NOT NULL for new records (after backfilling if needed, but for now we assume new usage)
-- ALTER TABLE characters ALTER COLUMN user_id SET NOT NULL; -- Optional, depends on existing data

-- Create index for faster lookup of global vs project characters
CREATE INDEX IF NOT EXISTS idx_characters_user_project ON characters(user_id, project_id);

-- 2. Create Series table
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying series by user
CREATE INDEX IF NOT EXISTS idx_series_user_id ON series(user_id);

-- 3. Update Projects table to link to Series
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'series_id') THEN 
        ALTER TABLE projects ADD COLUMN series_id UUID REFERENCES series(id);
    END IF; 

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'episode_order') THEN 
        ALTER TABLE projects ADD COLUMN episode_order INTEGER DEFAULT 1;
    END IF; 
END $$;

-- Index for querying projects in a series
CREATE INDEX IF NOT EXISTS idx_projects_series_id ON projects(series_id);
