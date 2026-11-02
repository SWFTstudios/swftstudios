/**
 * Admin-only project notes (session + ADMIN_EMAILS).
 *   GET    /api/admin/notes?projectId=<id>   (omit projectId for general notes)
 *   POST   /api/admin/notes   { projectId?, body }
 *   DELETE /api/admin/notes?id=<noteId>
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, randomId, str } from "../../_lib/portal-auth.js";

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const projectId = new URL(context.request.url).searchParams.get("projectId");
  const stmt = projectId
    ? gate.db.prepare("SELECT id, project_id, body, created_at FROM admin_notes WHERE project_id = ? ORDER BY created_at DESC, rowid DESC").bind(projectId)
    : gate.db.prepare("SELECT id, project_id, body, created_at FROM admin_notes WHERE project_id IS NULL ORDER BY created_at DESC, rowid DESC");
  const { results } = await stmt.all();
  return json({ ok: true, notes: results });
}

export async function onRequestPost(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  let body;
  try {
    body = JSON.parse(await context.request.text());
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const text = str(body.body, 5000);
  if (!text) return json({ ok: false, error: "Note is empty." }, 400);
  const projectId = body.projectId ? str(body.projectId, 64) : null;
  if (projectId) {
    const exists = await gate.db.prepare("SELECT 1 AS x FROM projects WHERE id = ?").bind(projectId).first();
    if (!exists) return json({ ok: false, error: "Unknown project." }, 404);
  }
  const id = randomId();
  await gate.db.prepare("INSERT INTO admin_notes (id, project_id, body) VALUES (?, ?, ?)").bind(id, projectId, text).run();
  const note = await gate.db.prepare("SELECT id, project_id, body, created_at FROM admin_notes WHERE id = ?").bind(id).first();
  return json({ ok: true, note }, 201);
}

export async function onRequestDelete(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id is required." }, 400);
  await gate.db.prepare("DELETE FROM admin_notes WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
