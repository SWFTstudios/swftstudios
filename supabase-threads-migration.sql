-- ============================================================================
-- SWFT Notes - Threads and Video Support Migration
-- ============================================================================
-- Run this script in Supabase SQL Editor to add threads and video support
-- ============================================================================

-- ============================================================================
-- 1. Create Threads Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS threads_user_id_idx ON threads(user_id);
CREATE INDEX IF NOT EXISTS threads_user_email_idx ON threads(user_email);
CREATE INDEX IF NOT EXISTS threads_updated_at_idx ON threads(updated_at DESC);

-- Enable RLS
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- Policies for threads
DROP POLICY IF EXISTS "Users can read own threads" ON threads;
DROP POLICY IF EXISTS "Users can create own threads" ON threads;
DROP POLICY IF EXISTS "Users can update own threads" ON threads;
DROP POLICY IF EXISTS "Users can delete own threads" ON threads;

CREATE POLICY "Users can read own threads"
  ON threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own threads"
  ON threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own threads"
  ON threads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own threads"
  ON threads FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_threads_updated_at ON threads;
CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. Update Notes Table for Threads
-- ============================================================================

-- Add thread_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='notes' AND column_name='thread_id') THEN
    ALTER TABLE notes ADD COLUMN thread_id UUID REFERENCES threads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add message_order column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='notes' AND column_name='message_order') THEN
    ALTER TABLE notes ADD COLUMN message_order INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create index on thread_id
CREATE INDEX IF NOT EXISTS notes_thread_id_idx ON notes(thread_id);
CREATE INDEX IF NOT EXISTS notes_thread_message_order_idx ON notes(thread_id, message_order);

-- ============================================================================
-- 3. Add Video Storage Bucket
-- ============================================================================

-- Insert video storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('notes-videos', 'notes-videos', true, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

-- Video bucket policies
DROP POLICY IF EXISTS "Public read access for videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;

CREATE POLICY "Public read access for videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notes-videos');

CREATE POLICY "Authenticated users can upload videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'notes-videos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 4. Create Default Threads
-- ============================================================================

-- Function to create default thread for users
CREATE OR REPLACE FUNCTION create_default_thread_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO threads (user_id, user_email, name, message_count)
  VALUES (NEW.id, NEW.email, 'General Notes', 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default thread on user signup
DROP TRIGGER IF EXISTS create_default_thread ON auth.users;
CREATE TRIGGER create_default_thread
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_thread_for_user();

-- ============================================================================
-- 5. Helper Function: Update Thread Message Count
-- ============================================================================

CREATE OR REPLACE FUNCTION update_thread_message_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment count on insert
  IF TG_OP = 'INSERT' AND NEW.thread_id IS NOT NULL THEN
    UPDATE threads 
    SET message_count = message_count + 1,
        updated_at = NOW()
    WHERE id = NEW.thread_id;
  END IF;
  
  -- Decrement count on delete
  IF TG_OP = 'DELETE' AND OLD.thread_id IS NOT NULL THEN
    UPDATE threads 
    SET message_count = GREATEST(message_count - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.thread_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update message count
DROP TRIGGER IF EXISTS update_thread_count ON notes;
CREATE TRIGGER update_thread_count
  AFTER INSERT OR DELETE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_message_count();

-- ============================================================================
-- Setup Complete
-- ============================================================================

SELECT 'Threads table created' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'threads');

SELECT 'Video bucket created' AS status, COUNT(*) AS bucket_count
FROM storage.buckets
WHERE id = 'notes-videos';

SELECT 'Notes table updated' AS status
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name='notes' AND column_name='thread_id'
);
