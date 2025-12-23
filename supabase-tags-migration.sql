-- Tags and Idea Tags Migration for Mind Map
-- This migration creates the tagging system for Thought Sessions and Ideas

-- Tags table for persistent tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ffffff',
  is_auto BOOLEAN DEFAULT false, -- true if converted from auto tag
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Tag assignments (many-to-many between ideas and tags)
CREATE TABLE IF NOT EXISTS idea_tags (
  idea_id TEXT NOT NULL, -- References the idea ID in notes.content JSONB
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (idea_id, tag_id, note_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_idea_tags_idea_id ON idea_tags(idea_id);
CREATE INDEX IF NOT EXISTS idx_idea_tags_tag_id ON idea_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_idea_tags_note_id ON idea_tags(note_id);

-- RLS Policies for tags table
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Users can read their own tags
CREATE POLICY "Users can read own tags" ON tags
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tags
CREATE POLICY "Users can insert own tags" ON tags
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own tags
CREATE POLICY "Users can update own tags" ON tags
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tags
CREATE POLICY "Users can delete own tags" ON tags
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for idea_tags table
ALTER TABLE idea_tags ENABLE ROW LEVEL SECURITY;

-- Users can read their own idea tags
CREATE POLICY "Users can read own idea tags" ON idea_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = idea_tags.note_id
      AND notes.user_id = auth.uid()
    )
  );

-- Users can insert their own idea tags
CREATE POLICY "Users can insert own idea tags" ON idea_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = idea_tags.note_id
      AND notes.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = idea_tags.tag_id
      AND tags.user_id = auth.uid()
    )
  );

-- Users can update their own idea tags
CREATE POLICY "Users can update own idea tags" ON idea_tags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = idea_tags.note_id
      AND notes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = idea_tags.note_id
      AND notes.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = idea_tags.tag_id
      AND tags.user_id = auth.uid()
    )
  );

-- Users can delete their own idea tags
CREATE POLICY "Users can delete own idea tags" ON idea_tags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = idea_tags.note_id
      AND notes.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION update_tags_updated_at();

-- Add session_tags column to notes table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notes' AND column_name = 'session_tags'
  ) THEN
    ALTER TABLE notes ADD COLUMN session_tags JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
