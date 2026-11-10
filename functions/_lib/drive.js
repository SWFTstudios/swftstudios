/**
 * Google Drive mirror for project files (service account, no user sign-in).
 *
 * Secrets (Cloudflare Pages > Settings > Variables and Secrets):
 *   GOOGLE_SERVICE_ACCOUNT_JSON  the full service account key JSON
 *   DRIVE_ROOT_FOLDER_ID         the shared Drive folder the service account was shared on (Editor)
 * Until both are set, files stay in R2 and show as "waiting for Drive".
 *
 * Layout in Drive:  <root folder> / <project name> / <file>
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive";

export function driveConfigured(env) {
  return !!(env?.GOOGLE_SERVICE_ACCOUNT_JSON && env?.DRIVE_ROOT_FOLDER_ID);
}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (s) => new TextEncoder().encode(s);

async function accessToken(env, fetchImpl = fetch) {
  const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(enc(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3300 })));
  const pem = String(key.private_key).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const ck = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, enc(`${head}.${claim}`));
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Drive auth failed (${res.status})`);
  return data.access_token;
}

async function ensureFolder(db, env, token, projectId, fetchImpl) {
  const p = await db.prepare("SELECT name, drive_folder_id FROM projects WHERE id = ?").bind(projectId).first();
  if (p?.drive_folder_id) return p.drive_folder_id;
  const res = await fetchImpl(`${API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: p?.name || projectId, mimeType: "application/vnd.google-apps.folder", parents: [env.DRIVE_ROOT_FOLDER_ID] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(`Could not create the Drive folder (${res.status})`);
  await db.prepare("UPDATE projects SET drive_folder_id = ? WHERE id = ?").bind(data.id, projectId).run();
  return data.id;
}

/** Mirror one file to Drive. Never throws: records synced / failed / skipped on the row. */
export async function syncFileToDrive(db, env, fileId, fetchImpl = fetch) {
  const f = await db.prepare("SELECT * FROM project_files WHERE id = ?").bind(fileId).first();
  if (!f || f.drive_status === "synced") return f?.drive_status || "missing";
  const mark = (status, extra = {}) =>
    db.prepare("UPDATE project_files SET drive_status = ?, drive_file_id = COALESCE(?, drive_file_id), drive_error = ? WHERE id = ?")
      .bind(status, extra.driveFileId || null, extra.error || null, fileId).run();
  if (!driveConfigured(env)) { await mark("skipped"); return "skipped"; }
  try {
    const obj = await env.FILES.get(f.r2_key);
    if (!obj) throw new Error("File is missing from storage");
    const token = await accessToken(env, fetchImpl);
    const folder = await ensureFolder(db, env, token, f.project_id, fetchImpl);
    const boundary = "swft" + crypto.randomUUID().replace(/-/g, "");
    const meta = JSON.stringify({ name: f.name, parents: [folder] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${f.mime || "application/octet-stream"}\r\n\r\n`,
      await obj.arrayBuffer(),
      `\r\n--${boundary}--`,
    ]);
    const res = await fetchImpl(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) throw new Error(`Drive upload failed (${res.status})`);
    await mark("synced", { driveFileId: data.id });
    return "synced";
  } catch (err) {
    console.error("drive sync failed", err);
    await mark("failed", { error: String(err.message || err).slice(0, 200) });
    return "failed";
  }
}

/** Retry everything not yet mirrored (pending, failed, or skipped from before Drive was connected). */
export async function syncPending(db, env, limit = 10, fetchImpl = fetch) {
  const rows = (await db.prepare("SELECT id FROM project_files WHERE drive_status != 'synced' ORDER BY created_at LIMIT ?").bind(limit).all()).results;
  const out = { synced: 0, failed: 0, skipped: 0 };
  for (const r of rows) {
    const s = await syncFileToDrive(db, env, r.id, fetchImpl);
    if (out[s] != null) out[s]++;
  }
  return out;
}
