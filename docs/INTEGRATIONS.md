# SWFT — Booking Flow Integrations (Airtable + Stripe)

**Submissions go straight to Airtable** — no more FormSubmit (their service was
returning 521 errors). Production is **Cloudflare Pages** (`swftstudios-website`);
forms post to **Pages Functions** under `functions/api/`, which write to your
Airtable base and send email via **Resend** when `RESEND_API_KEY` is set.
(`src/worker.ts` mirrors the same Airtable handlers for local `wrangler` use.)

| Form | Pages Function | Airtable table | Email |
|---|---|---|---|
| `book/<tier>.html` (Stripe tier booking) | `POST /api/book-tier` → `functions/api/book-tier.js` | "Discovery Calls" | Team notify → `hello@swftstudios.com` + visitor confirmation, then Stripe Checkout |
| `growth-audit.html` (Free Growth Audit — multi-step) | `POST /api/growth-audit` → `functions/api/growth-audit.js` | "Growth Audits" (`AIRTABLE_TABLE_GROWTH_AUDIT`) or Discovery Calls fallback | Team notify → `hello@swftstudios.com` + visitor confirmation |
| `contact.html` (Project inquiry) | `POST /api/contact` → `functions/api/contact.js` | "Discovery Calls" | Team notify → `hello@swftstudios.com` + visitor confirmation |
| `swft-method.html` (Instant Website intake — demoted) | `POST /api/build-request` → `functions/api/build-request.js` | "Website Build Requests" | (Airtable only for now) |

### Stripe tier booking pages

Each offer in [`data/pricing.json`](../data/pricing.json) has a dedicated booking page under `/book/`:

| Page | Checkout |
|---|---|
| `/book/gbp-refresh.html` | $400 one-time (start of $400–$600) |
| `/book/website-only.html` | $800 one-time (start of $800–$1,500) |
| `/book/website-content-half.html` | $2,000 one-time (start of $2,000–$2,800) |
| `/book/website-content-full.html` | $3,000 one-time (start of $3,000–$4,500+) |
| `/book/content-growth-retainer.html` | $450/mo subscription |
| `/book/full-growth-partner.html` | $1,200/mo subscription |

Flow: form → Airtable + Resend → Stripe Checkout → `/book/thank-you.html`.

**Amounts are server-authoritative** in [`functions/_lib/stripe-tiers.js`](../functions/_lib/stripe-tiers.js) (mirrored in `pricing.json` → `tier.stripe`). Clients cannot set the price.

Regenerate pages after editing pricing stripe fields:

```bash
npm run build:book
```

Pricing card CTAs use `tier.bookUrl` (see [`js/pricing-render.js`](../js/pricing-render.js)). The Growth Audit path remains for “not sure” traffic.

Required secret (same Pages project): `STRIPE_SECRET_KEY`. Without it, `/api/book-tier` returns 503 and the form shows an inline error.

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

Then set env on the **Pages** project (or leave unset to use the Discovery Calls fallback):

```bash
# Dashboard: Pages → swftstudios-website → Settings → Variables and Secrets
# AIRTABLE_TOKEN (secret) — already required for /api/contact
# AIRTABLE_TABLE_GROWTH_AUDIT (plain text) = tblXXXXXXXX  after you create the table
```

Recommended Airtable automation: optional — Resend now handles confirmation email
from the Pages Function (see Resend setup below).

`/api/build-request` also **starts a Stripe Checkout session** for the chosen plan
and returns its URL, which the page redirects the visitor to (only if a Stripe key
is set).

Growth Audit is multi-step and requires JavaScript. Contact is a single-page form.
On a submit error the page shows an inline "try again / email us" message instead of
bouncing the visitor to a third-party error page.

### Confirmation emails (Resend)

Growth Audit and contact submissions send:

1. **Team notification** to `hello@swftstudios.com` (override with `NOTIFY_EMAIL`), with `Reply-To` set to the visitor so you can reply in-thread.
2. **Visitor confirmation** from `SWFT Studios <hello@swftstudios.com>` (override with `RESEND_FROM`).

Shared helper: `functions/_lib/resend.js`. Email is best-effort — Airtable write still succeeds if Resend fails.

**Required secret (you already added this):** `RESEND_API_KEY` on Pages → `swftstudios-website`.

Optional vars:

| Var | Default |
|---|---|
| `RESEND_FROM` | `SWFT Studios <hello@swftstudios.com>` |
| `NOTIFY_EMAIL` | `hello@swftstudios.com` |

Domain `swftstudios.com` must stay **Verified** for sending in the Resend dashboard.

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

## Setup — the ONE thing to do

To see submissions land in Airtable, set a single secret on the **Pages** project
(`swftstudios-website` — already used by `/api/contact`):

1. Create the token at **https://airtable.com/create/tokens** while signed in as
   `elombe@swftstudios.com`.
2. Scope: **`data.records:write`** (add `data.records:read` too if you like).
3. Access: the **"SWFT Website Leads"** base.
4. In the Cloudflare dashboard:
   *Pages → swftstudios-website → Settings → Variables and Secrets → Add (Secret)*
   name `AIRTABLE_TOKEN`.

That's it — Growth Audit, contact, and booking submissions then appear in Airtable.
(`/api/contact` already returns `stored: true` in production, so this secret is set.)

### Stripe (optional — only needed to take payment)
Set `STRIPE_SECRET_KEY` on the same Pages project (secret).
Without it, the booking flow still saves to Airtable and shows the on-page
confirmation — it just won't open a checkout page.

> Until `AIRTABLE_TOKEN` is set, the Functions accept the submission and show the
> visitor a success message, but the record isn't saved.

### Optional overrides (vars, not secrets)
`STRIPE_PRICE_MONTHLY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE`,
`AIRTABLE_TABLE_CONTACT`, `AIRTABLE_TABLE_GROWTH_AUDIT`.

---

## How each plan is charged

- **Monthly Plan** → Stripe Checkout in `subscription` mode using the $299/mo price.
- **One-Time Build** → Stripe Checkout in `payment` mode for the **computed total**
  (base $800 + selected features, capped at $2,500). The maintenance add-on choice
  is recorded in Airtable + Stripe metadata; set up the $99/mo maintenance
  subscription separately (the maintenance price already exists).

## Local dev / deploy

Production deploys from Git → Cloudflare Pages (`swftstudios-website` on `main`).
Merging/pushing this function to `main` publishes `/api/growth-audit`.

```bash
npx wrangler pages deploy . --project-name=swftstudios-website   # manual Pages publish
# or: push/merge to main (Git-connected Pages)
```

### Failure cases (Growth Audit)

1. **Missing Pages Function** — `POST /api/growth-audit` returns 405 empty body; the form shows "Unable to send right now."
2. **Missing `AIRTABLE_TOKEN`** — API returns `{ ok: true, stored: false }`; visitor still reaches thank-you, lead is not saved.
3. **Invalid / oversized JSON** — API returns 400/413 with `{ ok: false, error }`; form shows that error inline.
