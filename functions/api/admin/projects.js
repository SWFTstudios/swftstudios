/**
 * POST /api/admin/projects — staff-only: set site_host (or create mapping).
 * Auth: Authorization: Bearer <PORTAL_ADMIN_SECRET>
 *
 * Body: { projectId?, email?, siteHost }
 */
import { isValidEmail, json, str } from "../../_lib/portal-auth.js";
import {
  findUserByEmail,
  getLatestProjectForUser,
  requireDb,
  updateProjectHost,
} from "../../_lib/portal-db.js";

function unauthorized() {
  return json({ ok: false, error: "Unauthorized" }, 401);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const secret = env.PORTAL_ADMIN_SECRET;
  if (!secret) {
    return json({ ok: false, error: "Admin API not configured." }, 503);
  }

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== secret) return unauthorized();

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

  const siteHost = str(body.siteHost || body.host, 253)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!siteHost || siteHost.includes(" ")) {
    return json({ ok: false, error: "siteHost is required (e.g. www.client.com)." }, 400);
  }

  let projectId = str(body.projectId, 64);
  if (!projectId) {
    const email = str(body.email, 320).toLowerCase();
    if (!isValidEmail(email)) {
      return json({ ok: false, error: "projectId or valid email is required." }, 400);
    }
    const user = await findUserByEmail(db, email);
    if (!user) return json({ ok: false, error: "User not found." }, 404);
    const project = await getLatestProjectForUser(db, user.id);
    if (!project) return json({ ok: false, error: "No project for that user." }, 404);
    projectId = project.id;
  }

  try {
    const project = await updateProjectHost(db, projectId, siteHost);
    if (!project) return json({ ok: false, error: "Project not found." }, 404);
    return json({
      ok: true,
      project: {
        id: project.id,
        userId: project.user_id,
        tierId: project.tier_id,
        status: project.status,
        siteHost: project.site_host,
      },
    });
  } catch (err) {
    console.error("admin projects failed", err);
    return json({ ok: false, error: "Update failed." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
