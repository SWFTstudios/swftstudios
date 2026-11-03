# Online payments

How customers pay online, and how to change it.

## The plan (decided 2026-11)

| How | Which offers | Why |
| --- | --- | --- |
| **Pay in full** | One-time packages under $1,000: Website Only, GBP Content Refresh, Product Photos, Social Profile Setup, Brand Photo Session, Tracking Setup, Short-Form Video Pack, Lead Follow-up, Single-Camera Stream | Clear scope, low risk; one tap with Apple Pay / Google Pay. |
| **50% deposit** | One-time packages $1,000 to $3,000: Website + Content Capture, Website + Extended Content, App Design Sprint, Brand Film, Multi-Camera Production | Protects your time and booked dates; customer risks only half. Balance invoiced (Stripe invoice) before delivery. |
| **Monthly subscription** | Every monthly plan | Month-to-month; customer can cancel themselves. |
| **Quote first** | App MVP Build and anything custom | Proposal, then a Stripe invoice (deposit + milestones). |

Booking pages say: deposit fully refundable until work starts.

## Where it lives

- `data/pricing.json` → each offer's `pay` (`full` / `deposit` + `percent` / `monthly`; none = quote first) and `priceCents`.
- `data/stripe-catalog.json` → the live Stripe product, price and payment link per offer.
- `npm run build:payments` copies matching links onto the offers (`stripe`, `bookUrl`) and rebuilds `book/`. An offer only goes online when its link charges exactly what `pay` says; otherwise it stays quote-first and any old booking page redirects to pricing.
- Server: `functions/_lib/stripe-tiers.js` reads the same data (Pages Functions and the Worker). Optional env overrides: `STRIPE_PAYMENT_LINK_<OFFER_ID>`, `STRIPE_PRICE_<OFFER_ID>`.

## Creating or changing links

```sh
node scripts/stripe-sync.mjs --dry-run                 # what would be created
STRIPE_SECRET_KEY=sk_live_... npm run stripe:sync      # create, save, rebuild pages
```

The sync is safe to re-run. Changing an amount creates a new price and link and **deactivates the old link**. Links carry `metadata.tierId` (the webhook uses it), collect phone and an optional business name, email a receipt or invoice for one-time payments, and redirect to `/book/thank-you.html`, where the customer books the kickoff call.

## Stripe dashboard settings (one time)

- **Payment methods:** turn on Apple Pay, Google Pay, Link and **ACH Direct Debit**. ACH is about 0.8%, capped at $5, which matters on deposits.
- **Customer portal** (Settings → Billing → Customer portal): let customers update cards and cancel subscriptions.
- **Optional:** Klarna or Affirm for the $1,500+ packages.
- **Sales tax:** check with your accountant before turning on Stripe Tax.
