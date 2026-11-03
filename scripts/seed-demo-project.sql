-- Demo client project for the owner dashboard and the client portal.
-- Client: elombekisala@gmail.com (sign in at /portal/onboard.html the first
-- time to set a password; after that /portal/login.html).
-- Site analytics point at swftstudios.com so the demo shows live numbers.
--
-- Needs migrations 0001-0004. Safe to run again: it resets the demo's
-- milestones and updates, and never touches other projects.
--   npx wrangler d1 execute swft-portal --remote --file scripts/seed-demo-project.sql
--
-- Remove the demo later:
--   npx wrangler d1 execute swft-portal --remote --command "DELETE FROM projects WHERE id = 'demo-swft-website'"

INSERT OR IGNORE INTO users (id, email) VALUES ('demo-client-elombe', 'elombekisala@gmail.com');

INSERT INTO projects (id, user_id, tier_id, status, site_host, name, is_demo, created_at, updated_at)
VALUES (
  'demo-swft-website',
  (SELECT id FROM users WHERE email = 'elombekisala@gmail.com' COLLATE NOCASE),
  'website-content-half', 'active', 'swftstudios.com',
  'SWFT Studios website + content (demo)', 1,
  datetime('now', '-24 days'), datetime('now')
)
ON CONFLICT(id) DO UPDATE SET status = 'active', site_host = 'swftstudios.com', name = excluded.name, is_demo = 1, updated_at = datetime('now');

DELETE FROM project_milestones WHERE project_id = 'demo-swft-website';
INSERT INTO project_milestones (id, project_id, title, detail, status, due_date, sort_order, completed_at) VALUES
  ('demo-ms-1', 'demo-swft-website', 'Kickoff & strategy call', 'Goals, audience and the one action every visitor should take.', 'done', date('now', '-24 days'), 1, datetime('now', '-24 days')),
  ('demo-ms-2', 'demo-swft-website', 'Content shoot', '3-hour on-site shoot: photos and short-form video.', 'done', date('now', '-17 days'), 2, datetime('now', '-17 days')),
  ('demo-ms-3', 'demo-swft-website', 'Design review', 'Homepage and service pages reviewed on phone and desktop.', 'done', date('now', '-9 days'), 3, datetime('now', '-8 days')),
  ('demo-ms-4', 'demo-swft-website', 'Build & tracking setup', 'Pages built, booking connected, Google tag and key events set up.', 'in_progress', date('now', '+4 days'), 4, NULL),
  ('demo-ms-5', 'demo-swft-website', 'Launch', 'Domain connected, final checks, site live.', 'upcoming', date('now', '+10 days'), 5, NULL),
  ('demo-ms-6', 'demo-swft-website', 'First monthly report', 'Traffic, leads and the three moves for next month.', 'upcoming', date('now', '+40 days'), 6, NULL);

DELETE FROM project_updates WHERE project_id = 'demo-swft-website';
INSERT INTO project_updates (id, project_id, body, created_at) VALUES
  ('demo-up-1', 'demo-swft-website', 'Kickoff done. Goal for the site: more booked consults from Google and Instagram.', datetime('now', '-24 days')),
  ('demo-up-2', 'demo-swft-website', 'Shoot wrapped: 50 edited photos and 3 short videos are in your shared folder.', datetime('now', '-16 days')),
  ('demo-up-3', 'demo-swft-website', 'Design approved. We are building the pages now and setting up booking and tracking. Next stop: launch.', datetime('now', '-7 days'));
