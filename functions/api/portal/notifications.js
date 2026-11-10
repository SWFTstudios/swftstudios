/**
 * The signed-in client's notifications (project updates from SWFT).
 * GET  /api/portal/notifications                 { items, unread, email: { on, prefsUrl } }
 * POST /api/portal/notifications  { action: "seen" }               mark all read
 *                                 { action: "email", on: boolean } email me about updates
 */
import { sameOrigin } from "../../_lib/admin-auth.js";
import { json } from "../../_lib/portal-auth.js";
import { getLatestProjectForUser, getSessionUser, requireDb } from "../../_lib/portal-db.js";
import { prefsReady } from "../../_lib/email-prefs.js";
import { markSeen, notificationsFor, setUpdateEmails } from "../../_lib/notifications.js";

async function gate(context, write) {
  const db = requireDb(context.env);
  if (!db) return { response: json({ ok: false, error: "Portal storage is not configured." }, 503) };
  if (write && !sameOrigin(context.request)) return { response: json({ ok: false, error: "Bad origin." }, 403) };
  const user = await getSessionUser(db, context.request);
  if (!user) return { response: json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401) };
  return { db, user };
}

export async function onRequestGet(context) {
  const g = await gate(context, false);
  if (g.response) return g.response;
  try {
    const project = await getLatestProjectForUser(g.db, g.user.id);
    if (!project) return json({ ok: true, items: [], unread: 0, email: null });
    return json({ ok: true, ...(await notificationsFor(context.env, g.db, g.user, project.id)) });
  } catch (err) {
    console.error("notifications failed", err);
    return json({ ok: false, error: "Could not load notifications." }, 500);
  }
}

export async function onRequestPost(context) {
  const g = await gate(context, true);
  if (g.response) return g.response;
  let b;
  try { b = await context.request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  try {
    if (b.action === "seen") { await markSeen(g.db, g.user.id); return json({ ok: true }); }
    if (b.action === "email") {
      if (!(await prefsReady(g.db))) return json({ ok: false, error: "Email settings aren't available yet." }, 503);
      await setUpdateEmails(g.db, g.user.email, !!b.on);
      return json({ ok: true, on: !!b.on });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("notifications post failed", err);
    return json({ ok: false, error: "Could not save." }, 500);
  }
}
