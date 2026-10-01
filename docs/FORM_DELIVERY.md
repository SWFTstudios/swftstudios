# SWFT website form delivery

## Testing

| Command | What it proves |
|---|---|
| `npm run test:forms` | Every handler (contact, growth audit, all six booking tiers, checkout and quote) emails hello@swftstudios.com, retries a transient failure, and reports failure instead of fake success when nothing was delivered. Also: each form appends a row to its Google Sheets tab, a Resend outage falls back to the Sheets script's email, and the Apps Script itself is exercised. No network or secrets needed. |
| `npm run test:forms:browser` | The same, driven through the real pages in Chromium (needs Playwright; set `CHROMIUM_PATH` for a preinstalled browser). |
| `npm run test:forms:live -- https://swftstudios.com` | Real delivery: submits three `[SWFT TEST]` leads (contact, audit, booking quote, no charge) to a deployed site and checks the server confirms the email. Then check hello@ for the three emails and delete any Airtable test rows. |

The SWFT website supports four intake endpoints:

| Frontend | Endpoint | Owner notification subject |
|---|---|---|
| Pricing / all six tier booking pages | POST /api/book-tier | Custom quote: … or Stripe book: … |
| Contact page | POST /api/contact | Project inquiry: … |
| Free Growth Audit | POST /api/growth-audit | Growth Audit: … |
| Legacy Website Build flow | POST /api/build-request | New website build request: … |

## Production email configuration

Check **Cloudflare → Workers & Pages → swftstudios-website → Settings → Variables and Secrets**, including the **Production** environment. If there is a separately deployed `swftstudios` Worker routing `swftstudios.com`, configure that Worker separately; secrets do not automatically propagate from Pages to Workers or between preview and production.

- `RESEND_API_KEY`: a valid **secret** for the Resend API, set in the actual runtime serving the domain.
- Every lead email goes to **hello@swftstudios.com**. This is fixed in code (`LEAD_INBOX` in `functions/_lib/resend.js`).
- `NOTIFY_EMAIL` (optional): extra recipients, one address or a comma-separated list, e.g. `elombe@swftstudios.com`. It adds copies; it can no longer replace the inbox.
- `RESEND_FROM`: `SWFT Studios <hello@swftstudios.com>`; the `swftstudios.com` sending domain must be verified with Resend.
- `AIRTABLE_TOKEN` is optional for email delivery; recommended as a **separate backup** and for the CRM, with correct base/table permissions.
- `GOOGLE_SHEETS_WEBHOOK_URL` + `GOOGLE_SHEETS_SECRET` (optional **secrets**): log every lead to a Google Sheet and let that script email hello@ if Resend fails. Setup: [`GOOGLE_SHEETS_LEADS.md`](GOOGLE_SHEETS_LEADS.md).

**Do not put a Resend or Airtable API key in GitHub, HTML, a URL or chat.** Configure it as an environment secret. Check Resend sender verification and Resend logs if API calls return an error.

## Reliability behavior

The team email is sent to hello@swftstudios.com plus any `NOTIFY_EMAIL` extras, with the lead as reply-to. A transient Resend failure (429/5xx/network) is retried once with the same idempotency key, so it can't double-send. The visitor confirmation is attempted only after SWFT team email delivery succeeds **or** Airtable saved the submission. Customer-facing form success requires at least one of those durable outcomes; an unconfirmed request returns a non-2xx error and actionable contact text.

Each lead is saved to Airtable **and** the Google Sheet in parallel; either one counts as a durable copy. If the Resend team email fails (or `RESEND_API_KEY` is missing), the Google Sheets script emails hello@swftstudios.com instead, and the form succeeds. See [`GOOGLE_SHEETS_LEADS.md`](GOOGLE_SHEETS_LEADS.md).

The CRM is a backup, not a dependency: a custom quote email can succeed even when Airtable is offline or not configured. Selecting extras never charges Stripe and must produce `quoteRequested: true`. A base-only order preserves the original Stripe Payment Link. All Worker routes now delegate to the same Pages Function handlers to prevent the domain using a stale version that lacked quote handling.

The booking pages use a non-autofillable hidden spam field; previously mobile autofill could trigger an apparently successful-but-dropped intake.

## Smoke test without charging a card

1. Open `https://swftstudios.com/book/gbp-content-refresh.html`, select an add-on, enter your own contact information and select **Request my custom quote**. No payment should occur. Look for `Custom quote: GBP Content Refresh` in `hello@swftstudios.com`. Check the spam folder.
2. Submit the Contact form and Growth Audit using real test details. Confirm a team notification with the submitted fields and, optionally, visitor confirmation.
3. Use a base-only tier form and stop at Stripe Checkout; do **not** pay just to test the request routing.
4. If a form still errors, examine the active Cloudflare runtime request logs and Resend Logs. A 503 with neither a CRM row nor sent team email indicates missing credentials, invalid sender/domain verification, rate limiting, or upstream failure.

The repository contains no Cloudflare production secret values. Passing mocked tests and a successful Cloudflare deployment does **not** prove real emails were delivered; check the destination inbox before treating the incident as fully resolved.
