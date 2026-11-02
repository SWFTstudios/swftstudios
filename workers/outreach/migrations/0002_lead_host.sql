-- Dedupe key for chains/branches that share a website but have different place_ids.
ALTER TABLE leads ADD COLUMN website_host TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_host ON leads(website_host);
