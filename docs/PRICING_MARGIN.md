# SWFT Pricing & Margin Notes (internal)

**Public source of truth:** [`data/pricing.json`](../data/pricing.json) (Digital / Visual catalog, October 2026).

## October 2026: Digital and Visual categories (owner review required)

`data/pricing.json` is now organized as **categories → services → offers**:

| Category | Service (`id`) | One-time | Monthly |
|---|---|---|---|
| Digital | Web Design & Development (`web-design`) | Website Only $800 · Website + Content Capture $2,000 · Website + Extended Content $3,000 | **Website Care $150/mo** (Care Plus $350, Care Pro $650) |
| Digital | App Design & Development (`app-development`) | **App Design Sprint $1,500** (25 screens $2,800) · **App MVP Build $6,000** | **App Care & Support $400/mo** (10 hrs $900, 20 hrs $1,700) |
| Digital | Analytics (`analytics`) | **Tracking Setup $500** (site + store $850) | **Monthly Insights $250/mo** |
| Digital | Marketing (`marketing`) | GBP Content Refresh $400 · **Lead Follow-up Automation $750** | **Ads Management $500/mo** (2 campaigns $850) · Full Growth Partner $1,200/mo |
| Visual | Photography (`photography`) | **Brand Photo Session $450** (4 hrs $850, 8 hrs $1,600) · **Product Photography $400** (25 products $850, 50 products $1,600) | **Monthly Photo Plan $400/mo** (4 hrs $750) |
| Visual | Videography (`videography`) | **Short-Form Video Pack $600** (8 videos $1,100, 12 videos $1,600) · **Brand Film $1,800** | **Monthly Video Plan $500/mo** (8 videos $900, 12 videos $1,250) |
| Visual | Social Media Management (`social-media`) | **Social Profile Setup $350** | Content + Growth Retainer $450/mo · **Managed Social $500/mo** (3 platforms $800, 4 platforms $1,150) |
| Visual | Live Streaming (`live-streaming`) | **Single-Camera Stream $900** (4 hrs $1,300, 8 hrs $2,100) · **Multi-Camera Production $2,500** (8 hrs $4,200) | **Recurring Streams $1,800/mo** (4 streams; 2 cameras $2,600; 8 streams $3,200) |

Every offer can carry these display fields (rendered by `js/pricing-render.js`):

| Field | Shows as | Example |
|---|---|---|
| `specs` | Quick-look tiles under the description | 2 hrs shoot · 25 edited photos · 7 business days delivery |
| `includes` | "What you get" (one-time) or "Every month you get" (monthly) | |
| `scale` | Size table; the first row is the starting price | Product Photography by product count |
| `rhythm` | "How each month runs" steps | Full Growth Partner week 1 to 4 |
| `handoff` | "At handoff": what the client keeps at the end | Accounts, files, training, support window |
| `next` | Link to the matching care plan or monthly option | Website Only → Website Care |

- **Unchanged:** the six Stripe-backed packages (plain text above). Their ids, prices, includes, base counts, booking pages, Price IDs and Payment Links are exactly as before; they were only moved under the service they fit best. Packages that span both categories carry a `crossover` tag on the card (for example "Includes photo + video").
- **Also new on the six Stripe packages (approve before merge):** `specs` (including typical launch/delivery times), `handoff` lists (account ownership, training call length, a 14 or 30 day launch support window) and the Full Growth Partner `rhythm` (a monthly planning call and up to 4 new ad variations a month). Their `includes`, prices and checkout are unchanged, but these lists now also appear on the booking pages, so they read as commitments.
- **New (bold above): proposed starting prices and deliverables, not yet approved.** They have no Stripe product. Their cards say "Quote first" and link to `/contact.html?service=<service id>`, which preselects the service. Nothing is charged until a quote is agreed. Confirm each price and deliverable list is sustainable before merging; adjust in `data/pricing.json` and the matching chips in `services.html`.
- How the new numbers were derived: photo/video offers sit near the existing add-on rate card ($150 per filming hour, $100 per 10 edited photos, $125 per extra Reel) with a small package discount. Ads Management + Content + Growth Retainer ($950/mo) stays below Full Growth Partner ($1,200/mo), which adds a longer monthly shoot and more edits. Managed Social excludes production on purpose so it pairs with the Content + Growth Retainer instead of competing with it. App, analytics and live streaming numbers are first drafts with no SWFT precedent; app work in particular should always get a written scope. Monthly plans sit a little under the matching one-time offer in exchange for a standing booking (Monthly Photo Plan $400/mo vs Brand Photo Session $450; Monthly Video Plan $500/mo for 4 videos vs $600 one-time). Recurring Streams work out to $450 a stream because the venue, operator and setup repeat every week. Care plans price edit or dev time at roughly $100 to $150 an hour, cheaper per hour on larger plans.
- To make a new offer bookable online: create the Stripe product, price and Payment Link, then add a `stripe` block and `bookUrl` to the offer and register it in `functions/_lib/stripe-tiers.js`, `data/stripe-catalog.json` and `growth-audit.html`; run `npm run build:book` to generate its page.

