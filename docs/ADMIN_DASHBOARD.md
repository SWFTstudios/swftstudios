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

## Analytics tab (the SWFT site itself)

`GET /api/admin/analytics` (admin only) shows the last 30 days for swftstudios.com from two sources, each degrading on its own:

| Card | Source | Setup | What it counts |
| --- | --- | --- | --- |
| Traffic | Cloudflare GraphQL Analytics API (`httpRequests1dGroups`), `functions/_lib/cloudflare-analytics.js` | Secret `CF_ANALYTICS_TOKEN` (API token with **Zone → Analytics → Read** for swftstudios.com) and variable `CF_ZONE_ID` (zone Overview page, right column) | Every request Cloudflare served, bots and files included; unique visitors = unique IPs per day. Matches the zone Overview in the Cloudflare dashboard. |
| Visitors | PostHog, `functions/_lib/posthog-metrics.js` | `POSTHOG_PERSONAL_API_KEY` (already used by the client portal); host from `SITE_ANALYTICS_HOST` (default `swftstudios.com`) | People who loaded pages with the snippet; top pages |
| Google Analytics | Link only | — | GA4 needs a service account to read from a Worker; not wired yet |

## Projects tab

Lists every client project with its progress. **Open** shows milestones (change status inline, add, remove), client-visible updates, and private notes. **View as client ↗** opens `/portal/dashboard.html?preview=<projectId>`: the client dashboard rendered from `GET /api/admin/project?id=…&metrics=1`, the same view the client gets from `GET /api/portal/project`, with a banner. Admin notes are never part of that view.

Writes: `POST /api/admin/project` with `action` = `milestone_status`, `add_milestone`, `edit_milestone`, `move_milestone`, `reorder_milestones`, `delete_milestone`, `add_update`, `delete_update`, `rename` (admin session + same-origin).

### Default steps and project-specific steps

Every new project (created when a client pays) starts with the default steps in [`functions/_lib/default-steps.js`](../functions/_lib/default-steps.js): Initial call, Deposit paid (done), Design review, Build, Review & revisions, Final approval, Final payment (the balance is due before launch), Launch, 30-day support check-in. After the initial call, open the project and add what that client needs (for example "CMS connection") with **Add**; use **Edit** to change a step's title, description or date, **drag the dotted tab** on a card to reorder (or focus the tab and press the up/down arrow keys; the client's dashboard updates right away), **Remove** for steps that don't apply, and the status dropdown to check steps off. Changing the default list affects new projects only.

Storage: migration `0004_project_progress.sql` (`project_milestones`, `project_updates`, `projects.name`, `projects.is_demo`). Before it is applied, the dashboard still loads; progress shows as unavailable.

## Demo client project

`scripts/seed-demo-project.sql` creates client **elombekisala@gmail.com** with project "SWFT Studios website + content (demo)" (Website + Content Capture, active, analytics host swftstudios.com), six milestones (three done, one in progress) and three updates, dated relative to the day you run it. Re-running resets the demo only.

```bash
npx wrangler d1 migrations apply swft-portal --remote
npx wrangler d1 execute swft-portal --remote --file scripts/seed-demo-project.sql
```

Then sign in as the demo client once at `/portal/onboard.html` (email + a new password), and as the owner use **Projects → View as client**.
