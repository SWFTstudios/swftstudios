-- Owner-only notes on client projects (admin dashboard). Apply to D1 swft-portal.
CREATE TABLE IF NOT EXISTS admin_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT,                          -- NULL = general note not tied to a project
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_project ON admin_notes(project_id, created_at);
