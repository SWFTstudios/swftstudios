# SWFT — Booking Flow Integrations (Airtable + Stripe + Resend)

**Submissions go straight to Airtable** — no more FormSubmit for live lead forms.
Production is **Cloudflare Pages** project **`swftstudios-website`**. Forms post to
same-origin `/api/*` **Pages Functions** under [`functions/api/`](../functions/api/),
which write to Airtable and send email via **Resend** when `RESEND_API_KEY` is set
(that secret is already configured on `swftstudios-website`).

[`src/worker.ts`](../src/worker.ts) mirrors the same handlers for local `wrangler` /
optional Worker deploys — keep it in sync with Pages Functions.

| Form | Pages Function | Airtable (CRM) | Email |
|---|---|---|---|
| `book/<tier>.html` (Stripe tier booking) | `POST /api/book-tier` → [`functions/api/book-tier.js`](../functions/api/book-tier.js) | Paid Bookings + Pipeline | Team notify → `hello@swftstudios.com` + visitor confirmation, then Stripe Checkout |
| `growth-audit.html` (Free Growth Audit — multi-step) | `POST /api/growth-audit` → [`functions/api/growth-audit.js`](../functions/api/growth-audit.js) | Growth Audits + Pipeline | Team notify → `hello@swftstudios.com` + visitor confirmation |
| `contact.html` (Project inquiry) | `POST /api/contact` → [`functions/api/contact.js`](../functions/api/contact.js) | Contact Inquiries + Pipeline | Team notify → `hello@swftstudios.com` + visitor confirmation |
| `swft-method.html` (Instant Website intake — demoted) | `POST /api/build-request` → [`functions/api/build-request.js`](../functions/api/build-request.js) | Website Build Requests + Pipeline | Legacy FormSubmit notify (not Resend yet) |

Full CRM schema, Kanban usage, and table IDs: [`docs/AIRTABLE_CRM.md`](AIRTABLE_CRM.md). Shared write helper: [`functions/_lib/airtable-crm.js`](../functions/_lib/airtable-crm.js).

### Stripe tier booking pages

Each offer in [`data/pricing.json`](../data/pricing.json) has a dedicated booking page under `/book/`:

| Page | Checkout |
|---|---|
| `/book/gbp-content-refresh.html` | $400 one-time (start of $400–$600) |
| `/book/website-only.html` | $800 one-time (start of $800–$1,500) |
| `/book/website-content-half.html` | $2,000 one-time (start of $2,000–$2,800) |
| `/book/website-content-full.html` | $3,000 one-time (start of $3,000–$4,500+) |
| `/book/content-growth-retainer.html` | $450/mo subscription |
| `/book/full-growth-partner.html` | $1,200/mo subscription |

Flow: form → Airtable + Resend → **Stripe Payment Link** (prefilled email) → after pay, `/portal/onboard.html`.

Payment Links are preferred so booking works **without** `STRIPE_SECRET_KEY`. Checkout Sessions remain an optional fallback only if a Payment Link is missing and a secret key is set.

**Amounts / Price IDs / Payment Links** are server-authoritative in [`functions/_lib/stripe-tiers.js`](../functions/_lib/stripe-tiers.js)
(also mirrored in [`src/worker.ts`](../src/worker.ts) / [`src/portal-handlers.ts`](../src/portal-handlers.ts); keep in sync with `pricing.json` / `stripe-catalog.json`).
Clients cannot set the price.

Regenerate pages after editing pricing stripe fields:

```bash
npm run build:book
```

Pricing card CTAs use `tier.bookUrl` (see [`js/pricing-render.js`](../js/pricing-render.js)). The Growth Audit path remains for “not sure” traffic.

`STRIPE_SECRET_KEY` is optional while Payment Links are in use. Without a Payment Link URL for a tier, `/api/book-tier` returns 502.

### Client portal + Stripe webhooks

See [`docs/CLIENT_PORTAL.md`](CLIENT_PORTAL.md) for full product + ops docs.

| Route | Role |
|---|---|
| `/portal/onboard.html` | Email + password signup (hashed in D1) |
| `/portal/login.html` | Sign in |
| `/portal/dashboard.html` | Project status + PostHog metrics by staff-assigned host |
| `POST /api/stripe-webhook` | Provisions portal user/project after payment |
| `POST /api/admin/projects` | Staff sets `site_host` (`PORTAL_ADMIN_SECRET`) |

D1 database: **`swft-portal`** (`dfd16777-238c-4679-a8e2-68a5bf9b707b`), binding **`DB`**.

Additional secrets: `STRIPE_WEBHOOK_SECRET`, `PORTAL_ADMIN_SECRET`, `POSTHOG_PERSONAL_API_KEY`.

### Growth Audit multi-step flow

`growth-audit.html` is a 5-step onboarding form (progress bar):

