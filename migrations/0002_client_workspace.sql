-- SWFT client workspace: roles, richer projects, files, notes/requests,
-- checklists, activity and password resets. Additive only: no existing
-- column or row is changed or removed.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client';
ALTER TABLE users ADD COLUMN name TEXT;
ALTER TABLE users ADD COLUMN company TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

ALTER TABLE projects ADD COLUMN title TEXT;
ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'website';
ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'intake';
ALTER TABLE projects ADD COLUMN due_date TEXT;
ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);

-- Files live in R2 (binding FILES); links are stored as kind = 'link'.
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'file',          -- file | link
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',     -- video | image | audio | document | brand | other
  note TEXT,
  url TEXT,                                   -- links only
  r2_key TEXT,                                -- files only
  upload_id TEXT,                             -- R2 multipart upload id while uploading
  size INTEGER,
  content_type TEXT,
  status TEXT NOT NULL DEFAULT 'ready',       -- uploading | ready
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',          -- note | request | revision | approval | update
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',        -- open | done (requests and revisions)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  client_visible INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, sort);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, id);

-- When each person last opened a project, for "new since you looked" badges.
CREATE TABLE IF NOT EXISTS project_reads (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
