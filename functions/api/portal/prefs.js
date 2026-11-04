/**
 * POST /api/portal/prefs  { mode: "system" | "light" | "dark" }
 * Saves the signed-in user's appearance mode (users.ui_mode, migration 0005).
 * The browser keeps its own copy, so a failure here is never fatal.
 */
import { json } from "../../_lib/portal-auth.js";
import { getSessionUser, requireDb } from "../../_lib/portal-db.js";

const MODES = new Set(["system", "light", "dark"]);

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Send JSON like {\"mode\":\"light\"}." }, 400);
  }
  const mode = String(body?.mode || "");
  if (!MODES.has(mode)) return json({ ok: false, error: "Mode must be system, light or dark." }, 400);

  try {
    const user = await getSessionUser(db, request);
    if (!user) return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    await db.prepare("UPDATE users SET ui_mode = ? WHERE id = ?").bind(mode, user.id).run();
    return json({ ok: true, mode });
  } catch (err) {
    // Most likely migration 0005 has not been applied yet
    console.error("portal prefs save failed", err);
    return json({ ok: false, error: "Could not save your appearance setting." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