---

The sections below describe the six Stripe-backed packages (previously grouped as "one-time projects" and "ongoing retainers").

This document tracks internal margin intuition for the content-capture-scoped ladder. It replaces the older Service Pro / Growth / E-Commerce monthly + GHL model.

## Pricing logic

Price scales primarily with **whether SWFT captures content on-site**, then with site complexity and shoot duration. Do not sell a content-inclusive tier to a mom-and-pop brochure client who already has usable photos.

| Tier | Public range | What moves price |
|------|--------------|------------------|
| GBP Content Refresh | $400–$600 OT | Shoot length, number of deliverables, GBP cleanup depth |
| Website Only | $800–$1,500 OT | Pages, Shopify vs brochure, forms, revision rounds (client supplies content) |
| Website + Content (half-day) | $2,000–$2,800 OT | Site scope + 2–4 hour shoot + edit load |
| Website + Extended Content | $3,000–$4,500+ OT | Multi-location / product lines, stakeholder complexity |
| Content + Growth Retainer | $450–$800/mo | Shoot frequency, channels managed |
| Full Growth Partner | From $1,200/mo | Content + Meta ads load; custom scoped, no published ceiling |

## Margin heuristics

1. **Website Only** must stay lean: client-supplied assets, limited revision rounds, platform builds (Webflow/Shopify), not ground-up custom frameworks.
2. **GBP Content Refresh** is the FB ad entry offer. Protect margin by keeping scope to one location and a defined deliverable pack. Ad traffic should land on `/book/gbp-content-refresh.html` (Stripe start at $400), not a free form, when the intent is paid booking.
3. **Half-day vs full-day** is the main jump from Tier 2 to Tier 3. Do not discount full-day multi-location work into the half-day band.
4. **Retainers** are month-to-month. Price toward the top of the band when GBP posting + review management + monthly shoots are all included.
5. **Growth Partner** always requires a written scope (content cadence + ad management hours). Ad spend is client-paid and separate.
6. Prefer honest platform language publicly: “built and customized on Webflow/Shopify,” never “fully custom-coded” unless that is true.

## Superseded model

The previous public model (Service Pro $200/mo, Growth $400/mo + GHL, E-Commerce $500/mo, Content Starter $600/mo, $1,200+$600 bundle) is retired from customer-facing pages. Do not quote those numbers on the marketing site.


## September 2026 preview: starting-at pricing

Public-facing pages now show one **Starting at** amount per tier, aligned to the existing Stripe checkout. The recommended scopes below are **internal sales examples**, not a second public price and not a change to Stripe prices.

| Sales conversation | Internal target scope | Public starting at / Stripe |
|---|---:|---:|
| One-location local visibility sprint | $500 | $400 one-time |
| Small-business website with client-supplied assets | $1,200 | $800 one-time |
| Website plus half-day photo/video content | $2,500 | $2,000 one-time |
| Monthly local content plan | $650/mo | $450/mo |
| Website + Extended Content | Quoted | $3,000 one-time |
| Full Growth Partner | Quoted | $1,200/mo |

Before selling the $650/mo plan, agree on a written statement of work and provision a matching Stripe subscription price or invoice; never treat the existing $450/mo subscription as an automatic $650/mo subscription. Website/platform subscriptions, domains, ad spend and other third-party costs remain separately scoped.

**Approval workflow:** Changes remain on `feature/clear-pricing-offer-ladder`. Review the Cloudflare Pages branch preview and **do not merge into main without Elombe's approval**. Existing booking URLs, payment amounts and Stripe price identifiers were preserved.

## Guided-order add-ons (preview only, owner approval required)

The onboarding builder displays **eight repeatable one-time add-on rates**. They are indicative pricing for the exact unit described, not a guarantee for more complex circumstances or a change to existing Stripe checkout prices.

| Priced add-on | Displayed rate | Scope boundary |
|---|---:|---|
| Additional standard website page | +$175 / page | Beyond approved base page count; custom functionality scoped separately |
| Local landing page | +$250 / page | Existing client assets and one location-specific page |
| Extra edited Reel | +$125 / video | Existing footage from same SWFT shoot; capture isn't included |
| 10 extra edited photos | +$100 / pack | Additional picks from same shoot, not a new product shoot |
| Extra filming hour | +$150 / hour | Same location, subject to availability |
| Filmed testimonial | +$175 / testimonial | One interview captured during scheduled shoot and short edited cut |
| Raw footage delivery | +$100 / shoot | Available source footage for one shoot; transfer arrangements confirmed |
| Additional Google Business Profile | +$175 / profile | Existing eligible second profile; photography at the location separate |

