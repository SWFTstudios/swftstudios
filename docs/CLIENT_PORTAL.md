# Client Portal

A shared workspace for SWFT Studios and its clients. Clients upload photos, videos, logos and docs (or share links), leave notes, requests, revisions and approvals, tick off their checklist and follow each project through its stages. SWFT runs everything from an admin dashboard: clients, invites, projects, stages, due dates, tasks and replies. Built on Cloudflare: Pages Functions (API), D1 (`swft-portal`), R2 (`swft-client-files`) and Email Service, with Resend for client emails.

## Pages

| Route | Who | Purpose |
| --- | --- | --- |
| [`/portal/login.html`](../portal/login.html) | everyone | Sign in. Admins land on the admin dashboard, clients on theirs |
| [`/portal/forgot.html`](../portal/forgot.html) | everyone | Email a password reset link (2 hours) |
| [`/portal/reset.html`](../portal/reset.html) | everyone | Choose a new password from that link |
| [`/portal/onboard.html`](../portal/onboard.html) | invited clients | Set a password from an invite link (7 days). **Invite-only**: without a valid token nobody can create or claim an account |
| [`/portal/dashboard.html`](../portal/dashboard.html) | clients | Their projects: Overview, Files, Notes & requests, Checklist, Activity, plus site traffic once `siteHost` is set |
| [`/portal/admin.html`](../portal/admin.html) | admins | Every project and client: create clients (with invite), projects, stages, due dates, tasks (client-visible or internal), replies, downloads |

Front end: [`js/portal.js`](../js/portal.js) (helpers) and [`js/portal-app.js`](../js/portal-app.js) (both dashboards), styled by [`css/portal.css`](../css/portal.css).

## Who is an admin

Anyone whose `users.role` is `admin`, or whose email is listed in the `ADMIN_EMAILS` var (comma-separated, default `hello@swftstudios.com`).

