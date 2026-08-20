/**
 * POST /api/portal/logout
 */
import { getSessionIdFromRequest, json, sessionCookieHeader } from "../../_lib/portal-auth.js";
import { destroySession, requireDb } from "../../_lib/portal-db.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = requireDb(env);
  const sessionId = getSessionIdFromRequest(request);
  if (db && sessionId) {
    try {
      await destroySession(db, sessionId);
    } catch (err) {
      console.error("portal logout session delete failed", err);
    }
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookieHeader("", { clear: true }) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