Each priced add-on offers **quantity 1–5**; the configurator calculates subtotal based on unit rate × quantity. All other selections continue to say **Custom quote**.

**Review logic:** For one-time projects show starting base + priced extras = **estimated investment** and mark custom items as excluded; for recurring retainers show base **monthly** and selected extras **one-time** separately (do not sum them into an ambiguous single recurring price). Every request containing an add-on routes to **custom quote, no payment**. Base-only clients may use the original fixed-price Stripe link or ask for a quote.

The backend has an allowlisted, independently priced catalog and recomputes amounts from tier and add-on IDs and validated quantities. Client-supplied numeric prices are ignored. The quote details go to Airtable Notes and SWFT emails. Review / approve all terms and scope with the customer **before collecting payment**. No subscription price, Stripe Price ID, Stripe Payment Link or production branch was changed as part of this feature.

## Base package visibility before add-ons

All six booking flows render **Included in your base package** ahead of the first goal and every add-on. The list is drawn directly from `data/pricing.json → tier.includes`, so it stays aligned with the price card and generator; the same included list appears again in the final review before the line-item estimate. The new `baseScopeNote` clarifies each starting package's boundaries without inventing fixed page, photo or Reel counts that have not yet been approved.

Prior to publishing, approve and document fixed included counts and revision limits for any offer that will be sold at its checkout starting price. Currently the pages explicitly say the final page count, edit count, deliverables and/or monthly cadence are confirmed before work begins. The extra page, Reel, shoot-hour and photo add-ons refer to work **beyond** that approved base scope. This change does not alter Stripe prices, add-on rates or checkout routing.

## Exact starter-package inclusions — owner-review draft (September 2026)

**These are proposed deliverable commitments now shown in the branch preview, not previously agreed quantities or evidence of work already completed.** Review profitability and feasibility before approving a main-site launch. All content counts below refer to **edited final exports**, not shutter clicks, unedited footage or unlimited revisions.

| Base tier | Project/visit allowance | Edited photos | Vertical shorts, 15–30s | Other firm inclusions |
|---|---|---:|---:|---|
| GBP Content Refresh — $400 | One 90-minute shoot, one location | 15 | 1 | One existing GBP refresh, 1 post, up to 10 GBP photo uploads, review link/QR, 1 consolidated edit round |
| Website Only — $800 | Up to 3 responsive pages, no shoot | 0 | 0 | One form/existing booking link; Shopify alternative up to 5 client-supplied listings; metadata for included pages; 1 consolidated revision and launch help |
| Website + Content — $2,000 | Up to 5 pages and 3-hour shoot at one location | **50** | **3** | Site placement, up to 10 GBP photo uploads with existing profile access, 1 standard lead path, basic SEO and 1 consolidated revision |
| Website + Extended Content — $3,000 | Up to 7 pages, 6-hour total session incl. local travel between max 2 approved locations | 80 | 5 | Site placement, up to 15 GBP photo uploads, 1 standard lead path and up to 2 consolidated revisions |
| Content + Growth — $450/mo | One 60-minute visit/mo at one location | 12/mo | 1/mo | 2 GBP posts/mo, review-response guidance, 1 consolidated content revision; monthly counts do not roll over |
| Full Growth Partner — $1,200/mo | One 3-hour visit/mo at one location | 30/mo | 3/mo | One managed active Meta campaign, 2 GBP posts, monthly performance summary, review guidance and 1 consolidated content revision; ad spend separate |

Pricing-page cards and onboarding inclusions use the **same source data** in `data/pricing.json`. The booking builder shows a metric strip before the extras and repeats the included list and quantities at review. Browser data attributes also expose the per-package included counts so add-ons can display contextual math, e.g. **50 included + 10 added = 60 edited photos** when selecting one +$100 photo pack.

### Boundaries / acceptance for owner

- This is an **exact defined starter scope**, using “up to” only for maximum quantities such as website pages, products, approved locations and shoot time. Photos/videos are promised edited final deliverable counts, contingent on production access and viable shoot conditions. Explicitly assess whether 50 edited photos, 3 videos, 5-page site and a 3-hour shoot are operationally sustainable at $2,000.
- Client provides brand assets, initial copy and any Shopify product details; ownership and access to existing GBP and ad accounts are required for the corresponding work. Ad spend, hosting, Shopify/Webflow fees, paid integrations, transportation beyond agreed local coverage, raw footage and extra locations are not included unless expressly specified.
- “Additional” pages and photo/video edits refer to **work above the included baseline**, not replacement of included quantities; repeatable add-on fees cover only their defined unit.
- An $800 website-only project includes **no photo/video shoot**, so the configurator now presents “Add an original photo + video shoot — Custom quote” rather than implying an extra Reel can be bought from nonexistent session footage.
- The starter pricing and existing Stripe links remain unchanged, as does the requirement to quote/approve all add-on combinations before charging them.
