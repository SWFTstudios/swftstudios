# SWFT campaign landing pages

These 11 pages are campaign-specific, conversion-focused variants of the published SWFT services. They **do not replace** the indexed service pages; they are \`noindex,follow\` with canonical links to the main service URL to avoid duplicate organic search pages.

## URLs

- /campaigns/websites.html
- /campaigns/apps.html
- /campaigns/software.html
- /campaigns/marketing.html
- /campaigns/content.html
- /campaigns/automations.html
- /campaigns/analytics.html
- /campaigns/photography.html
- /campaigns/videography.html
- /campaigns/social-media.html
- /campaigns/live-streaming.html

All pages use the site's existing Mono visual identity and shared nav, and primary CTAs open the existing 30-minute Cal.com meeting. The secondary CTA goes to the short SWFT contact form with service and source preselection. Published packages link to existing /book/ pages.

## Using a page in a campaign

Example: \`https://www.swftstudios.com/campaigns/websites.html?utm_source=meta&utm_medium=paid-social&utm_campaign=website-weekend\`

- The SWFT analytics helper records campaign UTMs in sessionStorage.
- \`js/funnel-attribution.js\` adds those UTMs to contact and calendar destination links and records \`service_landing_view\` and \`funnel_cta_click\` events.
- Existing analytics also records \`calendar_click\`, but that records **a click, not a completed appointment**. Configure a Cal.com webhook or confirmed-booking integration separately for actual booked meetings and attendance.
- Don't mark both calendar clicks and CTA clicks as GA4 conversions for the same goal.

## Maintaining the pages

Edit source offers in \`data/pricing.json\`; edit service outcomes, FAQs and descriptions in \`data/services.json\`; edit campaign copy, matched proof and offer IDs in \`scripts/build-campaign-pages.mjs\`. Then run:

\`\`\`bash
npm run build:campaigns
npm run test:funnel
\`\`\`

No fictitious client results are used. The app pages explicitly describe app **landing** projects rather than claiming production apps were shipped. The custom software landing page quotes a planning sprint, not a complete CRM build.

Before using a page in paid traffic: verify the booking link works, that the offer is currently available, UTM persistence and the mobile journey.
