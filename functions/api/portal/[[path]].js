/**
 * /api/portal/* — client workspace routes (projects, files, notes, tasks,
 * password reset). See functions/_lib/portal-api.js. Older single-file
 * routes in this folder (login, logout, me, onboard, metrics) take precedence.
 */
import { json } from "../../_lib/portal-auth.js";
import { handleWorkspaceApi } from "../../_lib/portal-api.js";

export async function onRequest(context) {
  return (await handleWorkspaceApi(context)) || json({ ok: false, error: "Not found" }, 404);
}
