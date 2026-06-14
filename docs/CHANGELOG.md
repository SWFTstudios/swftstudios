# Changelog

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
