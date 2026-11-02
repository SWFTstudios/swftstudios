/**
 * POST /api/subscribe  { email, name?, interests: ["videos","blog","products"], honeypot? }
 * Double opt-in sign-up for email updates. Always answers the same way for
 * new, pending and existing addresses so the list can't be probed.
 */
import { isValidEmail, json, str } from "../../_lib/portal-auth.js";
import { requireDb } from "../../_lib/portal-db.js";
import { sameOrigin } from "../../_lib/admin-auth.js";
import { cleanInterests, subscribe } from "../../_lib/subscribers.js";

const DONE = { ok: true, message: "Check your inbox and tap the link to confirm." };

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin." }, 403);
  const db = requireDb(env);
  if (!db || !env.SESSION_SECRET) return json({ ok: false, error: "Sign-up isn't available right now. Try again later." }, 503);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4000) return json({ ok: false, error: "Too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  if (str(body.honeypot, 200)) return json(DONE);

  const email = str(body.email, 320).toLowerCase();
  const name = str(body.name, 80).replace(/[\r\n<>]/g, "");
  const interests = cleanInterests(body.interests);
  if (!isValidEmail(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
  if (!interests) return json({ ok: false, error: "Pick at least one kind of update." }, 400);

  try {
    const res = await subscribe(db, env, request, { email, name, interests, sourcePage: str(body.sourcePage, 300) });
    if (!res.sent && !res.throttled) {
      return json({ ok: false, error: "We couldn't send the confirmation email. Try again in a few minutes." }, 502);
    }
    return json(DONE);
  } catch (err) {
    console.error("subscribe failed", err);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}
