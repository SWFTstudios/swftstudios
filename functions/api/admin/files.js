/**
 * Owner-only project files (admin session; writes need same-origin).
 *
 * GET    /api/admin/files?project=<id>            list (plus whether Drive is connected)
 * GET    /api/admin/files?project=<id>&id=<id>    download one
 * POST   /api/admin/files                         multipart upload (fields "project", "file")
 * POST   /api/admin/files?sync=1                  retry the Drive mirror for everything not yet synced
 * DELETE /api/admin/files?project=<id>&id=<id>    remove a file (also from R2; the Drive copy stays)
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { driveConfigured, syncPending } from "../../_lib/drive.js";
import { checkUpload, deleteFile, filesReady, listFiles, MAX_FILE_BYTES, saveFile, sendFile } from "../../_lib/files.js";

async function gate(context, write) {
  const g = await requireAdmin(context, { write });
  if (g.response) return g;
  if (!context.env.FILES || !(await filesReady(g.db))) {
    return { response: json({ ok: false, error: "File storage is not set up yet." }, 503) };
  }
  return g;
}

async function projectExists(db, id) {
  return !!id && !!(await db.prepare("SELECT id FROM projects WHERE id = ?").bind(id).first());
}

export async function onRequestGet(context) {
  const g = await gate(context, false);
  if (g.response) return g.response;
  const q = new URL(context.request.url).searchParams;
  const project = str(q.get("project"), 64);
  if (!(await projectExists(g.db, project))) return json({ ok: false, error: "Project not found." }, 404);
  try {
    const id = str(q.get("id"), 64);
    if (id) return await sendFile(context.env, project, id);
    return json({ ok: true, files: await listFiles(g.db, project), drive: driveConfigured(context.env), maxMb: MAX_FILE_BYTES / 1024 / 1024 });
  } catch (err) {
    console.error("admin files get failed", err);
    return json({ ok: false, error: "Could not load files." }, 500);
  }
}

export async function onRequestPost(context) {
  const g = await gate(context, true);
  if (g.response) return g.response;
  try {
    if (new URL(context.request.url).searchParams.get("sync") === "1") {
      return json({ ok: true, drive: driveConfigured(context.env), result: await syncPending(g.db, context.env) });
    }
    const form = await context.request.formData();
    const project = str(form.get("project"), 64);
    if (!(await projectExists(g.db, project))) return json({ ok: false, error: "Project not found." }, 404);
    const file = form.get("file");
    const bad = checkUpload(file);
    if (bad) return json({ ok: false, error: bad }, 400);
    await saveFile(context, { projectId: project, file, by: "admin", email: g.user.email });
    return json({ ok: true, files: await listFiles(g.db, project), drive: driveConfigured(context.env) });
  } catch (err) {
    console.error("admin file upload failed", err);
    return json({ ok: false, error: "Upload failed." }, 500);
  }
}

export async function onRequestDelete(context) {
  const g = await gate(context, true);
  if (g.response) return g.response;
  const q = new URL(context.request.url).searchParams;
  const project = str(q.get("project"), 64);
  const ok = await deleteFile(context.env, project, str(q.get("id"), 64));
  if (!ok) return json({ ok: false, error: "File not found." }, 404);
  return json({ ok: true, files: await listFiles(g.db, project) });
}
