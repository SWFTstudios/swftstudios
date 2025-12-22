-- ============================================================================
-- Fix RLS Policies for Notes Table
-- ============================================================================
-- This fixes the 403 error when creating notes
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add policy for users to read their own notes (not just published ones)
DROP POLICY IF EXISTS "Users can read own notes" ON notes;

CREATE POLICY "Users can read own notes"
  ON notes FOR SELECT
  USING (auth.uid() = user_id);

-- Ensure the INSERT policy exists and is correct
DROP POLICY IF EXISTS "Users can insert own notes" ON notes;

CREATE POLICY "Users can insert own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Verify policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notes'
ORDER BY policyname;
