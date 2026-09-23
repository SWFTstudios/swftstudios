# SWFT Pricing & Margin Notes (internal)

**Public source of truth:** [`data/pricing.json`](../data/pricing.json) (offer ladder v2).

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
