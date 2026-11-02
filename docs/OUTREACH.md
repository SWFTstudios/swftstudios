# Outreach Worker (`workers/outreach/`)

Cold email for local home-service businesses. Email only; there is no SMS code in this Worker.
Nothing is ever sent without a human approving that exact email.

## Flow

| UTC cron | Job | What happens |
| --- | --- | --- |
| `0 6 * * *` | `places-pull` | One Google Places search (rotating city), dedupe, find a generic business email on the lead's own site, score, check suppression |
| `30 6 * * *` | `score-and-draft` | Claude drafts an email for the best scored leads until the queue holds tomorrow's cap + 5 |
| `0 14,15 * * 1-5` | `send` | **Not built yet** (Resend send, throttle, ET window) |
| `0 12 * * *` | `digest` | **Not built yet** |

You review drafts at `https://<outreach host>/approve`: edit the subject/body, then Approve or Reject.
Approved drafts become `drafts.status = 'approved'` and the lead `queued`; the send job (next slice) only ever sends approved drafts.

## How drafting stays honest

- Claude only receives plain facts from Places and the lead's website (name, trade, city, rating, review count, website yes/no, booking yes/no, closed days, weekday closing time). They are shown on each approval card.
- Every draft is machine-checked and retried once, then the lead is parked as `draft_failed`: no links, no exclamation marks, no unsubscribe text, no placeholders, no claim that we called or tested, 40-140 words, must mention the business, and **every number must appear in the facts**.
- Model: `claude-opus-5-5` by default. Override with the `CLAUDE_MODEL` var (e.g. `claude-sonnet-5-5` for lower cost). Effort is `low`; no sampling parameters are sent (rejected by the API).
- An API outage leaves leads `scored`, so tomorrow's run retries them; unusable model output parks the lead so it isn't billed every night.

## Approval page security

- Password checked against `APPROVAL_PASSWORD_HASH` (PBKDF2-SHA-256, 100000 iterations, the Workers maximum). 5 wrong tries per IP per 15 minutes (KV).
- 12-hour signed session cookie: `HttpOnly; Secure; SameSite=Strict`, scoped to `/approve`.
- Every POST needs a same-origin `Origin` header **and** a per-session CSRF token.
- All lead and draft text is HTML-escaped; strict CSP (`default-src 'none'`), `no-store`, `noindex`.
- Approving re-checks the suppression list, so someone who unsubscribed after the draft was written is dropped.

## One-time setup

```bash
cd workers/outreach && npm install
npx wrangler d1 create swft-outreach            # put the id in wrangler.jsonc
npx wrangler kv namespace create OUTREACH_KV    # put the id in wrangler.jsonc
npx wrangler d1 migrations apply swft-outreach --remote
node ../../scripts/hash-approval-password.mjs    # prints the APPROVAL_PASSWORD_HASH value
npx wrangler secret put APPROVAL_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET           # openssl rand -hex 32
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GOOGLE_PLACES_KEY
npx wrangler secret put UNSUB_SIGNING_SECRET     # openssl rand -hex 32
npx wrangler deploy
```

Start the warmup clock by setting `settings.warmup_start` (a date, e.g. `2026-11-10`) once the sending domain is ready:
`npx wrangler d1 execute swft-outreach --remote --command "INSERT OR REPLACE INTO settings(key,value) VALUES ('warmup_start','2026-11-10')"`.
Optional `settings.min_score` (default 30) controls how good a lead must score to get a draft.

Fill the `REPLACE_*` values in `wrangler.jsonc` (sending domain, mailing address, public origin).

## Tests

Run `cd workers/outreach && npm install` once (the Worker imports the Anthropic SDK), then `npm run test:outreach` from the repo root (31 tests): scoring, throttle, tokens, Places pull on real migrations, drafting rules with a fake Claude client, and the approval page (auth, rate limit, CSRF, origin, escaping, edit/approve/reject). The tests do not call the real Claude or Places APIs.