1. Contact info (name, email, phone, business)
2. Website and/or social (at least one required)
3. Desired service (dropdown of pricing packages; pre-selected from `?plan=<tier-id>`)
4. Additional details + photo share links + consent
5. Cal.com booking (`https://cal.com/swftstudios/swft-meeting`) after the lead is saved

Pricing tier CTAs in [`js/pricing-render.js`](../js/pricing-render.js) link to `/growth-audit?plan=<id>` (e.g. `website-only`, `gbp-refresh`). Generic “Get Your Free Growth Audit” CTAs omit `plan` so the dropdown starts empty.

### Airtable CRM (created)

The **SWFT Website Leads** base is a hub-and-spoke CRM (People, Companies, Pipeline Kanban, plus one table per form). Table IDs are baked into [`functions/_lib/airtable-crm.js`](../functions/_lib/airtable-crm.js). See [`docs/AIRTABLE_CRM.md`](AIRTABLE_CRM.md).

```bash
# Dashboard: Pages → swftstudios-website → Settings → Variables and Secrets
# AIRTABLE_TOKEN (secret) — needs data.records:read + data.records:write
# Optional overrides if you recreate tables:
# AIRTABLE_TABLE_GROWTH_AUDIT, AIRTABLE_TABLE_CONTACT, AIRTABLE_TABLE_BOOKINGS,
# AIRTABLE_TABLE, AIRTABLE_TABLE_PEOPLE, AIRTABLE_TABLE_COMPANIES, AIRTABLE_TABLE_PIPELINE
```

Recommended Airtable automation: optional — Resend handles confirmation email
from the Pages Function (see Resend setup below).

`/api/build-request` also **starts a Stripe Checkout session** for the chosen plan
and returns its URL, which the page redirects the visitor to (only if a Stripe key
is set).

Growth Audit is multi-step and requires JavaScript. Contact is a single-page form.
On a submit error the page shows an inline "try again / email us" message instead of
bouncing the visitor to a third-party error page.

### Confirmation emails (Resend)

Contact, Growth Audit, and book-tier submissions send:

1. **Team notification** to `hello@swftstudios.com` (override with `NOTIFY_EMAIL`), with `Reply-To` set to the visitor so you can reply in-thread.
2. **Visitor confirmation** from `SWFT Studios <hello@swftstudios.com>` (override with `RESEND_FROM`).

Implementation:

- Worker: Resend helpers inside [`src/worker.ts`](../src/worker.ts)
- Pages Functions (mirror): [`functions/_lib/resend.js`](../functions/_lib/resend.js)

Email is best-effort — Airtable write still succeeds if Resend fails. Responses include `emailed: true|false`.

**Required secret (already set on production):** `RESEND_API_KEY` on Cloudflare Pages project **`swftstudios-website`**
(Dashboard → Workers & Pages → `swftstudios-website` → Settings → Variables and Secrets).

The code reads `env.RESEND_API_KEY` in both Pages Functions and [`src/worker.ts`](../src/worker.ts) — that exact name.

```bash
# Production Pages (only if rotating / re-adding the key)
npx wrangler pages secret put RESEND_API_KEY --project-name=swftstudios-website

# Local (copy .dev.vars.example → .dev.vars; never commit .dev.vars)
# RESEND_API_KEY=re_xxxxxxxx
```

Do **not** use `npx wrangler secret put RESEND_API_KEY` against Worker name `swftstudios` from `wrangler.jsonc` unless you intentionally deploy that Worker — production form traffic is the Pages project.

Domain `swftstudios.com` is **Verified** for sending in Resend (US East). Keep it verified.

Optional vars (plain text, not secrets):

| Var | Default |
|---|---|
| `RESEND_FROM` | `SWFT Studios <hello@swftstudios.com>` |
| `NOTIFY_EMAIL` | `hello@swftstudios.com` |

Do **not** call Resend from the browser — the API has no CORS and would expose the key.

---

## Resources already provisioned

These IDs are **baked in as defaults** in `src/worker.ts` (`DEFAULTS`), so you
do **not** need to set them unless you want to point at different ones.

| Thing | ID |
|---|---|
| Airtable base — "SWFT Website Leads" | `appjwRgcgS0BD4lT7` |
| Companies | `tblsWplUc9TypNts6` |
| People | `tbl8Dh908emJXZ6vj` |
| Pipeline | `tblRnwAPc9Yz6LnHz` |
| Growth Audits | `tbl4yRS7k6ZIYQ4zh` |
| Contact Inquiries | `tbl1juYArQAJxoQcf` |
| Paid Bookings | `tbloX0ged1EJUOpuA` |
| Website Build Requests | `tbl2oMRm4qjOftvLQ` |
| Archive — Discovery Calls | `tblGCvDi4RdGkK96L` |
| Stripe price — Monthly Plan ($299/mo) | `price_1Td9xhAF4d9gCyuNnjPgqkho` (legacy Instant Website) |
| Stripe price — Maintenance ($99/mo) | `price_1Td9xiAF4d9gCyuN6rUc25R0` (legacy) |
| Offer-ladder Prices + Payment Links | See [`data/stripe-catalog.json`](../data/stripe-catalog.json) |
| D1 — client portal | `swft-portal` / `dfd16777-238c-4679-a8e2-68a5bf9b707b` |

