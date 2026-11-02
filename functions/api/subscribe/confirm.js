/**
 * POST /api/subscribe/confirm  { token }
 * Called by /account.html?confirm=<token> (a page, not a GET endpoint, so
 * mail scanners that pre-open links don't confirm on someone's behalf).
 */
import { json, str } from "../../_lib/portal-auth.js";
import { requireDb } from "../../_lib/portal-db.js";
import { sameOrigin } from "../../_lib/admin-auth.js";
import { confirm } from "../../_lib/subscribers.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin." }, 403);
  const db = requireDb(env);
  if (!db) return json({ ok: false, error: "Not available right now." }, 503);
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  try {
    const res = await confirm(db, str(body.token, 100));
    if (res.ok) return json({ ok: true });
    return json({ ok: false, reason: res.reason, error: res.reason === "expired" ? "That link has expired. Sign up again for a fresh one." : "That link isn't valid." }, 400);
  } catch (err) {
    console.error("subscribe confirm failed", err);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}
