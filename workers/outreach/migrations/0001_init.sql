-- SWFT outreach pipeline (Cloudflare D1: swft-outreach)

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL UNIQUE,            -- only Places field we may keep indefinitely
  name TEXT NOT NULL,
  trade TEXT,
  phone TEXT,
  website TEXT,
  email TEXT,
  email_source_url TEXT,
  rating REAL,
  review_count INTEGER,
  hours_json TEXT,
  has_booking_link INTEGER NOT NULL DEFAULT 0,
  city TEXT,
  score INTEGER,
  score_reasons TEXT,
  status TEXT NOT NULL DEFAULT 'new',       -- new|scored|drafted|queued|sent|replied|suppressed|booked|dead
  places_fetched_at TEXT,                   -- Places fields expire after ~30 days
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status_score ON leads(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  facts_json TEXT NOT NULL,                 -- the only facts Claude was given; shown on approval card
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|approved|rejected|sent
  edited_by_human INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

CREATE TABLE IF NOT EXISTS sends (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  resend_id TEXT,
  thread_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',      -- sent|delivered|bounced|complained
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (draft_id) REFERENCES drafts(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
CREATE INDEX IF NOT EXISTS idx_sends_sent_at ON sends(sent_at);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  send_id TEXT,
  raw_text TEXT NOT NULL,
  class TEXT,                               -- interested|not_now|unsubscribe|wrong_person|other
  reply_draft TEXT,
  reply_status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|sent|none
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Checked before drafting AND before sending. Hash survives lead deletion.
CREATE TABLE IF NOT EXISTS suppressions (
  email_hash TEXT PRIMARY KEY,
  email TEXT,
  reason TEXT NOT NULL,                     -- unsubscribe|bounce|complaint|manual|wrong_person
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- auto_send_<category> keys are absent/0 by default: human approval is required.
INSERT OR IGNORE INTO settings(key, value) VALUES ('paused', '0');

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ok INTEGER NOT NULL,
  detail TEXT
);
