-- Appearance preference (System / Light / Dark) for signed-in users, so the
-- site, portal and admin open in the same mode on every device.
-- Apply to D1 swft-portal:  npx wrangler d1 migrations apply swft-portal --remote
-- NULL = never chosen (the browser's own choice, default dark, applies).
ALTER TABLE users ADD COLUMN ui_mode TEXT CHECK (ui_mode IN ('system', 'light', 'dark'));
