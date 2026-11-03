/**
 * Owner/admin gate for the personal admin dashboard.
 *
 * Admin = a normal portal session whose email is on the allowlist. The check is
 * always done here on the server; the browser never decides who is an admin.
 * The site owner (OWNER_EMAILS) is always an admin. ADMIN_EMAILS (comma-separated,
 * optional) only ADDS people, so a misconfigured env var can never lock the
 * owner out of the admin view.
 */
import { json } from "./portal-auth.js";
import { getSessionUser, requireDb } from "./portal-db.js";

export const OWNER_EMAILS = ["elombe@swftstudios.com"];

export function adminEmails(env) {
  const extra = String(env?.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...OWNER_EMAILS, ...extra])];
}

export function isAdminEmail(env, email) {
  return !!email && adminEmails(env).includes(String(email).trim().toLowerCase());
}

/** Writes must come from our own pages (blocks cross-site form posts using the session cookie). */
export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * Returns { db, user } for an admin, or { response } to send back as-is:
 * 503 no storage, 401 not signed in, 403 signed in but not an admin,
 * 403 for a write without a same-origin Origin header.
 */
export async function requireAdmin(context, { write = false } = {}) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) return { response: json({ ok: false, error: "Portal storage is not configured." }, 503) };
  if (write && !sameOrigin(request)) {
    return { response: json({ ok: false, error: "Bad origin." }, 403) };
  }
  const user = await getSessionUser(db, request);
  if (!user) return { response: json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401) };
  if (!isAdminEmail(env, user.email)) {
    return { response: json({ ok: false, error: "Admins only.", code: "forbidden" }, 403) };
  }
  return { db, user };
}
