/**
 * One-click unsubscribe (RFC 8058) from the List-Unsubscribe header of every person-facing email.
 * POST /api/email-prefs/unsubscribe?t=<token>&c=<category|all>
 * Mail apps send this POST with no Origin, so the random token is the only key.
 * GET (a person or a link scanner opening the URL) changes nothing and shows the preferences page.
 */
import { json, str } from "../../_lib/portal-auth.js";
import { requireDb } from "../../_lib/portal-db.js";
import { CATEGORIES, prefsByToken, prefsReady, savePrefs } from "../../_lib/email-prefs.js";
import { unsubscribe } from "../../_lib/subscribers.js";

export async function onRequestPost(context) {
  const db = requireDb(context.env);
  if (!db || !(await prefsReady(db))) return json({ ok: false }, 503);
  const q = new URL(context.request.url).searchParams;
  const row = await prefsByToken(db, str(q.get("t"), 64));
  if (!row) return json({ ok: false, error: "That link isn't valid." }, 400);
  const c = str(q.get("c"), 20);
  if (CATEGORIES[c]) await savePrefs(db, row, { changes: { [c]: false } });
  else {
    await savePrefs(db, row, { allOff: true });
    const s = await db.prepare("SELECT id FROM subscribers WHERE email = ? AND status != 'unsubscribed'").bind(row.email).first().catch(() => null);
    if (s) await unsubscribe(db, s.id);
  }
  return json({ ok: true });
}

export function onRequestGet(context) {
  const q = new URL(context.request.url).searchParams;
  const t = str(q.get("t"), 64);
  return Response.redirect(new URL(`/email-preferences.html?t=${encodeURIComponent(t)}&off=${encodeURIComponent(str(q.get("c"), 20) || "all")}`, context.request.url).toString(), 302);
}
