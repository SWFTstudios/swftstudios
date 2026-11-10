-- Email preferences for everyone SWFT emails (clients, leads, subscribers), plus
-- client notifications for project updates.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
--
-- email_prefs: one row per address. `token` is random and only ever appears in that
-- person's own emails; it opens /email-preferences.html and powers one-click unsubscribe.
-- `off` is a comma list of categories turned off (project, account, replies);
-- all_off = 1 stops every email except ones the person just asked for.
CREATE TABLE IF NOT EXISTS email_prefs (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  token TEXT NOT NULL UNIQUE,
  off TEXT NOT NULL DEFAULT '',
  all_off INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- When the client last opened their Notifications tab (unread = updates newer than this).
ALTER TABLE users ADD COLUMN updates_seen_at TEXT;

-- What happened to the email for each update: sent | opted_out | failed | not_sent | unavailable
ALTER TABLE project_updates ADD COLUMN email_status TEXT;
