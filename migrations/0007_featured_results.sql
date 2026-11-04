-- Client sites the owner chose to feature in the home page Results cards.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
-- A featured site only shows while its numbers are up (see /api/results).
CREATE TABLE IF NOT EXISTS featured_results (
  zone_id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  label TEXT,              -- client name to show, e.g. "Blurred Lines Entertainment"
  link TEXT,               -- optional case study path, e.g. /case-study/blurred-lines-entertainment.html
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
