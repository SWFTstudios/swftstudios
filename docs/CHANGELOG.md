# Changelog

## 2026-06-14 — Linoxa Polish Pass

### Visual system
- Extended `css/swft-studio.css` with editorial layouts: `.section--editorial`, `.studio-marquee`, `.image-panel`, `.project-shot`, `.sticky-copy-grid`, `.project-feature`, `.horizontal-scroll-track`, `.method-progress-shell`, `.method-bundle-grid`
- Stronger card depth, parallax-ready image panels, responsive project shot aspect ratios

### Motion
- Upgraded `js/swft-studio.js` with `gsap.matchMedia()`, hero timeline entrances, `ScrollTrigger.batch()` reveals, scrubbed parallax on `.parallax-panel`, desktop pin on `[data-pin-copy]`, and `prefers-reduced-motion` fallbacks

### Project thumbnails
- Added `data/projects.json` as single source of truth for portfolio cards
- Added `images/project-thumbnails/` with 9 branded SVG preview assets (hybrid approach: polished mocks; live URLs noted in case studies)
- `work.html`, homepage Selected Work carousel, and venture cards now use real `<img>` thumbnails

### SWFT Method booking flow
- Redesigned `swft-method.html` guided planner: sticky mobile progress + percentage bar, GSAP step transitions, bundle quick-select cards (Starter / Sales System / Monthly), auto-generated website brief summary, recommended bundle output
- Payload now sends `recommendedBundle` and `websiteBriefSummary` to `/api/build-request`

### Worker / Airtable
- `src/worker.ts` persists richer planner fields: Ideal Day Vision, Current Bottleneck, Transformation, Unique Edge, Client Problem, Client Social Proof, How They Sell Now, 90-Day Win, Revenue Goal, Brand Personality, Recommended Bundle, Website Brief Summary

### CTAs
- Primary funnel CTA updated to **Build Your Website** → `swft-method.html` in nav (`js/swft-nav.js`), pricing, homepage, services, ventures, and method pages
- `start-a-project.html` retained for general inquiries

### Failure behavior
- GSAP/ScrollTrigger load failure: static layout, all content visible
- `prefers-reduced-motion`: no pin/scrub; instant step changes in SWFT Method
- `/api/build-request` or Stripe failure: inline error + `hello@swftstudios.com` fallback; Airtable lead preserved when token is set
- Missing project JSON: graceful fallback copy on work page

---

## 2026-06-14 — Full Site Redesign (Venture Studio)

### Added
- `css/swft-studio.css` — unified design system (dark editorial aesthetic, tokens, components, responsive)
- `js/swft-studio.js` — scroll reveal animations (GSAP) and project inquiry form handler
- `ventures.html` — venture studio page (Snooze Lane, KIOSK, Roller Reels, SWFT Studios)
- `work.html` — portfolio / case study grid
- `method.html` — editorial SWFT Method process page (6-step framework)

### Redesigned
- `index.html` — 8-section homepage with Spline 3D hero, studio thesis, acronym block, ventures/services/work/method/pricing previews, final CTA
- `services.html` — 8 detailed service cards, who-we-help, tool stack, package preview
- `pricing.html` — 3-tier pricing, add-ons table, FAQ accordion
- `start-a-project.html` — 9-field project inquiry form → `POST /api/contact`
- `js/swft-nav.js` — unified nav: Home, Ventures, Services, Work, Method, Pricing + Start a Project CTA

### Preserved
- `case-studies.html`, `case-study/`, `detail_project.html`, `detail_video.html` (protected)
- `swft-method.html` — Stripe + Airtable build funnel (unchanged)
- `src/worker.ts`, `wrangler.jsonc` (unchanged)

### Technical
- Dropped Webflow runtime dependency on redesigned pages
- Spline hero loads via `@splinetool/viewer` web component (replaces broken Webflow Spline integration)
- SEO metadata updated on all 7 core pages
- SWFT acronym (Strategic Workflows Facilitating Transformation) in studio thesis, footer, and method page
