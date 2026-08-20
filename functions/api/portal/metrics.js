/**
 * GET /api/portal/metrics — PostHog metrics for the staff-assigned site_host only.
 */
import { json } from "../../_lib/portal-auth.js";
import { getLatestProjectForUser, getSessionUser, requireDb } from "../../_lib/portal-db.js";
import { fetchHostMetrics } from "../../_lib/posthog-metrics.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) {
    return json({ ok: false, error: "Portal storage is not configured." }, 503);
  }

  try {
    const user = await getSessionUser(db, request);
    if (!user) {
      return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    }

    const project = await getLatestProjectForUser(db, user.id);
    if (!project) {
      return json({
        ok: true,
        metrics: {
          ok: false,
          reason: "no_project",
          message: "No project yet. Complete a booking to see progress here.",
        },
      });
    }

    const metrics = await fetchHostMetrics(env, project.site_host);
    return json({ ok: true, projectId: project.id, metrics });
  } catch (err) {
    console.error("portal metrics failed", err);
    return json({ ok: false, error: "Unable to load metrics." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
