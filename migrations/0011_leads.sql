-- Website leads (contact, Free Growth Audit, booking / quote, website build,
-- growth guide). Every form submission is saved here first, so a lead is never
-- lost when email delivery fails. Shown in the admin Leads tab.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
--
-- form_group:      Project Inquiry | Growth Audit | Paid Booking | Website Build
-- fields:          JSON of every field the form sent (same keys as the team email)
-- email_delivered: 1 team email sent, 0 failed, NULL not attempted yet
-- status:          new | contacted | won | lost | spam | test ([SWFT TEST] submissions)
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  form_group TEXT NOT NULL,
  form_type TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  business TEXT,
  source_page TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  fields TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  email_delivered INTEGER,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost', 'spam', 'test')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
