-- Free SWFT Growth Guide requests, so the owner can answer "do it for me"
-- requests (and worksheet answers) from the admin Guides tab.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
--
-- kind:    diy (sent the worksheet) | dfy (do it for me) | answers (worksheet sent back)
-- details: JSON of what they filled in (business, links, sells, customers, goal, notes or answers)
-- status:  new | sent (results emailed from admin)
CREATE TABLE IF NOT EXISTS growth_guides (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('diy', 'dfy', 'answers')),
  email TEXT NOT NULL,
  first_name TEXT,
  business_name TEXT,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'sent')),
  results TEXT,
  results_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_growth_guides_created ON growth_guides(created_at);