The base lives in your **SWFT Studios Workspace** on Airtable (account
`elombe@swftstudios.com`). Day-to-day: open **Pipeline** and Kanban by **Stage**.

> The Stripe products were created in **live mode**. Real cards will be charged.
> Test first with a test key if you want to dry-run the flow.

---

## Setup — secrets on Pages (`swftstudios-website`)

Production is the **Cloudflare Pages** project **`swftstudios-website`**. Form handlers live in
[`functions/api/`](../functions/api/) and already look for `env.RESEND_API_KEY`.

To see submissions land in Airtable **and** emails fire via Resend, confirm these secrets on that project:

1. Create the Airtable token at **https://airtable.com/create/tokens** while signed in as
   `elombe@swftstudios.com`.
2. Scope: **`data.records:write`** and **`data.records:read`** (read is required for
   person/company upsert by email).
3. Access: the **"SWFT Website Leads"** base.
4. Secrets (Dashboard → Pages → `swftstudios-website` → Settings → Variables and Secrets):

| Secret | Status |
|---|---|
| `AIRTABLE_TOKEN` | Required for lead storage |
| `RESEND_API_KEY` | **Already set** — name must stay exactly `RESEND_API_KEY` |
| `STRIPE_SECRET_KEY` | Required for `/api/book-tier` checkout |
| `STRIPE_WEBHOOK_SECRET` | Required for portal provisioning after payment |
| `PORTAL_ADMIN_SECRET` | Required for staff host assignment |
| `POSTHOG_PERSONAL_API_KEY` | Required for client dashboard metrics |

```bash
# Rotate Resend key on Pages only:
npx wrangler pages secret put RESEND_API_KEY --project-name=swftstudios-website
```

Local: copy [`.dev.vars.example`](../.dev.vars.example) to `.dev.vars` (gitignored).

That's it — Growth Audit, contact, and booking submissions then appear in Airtable,
and Resend sends team + visitor mail when `RESEND_API_KEY` is present.

### Stripe (optional — only needed to take payment)
Set `STRIPE_SECRET_KEY` on the same Pages project (secret).
Without it, `/api/book-tier` returns 503; contact and growth-audit still work.

> Until `AIRTABLE_TOKEN` is set, the Functions accept the submission and show the
> visitor a success message, but the record isn't saved. Until `RESEND_API_KEY` is
> set, `emailed` is `false` and no mail is sent.

### Optional overrides (vars, not secrets)
`STRIPE_PRICE_MONTHLY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE`,
`AIRTABLE_TABLE_CONTACT`, `AIRTABLE_TABLE_GROWTH_AUDIT`, `AIRTABLE_TABLE_BOOKINGS`,
`AIRTABLE_TABLE_PEOPLE`, `AIRTABLE_TABLE_COMPANIES`, `AIRTABLE_TABLE_PIPELINE`,
`RESEND_FROM`, `NOTIFY_EMAIL`.

---

## How each plan is charged

- **Monthly Plan** → Stripe Checkout in `subscription` mode using the $299/mo price.
- **One-Time Build** → Stripe Checkout in `payment` mode for the **computed total**
  (base $800 + selected features, capped at $2,500). The maintenance add-on choice
  is recorded in Airtable + Stripe metadata; set up the $99/mo maintenance
  subscription separately (the maintenance price already exists).

## Local dev / deploy

```bash
npx wrangler pages dev .            # local Pages + functions/api
# or: npx wrangler dev              # Worker mirror in src/worker.ts (needs .dev.vars)
npx wrangler pages deploy . --project-name=swftstudios-website
```

### Failure cases (forms + Resend)

1. **Missing `RESEND_API_KEY`** — API still returns `{ ok: true }`; Airtable may store; `emailed` is false; no mail.
2. **Resend 403 (domain / from mismatch)** — Function/Worker logs the error body; lead still stored; visitor sees success.
3. **Missing Pages Function** — `POST /api/growth-audit` returns 405; the form shows "Unable to send right now."
4. **Missing `AIRTABLE_TOKEN`** — API returns `{ ok: true, stored: false }`; visitor still reaches thank-you, lead is not saved.
5. **Invalid / oversized JSON** — API returns 400/413 with `{ ok: false, error }`; form shows that error inline.
6. **Missing `STRIPE_SECRET_KEY` on book-tier** — `503` with inline checkout error; lead may still be in Airtable.
