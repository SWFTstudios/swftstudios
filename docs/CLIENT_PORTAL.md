# Client Portal

Client-facing account area for SWFT Studios customers: email + password sign-in, project/billing status from Stripe, and PostHog site performance for the client’s live hostname.

## What clients see

| Route | Purpose |
| --- | --- |
| [`/portal/onboard.html`](../portal/onboard.html) | Create password (after Stripe or with invite token) |
| [`/portal/login.html`](../portal/login.html) | Sign in |
| [`/portal/dashboard.html`](../portal/dashboard.html) | Project status + last-30-day traffic metrics |

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

| Name | Where | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Pages/Worker secret | Existing; Checkout |
| `STRIPE_WEBHOOK_SECRET` | Secret | Stripe Dashboard → Webhooks → signing secret |
| `SESSION_SECRET` | Secret | Reserved for future signed cookies; sessions currently use random D1 ids |
| `PORTAL_ADMIN_SECRET` | Secret | Bearer token for `/api/admin/projects` |
| `POSTHOG_PERSONAL_API_KEY` | Secret | Personal API key with query access |
| `POSTHOG_PROJECT_ID` | Optional var | Default `486061` |
| `PORTAL_ORIGIN` | Optional var | Default `https://www.swftstudios.com` (invite links) |
| `STRIPE_PRICE_*` | Optional vars | Override Price IDs from catalog defaults |
| `DB` | D1 binding | Database `swft-portal` |

### Stripe webhook setup

1. Stripe Dashboard → Developers → Webhooks → Add endpoint  
2. URL: `https://www.swftstudios.com/api/stripe-webhook`  
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`  
4. Copy signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET` (and Pages project secrets)

### Pages project binding

Production leads run on Pages Functions (`swftstudios-website`). Bind D1 database `swft-portal` as **`DB`** on that Pages project (Dashboard → Settings → Functions → D1 bindings), matching [`wrangler.jsonc`](../wrangler.jsonc).

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
