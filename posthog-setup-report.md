# PostHog post-wizard report

The wizard has completed a deep integration of PostHog across the SWFT Studios project. The `posthog-node` v5 SDK was already installed and the main Cloudflare Worker (`src/worker.ts`) already had four core events. This session extended coverage in three ways: (1) added `rate limit hit` events to all three rate-limited routes in the Worker so abuse and traffic spikes are visible in PostHog; (2) added full PostHog instrumentation to both Cloudflare Pages Functions (`functions/api/build-request.js` and `functions/api/contact.js`), which mirror the Worker's routes for Pages deployments; (3) confirmed `POSTHOG_API_KEY` and `POSTHOG_HOST` are written to `.dev.vars` for local development. All captures use `captureImmediate` + `context.waitUntil()` so PostHog calls never block HTTP responses. User identity is linked via email as the distinct ID where available, with client IP as the anonymous fallback.

| Event name | Description | File |
|---|---|---|
| `build request submitted` | Fired when a visitor submits the website build order form with their plan choice and business details. | `src/worker.ts`, `functions/api/build-request.js` |
| `stripe checkout initiated` | Fired when a Stripe Checkout session is successfully created for a build request. | `src/worker.ts`, `functions/api/build-request.js` |
| `discovery call requested` | Fired when a visitor submits the discovery call contact form. | `src/worker.ts`, `functions/api/contact.js` |
| `case study matched` | Fired when the AI-powered case study matcher returns a result for a visitor query. | `src/worker.ts` |
| `rate limit hit` | Fired when a client IP exceeds the in-memory rate limit, with the route as a property. | `src/worker.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/486061/dashboard/1761251)
- [Build requests over time](https://us.posthog.com/project/486061/insights/4QMXPYWt) — daily line chart
- [Build → Checkout conversion funnel](https://us.posthog.com/project/486061/insights/froK990m) — conversion from build request to Stripe checkout
- [Discovery call requests over time](https://us.posthog.com/project/486061/insights/W2HsBeyE) — daily line chart
- [Case study matches over time](https://us.posthog.com/project/486061/insights/kZH6g4gS) — daily line chart
- [Rate limit hits by route](https://us.posthog.com/project/486061/insights/2IE3j4AA) — bar chart broken down by API route

## Verify before merging

- [ ] Run a full production build (`wrangler deploy --dry-run`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `POSTHOG_API_KEY` and `POSTHOG_HOST` to a `.dev.vars.example` file so collaborators know what to set locally. For production, set these as Cloudflare Worker secrets via `wrangler secret put POSTHOG_API_KEY` or the Cloudflare dashboard (Settings → Variables and Secrets).

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
