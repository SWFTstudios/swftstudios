# SWFT — Booking Flow Integrations (Airtable + Stripe + Resend)

**Submissions go straight to Airtable** — no more FormSubmit for live lead forms.
Production is **Cloudflare Pages** project **`swftstudios-website`**. Forms post to
same-origin `/api/*` **Pages Functions** under [`functions/api/`](../functions/api/),
which write to Airtable and send email via **Resend** when `RESEND_API_KEY` is set
(that secret is already configured on `swftstudios-website`).

[`src/worker.ts`](../src/worker.ts) mirrors the same handlers for local `wrangler` /
optional Worker deploys — keep it in sync with Pages Functions.

| Form | Pages Function | Airtable table | Email |
|---|---|---|---|
| `book/<tier>.html` (Stripe tier booking) | `POST /api/book-tier` → [`functions/api/book-tier.js`](../functions/api/book-tier.js) | "Discovery Calls" | Team notify → `hello@swftstudios.com` + visitor confirmation, then Stripe Checkout |
| `growth-audit.html` (Free Growth Audit — multi-step) | `POST /api/growth-audit` → [`functions/api/growth-audit.js`](../functions/api/growth-audit.js) | "Growth Audits" (`AIRTABLE_TABLE_GROWTH_AUDIT`) or Discovery Calls fallback | Team notify → `hello@swftstudios.com` + visitor confirmation |
| `contact.html` (Project inquiry) | `POST /api/contact` → [`functions/api/contact.js`](../functions/api/contact.js) | "Discovery Calls" | Team notify → `hello@swftstudios.com` + visitor confirmation |
| `swft-method.html` (Instant Website intake — demoted) | `POST /api/build-request` → [`functions/api/build-request.js`](../functions/api/build-request.js) | "Website Build Requests" | Legacy FormSubmit notify (not Resend yet) |

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

Flow: form → Airtable + Resend → Stripe Checkout → `/book/thank-you.html`.

**Amounts are server-authoritative** in [`functions/_lib/stripe-tiers.js`](../functions/_lib/stripe-tiers.js)
(also inlined in [`src/worker.ts`](../src/worker.ts); keep both in sync with `pricing.json` → `tier.stripe`).
Clients cannot set the price.

Regenerate pages after editing pricing stripe fields:

```bash
npm run build:book
```

Pricing card CTAs use `tier.bookUrl` (see [`js/pricing-render.js`](../js/pricing-render.js)). The Growth Audit path remains for “not sure” traffic.

Required secret (Pages `swftstudios-website`): `STRIPE_SECRET_KEY`. Without it, `/api/book-tier` returns 503 and the form shows an inline error.

### Growth Audit multi-step flow

`growth-audit.html` is a 5-step onboarding form (progress bar):

1. Contact info (name, email, phone, business)
2. Website and/or social (at least one required)
3. Desired service (dropdown of pricing packages; pre-selected from `?plan=<tier-id>`)
4. Additional details + photo share links + consent
5. Cal.com booking (`https://cal.com/swftstudios/swft-meeting`) after the lead is saved

Pricing tier CTAs in [`js/pricing-render.js`](../js/pricing-render.js) link to `/growth-audit?plan=<id>` (e.g. `website-only`, `gbp-refresh`). Generic “Get Your Free Growth Audit” CTAs omit `plan` so the dropdown starts empty.

### Growth Audit table setup (manual)

Create a table named **Growth Audits** in the SWFT Website Leads base with fields:

| Field | Type |
|---|---|
| First Name | Single line text |
| Email | Email |
| Phone | Phone / single line |
| Business Name | Single line text |
| Website or Social | URL / single line |
| Business Category | Single line text |
| Biggest Challenge | Single select / long text |
| Desired Outcome | Long text |
| Instagram | Single line text |
| Additional Context | Long text (includes last name, desired service, photo links, notes) |
| UTM Source / Medium / Campaign | Single line text |
| Source Page | Single line text |
| Status | Single select (default New) |
| Submitted At | Date/time |

Optional later (if you add columns in Airtable): Last Name, Desired Service, Photo Links. Until then those values are folded into **Additional Context** / **Biggest Challenge** so writes never fail on unknown fields.

Then set env on the **Pages** project `swftstudios-website` (or leave unset to use the Discovery Calls fallback):

```bash
# Dashboard: Pages → swftstudios-website → Settings → Variables and Secrets
# AIRTABLE_TOKEN (secret) — required for /api/contact and other lead routes
# AIRTABLE_TABLE_GROWTH_AUDIT (plain text) = tblXXXXXXXX  after you create the table
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
| Airtable table — "Website Build Requests" | `tbl30H9M2CC7p6MqY` |
| Airtable table — "Discovery Calls" | `tblGCvDi4RdGkK96L` |
| Stripe price — Monthly Plan ($299/mo) | `price_1Td9xhAF4d9gCyuNnjPgqkho` |
| Stripe price — Maintenance ($99/mo) | `price_1Td9xiAF4d9gCyuN6rUc25R0` |

The base lives in your **SWFT Studios Workspace** on Airtable (account
`elombe@swftstudios.com`). A sample row ("SAMPLE — Jane's Bakery") was added so you
can see the layout — delete it anytime.

> The Stripe products were created in **live mode**. Real cards will be charged.
> Test first with a test key if you want to dry-run the flow.

---

## Setup — secrets on Pages (`swftstudios-website`)

Production is the **Cloudflare Pages** project **`swftstudios-website`**. Form handlers live in
[`functions/api/`](../functions/api/) and already look for `env.RESEND_API_KEY`.

To see submissions land in Airtable **and** emails fire via Resend, confirm these secrets on that project:

1. Create the Airtable token at **https://airtable.com/create/tokens** while signed in as
   `elombe@swftstudios.com`.
2. Scope: **`data.records:write`** (add `data.records:read` too if you like).
3. Access: the **"SWFT Website Leads"** base.
4. Secrets (Dashboard → Pages → `swftstudios-website` → Settings → Variables and Secrets):

| Secret | Status |
|---|---|
| `AIRTABLE_TOKEN` | Required for lead storage |
| `RESEND_API_KEY` | **Already set** — name must stay exactly `RESEND_API_KEY` |
| `STRIPE_SECRET_KEY` | Optional; required for `/api/book-tier` checkout |

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
`AIRTABLE_TABLE_CONTACT`, `AIRTABLE_TABLE_GROWTH_AUDIT`, `RESEND_FROM`, `NOTIFY_EMAIL`.

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
