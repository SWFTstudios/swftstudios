/**
 * Email preferences by link (no sign-in): the token comes from the footer of any SWFT email.
 *
 * GET  /api/email-prefs?t=<token>
 * POST /api/email-prefs  { t, changes?: { project: bool, account: bool, replies: bool }, allOff?: bool, news?: false }
 */
import { sameOrigin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { requireDb } from "../../_lib/portal-db.js";
import { prefsByToken, prefsReady, prefsView, savePrefs } from "../../_lib/email-prefs.js";
import { unsubscribe } from "../../_lib/subscribers.js";

function maskEmail(e) {
  const [u, d] = String(e).split("@");
  return (u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "*".repeat(Math.min(6, u.length - 2))) + "@" + d;
}

async function newsStatus(db, email) {
  try {
    const s = await db.prepare("SELECT id, status FROM subscribers WHERE email = ?").bind(email).first();
    return s ? { id: s.id, status: s.status } : null;
  } catch { return null; }
}

async function load(db, token) {
  if (!(await prefsReady(db))) return null;
  return prefsByToken(db, token);
}

async function view(db, row) {
  const news = await newsStatus(db, row.email);
  return { ok: true, email: maskEmail(row.email), ...prefsView(row), news: news ? news.status === "active" : null };
}

export async function onRequestGet(context) {
  const db = requireDb(context.env);
  if (!db) return json({ ok: false, error: "Not available right now." }, 503);
  const row = await load(db, str(new URL(context.request.url).searchParams.get("t"), 64));
  if (!row) return json({ ok: false, error: "That link isn't valid. Use the link in your most recent email from us." }, 404);
  return json(await view(db, row));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) return json({ ok: false, error: "Not available right now." }, 503);
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin." }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  let row = await load(db, str(b.t, 64));
  if (!row) return json({ ok: false, error: "That link isn't valid." }, 404);
  const changes = {};
  for (const [k, v] of Object.entries(b.changes || {})) changes[k] = !!v;
  row = await savePrefs(db, row, { changes, allOff: b.allOff == null ? undefined : !!b.allOff });
  if (b.allOff === true || b.news === false) {
    const news = await newsStatus(db, row.email);
    if (news && news.status !== "unsubscribed") await unsubscribe(db, news.id);
  }
  return json(await view(db, row));
}
