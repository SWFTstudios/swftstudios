-- Email updates list (new films, blog posts, products). Apply to D1 swft-portal:
--   npx wrangler d1 migrations apply swft-portal --remote
-- Double opt-in: a row is 'pending' until the emailed link is confirmed.
-- Confirm tokens are stored hashed. Unsubscribe links are HMAC-signed with
-- SESSION_SECRET, so nothing reusable is stored for them.
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  interests TEXT NOT NULL DEFAULT '',          -- comma list: videos,blog,products
  pending_interests TEXT,                      -- applied when the next confirm link is used
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token_hash TEXT,
  confirm_expires_at TEXT,
  confirm_sent_at TEXT,
  source_page TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm ON subscribers(confirm_token_hash);
