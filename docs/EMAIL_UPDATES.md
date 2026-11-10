# Email updates list

Visitors sign up on [`/account.html`](../account.html) to get an email when SWFT releases a film, publishes a blog post or launches a product. Clients log in on the same page.

## Flow

1. Visitor picks topics (`videos`, `blog`, `products`), enters email (and optionally a first name) → `POST /api/subscribe`.
2. A row is created as `pending` (or refreshed) and a confirm email is sent through Resend with `https://www.swftstudios.com/account.html?confirm=<token>`.
3. The account page posts the token to `POST /api/subscribe/confirm` → `active`. Topics change only when a confirm link is used, so nobody can change another person's topics by typing their email.
4. Unsubscribe: `account.html?unsubscribe=<id>` → `POST /api/subscribe/unsubscribe`. Mail apps can also POST `/api/subscribe/unsubscribe?id=` directly (RFC 8058 one-click). The id is 96 random bits that only appear in that subscriber's own emails, so it is the unsubscribe key; no signing secret is needed.

## Storage

D1 `swft-portal`, table `subscribers` ([`migrations/0003_subscribers.sql`](../migrations/0003_subscribers.sql)). Apply once:

```bash
npx wrangler d1 migrations apply swft-portal --remote
```

Read the list:

```bash
npx wrangler d1 execute swft-portal --remote --command "SELECT email, name, interests, confirmed_at FROM subscribers WHERE status = 'active'"
```

## Required env

| Name | Why |
| --- | --- |
| `DB` | D1 binding (already set) |
| `RESEND_API_KEY` | Sends the confirm email. If sending fails the visitor sees an error and can retry after 5 minutes. |
| `PORTAL_ORIGIN` | Host used in links (default request origin) |

## Sending updates

Code: [`functions/_lib/newsletter.js`](../functions/_lib/newsletter.js). Recipients are `status = 'active'` subscribers whose `interests` include the topic, minus anyone who turned off all email on the preferences page. Every email has that subscriber's unsubscribe link plus `List-Unsubscribe` / `List-Unsubscribe-Post` one-click headers. `newsletter_deliveries` records who got what, so nobody gets the same post or video twice.

**By hand:** Admin → Newsletter. Pick a post or video, edit the subject and summary, send yourself a test, then send to subscribers.

**Automatically (new blog posts):** the cron Worker [`workers/newsletter`](../workers/newsletter) runs every 15 minutes. It reads the live `https://www.swftstudios.com/data/blog-posts.json`, so a post counts as published once it is deployed. **After adding a post, run `npm run build:blog-index` and commit the updated `data/blog-posts.json`,** otherwise the Worker can't see the post.

- First run: every post already on the site is recorded as `baseline` and never emailed automatically.
- A post seen later waits 30 minutes, then goes to blog subscribers with its title as the subject and its meta description as the summary. To stop one, click "Don't auto-send" in Admin → Newsletter before then, or take the post down.
- Videos are sent by hand only.

Setup (once, after migration 0010 is applied):

```bash
cd workers/newsletter
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Optional: set `NEWSLETTER_FROM` (e.g. `SWFT Studios <updates@news.swftstudios.com>`) on both the Worker and the Pages project to send from a verified Resend subdomain, not the main address.

## Failure cases

- **No DB**: 503 "Sign-up isn't available right now."
- **Resend down**: 502, row stays pending; retry allowed after the 5-minute cooldown.
- **Expired / reused confirm link**: page explains and asks to sign up again.
- **Malformed unsubscribe link**: 400, nothing changes. An unknown id answers OK without changing anything.
