-- ============================================================================
-- SWFT Notes - Supabase Database Setup
-- ============================================================================
-- Run this script in Supabase SQL Editor to set up the database schema
-- Project: mnrteunavnzrglbozpfc
-- ============================================================================

-- ============================================================================
-- 1. Create Notes Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  tags TEXT[] DEFAULT '{}',
  content_type TEXT CHECK (content_type IN ('text', 'audio', 'image', 'link', 'social')),
  file_urls TEXT[] DEFAULT '{}',
  external_links TEXT[] DEFAULT '{}',
  markdown_path TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS notes_user_email_idx ON notes(user_email);
CREATE INDEX IF NOT EXISTS notes_status_idx ON notes(status);
CREATE INDEX IF NOT EXISTS notes_created_at_idx ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);

-- ============================================================================
-- 2. Enable Row Level Security
-- ============================================================================

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can read published notes" ON notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON notes;

-- Policy: Anyone can read published notes
CREATE POLICY "Anyone can read published notes"
  ON notes FOR SELECT
  USING (status = 'published');

-- Policy: Authenticated users can insert their own notes
CREATE POLICY "Users can insert own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own notes
CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own notes
CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. Create Storage Buckets
-- ============================================================================

-- Insert storage buckets (will skip if already exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('notes-audio', 'notes-audio', true, 52428800, ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']),
  ('notes-images', 'notes-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('notes-files', 'notes-files', true, 10485760, ARRAY['application/pdf', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. Storage Policies
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read access for audio" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- Public read access for all buckets
CREATE POLICY "Public read access for audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notes-audio');

CREATE POLICY "Public read access for images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notes-images');

CREATE POLICY "Public read access for files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notes-files');

-- Authenticated users can upload to their own folder
CREATE POLICY "Authenticated users can upload audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'notes-audio'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'notes-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can upload files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'notes-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update/delete their own files
CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE
  USING ((storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING ((storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 5. Create Helper Functions
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Add Messages Column for Conversation Threads
-- ============================================================================

-- Add messages JSONB column to store conversation thread
ALTER TABLE notes ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

-- Create GIN index on messages for efficient querying
CREATE INDEX IF NOT EXISTS notes_messages_idx ON notes USING GIN (messages);

-- Migration: Convert existing content to first message if messages is empty
-- This ensures backward compatibility
DO $$
DECLARE
  note_record RECORD;
  attachments_json JSONB;
  file_url TEXT;
BEGIN
  FOR note_record IN 
    SELECT id, content, file_urls, tags, created_at
    FROM notes
    WHERE (messages IS NULL OR messages = '[]'::jsonb)
    AND content IS NOT NULL
    AND content != ''
  LOOP
    -- Build attachments array from file_urls
    attachments_json := '[]'::jsonb;
    
    IF note_record.file_urls IS NOT NULL AND array_length(note_record.file_urls, 1) > 0 THEN
      FOR file_url IN SELECT unnest(note_record.file_urls)
      LOOP
        attachments_json := attachments_json || jsonb_build_object(
          'type', CASE 
            WHEN file_url LIKE '%.mp4' OR file_url LIKE '%.mov' OR file_url LIKE '%.webm' THEN 'video'
            WHEN file_url LIKE '%.mp3' OR file_url LIKE '%.wav' OR file_url LIKE '%.m4a' THEN 'audio'
            WHEN file_url LIKE '%.jpg' OR file_url LIKE '%.png' OR file_url LIKE '%.webp' OR file_url LIKE '%.gif' THEN 'image'
            ELSE 'file'
          END,
          'url', file_url,
          'name', ''
        );
      END LOOP;
    END IF;
    
    -- Update note with messages array
    UPDATE notes
    SET messages = jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'content', note_record.content,
        'attachments', attachments_json,
        'tags', COALESCE(note_record.tags::jsonb, '[]'::jsonb),
        'created_at', note_record.created_at
      )
    )
    WHERE id = note_record.id;
  END LOOP;
END $$;

-- ============================================================================
-- Setup Complete
-- ============================================================================

-- Verify setup
SELECT 'Notes table created' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes');

SELECT 'Storage buckets created' AS status, COUNT(*) AS bucket_count
FROM storage.buckets
WHERE id IN ('notes-audio', 'notes-images', 'notes-files');

SELECT 'RLS policies created' AS status, COUNT(*) AS policy_count
FROM pg_policies
WHERE tablename = 'notes';

SELECT 'Messages column added' AS status
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_name = 'notes' AND column_name = 'messages'
);
