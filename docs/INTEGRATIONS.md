# SWFT — Booking Flow Integrations (Airtable + Stripe)

**Submissions go straight to Airtable** — no more FormSubmit (their service was
returning 521 errors). Both forms post to the Worker, which writes the record to
your Airtable base so you can see every lead in a grid and start the build.

| Form | Worker endpoint | Airtable table |
|---|---|---|
| `swft-method.html` (Order Your Website) | `POST /api/build-request` | "Website Build Requests" |
| `contact.html` (Discovery) | `POST /api/contact` | "Discovery Calls" |

`/api/build-request` also **starts a Stripe Checkout session** for the chosen plan
and returns its URL, which the page redirects the visitor to (only if a Stripe key
is set).

Both forms are multi-step and require JavaScript to operate; on a submit error the
page now shows an inline "try again / email us" message instead of bouncing the
visitor to a third-party error page.

### Confirmation emails (optional)
The Worker still makes a best-effort background call to FormSubmit to email a
confirmation — but since that service is flaky, the **recommended** way to send a
reliable "we got your request, we'll reply within 48 hours" email is an **Airtable
automation**: in the base, add *Automation → When record created → Send email* to
the record's Email field. That sends from Airtable's infrastructure, no extra keys.

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

To see submissions land in Airtable, set a single secret on the Worker:

```bash
# Airtable Personal Access Token with data.records:write on the base
npx wrangler secret put AIRTABLE_TOKEN
```

1. Create the token at **https://airtable.com/create/tokens** while signed in as
   `elombe@swftstudios.com`.
2. Scope: **`data.records:write`** (add `data.records:read` too if you like).
3. Access: the **"SWFT Website Leads"** base.
4. Copy the token (starts with `pat...`) and paste it when `wrangler secret put`
   prompts. You can also set it in the Cloudflare dashboard:
   *Workers → swftstudios → Settings → Variables and Secrets → Add (Secret)*.

That's it — every booking + contact submission then appears in your Airtable.

### Stripe (optional — only needed to take payment)
```bash
npx wrangler secret put STRIPE_SECRET_KEY   # sk_live_... or sk_test_...
```
Without it, the booking flow still saves to Airtable and shows the on-page
confirmation — it just won't open a checkout page.

> Until `AIRTABLE_TOKEN` is set, the Worker accepts the submission and shows the
> visitor a success message, but the record isn't saved. Set the token first.

### Optional overrides (vars, not secrets)
`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_MAINTENANCE`, `AIRTABLE_BASE_ID`,
`AIRTABLE_TABLE`, `AIRTABLE_TABLE_CONTACT`, `FORMSUBMIT_EMAIL`.

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
