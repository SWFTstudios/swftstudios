/**
 * Project progress (migrations/0004_project_progress.sql): milestones and
 * client-visible updates. One view shape is shared by the client dashboard
 * (/api/portal/project) and the owner's preview (/api/admin/project), so
 * "View as client" shows exactly what the client sees. Private admin notes
 * are never part of this view.
 */
import { randomId } from "./portal-auth.js";
import { getStripeTier, offerName } from "./stripe-tiers.js";

export const MILESTONE_STATUSES = ["upcoming", "in_progress", "done"];

function tierName(id) {
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
  const updates = ready
    ? (await db
        .prepare(`SELECT id, body, created_at FROM project_updates WHERE project_id = ? ORDER BY datetime(created_at) DESC LIMIT 20`)
        .bind(projectId)
        .all()).results.map((u) => ({ id: u.id, body: u.body, createdAt: u.created_at }))
    : [];
  return {
    project: {
      id: p.id,
      name: p.name || tierName(p.tier_id),
      tierName: tierName(p.tier_id),
      status: p.status,
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

export async function setMilestoneStatus(db, id, status) {
  if (!MILESTONE_STATUSES.includes(status)) return false;
  const r = await db
    .prepare(
      `UPDATE project_milestones SET status = ?,
         completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
       WHERE id = ?`
    )
    .bind(status, status, id)
    .run();
  return (r?.meta?.changes || 0) > 0;
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
