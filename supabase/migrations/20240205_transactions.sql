-- Migration: 20240205_transactions.sql
-- Run this in Supabase SQL Editor to enable atomic transactions

-- 1. Atomic Scene Deletion
-- Deletes a scene and all its associated shots transactionally
CREATE OR REPLACE FUNCTION delete_scene_atomic(scene_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- Delete all shots belonging to this scene
  DELETE FROM shots WHERE scene_id = scene_uuid;
  
  -- Delete the scene itself
  DELETE FROM scenes WHERE id = scene_uuid;
END;
$$ LANGUAGE plpgsql;

-- 2. Atomic Project Deletion (Optional but recommended)
CREATE OR REPLACE FUNCTION delete_project_atomic(project_uuid UUID)
RETURNS VOID AS $$
BEGIN
  -- Delete all associated data (cascading deletes usually handle this, but explicit is safer)
  DELETE FROM shots WHERE project_id = project_uuid;
  DELETE FROM scenes WHERE project_id = project_uuid;
  DELETE FROM chat_messages WHERE project_id = project_uuid;
  
  -- Delete project
  DELETE FROM projects WHERE id = project_uuid;
END;
$$ LANGUAGE plpgsql;