**First admin sign-in:** go to `/portal/forgot.html`, enter an `ADMIN_EMAILS` address, and use the emailed link to set a password. (The forgot flow creates the admin account if it doesn't exist; owning the inbox is the proof.)

## Workspace API

All routes live in [`functions/_lib/portal-api.js`](../functions/_lib/portal-api.js), mounted by `functions/api/portal/[[path]].js` and `functions/api/admin/[[path]].js`. Every route needs a session; `/api/admin/*` needs an admin; clients only ever reach their own projects. Writes from another origin are rejected.

| Method + path | Purpose |
| --- | --- |
| `POST /api/portal/forgot`, `POST /api/portal/reset` | Password reset (same answer whether or not the email exists) |
| `GET /api/portal/session` | Signed-in user, stages, upload part size |
| `GET /api/portal/projects`, `GET /api/portal/projects/:id` | List (with counts and "new since you looked") / full project |
| `POST /api/portal/projects/:id/uploads` → `PUT /api/portal/uploads/:asset/parts/:n` → `POST /api/portal/uploads/:asset/complete` | Upload a file to R2 in 10 MB parts (up to 5 GB); `DELETE /api/portal/uploads/:asset` aborts |
| `GET /api/portal/files/:asset` | View or `?download=1` (Range supported, so video scrubs) |
| `POST /api/portal/projects/:id/links`, `DELETE /api/portal/assets/:id` | Share / remove links and files |
| `POST /api/portal/projects/:id/messages`, `PATCH /api/portal/messages/:id` | Notes, requests, revisions, approvals, updates (admin); mark requests done |
| `PATCH /api/portal/tasks/:id` | Clients tick tasks; admins also rename, hide, set due dates |
| `GET /api/portal/projects/:id/metrics` | PostHog traffic for the project's `siteHost` |
| `GET/POST /api/admin/clients`, `PATCH /api/admin/clients/:id`, `POST /api/admin/clients/:id/invite` | Clients and invites |
| `POST /api/admin/workspace/projects`, `PATCH/DELETE /api/admin/projects/:id`, `POST /api/admin/projects/:id/tasks`, `DELETE /api/admin/tasks/:id` | Projects and tasks |

Files are stored in R2 at `projects/<projectId>/<assetId>/<name>` and are only served through the API after a permission check (never public). Uploaded files are served with `Content-Security-Policy: sandbox` and `nosniff`, so an uploaded HTML/SVG can't run as a page on this site.

## Email

| What | Sent with | To |
| --- | --- | --- |
| New upload, link, note or request from a client | Cloudflare Email Service REST API (falls back to Resend) | `PORTAL_NOTIFY_EMAIL` (default hello@swftstudios.com) |
| Invites, password resets, stage changes, SWFT updates/messages | Resend | the client |

Pages Functions can't use the Worker `send_email` binding, so SWFT notifications use the Email Service REST API. Sends to a **verified Email Routing destination address** are free on every plan. Needs `CF_ACCOUNT_ID` (var) and `CF_EMAIL_API_TOKEN` (secret: an API token with **Email Sending: Edit**); `PORTAL_FROM_EMAIL` must be on swftstudios.com (an Email Routing domain).

## Tests

```bash
npm run db:migrate:local
npx wrangler dev --port 8790      # remove the "ai" binding from a copy of wrangler.jsonc if offline
PORTAL_URL=http://127.0.0.1:8790 npm run test:portal
```

`tests/portal/workspace.e2e.mjs` seeds an admin and invites in the local D1 and checks sign-in, invite-only onboarding, a chunked 12 MB upload, Range downloads, links, messages, hidden tasks, permissions and password reset.

## Older pieces (still in place)

Passwords are never stored in plaintext. Cloudflare D1 stores a per-user salt + PBKDF2-SHA-256 hash. Sessions use an httpOnly `Secure` cookie (`swft_portal_session`).

## What SWFT stores (D1 `swft-portal`)

- **users** — email, password hash/salt, optional `stripe_customer_id`
- **sessions** — session id → user, expiry
- **projects** — tier, Stripe checkout/subscription ids, status (`paid` / `active` / `past_due` / `canceled`), **`site_host`** (staff-only)
- **invite_tokens** — hashed one-time tokens for set-password emails after checkout

Database id: `dfd16777-238c-4679-a8e2-68a5bf9b707b` (binding name **`DB`**).

## Stripe → portal flow

1. Client pays via `/book/` Checkout (reusable Price IDs) or a [Payment Link](../data/stripe-catalog.json).
2. Stripe sends `checkout.session.completed` to `POST /api/stripe-webhook`.
3. Webhook upserts user + project and emails a set-password link (Resend) when the user has no password yet.
4. Client completes [`/portal/onboard.html`](../portal/onboard.html) and lands on the dashboard.

Catalog (Products, Prices, Payment Links): [`data/stripe-catalog.json`](../data/stripe-catalog.json).

## Staff: assign analytics host

Clients cannot choose which hostname to query (that would leak other sites in the shared PostHog project). After the client site is live and PostHog is installed:

```bash
curl -X POST https://www.swftstudios.com/api/admin/projects \
  -H "Authorization: Bearer $PORTAL_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"client@example.com","siteHost":"www.client.com"}'
```

Until `site_host` is set, the dashboard shows: “Analytics pending — we install tracking when your site is live.”

## PostHog on client sites

Install the same US project snippet on the **client** site (project `486061`). Public project token is fine in the browser:

```html
<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('phc_AwfkAWFJ3Xs2vcFLcjhN9CfeSfZ6nYStWvpXMTi3uMkb',{api_host:'https://us.i.posthog.com', defaults:'2025-05-24'})
</script>
```

Dashboard metrics call the PostHog Query API server-side with `POSTHOG_PERSONAL_API_KEY`, filtered by the staff-assigned `$host`. Never expose that personal API key to the browser.

## Required secrets / vars

Workspace additions:

| Name | Where | Notes |
| --- | --- | --- |
| `FILES` | R2 binding | Bucket `swft-client-files` (production + preview) |
| `ADMIN_EMAILS` | Plain var | Comma-separated admin emails (default `hello@swftstudios.com`) |
| `PORTAL_NOTIFY_EMAIL` | Plain var | Where client activity is emailed (must be a verified Email Routing destination) |
| `PORTAL_FROM_EMAIL` | Plain var | Sender on swftstudios.com (default `hello@swftstudios.com`) |
| `CF_ACCOUNT_ID` | Plain var | `e246ec2918a6cd045fd4bfd00f024f0c` |
| `CF_EMAIL_API_TOKEN` | Secret | API token with Email Sending: Edit |
| `RESEND_API_KEY` | Secret | Client emails (invites, resets, updates) |

Existing:

| Name | Where | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Pages/Worker secret | **Required for Checkout** — set in dashboard if missing |
| `STRIPE_WEBHOOK_SECRET` | Secret | Stripe Dashboard → Webhooks → signing secret |
| `SESSION_SECRET` | Secret | Session hardening / future signed cookies |
| `PORTAL_ADMIN_SECRET` | Secret | Bearer token for `/api/admin/projects` |
| `POSTHOG_PERSONAL_API_KEY` | Secret | Personal API key (`phx_…`) with query access — not the public `phc_` project token |
| `POSTHOG_PROJECT_ID` | Plain var | Default `486061` |
| `PORTAL_ORIGIN` | Plain var | Default `https://www.swftstudios.com` (invite links) |
| `STRIPE_PRICE_*` | Plain vars | Override Price IDs from catalog defaults |
| `DB` | D1 binding | Database `swft-portal` |

### Wired on production Pages (`swftstudios-website`) as of 2026-08-20

Already set via API / wrangler:

- D1 binding **`DB`** → `swft-portal` (`dfd16777-238c-4679-a8e2-68a5bf9b707b`) on production + preview
- Secrets: `STRIPE_WEBHOOK_SECRET`, `PORTAL_ADMIN_SECRET`, `SESSION_SECRET`
- Plain vars: `PORTAL_ORIGIN`, `POSTHOG_PROJECT_ID`, all six `STRIPE_PRICE_*`
- Stripe webhook endpoint: `we_1U6cSSAF4d9gCyuNlEcMD2v1` → `https://www.swftstudios.com/api/stripe-webhook`

**Still required (set in Cloudflare Pages → Settings → Variables and Secrets):**

1. `STRIPE_SECRET_KEY` — live secret key from Stripe Dashboard (Checkout will 503 without it)
2. `POSTHOG_PERSONAL_API_KEY` — create at [PostHog user API keys](https://us.posthog.com/settings/user-api-keys) with Query access

Local copies of generated admin/session values (if created by the setup script) live in gitignored `.portal-secrets.local`.

### Stripe webhook setup

1. Stripe Dashboard → Developers → Webhooks → Add endpoint  
2. URL: `https://www.swftstudios.com/api/stripe-webhook`  
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`  
4. Copy signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET` (and Pages project secrets)

### Pages project binding

Production is Cloudflare Pages project **`swftstudios-website`**.

- Worker local/dev config: [`wrangler.jsonc`](../wrangler.jsonc) (includes D1 `DB` for `wrangler dev`)
- Pages deploy config: [`wrangler.pages.jsonc`](../wrangler.pages.jsonc) (D1 + portal vars; no Worker `ASSETS` binding)

```bash
npx wrangler pages deploy . --project-name=swftstudios-website
# or: npm run deploy:pages
```

[`wrangler.pages.jsonc`](../wrangler.pages.jsonc) documents the intended Pages D1 + vars shape. Wrangler Pages does not accept `--config` yet, so production bindings are applied via the Cloudflare Pages API / dashboard; keep this file as the source of truth for what must be bound.

## Failure behavior

1. **Missing Stripe Price / secret** — `/api/book-tier` returns 503/502; no fake checkout URL.
2. **Bad webhook signature or D1 down** — 400/500; Stripe retries; staff can reconcile in Stripe + admin host API.
3. **PostHog key missing / no events** — dashboard still loads; metrics panel shows an explicit pending/empty message (not fake zeros).

## Local test

```bash
npx wrangler d1 migrations apply swft-portal --local
npx wrangler dev
# Open /portal/onboard.html → create account → /portal/dashboard.html
```
