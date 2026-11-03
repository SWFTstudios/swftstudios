/**
 * GET /api/portal/project — the signed-in client's latest project: milestones,
 * progress and updates (functions/_lib/projects.js). Never includes admin notes.
 */
import { json } from "../../_lib/portal-auth.js";
import { getLatestProjectForUser, getSessionUser, requireDb } from "../../_lib/portal-db.js";
import { getProjectView } from "../../_lib/projects.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
  try {
    const user = await getSessionUser(db, request);
    if (!user) return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    const project = await getLatestProjectForUser(db, user.id);
    if (!project) return json({ ok: true, view: null });
    return json({ ok: true, view: await getProjectView(db, project.id) });
  } catch (err) {
    console.error("portal project failed", err);
    return json({ ok: false, error: "Unable to load your project." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
