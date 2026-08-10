# Changelog

## 2026-08-10 — Stripe booking pages per pricing tier

### Added
- Dedicated Stripe Checkout booking pages for every offer-ladder tier under `/book/` (GBP Refresh, Website Only, Website + Content half/full, Content Retainer, Full Growth Partner).
- `POST /api/book-tier` Pages Function: Airtable (Discovery Calls) + Resend notify + Stripe Checkout (`price_data`; payment or subscription).
- Shared catalog [`functions/_lib/stripe-tiers.js`](../functions/_lib/stripe-tiers.js) (server-authoritative amounts).
- Generator: `npm run build:book` → [`scripts/build-book-pages.mjs`](../scripts/build-book-pages.mjs).
- Thank-you page at `/book/thank-you.html`.

### Changed
- [`data/pricing.json`](../data/pricing.json) tiers now include `bookUrl` + `stripe` start amounts.
- Pricing card CTAs link to `/book/<tier>.html` instead of Growth Audit preselect.

### Docs
- Updated [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for the tier booking flow.

---

## 2026-08-10 — Pricing → Growth Audit preselect + multi-step onboarding

### Changed
- Growth Audit (`growth-audit.html`) is now a Launch Kit–style **5-step** form with a progress bar: contact → website/social → desired service → details/photos → Cal.com booking.
- Removed overlapping qualification questions (category / challenge / budget / timeline) so service intent is asked once.
- Pricing tier CTAs append `?plan=<tier-id>` so the desired-service dropdown arrives pre-selected (still editable).

### Added
- Desired service dropdown aligned to [`data/pricing.json`](../data/pricing.json) package IDs.
- Photo share-link field (Drive/Dropbox/iCloud) — no file-upload backend.
- API + worker accept `desiredService`, `lastName`, `photoLinks`, and website-or-social presence.

### Docs
- Updated [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for the multi-step flow and Airtable fields.

---

## 2026-08-09 — Homepage audience carousel + Investment tabs

### Changed
- Replaced homepage **Offers** and **Ongoing** pricing cards with a **Who’s this for** horizontal swipe section (`#homepage-audience`) covering service businesses, e-commerce, restaurants, B2B, creators, and health/wellness.
- Industry cards keep LLM-readable blurbs in the HTML; **Learn more** expands the blurb in-card; a second tap collapses back to headline + background image.
- Homepage **Investment** (and `website-pricing.html`) now mounts one-time + ongoing tiers in a legible tab toggle via [`js/pricing-render.js`](../js/pricing-render.js).
- Rewrote customer-facing third-person “SWFT Studios / SWFT helps / SWFT builds” copy to first-person “we” on the homepage, case studies, portfolio data, contact, growth audit, and team pages (brand name kept in titles/schema).

### Added
- [`js/homepage-audience.js`](../js/homepage-audience.js) — expand/collapse behavior for audience cards.

---

## 2026-08-07 — Resend lead emails + Growth Audit Pages Function

### Added
- [`functions/_lib/resend.js`](../functions/_lib/resend.js) — shared Resend send helper
- Growth Audit + contact Forms send team notify to `hello@swftstudios.com` and visitor confirmation via Resend (`RESEND_API_KEY`)
- [`functions/api/growth-audit.js`](../functions/api/growth-audit.js) — Pages Function for `POST /api/growth-audit` (was missing; caused form 405)

### Fixed
- Growth Audit form on production returned “Unable to send right now” because `POST /api/growth-audit` had no Cloudflare Pages Function

### Docs
- Updated [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for Pages Functions + Resend

---

## 2026-08-06 — Offer ladder & pricing overhaul (v2)

### Changed
- Replaced the old Service Pro / Growth / E-Commerce / Content Starter pricing model with a content-capture-scoped offer ladder (Tiers 0–5) in [`data/pricing.json`](../data/pricing.json).
- Homepage hero primary CTA is now **See Pricing** (`#homepage-pricing`). Services section is the one-time offer ladder; Ongoing section covers retainers; Investment mounts the same JSON.
- [`website-pricing.html`](../website-pricing.html), [`services.html`](../services.html), [`js/pricing-render.js`](../js/pricing-render.js), and related CSS updated to the new schema (no monthly/one-time billing toggle).
- Portfolio labels on [`websites.html`](../websites.html), homepage Proven Results, and case-study pages now distinguish **E-Commerce (Shopify)**, **Custom Website Build**, and **Content & Production**.
- Roller Reels and Blurred Lines Entertainment moved out of the website gallery into a **Content & Production** section on `websites.html`.
- Core Home (`corehome.com`) removed from public galleries, marquees, Proven Results, and the case-studies hub index pending operator confirmation that the live flagship site was SWFT-built.

### Added
- Homepage FAQ items: website cost, GBP Content Refresh, contracts, turnaround speed (plus matching FAQ schema).
- Pricing FAQ in `data/pricing.json` aligned to the new ladder.

### Security / trust
- Public copy now pairs every price with concrete scope (content capture vs client-supplied assets) to reduce under/over-selling from cold ad traffic.

---

## 2026-08-06 — Vimeo hero + intro loader

### Changed
- Replaced the Spline 3D hero background with a muted autoplay/loop Vimeo embed (`1216244886` — “NYC View”) on:
  - `index.html`, `websites.html`, `apps.html`, `media.html`, `resources.html`, `swft-tv.html`, `videos.html`
- Added a site intro loader (SWFT wordmark + progress bar + %) that stays up until the Vimeo player is ready, so visitors never see the Vimeo buffering UI.

### Added
- [`css/hero-vimeo-loader.css`](../css/hero-vimeo-loader.css) — cover iframe styles + loader UI
- [`js/hero-vimeo-loader.js`](../js/hero-vimeo-loader.js) — Vimeo Player API gating, soft timeout, connection/reduced-motion fallbacks
- [`images/hero-nyc-view-still.jpg`](../images/hero-nyc-view-still.jpg) — local still from the Vimeo thumbnail for offline / slow / reduced-motion paths

### Removed
- Unused Webflow `page-loader_component` markup and GSAP fake-progress preloader script on `index.html` (was wrapped in `.hide` / `display: none`)

### Fallback behavior
- Offline, Save-Data, `2g` / `slow-2g`, or `prefers-reduced-motion`: skip iframe, show still, dismiss loader quickly
- Soft timeout (~8s): show still and reveal the page
