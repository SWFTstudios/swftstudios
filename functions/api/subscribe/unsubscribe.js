/**
 * POST /api/subscribe/unsubscribe  { id, sig }  or  ?id=&sig= (RFC 8058
 * one-click List-Unsubscribe-Post from mail apps, which send no Origin).
 * The signature (HMAC with SESSION_SECRET) is the authorization.
 */
import { json, str } from "../../_lib/portal-auth.js";
import { requireDb } from "../../_lib/portal-db.js";
import { unsubscribe } from "../../_lib/subscribers.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) return json({ ok: false, error: "Not available right now." }, 503);
  const q = new URL(request.url).searchParams;
  let body = {};
  if ((request.headers.get("Content-Type") || "").includes("application/json")) {
    try { body = await request.json(); } catch { /* empty */ }
  }
  const id = str(body.id || q.get("id"), 40);
  const sig = str(body.sig || q.get("sig"), 80);
  try {
    const res = await unsubscribe(db, env, id, sig);
    return res.ok ? json({ ok: true }) : json({ ok: false, error: "That unsubscribe link isn't valid." }, 400);
  } catch (err) {
    console.error("unsubscribe failed", err);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}
