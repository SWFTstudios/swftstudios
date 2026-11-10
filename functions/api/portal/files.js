/**
 * Client files for the signed-in client's latest project (stored in R2, mirrored to Drive).
 *
 * GET    /api/portal/files            list
 * GET    /api/portal/files?id=<id>    download one
 * POST   /api/portal/files            multipart upload (field "file")
 * DELETE /api/portal/files?id=<id>    remove a file the client uploaded (not SWFT's)
 */
import { sameOrigin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { getLatestProjectForUser, getSessionUser, requireDb } from "../../_lib/portal-db.js";
import { checkUpload, deleteFile, filesReady, listFiles, MAX_FILE_BYTES, saveFile, sendFile } from "../../_lib/files.js";

async function gate(context, write) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db || !env.FILES) return { response: json({ ok: false, error: "File storage is not set up yet." }, 503) };
  if (write && !sameOrigin(request)) return { response: json({ ok: false, error: "Bad origin." }, 403) };
  const user = await getSessionUser(db, request);
  if (!user) return { response: json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401) };
  if (!(await filesReady(db))) return { response: json({ ok: false, error: "File storage is not set up yet." }, 503) };
  const project = await getLatestProjectForUser(db, user.id);
  if (!project) return { response: json({ ok: false, error: "No project yet." }, 404) };
  return { user, project };
}

export async function onRequestGet(context) {
  const g = await gate(context, false);
  if (g.response) return g.response;
  try {
    const id = str(new URL(context.request.url).searchParams.get("id"), 64);
    if (id) return await sendFile(context.env, g.project.id, id);
    return json({ ok: true, files: await listFiles(context.env.DB, g.project.id), maxMb: MAX_FILE_BYTES / 1024 / 1024 });
  } catch (err) {
    console.error("portal files get failed", err);
    return json({ ok: false, error: "Could not load files." }, 500);
  }
}

export async function onRequestPost(context) {
  const g = await gate(context, true);
  if (g.response) return g.response;
  try {
    const form = await context.request.formData();
    const file = form.get("file");
    const bad = checkUpload(file);
    if (bad) return json({ ok: false, error: bad }, 400);
    await saveFile(context, { projectId: g.project.id, file, by: "client", email: g.user.email });
    return json({ ok: true, files: await listFiles(context.env.DB, g.project.id) });
  } catch (err) {
    console.error("portal file upload failed", err);
    return json({ ok: false, error: "Upload failed. Please try again." }, 500);
  }
}

export async function onRequestDelete(context) {
  const g = await gate(context, true);
  if (g.response) return g.response;
  const id = str(new URL(context.request.url).searchParams.get("id"), 64);
  const row = await context.env.DB.prepare("SELECT uploaded_by FROM project_files WHERE id = ? AND project_id = ?").bind(id, g.project.id).first();
  if (!row) return json({ ok: false, error: "File not found." }, 404);
  if (row.uploaded_by !== "client") return json({ ok: false, error: "Only files you uploaded can be removed." }, 403);
  await deleteFile(context.env, g.project.id, id);
  return json({ ok: true, files: await listFiles(context.env.DB, g.project.id) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
