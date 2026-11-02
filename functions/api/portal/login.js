/**
 * POST /api/portal/login
 */
import {
  isValidEmail,
  json,
  passwordOk,
  sessionCookieHeader,
  str,
} from "../../_lib/portal-auth.js";
import { authenticateUser, createSession, requireDb } from "../../_lib/portal-db.js";
import { isAdminEmail } from "../../_lib/admin-auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) {
    return json({ ok: false, error: "Portal storage is not configured." }, 503);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const email = str(body.email, 320).toLowerCase();
  const password = String(body.password ?? "");

  if (!isValidEmail(email) || !passwordOk(password)) {
    return json({ ok: false, error: "Invalid email or password." }, 401);
  }

  try {
    const user = await authenticateUser(db, email, password);
    if (!user) {
      return json({ ok: false, error: "Invalid email or password." }, 401);
    }
    const sessionId = await createSession(db, user.id);
    // Owner/admin emails land on the admin dashboard; everyone else on the client portal.
    const redirect = isAdminEmail(env, user.email) ? "/admin/" : "/portal/dashboard.html";
    return json(
      { ok: true, email: user.email, redirect },
      200,
      { "Set-Cookie": sessionCookieHeader(sessionId) }
    );
  } catch (err) {
    console.error("portal login failed", err);
    return json({ ok: false, error: "Unable to sign in. Try again." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
