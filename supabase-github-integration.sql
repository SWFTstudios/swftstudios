-- ============================================================================
-- GitHub Integration for Thought Sessions
-- ============================================================================
-- This migration adds GitHub repository integration for user thought sessions
-- Run this script in Supabase SQL Editor after supabase-setup.sql
-- ============================================================================

-- ============================================================================
-- 1. Create user_github_accounts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_github_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username TEXT NOT NULL,
  github_email TEXT, -- Email for matching GitHub accounts
  github_access_token TEXT NOT NULL, -- Will be encrypted at application level
  repo_name TEXT,
  repo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_github_user_id ON user_github_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_github_username ON user_github_accounts(github_username);
CREATE INDEX IF NOT EXISTS idx_user_github_email ON user_github_accounts(github_email);
CREATE INDEX IF NOT EXISTS idx_user_github_active ON user_github_accounts(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. Create github_sync_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS github_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced', 'failed')),
  github_commit_sha TEXT,
  error_message TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_github_sync_user_id ON github_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_github_sync_note_id ON github_sync_log(note_id);
CREATE INDEX IF NOT EXISTS idx_github_sync_status ON github_sync_log(sync_status);
CREATE INDEX IF NOT EXISTS idx_github_sync_created_at ON github_sync_log(created_at DESC);

-- ============================================================================
-- 3. Add GitHub columns to notes table
-- ============================================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS github_synced BOOLEAN DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS github_path TEXT; -- e.g., "thought-sessions/session-123/"

-- Index for GitHub sync status
CREATE INDEX IF NOT EXISTS idx_notes_github_synced ON notes(github_synced) WHERE github_synced = false;
CREATE INDEX IF NOT EXISTS idx_notes_github_path ON notes(github_path) WHERE github_path IS NOT NULL;

-- ============================================================================
-- 4. Enable Row Level Security
-- ============================================================================

ALTER TABLE user_github_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_sync_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS Policies for user_github_accounts
-- ============================================================================

-- Users can read their own GitHub account
DROP POLICY IF EXISTS "Users can read own GitHub account" ON user_github_accounts;
CREATE POLICY "Users can read own GitHub account" ON user_github_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own GitHub account
DROP POLICY IF EXISTS "Users can insert own GitHub account" ON user_github_accounts;
CREATE POLICY "Users can insert own GitHub account" ON user_github_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own GitHub account
DROP POLICY IF EXISTS "Users can update own GitHub account" ON user_github_accounts;
CREATE POLICY "Users can update own GitHub account" ON user_github_accounts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own GitHub account
DROP POLICY IF EXISTS "Users can delete own GitHub account" ON user_github_accounts;
CREATE POLICY "Users can delete own GitHub account" ON user_github_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 6. RLS Policies for github_sync_log
-- ============================================================================

-- Users can read their own sync logs
DROP POLICY IF EXISTS "Users can read own sync logs" ON github_sync_log;
CREATE POLICY "Users can read own sync logs" ON github_sync_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own sync logs
DROP POLICY IF EXISTS "Users can insert own sync logs" ON github_sync_log;
CREATE POLICY "Users can insert own sync logs" ON github_sync_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sync logs
DROP POLICY IF EXISTS "Users can update own sync logs" ON github_sync_log;
CREATE POLICY "Users can update own sync logs" ON github_sync_log
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can insert/update sync logs (for Cloudflare Functions)
DROP POLICY IF EXISTS "Service role can manage sync logs" ON github_sync_log;
CREATE POLICY "Service role can manage sync logs" ON github_sync_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 7. Update triggers for updated_at
-- ============================================================================

-- Trigger function for user_github_accounts
CREATE OR REPLACE FUNCTION update_user_github_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_github_accounts_updated_at ON user_github_accounts;
CREATE TRIGGER update_user_github_accounts_updated_at
  BEFORE UPDATE ON user_github_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_user_github_accounts_updated_at();

-- Trigger function for github_sync_log
CREATE OR REPLACE FUNCTION update_github_sync_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_github_sync_log_updated_at ON github_sync_log;
CREATE TRIGGER update_github_sync_log_updated_at
  BEFORE UPDATE ON github_sync_log
  FOR EACH ROW
  EXECUTE FUNCTION update_github_sync_log_updated_at();

-- ============================================================================
-- 8. Helper function to get user's GitHub account
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_github_account(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  github_username TEXT,
  repo_name TEXT,
  repo_url TEXT,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uga.id,
    uga.github_username,
    uga.repo_name,
    uga.repo_url,
    uga.is_active
  FROM user_github_accounts uga
  WHERE uga.user_id = p_user_id
    AND uga.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. Helper function to check if note is synced
-- ============================================================================

CREATE OR REPLACE FUNCTION is_note_synced(p_note_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM notes
    WHERE id = p_note_id
      AND github_synced = true
      AND github_path IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. Add github_email column (if table already exists)
-- ============================================================================

ALTER TABLE user_github_accounts ADD COLUMN IF NOT EXISTS github_email TEXT;
CREATE INDEX IF NOT EXISTS idx_user_github_email ON user_github_accounts(github_email);

