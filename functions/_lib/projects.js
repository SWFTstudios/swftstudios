/**
 * Project progress (migrations/0004_project_progress.sql): milestones and
 * client-visible updates. One view shape is shared by the client dashboard
 * (/api/portal/project) and the owner's preview (/api/admin/project), so
 * "View as client" shows exactly what the client sees. Private admin notes
 * are never part of this view.
 */
import { randomId } from "./portal-auth.js";
import { getStripeTier, offerName } from "./stripe-tiers.js";
import { DEFAULT_STEPS } from "./default-steps.js";

export const MILESTONE_STATUSES = ["upcoming", "in_progress", "done"];

function tierName(id) {
  if (id === "custom" || id === "unknown") return "Custom project";
  return getStripeTier(id)?.name || offerName(id) || id;
}

/** True when the 0004 tables exist (so callers can degrade before migrating). */
async function hasProgressTables(db) {
  try {
    await db.prepare("SELECT 1 FROM project_milestones LIMIT 1").all();
    return true;
  } catch {
    return false;
  }
}

export function progressOf(milestones) {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "done").length;
  const current = milestones.find((m) => m.status === "in_progress") || milestones.find((m) => m.status === "upcoming") || null;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, current: current ? current.title : null };
}

/** The client-safe view of one project, or null if it doesn't exist. */
export async function getProjectView(db, projectId) {
  const p = await db
    .prepare(
      `SELECT p.*, u.email FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .bind(projectId)
    .first();
  if (!p) return null;
  const ready = await hasProgressTables(db);
  const milestones = ready
    ? (await db
        .prepare(
          `SELECT id, title, detail, status, due_date, completed_at FROM project_milestones
           WHERE project_id = ? ORDER BY sort_order, created_at`
        )
        .bind(projectId)
        .all()).results.map((m) => ({ id: m.id, title: m.title, detail: m.detail || "", status: m.status, dueDate: m.due_date || null, completedAt: m.completed_at || null }))
    : [];
  let updates = [];
  if (ready) {
    const q = (cols) => db.prepare(`SELECT ${cols} FROM project_updates WHERE project_id = ? ORDER BY datetime(created_at) DESC, id LIMIT 20`).bind(projectId).all();
    // email_status arrives with migration 0009; fall back without it.
    const rows = (await q("id, body, created_at, email_status").catch(() => q("id, body, created_at"))).results;
    updates = rows.map((u) => ({ id: u.id, body: u.body, createdAt: u.created_at, emailStatus: u.email_status || null }));
  }
  return {
    project: {
      id: p.id,
      name: p.name || tierName(p.tier_id),
      tierName: tierName(p.tier_id),
      status: p.status,
      // "subscription" only when Stripe gave us a subscription; everything else is a one-time payment.
      billing: p.stripe_subscription_id ? "subscription" : "one_time",
      siteHost: p.site_host || null,
      createdAt: p.created_at,
      isDemo: !!p.is_demo,
    },
    client: { email: p.email },
    milestones,
    updates,
    progress: progressOf(milestones),
    progressReady: ready,
  };
}

/* ---------- owner-only writes ---------- */

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-31 and the like). */
export function isValidDate(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** A completion date can't be in the future (one day of slack for time zones ahead of UTC). */
export function isFutureDate(d, now = new Date()) {
  return d > new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A picked calendar day is stored as noon UTC, so it shows as the same day in
 * every US and European time zone (midnight would slip to the day before).
 */
const completedAtFromDate = (d) => `${d} 12:00:00`;

/** completedOn (YYYY-MM-DD, optional): when the step was finished. Defaults to now. */
export async function setMilestoneStatus(db, id, status, completedOn) {
  if (!MILESTONE_STATUSES.includes(status)) return false;
  const doneAt = status === "done" && completedOn ? completedAtFromDate(completedOn) : null;
  const r = await db
    .prepare(
      `UPDATE project_milestones SET status = ?,
         completed_at = CASE WHEN ? = 'done' THEN COALESCE(?, completed_at, datetime('now')) ELSE NULL END
       WHERE id = ?`
    )
    .bind(status, status, doneAt, id)
    .run();
  return (r?.meta?.changes || 0) > 0;
}

/**
 * Change a step's calendar date. A done step's date is when it was completed
 * (required, not in the future); any other step's date is its target (empty clears it).
 * Returns true, false (no such step), "date_required" or "future".
 */
export async function setMilestoneDate(db, id, date) {
  const m = await db.prepare("SELECT id, status FROM project_milestones WHERE id = ?").bind(id).first();
  if (!m) return false;
  if (m.status === "done") {
    if (!date) return "date_required";
    if (isFutureDate(date)) return "future";
    await db.prepare("UPDATE project_milestones SET completed_at = ? WHERE id = ?").bind(completedAtFromDate(date), id).run();
  } else {
    await db.prepare("UPDATE project_milestones SET due_date = ? WHERE id = ?").bind(date || null, id).run();
  }
  return true;
}

export async function addMilestone(db, projectId, { title, detail, dueDate }) {
  const next = await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM project_milestones WHERE project_id = ?")
    .bind(projectId)
    .first();
  const id = randomId(12);
  await db
    .prepare(
      `INSERT INTO project_milestones (id, project_id, title, detail, due_date, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, projectId, title, detail || null, dueDate || null, next?.n || 1)
    .run();
  return id;
}

/**
 * Give a new project the default steps (functions/_lib/default-steps.js).
 * Does nothing if the project already has steps, so it is safe to call twice,
 * and never throws: before migration 0004 there is no steps table, and a
 * missing checklist must not fail a paid client's account creation.
 */
export async function seedDefaultSteps(db, projectId) {
  try {
    const have = await db
      .prepare("SELECT COUNT(*) AS n FROM project_milestones WHERE project_id = ?")
      .bind(projectId)
      .first();
    if (have?.n > 0) return 0;
    let order = 1;
    for (const step of DEFAULT_STEPS) {
      await db
        .prepare(
          `INSERT INTO project_milestones (id, project_id, title, detail, status, sort_order, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END)`
        )
        .bind(randomId(12), projectId, step.title, step.detail || null, step.status, order++, step.status)
        .run();
    }
    return DEFAULT_STEPS.length;
  } catch (err) {
    console.error("seedDefaultSteps failed", err);
    return 0;
  }
}

export async function editMilestone(db, id, { title, detail, dueDate }) {
  const r = await db
    .prepare("UPDATE project_milestones SET title = ?, detail = ?, due_date = ? WHERE id = ?")
    .bind(title, detail || null, dueDate || null, id)
    .run();
  return (r?.meta?.changes || 0) > 0;
}

/** Swap a step with its neighbour. direction: "up" (earlier) or "down" (later). */
export async function moveMilestone(db, id, direction) {
  const cur = await db.prepare("SELECT id, project_id, sort_order FROM project_milestones WHERE id = ?").bind(id).first();
  if (!cur) return false;
  const neighbour = await db
    .prepare(
      direction === "up"
        ? `SELECT id, sort_order FROM project_milestones WHERE project_id = ? AND (sort_order < ? OR (sort_order = ? AND id < ?)) ORDER BY sort_order DESC, id DESC LIMIT 1`
        : `SELECT id, sort_order FROM project_milestones WHERE project_id = ? AND (sort_order > ? OR (sort_order = ? AND id > ?)) ORDER BY sort_order ASC, id ASC LIMIT 1`
    )
    .bind(cur.project_id, cur.sort_order, cur.sort_order, cur.id)
    .first();
  if (!neighbour) return true; // already first/last: nothing to do
  // Equal sort_order can't be swapped meaningfully; give the neighbour a distinct slot.
  const a = cur.sort_order;
  const b = neighbour.sort_order === a ? (direction === "up" ? a - 1 : a + 1) : neighbour.sort_order;
  await db.prepare("UPDATE project_milestones SET sort_order = ? WHERE id = ?").bind(b, cur.id).run();
  await db.prepare("UPDATE project_milestones SET sort_order = ? WHERE id = ?").bind(a, neighbour.id).run();
  return true;
}

/**
 * Set the order of a project's steps from a list of step ids (drag and drop).
 * The list must contain exactly the project's current steps, so a stale page
 * (a step added or removed elsewhere) is rejected instead of half-applied.
 * Returns true, or false when the ids don't match the project.
 */
export async function reorderMilestones(db, projectId, ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return false;
  const have = (await db.prepare("SELECT id FROM project_milestones WHERE project_id = ?").bind(projectId).all()).results.map((r) => r.id);
  if (have.length !== ids.length || !ids.every((id) => have.includes(id))) return false;
  for (let i = 0; i < ids.length; i++) {
    await db.prepare("UPDATE project_milestones SET sort_order = ? WHERE id = ? AND project_id = ?").bind(i + 1, ids[i], projectId).run();
  }
  return true;
}

export async function deleteMilestone(db, id) {
  const r = await db.prepare("DELETE FROM project_milestones WHERE id = ?").bind(id).run();
  return (r?.meta?.changes || 0) > 0;
}

export async function addUpdate(db, projectId, body) {
  const id = randomId(12);
  await db.prepare("INSERT INTO project_updates (id, project_id, body) VALUES (?, ?, ?)").bind(id, projectId, body).run();
  return id;
}

export async function deleteUpdate(db, id) {
  const r = await db.prepare("DELETE FROM project_updates WHERE id = ?").bind(id).run();
  return (r?.meta?.changes || 0) > 0;
}

export async function renameProject(db, projectId, name) {
  const r = await db.prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(name || null, projectId).run();
  return (r?.meta?.changes || 0) > 0;
}
