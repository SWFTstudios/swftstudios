-- Shared project files: uploaded by the client or by SWFT, stored in R2 (binding FILES),
-- mirrored to the shared Google Drive by functions/_lib/drive.js when Drive is configured.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
--
-- drive_status: pending (waiting to mirror) | synced | failed (will retry) | skipped (Drive not configured)
ALTER TABLE projects ADD COLUMN drive_folder_id TEXT;

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT,
  r2_key TEXT NOT NULL,
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('client', 'admin')),
  uploader_email TEXT,
  drive_file_id TEXT,
  drive_status TEXT NOT NULL DEFAULT 'pending' CHECK (drive_status IN ('pending', 'synced', 'failed', 'skipped')),
  drive_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_files_sync ON project_files(drive_status);
