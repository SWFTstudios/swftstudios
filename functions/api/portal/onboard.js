/**
 * POST /api/portal/onboard — create password (or complete invite) and start session.
 */
import {
  isValidEmail,
  json,
  passwordOk,
  sessionCookieHeader,
  str,
} from "../../_lib/portal-auth.js";
import { createSession, onboardUser, requireDb } from "../../_lib/portal-db.js";

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
  const inviteToken = str(body.inviteToken || body.token, 128);

  if (!isValidEmail(email)) {
    return json({ ok: false, error: "Valid email is required." }, 400);
  }
  if (!passwordOk(password)) {
    return json({ ok: false, error: "Password must be at least 10 characters." }, 400);
  }

  try {
    const result = await onboardUser(db, { email, password, inviteToken });
    if (result.error) {
      return json({ ok: false, error: result.error, code: result.code }, 409);
    }
    const sessionId = await createSession(db, result.user.id);
    return json(
      {
        ok: true,
        created: result.created,
        email: result.user.email,
        redirect: "/portal/dashboard.html",
      },
      200,
      { "Set-Cookie": sessionCookieHeader(sessionId) }
    );
  } catch (err) {
    console.error("portal onboard failed", err);
    return json({ ok: false, error: "Unable to create account. Try again." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
