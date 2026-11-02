# Email updates list

Visitors sign up on [`/account.html`](../account.html) to get an email when SWFT releases a film, publishes a blog post or launches a product. Clients log in on the same page.

## Flow

1. Visitor picks topics (`videos`, `blog`, `products`), enters email (and optionally a first name) → `POST /api/subscribe`.
2. A row is created as `pending` (or refreshed) and a confirm email is sent through Resend with `https://www.swftstudios.com/account.html?confirm=<token>`.
3. The account page posts the token to `POST /api/subscribe/confirm` → `active`. Topics change only when a confirm link is used, so nobody can change another person's topics by typing their email.
4. Unsubscribe: `account.html?unsubscribe=<id>&sig=<hmac>` → `POST /api/subscribe/unsubscribe`. Mail apps can also POST `/api/subscribe/unsubscribe?id=&sig=` directly (RFC 8058 one-click).

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
| `SESSION_SECRET` | Signs unsubscribe links (already set). Without it sign-up returns 503. Rotating it breaks old unsubscribe links. |
| `RESEND_API_KEY` | Sends the confirm email. If sending fails the visitor sees an error and can retry after 5 minutes. |
| `PORTAL_ORIGIN` | Host used in links (default request origin) |

## Sending updates (not built yet)

When a broadcast job is added, every email must include `await unsubscribeUrl(env, origin, row.id)` from `functions/_lib/subscribers.js`, plus `List-Unsubscribe: <https://www.swftstudios.com/api/subscribe/unsubscribe?id=…&sig=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Only send to `status = 'active'` rows whose `interests` include the topic.

## Failure cases

- **No DB / secret**: 503 "Sign-up isn't available right now."
- **Resend down**: 502, row stays pending; retry allowed after the 5-minute cooldown.
- **Expired / reused confirm link**: page explains and asks to sign up again.
- **Tampered unsubscribe link**: 400, nothing changes.
