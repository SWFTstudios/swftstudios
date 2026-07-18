# SWFT Conversion Funnel — Implementation Checklist

Branch: `cursor/swft-conversion-funnel-4378`  
Primary funnel: Homepage / Services → `/growth-audit` → form → `/growth-audit/thank-you` → optional Cal.com

## Architecture (audit)

| Layer | Finding |
|---|---|
| Stack | Static HTML + Cloudflare Worker (`src/worker.ts`) |
| Forms | Worker → Airtable (`AIRTABLE_TOKEN`) |
| Booking | `https://cal.com/swftstudios/swft-meeting` |
| Analytics | Added via `js/swft-analytics.js` (optional GA4 ID) |
| Pricing source | `data/pricing.json` (Method page demoted) |

## Release gates

### Release 1 — Cleanup and conversion
- [x] Branch created
- [ ] Hidden legacy homepage block removed
- [ ] Nav CTA → Growth Audit
- [ ] Homepage hero + section order updated
- [ ] Growth Audit landing + thank-you + API live
- [ ] Local funnel path verified

### Release 2 — Trust and qualification
- [ ] Pricing CTAs/copy aligned
- [ ] Contact form expanded
- [ ] Case study end CTAs → Growth Audit
- [ ] Airtable confirmation automations documented

### Release 3 — Measurement and optimization
- [ ] robots.txt + sitemap.xml
- [ ] Analytics events wired
- [ ] SEO meta / JSON-LD on key pages
- [ ] A11y / responsive / performance QA

## Legacy inventory (pre-cleanup)

- `index.html` ~1306–2125: hidden chatbots, First 10 Signups, Calendly, template footer
- Nav: “Order Your Website →” → `swft-method.html`
- Hero: “Book a Discovery Call”
- Footer mailto mismatches on many Webflow pages
- No Growth Audit pages; no robots/sitemap

## Commits

1. `chore: audit and remove legacy content`
2. `feat: standardize conversion CTAs`
3. `feat: restructure homepage messaging`
4. `feat: add growth audit funnel`
5. `feat: improve contact and pricing pages`
6. `feat: strengthen case study conversion paths`
7. `feat: add analytics and SEO improvements`
8. `fix: accessibility performance and responsive QA`
