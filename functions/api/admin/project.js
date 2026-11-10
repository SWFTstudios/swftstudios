/**
 * Owner-only project management (admin session; writes need same-origin).
 *
 * GET  /api/admin/project?id=<projectId>[&metrics=1]
 *      The same view the client sees (for "View as client"), plus site metrics
 *      when metrics=1.
 * POST /api/admin/project  { action, ... }
 *      milestone_status { id, status, completedOn? }     set_milestone_date { id, date }
 *                                             add_milestone { projectId, title, detail?, dueDate? }
 *      delete_milestone { id }                add_update    { projectId, body, notify? (default true: email the client) }
 *      delete_update    { id }                rename        { projectId, name }
 *      edit_milestone { id, title, detail?, dueDate? }   move_milestone { id, direction: "up"|"down" }
 *      reorder_milestones { projectId, ids: [every step id, in the new order] }
 *      schedule_milestones { projectId, start, end? }  (target dates for the steps not done yet, sized by
 *                                             their default lengths; no end = the default lengths decide)
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { fetchHostMetrics } from "../../_lib/posthog-metrics.js";
import { emailUpdate } from "../../_lib/notifications.js";
import { sendLoginLink } from "../../_lib/login-links.js";
import {
  addMilestone, addUpdate, deleteMilestone, deleteUpdate, editMilestone, getProjectView, isFutureDate, isValidDate,
  MILESTONE_STATUSES, moveMilestone, renameProject, reorderMilestones, scheduleMilestones, setMilestoneDate, setMilestoneStatus,
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
      const completedOn = str(b.completedOn, 10);
      if (completedOn && (!isValidDate(completedOn) || isFutureDate(completedOn))) {
        return json({ ok: false, error: "Pick a real date that is not in the future." }, 400);
      }
      ok = await setMilestoneStatus(db, str(b.id, 64), b.status, completedOn);
    } else if (action === "set_milestone_date") {
      const d = str(b.date, 10);
      if (d && !isValidDate(d)) return json({ ok: false, error: "Use a real date (YYYY-MM-DD)." }, 400);
      const r = await setMilestoneDate(db, str(b.id, 64), d);
      if (r === "date_required") return json({ ok: false, error: "A completed step needs a completion date." }, 400);
      if (r === "future") return json({ ok: false, error: "A completion date can't be in the future." }, 400);
      ok = r === true;
    } else if (action === "add_milestone") {
      const title = str(b.title, 120);
      const dueDate = str(b.dueDate, 10);
      if (!title) return json({ ok: false, error: "Title is required." }, 400);
      if (dueDate && !DATE.test(dueDate)) return json({ ok: false, error: "Use YYYY-MM-DD for the date." }, 400);
      id = await addMilestone(db, str(b.projectId, 64), { title, detail: str(b.detail, 400), dueDate });
      ok = true;
    } else if (action === "edit_milestone") {
      const title = str(b.title, 120);
      const dueDate = str(b.dueDate, 10);
      if (!title) return json({ ok: false, error: "Title is required." }, 400);
      if (dueDate && !DATE.test(dueDate)) return json({ ok: false, error: "Use YYYY-MM-DD for the date." }, 400);
      ok = await editMilestone(db, str(b.id, 64), { title, detail: str(b.detail, 400), dueDate });
    } else if (action === "move_milestone") {
      if (b.direction !== "up" && b.direction !== "down") return json({ ok: false, error: "direction must be up or down." }, 400);
      ok = await moveMilestone(db, str(b.id, 64), b.direction);
    } else if (action === "reorder_milestones") {
      const ids = Array.isArray(b.ids) ? b.ids.slice(0, 100).map((x) => str(x, 64)) : [];
      if (!ids.length) return json({ ok: false, error: "ids is required." }, 400);
      ok = await reorderMilestones(db, str(b.projectId, 64), ids);
      if (!ok) return json({ ok: false, error: "The steps changed since this page loaded. Refresh and try again." }, 409);
    } else if (action === "send_login_link") {
      const user = await db
        .prepare("SELECT u.* FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?")
        .bind(str(b.projectId, 64))
        .first();
      if (!user) return json({ ok: false, error: "Project not found." }, 404);
      const { url, sent } = await sendLoginLink(context.env, db, user);
      return json({ ok: true, url, emailed: sent, email: user.email, hasPassword: !!user.password_hash });
    } else if (action === "schedule_milestones") {
      const start = str(b.start, 10), end = str(b.end, 10);
      if (!isValidDate(start) || (end && !isValidDate(end))) return json({ ok: false, error: "Pick a start date (and an optional launch date)." }, 400);
      if (end && end <= start) return json({ ok: false, error: "The end date has to be after the start date." }, 400);
      if (end && Date.parse(end) - Date.parse(start) > 366 * 24 * 60 * 60 * 1000) return json({ ok: false, error: "Keep the schedule within a year." }, 400);
      const projectId = str(b.projectId, 64);
      if (!(await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first())) return json({ ok: false, error: "Project not found." }, 404);
      const r = await scheduleMilestones(db, projectId, start, end);
      return json({ ok: true, ...r });
    } else if (action === "delete_milestone") {
      ok = await deleteMilestone(db, str(b.id, 64));
    } else if (action === "add_update") {
      const body = str(b.body, 2000);
      if (!body) return json({ ok: false, error: "Write the update first." }, 400);
      const projectId = str(b.projectId, 64);
      if (!(await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first())) return json({ ok: false, error: "Project not found." }, 404);
      id = await addUpdate(db, projectId, body);
      let emailStatus = "not_sent";
      if (b.notify !== false) emailStatus = await emailUpdate(context.env, db, id);
      else await db.prepare("UPDATE project_updates SET email_status = 'not_sent' WHERE id = ?").bind(id).run().catch(() => {});
      return json({ ok: true, id, emailStatus });
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
