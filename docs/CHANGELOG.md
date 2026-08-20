# Changelog

## 2026-08-20: Punch-list phases 3 and 4 (SEO and copy)

### SEO (items 10 to 13)
- Added unique meta descriptions (about 140 to 160 characters) to 14 client case studies, plus `media.html`, `videos.html`, and `swft-tv.html`.
- Rewrote titles on Websites, Apps, Media, SWFT TV, Resources, Video Resources, and Contact to the house pattern `Topic | SWFT Studios` (about 50 characters). Replaced leftover Dann Petty template titles, descriptions, and OG images on Websites, Apps, and Resources.
- Shortened generated location-page descriptions in [`scripts/build-location-pages.mjs`](../scripts/build-location-pages.mjs) (rebuild with `npm run build:locations`). Longest is now 146 characters (Staten Island).
- Homepage testimonials heading is now a single `h2` (“What clients had to say”). The hero `h1` is the only H1.
- Filled empty `alt` on work thumbnails, posters, and logos on Home, Videos, Apps, Media, Resources, SWFT TV, and Websites. Hidden hero stills and decorative arrows stay `alt=""`.

### Copy (items 14 to 26)
- Yanko testimonial: consistent curly quotes, “one-stop shop,” one period, question mark.
- Homepage problem heading no longer repeats the intro line. Pricing trust line no longer repeats the H1.
- Services card label is `02-03 / Website + Content` (one card, combined offer).
- Homepage section titles use sentence case. Audience copy is device-neutral (“Browse” / “Select a card”).
- “And more” instead of “And More..”. “long-term” hyphenated. Team CTA is “View our work.”
- GBP button and book hub copy say **GBP Content Refresh**. Booking copy uses `1- to 5-page` and `2- to 4-hour` (`npm run build:book`).
- Contact: “Get in touch,” one “Not ready to start?” line, budget options aligned to live tiers (`$400 to $600`, `$800 to $1,500`, `$2,000 to $2,800`, `$3,000+`, “Not sure yet”).
- Case-study possessives (`brand’s`, `kids’`) use `&rsquo;` so they do not mix with script quotes.

### Notes
- Punch-list items 10 to 26. Branch: `feat/site-punch-list-p3p4`.
- A Webflow import of `index.html`, `websites.html`, `apps.html`, `media.html`, `resources.html`, `videos.html`, or `swft-tv.html` will overwrite titles, metas, alts, and homepage copy. Re-apply after import.
- Rebuild generated pages after editing sources: `npm run build:book` and `npm run build:locations`.

### Failure cases
- If `build:locations` is skipped after a generator edit, city pages keep the longer descriptions Google would truncate.
- Contact budget is a free-text field on the worker (`Budget: str(body.budget, 200)`). New option labels only affect the dropdown; old submissions are unchanged.
- Decorative `alt=""` on arrows is intentional. Work images without a mapped filename still need a manual alt if new galleries are added.

---

## 2026-08-20: Homepage hero overflow

### Fixed
- At a 400px viewport the homepage was ~6px wider than the screen. The scaled Vimeo hero iframe is now clipped on `.hero-vimeo` (`contain: paint`) and `.background_image-wrappe`.

### Notes
- Punch-list item 09. Lives in `css/hero-vimeo-loader.css` so a Webflow import of `index.html` does not drop the rule if that stylesheet stays linked. Branch: `fix/homepage-overflow`.

---

## 2026-08-20: Shared site footer

### Added
- `js/swft-nav.js` now injects one footer (email, Instagram, Our Work, Locations, site map, Growth Audit) on every page that already loads the shared nav, including Home, Services, and Pricing.

### Changed
- Existing `footer.ps-footer` and `footer.footer_component` blocks are hidden when the shared footer is present so crawlers and visitors see one set of links.

### Notes
- Punch-list item 07. Branch: `feat/shared-footer`.

---

## 2026-08-20: Shell nav gutter and box model

### Fixed
- Shared nav used `width: 100%` plus 40px padding without `border-box`, so the Growth Audit CTA clipped by a constant 40px on shell pages.
- Nav inset was 40px while page-shell body used 20px. Both now use `--swft-gutter` (24px).

### Notes
- Punch-list items 05 and 06. Branch: `fix/shell-nav-layout`.

---

## 2026-08-20: Growth Audit skip CTA

### Fixed
- Removed the “Done: go to confirmation” link that jumped to `/growth-audit/thank-you` without submitting a lead.
- `.ps-page .button { display: inline-block }` overrode `[hidden]`, so Back stayed visible on step 1. `.ps-page [hidden]` now wins. Back is also `disabled` on steps 1 and 5.

### Notes
- Punch-list item 02. Branch: `fix/growth-audit-skip`.

---

## 2026-08-20: Nested page assets load from site root

### Fixed
- Booking pages under `/book/`, case studies under `/case-study/`, and `/growth-audit/thank-you` requested CSS/JS/images with `./` or `../`, so browsers resolved `/book/css/…` and `/case-study/css/…` (404). Assets now use root-absolute `/css/`, `/js/`, `/images/`.
- Case study pages used a leftover Webflow nav (`footer.navbar`) with 404 links and `mailto:elombe@` while the visible text said `hello@`. That block is removed; `#swft-nav` is the nav. Footer CTA text matches `hello@swftstudios.com`.
- [`scripts/build-book-pages.mjs`](../scripts/build-book-pages.mjs) now emits root-absolute asset paths so `npm run build:book` cannot restore the bug.

### Notes
- Punch-list items 01, 03, 04, and 08. Branch: `fix/nested-page-assets` off `feat/site-punch-list`.

---

## 2026-08-10: Copy dash cleanup, local SEO pages, structured site map

### Changed
- Removed em dashes and en dashes from public website copy across HTML pages, pricing/portfolio data, booking pages, and user-facing email/API strings. Price ranges now read as `$400 to $600`. Clause breaks use commas or periods instead of AI-style dashes.

### Added
- Local SEO hub at [`/locations/`](../locations/index.html) covering Jersey City & Hudson County, North Jersey, and New York City.
- 25 area landing pages under `/locations/<slug>.html` (unique local copy + schema.org `ProfessionalService` markup), generated from [`data/locations.json`](../data/locations.json) via `npm run build:locations`.
- Human and LLM readable structured site map at [`/sitemap.html`](../sitemap.html).
- [`css/locations-page.css`](../css/locations-page.css) and generator [`scripts/build-location-pages.mjs`](../scripts/build-location-pages.mjs).
- Nav link to Locations; contact and Growth Audit link into the locations hub.

### SEO
- Expanded homepage and Growth Audit `areaServed` schema to include each served city.
- Updated [`sitemap.xml`](../sitemap.xml) with `/sitemap.html`, `/locations/`, and every area page.

---

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
