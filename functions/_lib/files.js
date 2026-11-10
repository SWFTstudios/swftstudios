/**
 * Shared project files (R2 + D1 index). Used by the client portal and the admin dashboard.
 * Access rules live in the endpoints; everything here is project-scoped.
 */
import { randomId } from "./portal-auth.js";
import { driveConfigured, syncFileToDrive } from "./drive.js";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const BLOCKED_EXT = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|app|dmg|apk|sh|dll|html?|svg)$/i;

/** Safe display name: no paths, no control chars, bounded length. */
export function cleanName(name) {
  const base = String(name || "file").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  const out = base.slice(-120).replace(/^\.+/, "");
  return out || "file";
}

export function checkUpload(file) {
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return "Choose a file to upload.";
  if (!file.size) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return `Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  if (BLOCKED_EXT.test(cleanName(file.name))) return "That file type can't be uploaded. Zip it first if you need to send it.";
  return null;
}

export async function filesReady(db) {
  try { await db.prepare("SELECT 1 FROM project_files LIMIT 1").first(); return true; } catch { return false; }
}

export async function listFiles(db, projectId) {
  const rows = (await db.prepare(
    `SELECT id, name, size, mime, uploaded_by, drive_status, created_at FROM project_files WHERE project_id = ? ORDER BY datetime(created_at) DESC, id`
  ).bind(projectId).all()).results;
  return rows.map((r) => ({ id: r.id, name: r.name, size: r.size, mime: r.mime || "", by: r.uploaded_by, drive: r.drive_status, createdAt: r.created_at }));
}

/** Store the file in R2, index it in D1, then try the Drive mirror in the background. */
export async function saveFile(context, { projectId, file, by, email }) {
  const { env } = context;
  const id = randomId(12);
  const key = `projects/${projectId}/${id}`;
  const name = cleanName(file.name);
  const mime = String(file.type || "application/octet-stream").slice(0, 100);
  await env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime }, customMetadata: { name } });
  await env.DB.prepare(
    `INSERT INTO project_files (id, project_id, name, size, mime, r2_key, uploaded_by, uploader_email, drive_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, name, file.size, mime, key, by, email || null, driveConfigured(env) ? "pending" : "skipped").run();
  const work = syncFileToDrive(env.DB, env, id);
  if (typeof context.waitUntil === "function") context.waitUntil(work);
  else await work;
  return id;
}

/** Stream a file back as a download. Caller has already checked the project access. */
export async function sendFile(env, projectId, fileId) {
  const f = await env.DB.prepare("SELECT * FROM project_files WHERE id = ? AND project_id = ?").bind(fileId, projectId).first();
  if (!f) return new Response("Not found", { status: 404 });
  const obj = await env.FILES.get(f.r2_key);
  if (!obj) return new Response("Not found", { status: 404 });
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function deleteFile(env, projectId, fileId) {
  const f = await env.DB.prepare("SELECT r2_key FROM project_files WHERE id = ? AND project_id = ?").bind(fileId, projectId).first();
  if (!f) return false;
  await env.FILES.delete(f.r2_key);
  await env.DB.prepare("DELETE FROM project_files WHERE id = ?").bind(fileId).run();
  return true;
}
