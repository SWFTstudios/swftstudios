-- New blog post / video emails to the subscribers list (migration 0003).
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
--
-- newsletter_sends: one row per blog post or video that was emailed out.
-- newsletter_deliveries: who already got it, so a re-send (or a retry after a
-- failure part way through) never emails the same person twice.
CREATE TABLE IF NOT EXISTS newsletter_sends (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('blog', 'videos')),
  item_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT,
  UNIQUE (kind, item_key)
);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  send_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (send_id, subscriber_id),
  FOREIGN KEY (send_id) REFERENCES newsletter_sends(id) ON DELETE CASCADE
);
