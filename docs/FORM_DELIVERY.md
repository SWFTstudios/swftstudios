# SWFT website form delivery

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
- `NOTIFY_EMAIL`: `elombe@swftstudios.com` (or explicitly choose another inbox). The code now defaults to this address if unset.
- `RESEND_FROM`: `SWFT Studios <hello@swftstudios.com>`; the `swftstudios.com` sending domain must be verified with Resend.
- `AIRTABLE_TOKEN` is optional for email delivery; recommended as a **separate backup** and for the CRM, with correct base/table permissions.

**Do not put a Resend or Airtable API key in GitHub, HTML, a URL or chat.** Configure it as an environment secret. Check Resend sender verification and Resend logs if API calls return an error.

## Diagnose production in one minute (no dashboard needed)

Open **https://swftstudios.com/api/form-health** on any device. It shows only booleans, never secret values:

- `config.RESEND_API_KEY` / `config.AIRTABLE_TOKEN`: whether **the deployment currently serving the domain** can see each secret. `false` means the secret is missing from that environment (Production vs Preview), or it was added after the last deployment. Cloudflare Pages applies variable changes **only to new deployments**, so redeploy after changing them.
- `deployment.commit` / `deployment.branch`: which build is live.
- `https://swftstudios.com/api/form-health?live=1` additionally checks, without sending mail, that the Airtable token can read Paid Bookings and that the Resend key is valid and `swftstudios.com` is verified. A send-only Resend key reports `valid_send_only_key_domain_unchecked`. Limited to one live check every 15 seconds.

When a submission fails, the customer sees a **reference** (for example `A1B2C3D4`) and the response JSON carries a short `diagnostic` such as `email:missing_api_key crm:missing_token` or `email:validation_error/403 crm:AUTHENTICATION_REQUIRED/401`. The matching server log line (Cloudflare → swftstudios-website → Functions → Real-time logs) looks like:

```
[SWFT Form] submission_id=... route=/api/book-tier outcome=failed resend_status=403 resend_error=validation_error visitor_email=skipped airtable_status=401 airtable_error=AUTHENTICATION_REQUIRED resend_message="..." airtable_message="..."
```

| Diagnostic | Meaning | Fix |
|---|---|---|
| `email:missing_api_key` | `RESEND_API_KEY` not visible to this deployment | Add it to **Production** as a secret, then redeploy |
| `email:validation_error/403` | Usually the `swftstudios.com` sending domain is not verified in Resend | Resend → Domains → verify (DNS records) |
| `email:invalid_api_key/401` or `/403` | Key revoked or wrong | Create a new key in Resend and replace the secret |
| `email:rate_limit_exceeded/429` | Temporary | Customer can retry; the same submission is not duplicated |
| `crm:missing_token` | `AIRTABLE_TOKEN` not visible to this deployment | Add to Production and redeploy |
| `crm:AUTHENTICATION_REQUIRED/401` | Token invalid/expired | Create a new Airtable PAT |
| `crm:INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND/403` or `/404` | Token lacks the `SWFT Website Leads` base or `data.records:read`/`write` scope | Edit the PAT's scopes/access |

## Delivery outcomes

| Outcome | HTTP | Customer sees |
|---|---|---|
| `delivered`: owner email accepted by Resend **and** Airtable saved | 200 | Success |
| `email_only`: email accepted, Airtable failed | 200 | Success. The owner email shows a **CRM backup: Not saved…** row with the reason |
| `saved_only`: Airtable saved, owner email failed | 200 | Success plus a warning with their reference |
| `failed`: neither | 503 (temporary) / 502 (configuration) | Error with reference; all answers stay on the page for retry |
| invalid input | 400 | Field error |

A Resend response only counts as accepted when it returns a message `id`.

## Retries never duplicate

Each form keeps a `submissionId` in `sessionStorage` until it succeeds. The server:
- tags the Airtable row with `[SWFT ref <id>]` and skips writing again if that tag already exists;
- uses `<form>/<id>.<attempt>` as the Resend `Idempotency-Key`. The browser only bumps `attempt` after the server has confirmed the owner email was **not** sent, so a retry after a timeout can't send twice.

Run the offline test suite (mocked Resend/Airtable, no network, no Stripe) with `npm run test:forms`.

## Reliability behavior

The team email is sent to `NOTIFY_EMAIL` or to the default `elombe@swftstudios.com`. The visitor confirmation is attempted only after SWFT team email delivery succeeds **or** Airtable saved the submission. Customer-facing form success requires at least one of those durable outcomes; an unconfirmed request returns a non-2xx error and actionable contact text.

The CRM is a backup, not a dependency: a custom quote email can succeed even when Airtable is offline or not configured. Selecting extras never charges Stripe and must produce `quoteRequested: true`. A base-only order preserves the original Stripe Payment Link. All Worker routes now delegate to the same Pages Function handlers to prevent the domain using a stale version that lacked quote handling.

All forms (booking pages, Contact, Growth Audit) use a non-autofillable hidden spam field (`swft_hp_confirm`). If it is ever filled, the API returns an explicit 400 instead of a fake success. Previously the Contact and Growth Audit forms used a visible-to-autofill "Company website" field and silently dropped the lead while showing success.

## Smoke test without charging a card

1. Open `https://swftstudios.com/book/gbp-content-refresh.html`, select an add-on, enter your own contact information and select **Request my custom quote**. No payment should occur. Look for `Custom quote: GBP Content Refresh` in `elombe@swftstudios.com`. Check the spam folder.
2. Submit the Contact form and Growth Audit using real test details. Confirm a team notification with the submitted fields and, optionally, visitor confirmation.
3. Use a base-only tier form and stop at Stripe Checkout; do **not** pay just to test the request routing.
4. If a form still errors, examine the active Cloudflare runtime request logs and Resend Logs. A 503 with neither a CRM row nor sent team email indicates missing credentials, invalid sender/domain verification, rate limiting, or upstream failure.

The repository contains no Cloudflare production secret values. Passing mocked tests and a successful Cloudflare deployment does **not** prove real emails were delivered; check the destination inbox before treating the incident as fully resolved.
