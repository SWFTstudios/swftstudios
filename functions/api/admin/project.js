/**
 * Owner-only project management (admin session; writes need same-origin).
 *
 * GET  /api/admin/project?id=<projectId>[&metrics=1]
 *      The same view the client sees (for "View as client"), plus site metrics
 *      when metrics=1.
 * POST /api/admin/project  { action, ... }
 *      milestone_status { id, status }        add_milestone { projectId, title, detail?, dueDate? }
 *      delete_milestone { id }                add_update    { projectId, body }
 *      delete_update    { id }                rename        { projectId, name }
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { fetchHostMetrics } from "../../_lib/posthog-metrics.js";
import {
  addMilestone, addUpdate, deleteMilestone, deleteUpdate, getProjectView,
  MILESTONE_STATUSES, renameProject, setMilestoneStatus,
} from "../../_lib/projects.js";

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const q = new URL(context.request.url).searchParams;
  const id = str(q.get("id"), 64);
  if (!id) return json({ ok: false, error: "id is required." }, 400);
  try {
    const view = await getProjectView(gate.db, id);
    if (!view) return json({ ok: false, error: "Project not found." }, 404);
    const metrics = q.get("metrics") === "1" ? await fetchHostMetrics(context.env, view.project.siteHost) : undefined;
    return json({ ok: true, view, metrics });
  } catch (err) {
    console.error("admin project get failed", err);
    return json({ ok: false, error: "Could not load the project." }, 500);
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestPost(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  let b;
  try { b = JSON.parse(await context.request.text()); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const db = gate.db;
  const action = str(b.action, 40);
  try {
    let ok = false, id;
    if (action === "milestone_status") {
      if (!MILESTONE_STATUSES.includes(b.status)) return json({ ok: false, error: "Unknown status." }, 400);
      ok = await setMilestoneStatus(db, str(b.id, 64), b.status);
    } else if (action === "add_milestone") {
      const title = str(b.title, 120);
      const dueDate = str(b.dueDate, 10);
      if (!title) return json({ ok: false, error: "Title is required." }, 400);
      if (dueDate && !DATE.test(dueDate)) return json({ ok: false, error: "Use YYYY-MM-DD for the date." }, 400);
      id = await addMilestone(db, str(b.projectId, 64), { title, detail: str(b.detail, 400), dueDate });
      ok = true;
    } else if (action === "delete_milestone") {
      ok = await deleteMilestone(db, str(b.id, 64));
    } else if (action === "add_update") {
      const body = str(b.body, 2000);
      if (!body) return json({ ok: false, error: "Write the update first." }, 400);
      id = await addUpdate(db, str(b.projectId, 64), body);
      ok = true;
    } else if (action === "delete_update") {
      ok = await deleteUpdate(db, str(b.id, 64));
    } else if (action === "rename") {
      ok = await renameProject(db, str(b.projectId, 64), str(b.name, 120));
    } else {
      return json({ ok: false, error: "Unknown action." }, 400);
    }
    return ok ? json({ ok: true, id }) : json({ ok: false, error: "Not found." }, 404);
  } catch (err) {
    console.error("admin project post failed", err);
    const msg = /no such table|FOREIGN KEY/i.test(String(err?.message))
      ? "Project progress tables are missing or the project doesn't exist. Apply migration 0004."
      : "Could not save.";
    return json({ ok: false, error: msg }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
