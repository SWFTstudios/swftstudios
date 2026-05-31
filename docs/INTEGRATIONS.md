# SWFT — Booking Flow Integrations (Airtable + Stripe)

The "Order Your Website" booking flow (`swft-method.html`) submits to the Worker
endpoint **`POST /api/build-request`** (in `src/worker.ts`). That endpoint:

1. **Stores the lead in Airtable** (best-effort).
2. **Starts a Stripe Checkout session** for the chosen plan and returns its URL,
   which the page redirects the visitor to.

If a visitor has JavaScript disabled — or the endpoint errors — the form falls
back to its `formsubmit.co` action so the lead still reaches email.

---

## Resources already provisioned

These IDs are **baked in as defaults** in `src/worker.ts` (`DEFAULTS`), so you
do **not** need to set them unless you want to point at different ones.

| Thing | ID |
|---|---|
| Airtable base — "SWFT Website Leads" | `appjwRgcgS0BD4lT7` |
| Airtable table — "Website Build Requests" | `tbl30H9M2CC7p6MqY` |
| Stripe price — Monthly Plan ($299/mo) | `price_1Td9xhAF4d9gCyuNnjPgqkho` |
| Stripe price — Maintenance ($99/mo) | `price_1Td9xiAF4d9gCyuN6rUc25R0` |

> The Stripe products were created in **live mode**. Real cards will be charged.
> Test first with a test key if you want to dry-run the flow.

---

## Secrets you must set (one-time)

Only **two** secrets are required. Set them on the Worker:

```bash
# Stripe secret key (sk_live_... or sk_test_...)
npx wrangler secret put STRIPE_SECRET_KEY

# Airtable Personal Access Token with data.records:write on the base above
npx wrangler secret put AIRTABLE_TOKEN
```

- Create the Airtable token at https://airtable.com/create/tokens
  (scope: `data.records:write`, access: the "SWFT Website Leads" base).
- Until each secret is set, that integration is simply skipped:
  - No `STRIPE_SECRET_KEY` → no checkout link is returned; the page shows the
    "You're in" confirmation instead.
  - No `AIRTABLE_TOKEN` → the lead isn't written to Airtable (still gets the
    email fallback / Stripe metadata).

### Optional overrides (vars, not secrets)
Set these only to point at different resources:
`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_MAINTENANCE`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE`.

---

## How each plan is charged

- **Monthly Plan** → Stripe Checkout in `subscription` mode using the $299/mo price.
- **One-Time Build** → Stripe Checkout in `payment` mode for the **computed total**
  (base $800 + selected features, capped at $2,500). The maintenance add-on choice
  is recorded in Airtable + Stripe metadata; set up the $99/mo maintenance
  subscription separately (the maintenance price already exists).

## Local dev / deploy

```bash
npx wrangler dev      # local
npx wrangler deploy   # publish
```
