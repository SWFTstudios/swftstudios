# SWFT Conversion Funnel — Final Report

Branch: `cursor/swft-conversion-funnel-4378`

## Summary

The site now funnels visitors toward a Free Growth Audit instead of competing Method / discovery-call CTAs. Legacy chatbot / First-10 / Calendly content was deleted from the homepage source. Pricing and contact reinforce the same qualification path.

## Files changed (high level)

- Homepage: `index.html` (legacy removal + messaging restructure)
- Nav: `js/swft-nav.js`
- Funnel: `growth-audit.html`, `growth-audit/thank-you.html`, `css/growth-audit.css`, `js/growth-audit-form.js`
- Worker: `src/worker.ts` (clean URLs + `/api/growth-audit` + expanded contact)
- Contact / pricing: `contact.html`, `data/pricing.json`, `js/pricing-render.js`, `website-pricing.html`, `services.html`
- Case studies: `case-study/*.html` end CTAs + footers
- SEO / analytics: `robots.txt`, `sitemap.xml`, `js/swft-analytics.js`
- Config/docs: `.assetsignore`, `wrangler.jsonc`, `docs/INTEGRATIONS.md`, `docs/CONVERSION_FUNNEL_CHECKLIST.md`
- Method demoted: `swft-method.html` banner

## Pages added

- `/growth-audit` → `growth-audit.html`
- `/growth-audit/thank-you` → `growth-audit/thank-you.html`

## Content removed

- Hidden homepage block (~820 lines): AI/chatbot offers, First 10 Signups, Calendly, template footer
- FormSubmit early-access signup
- Competing primary CTAs (Order Your Website, Book a Discovery Call as default)

## Forms and integrations

| Form | Endpoint | Storage |
|---|---|---|
| Growth Audit | `POST /api/growth-audit` | Airtable Growth Audits (`AIRTABLE_TABLE_GROWTH_AUDIT`) or Discovery Calls fallback |
| Contact / project | `POST /api/contact` | Airtable Discovery Calls |

## Analytics events

Implemented via `js/swft-analytics.js` + form hooks:

`growth_audit_view`, `growth_audit_start`, `growth_audit_submit`, `contact_form_submit`, `calendar_click`, `portfolio_view`, `case_study_view`, `pricing_view`, `email_click`, `phone_click`

No PII is sent. Optional GA4 via `window.SWFT_GA_ID` or `<meta name="swft-ga-id">`.

## Environment variables required

| Variable | Required |
|---|---|
| `AIRTABLE_TOKEN` | Yes for durable lead storage |
| `AIRTABLE_TABLE_GROWTH_AUDIT` | Recommended (table id after creating Growth Audits) |
| `AIRTABLE_TABLE_CONTACT` | Already defaulted |
| GA4 measurement ID | Optional |

## Manual setup still needed

1. Create Airtable **Growth Audits** table (field list in `docs/INTEGRATIONS.md`) and set `AIRTABLE_TABLE_GROWTH_AUDIT`.
2. Confirm `AIRTABLE_TOKEN` is set on the Worker.
3. Add Airtable automations for confirmation emails (audit + contact).
4. Provide GA4 ID when ready for measurement.
5. Deploy from this branch after review (do not push directly to production from this agent).

## Testing performed

- `npx tsc --noEmit` (pass)
- `npx wrangler dev --local` after `.assetsignore`
- HTTP 200: `/`, `/growth-audit`, `/growth-audit/thank-you`, `/robots.txt`, `/sitemap.xml`, `/contact.html`
- `POST /api/growth-audit` returns `{ ok: true }` (stored false locally without token — expected)
- Honeypot path returns ok without error
- Homepage HTML contains no calendly / First 10 / formsubmit / chatbot legacy strings
- Nav CTA label is Growth Audit

## Remaining recommendations

- Align or further retire Instant Website Stripe pricing vs `data/pricing.json` when ready
- Add privacy policy page and point consent links there (currently resources + email)
- Wire GA4 ID and verify events in debug view
- Expand sitemap with remaining thought-leadership case-study URLs if they should stay indexed
- Visual regression pass on homepage after large section reorder
