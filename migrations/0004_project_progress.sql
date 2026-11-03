-- Project progress for the client dashboard and the owner's Projects tab.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
--
-- milestones: the steps of a project, shown to the client as a timeline.
-- updates:    short notes the client can read (admin_notes stay private).
ALTER TABLE projects ADD COLUMN name TEXT;
ALTER TABLE projects ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'done')),
  due_date TEXT,                 -- YYYY-MM-DD, optional
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id, sort_order);

CREATE TABLE IF NOT EXISTS project_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_updates_project ON project_updates(project_id, created_at);
