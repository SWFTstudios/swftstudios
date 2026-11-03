# Admin dashboard (owner only)

Private dashboard at **`/admin/`**. Signing in at `/portal/login.html` with an admin email lands here
instead of the client portal; client emails are unaffected.

## Who is an admin

A normal portal account (same email + password, same session cookie) whose email is on the allowlist.
The check runs **on the server for every admin API call** ([`functions/_lib/admin-auth.js`](../functions/_lib/admin-auth.js));
the page itself only renders what the API returns.

- The owner, `elombe@swftstudios.com`, is **always** an admin.
- `ADMIN_EMAILS` (comma-separated) **adds** admins, e.g. a teammate. It can't remove the owner.
- Admins land on `/admin/` after logging in, and `/portal/dashboard.html` forwards them there. On phones the tab bar shows **Admin**, and on desktop the sidebar shows a **Workspace → Admin** link.
- Signed out -> redirected to the login page. Signed in as a client -> 403 and a short message; no data is returned.
- Writes (`POST`/`DELETE`) also require a same-origin `Origin` header, so another site cannot use your cookie.
- Your account must exist first (create it via `/portal/onboard.html` if needed).

## What it shows

| Tab | Source |
| --- | --- |
| Overview | Client counts and outreach numbers |
| Clients & notes | `projects` + `users` in D1 `swft-portal`; private notes in `admin_notes` (per project, plus general notes) |
| Outreach | D1 `swft-outreach` via the `OUTREACH_DB` binding: leads by status, drafts awaiting approval, recent sends, replies, job runs |
| Emails | Resend "list emails" API using `RESEND_API_KEY` |
| Blog | `data/blog-posts.json` (generated from `blog/*.html`) |

## One-time setup

1. Apply the notes table to the portal database:
   `npx wrangler d1 migrations apply swft-portal --remote` (adds [`migrations/0002_admin_notes.sql`](../migrations/0002_admin_notes.sql)).
2. **Outreach tab:** after creating the `swft-outreach` D1, add it to the Pages project `swftstudios-website`
   as a D1 binding named **`OUTREACH_DB`** (Pages > Settings > Bindings, or in `wrangler.pages.jsonc`). Until then the tab says "not connected".
3. **Emails tab:** Resend keys scoped to "sending access" cannot list emails. Either use a full-access key
   or accept the tab's notice. Never paste the key anywhere but `wrangler pages secret put RESEND_API_KEY`.
4. **Blog tab:** run `npm run build:blog-index` after adding or editing a blog page, and commit `data/blog-posts.json`.
5. Optional: `wrangler pages secret put ADMIN_EMAILS` to add more admins.

## Notes on privacy and crawling

`/admin/` and `/portal/` are `Disallow`ed in `robots.txt`, served `noindex, nofollow`, and `/api/admin/*` is `no-store`.
Notes are stored only in D1 and never returned to clients; client-facing endpoints do not query `admin_notes`.

## Not included yet

- Editing/publishing blog posts from the dashboard (it lists them; edit in the repo/Webflow).
- Approving outreach drafts: arrives with the approval-page slice of the outreach Worker.
- `src/worker.ts` (the local/optional Worker mirror) does not have these routes yet; production is the Pages project.

## Tests

`npm run test:admin` runs the real portal migrations through a D1 shim and covers: allowlist, 401/403/200 gating,
origin check, notes create/list/delete, outreach degrade, Resend listing, and the login redirect.
