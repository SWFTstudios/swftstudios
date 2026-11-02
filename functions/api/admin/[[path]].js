/**
 * /api/admin/* — admin workspace routes (clients, invites, projects, tasks).
 * Needs a signed-in admin. See functions/_lib/portal-api.js.
 * POST /api/admin/projects (functions/api/admin/projects.js) is the older
 * bearer-token endpoint for setting a project's analytics host.
 */
import { json } from "../../_lib/portal-auth.js";
import { handleWorkspaceApi } from "../../_lib/portal-api.js";

export async function onRequest(context) {
  return (await handleWorkspaceApi(context)) || json({ ok: false, error: "Not found" }, 404);
}
