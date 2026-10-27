/**
 * Client workspace API (Pages Functions, D1 `DB`, R2 `FILES`).
 *
 * Mounted by functions/api/portal/[[path]].js and functions/api/admin/[[path]].js
 * (and the Worker in src/worker.ts). Everything needs a session; /api/admin/*
 * needs an admin. A client only ever sees their own projects; an admin sees all.
 *
 * Files upload in parts straight through this API into R2 (no storage keys in
 * the browser): start → PUT each part → complete.
 */
import { isValidEmail, json, passwordOk, randomId, sessionCookieHeader, sha256Hex, str } from "./portal-auth.js";
import {
  createInviteToken,
  createSession,
  findUserByEmail,
  findUserById,
  getSessionUser,
  requireDb,
  setUserPassword,
} from "./portal-db.js";
import { emailClient, escapeHtml, notifyAdmin, portalOrigin } from "./portal-notify.js";
import { fetchHostMetrics } from "./posthog-metrics.js";

export const STAGES = ["intake", "planning", "production", "review", "delivered"];
export const STAGE_LABELS = {
  intake: "Intake",
  planning: "Planning",
  production: "In production",
  review: "In review",
  delivered: "Delivered",
};
export const PROJECT_TYPES = ["website", "video", "photo", "content", "app", "other"];
const MESSAGE_KINDS = ["note", "request", "revision", "approval", "update"];
const ASSET_CATEGORIES = ["video", "image", "audio", "document", "brand", "other"];

export const PART_SIZE = 10 * 1024 * 1024; // browser sends 10 MB parts
const MAX_PART = 25 * 1024 * 1024;
const MAX_FILE = 5 * 1024 * 1024 * 1024; // 5 GB per file
const RESET_HOURS = 2;

/* ---------- helpers ---------- */

export function adminEmails(env) {
  return String(env.ADMIN_EMAILS || "hello@swftstudios.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user, env) {
  if (!user) return false;
  return user.role === "admin" || adminEmails(env).includes(String(user.email).toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(request, max = 200_000) {
  const raw = await request.text();
  if (raw.length > max) throw Object.assign(new Error("Payload too large"), { status: 413 });
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

// Mutating requests must come from this site (cookies are SameSite=Lax, and
// this blocks cross-site form or fetch posts that carry the session).
function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function categoryFor(name, type) {
  const t = String(type || "").toLowerCase();
  const ext = String(name || "").toLowerCase().split(".").pop();
  if (t.startsWith("video/") || ["mp4", "mov", "m4v", "webm", "avi", "mkv", "mxf", "braw", "r3d"].includes(ext)) return "video";
  if (t.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "tif", "tiff", "raw", "cr2", "cr3", "nef", "arw", "dng"].includes(ext)) return "image";
  if (t.startsWith("audio/") || ["mp3", "wav", "aac", "m4a", "flac", "aif", "aiff"].includes(ext)) return "audio";
  if (["ai", "eps", "svg", "psd", "fig", "sketch", "xd", "indd", "otf", "ttf", "woff", "woff2"].includes(ext)) return "brand";
  if (t.startsWith("text/") || t.includes("pdf") || t.includes("word") || t.includes("sheet") || t.includes("presentation") ||
      ["pdf", "doc", "docx", "txt", "rtf", "md", "csv", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers"].includes(ext)) return "document";
  return "other";
}

function safeFileName(name) {
  const clean = String(name || "file")
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 140);
  return clean || "file";
}

function normUrl(raw) {
  const s = str(raw, 2000);
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

function normDate(raw) {
  const s = str(raw, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name || "", company: u.company || "", role: u.role || "client" };
}

function publicProject(p, extra = {}) {
  return {
    id: p.id,
    title: p.title || defaultTitle(p),
    type: p.type || "website",
    stage: p.stage || "intake",
    stageLabel: STAGE_LABELS[p.stage] || "Intake",
    dueDate: p.due_date || null,
    description: p.description || "",
    tierId: p.tier_id,
    status: p.status,
    siteHost: p.site_host || null,
    archived: !!p.archived,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    ...extra,
  };
}

function defaultTitle(p) {
  return p.tier_id && p.tier_id !== "custom" ? `Project: ${p.tier_id.replace(/-/g, " ")}` : "New project";
}

function publicAsset(a, uploader) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    category: a.category,
    note: a.note || "",
    url: a.kind === "link" ? a.url : `/api/portal/files/${a.id}`,
    size: a.size || null,
    contentType: a.content_type || null,
    status: a.status,
    createdAt: a.created_at,
    uploadedBy: uploader ? { id: uploader.id, name: uploader.name || uploader.email, role: uploader.role } : null,
  };
}

async function logActivity(db, projectId, actorId, action, detail = "") {
  await db
    .prepare("INSERT INTO activity (project_id, actor_id, action, detail) VALUES (?, ?, ?, ?)")
    .bind(projectId, actorId, action, str(detail, 300))
    .run();
  await db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").bind(projectId).run();
}

async function getProject(db, id) {
  return db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
}

/** Project the user may open, or null. */
async function accessibleProject(db, user, env, projectId) {
  const p = await getProject(db, str(projectId, 64));
  if (!p) return null;
  if (isAdmin(user, env) || p.user_id === user.id) return p;
  return null;
}

function background(ctx, promise) {
  const p = Promise.resolve(promise).catch((err) => console.error("portal background task failed", err));
  if (ctx.waitUntil) ctx.waitUntil(p);
  return p;
}

function displayName(u) {
  return u.name || u.company || u.email;
}

/* ---------- route table ---------- */

const ROUTES = [
  // auth (no session needed)
  ["POST", /^\/api\/portal\/forgot$/, forgotPassword, { auth: false }],
  ["POST", /^\/api\/portal\/reset$/, resetPassword, { auth: false }],
  // client + admin
  ["GET", /^\/api\/portal\/session$/, sessionInfo],
  ["GET", /^\/api\/portal\/projects$/, listProjects],
  ["GET", /^\/api\/portal\/projects\/([\w-]+)$/, projectDetail],
  ["GET", /^\/api\/portal\/projects\/([\w-]+)\/metrics$/, projectMetrics],
  ["POST", /^\/api\/portal\/projects\/([\w-]+)\/messages$/, postMessage],
  ["PATCH", /^\/api\/portal\/messages\/([\w-]+)$/, updateMessage],
  ["POST", /^\/api\/portal\/projects\/([\w-]+)\/links$/, addLink],
  ["POST", /^\/api\/portal\/projects\/([\w-]+)\/uploads$/, startUpload],
  ["PUT", /^\/api\/portal\/uploads\/([\w-]+)\/parts\/(\d+)$/, uploadPart],
  ["POST", /^\/api\/portal\/uploads\/([\w-]+)\/complete$/, completeUpload],
  ["DELETE", /^\/api\/portal\/uploads\/([\w-]+)$/, abortUpload],
  ["GET", /^\/api\/portal\/files\/([\w-]+)$/, getFile],
  ["HEAD", /^\/api\/portal\/files\/([\w-]+)$/, getFile],
  ["DELETE", /^\/api\/portal\/assets\/([\w-]+)$/, deleteAsset],
  ["PATCH", /^\/api\/portal\/tasks\/([\w-]+)$/, updateTask],
  ["POST", /^\/api\/portal\/account$/, updateAccount],
  // admin only
  ["GET", /^\/api\/admin\/clients$/, listClients, { admin: true }],
  ["POST", /^\/api\/admin\/clients$/, createClient, { admin: true }],
  ["PATCH", /^\/api\/admin\/clients\/([\w-]+)$/, updateClient, { admin: true }],
  ["POST", /^\/api\/admin\/clients\/([\w-]+)\/invite$/, resendInvite, { admin: true }],
  ["POST", /^\/api\/admin\/workspace\/projects$/, createProject, { admin: true }],
  ["PATCH", /^\/api\/admin\/projects\/([\w-]+)$/, updateProject, { admin: true }],
  ["DELETE", /^\/api\/admin\/projects\/([\w-]+)$/, deleteProject, { admin: true }],
  ["POST", /^\/api\/admin\/projects\/([\w-]+)\/tasks$/, createTask, { admin: true }],
  ["DELETE", /^\/api\/admin\/tasks\/([\w-]+)$/, deleteTask, { admin: true }],
];

/**
 * Handle a workspace API request. Returns a Response, or null when the path
 * isn't one of these routes (so older handlers can take it).
 */
export async function handleWorkspaceApi(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let route = null;
  let params = [];
  let pathMatched = false;
  for (const r of ROUTES) {
    const m = url.pathname.match(r[1]);
    if (!m) continue;
    pathMatched = true;
    if (r[0] === method) {
      route = r;
      params = m.slice(1);
      break;
    }
  }
  if (!route) return pathMatched ? json({ ok: false, error: "Method not allowed" }, 405) : null;

  const db = requireDb(env);
  if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
  if (method !== "GET" && method !== "HEAD" && !sameOrigin(request)) {
    return json({ ok: false, error: "Cross-site request blocked." }, 403);
  }

  const opts = route[3] || {};
  let user = null;
  if (opts.auth !== false) {
    user = await getSessionUser(db, request);
    if (!user) return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    if (opts.admin && !isAdmin(user, env)) return json({ ok: false, error: "Admins only." }, 403);
  }

  try {
    return await route[2]({ ...context, db, user, url, params, admin: isAdmin(user, env) });
  } catch (err) {
    if (err && err.status) return json({ ok: false, error: err.message }, err.status);
    console.error("workspace api failed", url.pathname, err);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
}

/* ---------- auth: forgot + reset ---------- */

async function forgotPassword(ctx) {
  const { db, env, request } = ctx;
  const body = await readJson(request, 5_000);
  const email = str(body.email, 320).toLowerCase();
  // Same answer whether or not the account exists, so emails can't be probed.
  const done = json({ ok: true, message: "If that email has an account, a reset link is on its way." });
  if (!isValidEmail(email)) return done;

  let user = await findUserByEmail(db, email);
  // First sign-in for an admin address: create the account, then the email
  // link proves the person owns the inbox.
  if (!user && adminEmails(env).includes(email)) {
    const id = randomId(16);
    await db.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, 'admin')").bind(id, email).run();
    user = await findUserById(db, id);
  }
  if (!user) return done;

  const raw = randomId(24);
  const expires = new Date(Date.now() + RESET_HOURS * 3600 * 1000).toISOString();
  await db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();
  await db
    .prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(raw), user.id, expires)
    .run();

  const link = `${portalOrigin(env)}/portal/reset.html?token=${encodeURIComponent(raw)}`;
  background(
    ctx,
    emailClient(env, {
      to: user.email,
      subject: "Reset your SWFT portal password",
      heading: user.password_hash ? "Reset your password" : "Set your password",
      bodyHtml: `<p>Use the button below to ${user.password_hash ? "choose a new" : "set your"} password for the SWFT client portal. The link works for ${RESET_HOURS} hours.</p><p>If you didn't ask for this, you can ignore this email.</p>`,
      ctaUrl: link,
      ctaLabel: "Choose a password",
      idempotencyKey: `portal-reset/${user.id}/${raw.slice(0, 12)}`,
    })
  );
  return done;
}

async function resetPassword(ctx) {
  const { db, request } = ctx;
  const body = await readJson(request, 5_000);
  const token = str(body.token, 128);
  const password = String(body.password ?? "");
  if (!passwordOk(password)) return json({ ok: false, error: "Password must be at least 10 characters." }, 400);
  if (!token) return json({ ok: false, error: "This link is missing its token. Request a new one." }, 400);

  const hash = await sha256Hex(token);
  const row = await db.prepare("SELECT * FROM password_resets WHERE token_hash = ?").bind(hash).first();
  await db.prepare("DELETE FROM password_resets WHERE token_hash = ?").bind(hash).run();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "This link has expired. Request a new one.", code: "expired" }, 400);
  }

  await setUserPassword(db, row.user_id, password);
  // Sign out every other session for this account
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id).run();
  const sessionId = await createSession(db, row.user_id);
  const user = await findUserById(db, row.user_id);
  return json(
    { ok: true, redirect: isAdmin(user, ctx.env) ? "/portal/admin.html" : "/portal/dashboard.html" },
    200,
    { "Set-Cookie": sessionCookieHeader(sessionId) }
  );
}

/* ---------- session + account ---------- */

async function sessionInfo({ user, admin }) {
  return json({ ok: true, user: { ...publicUser(user), admin }, stages: STAGES.map((s) => ({ id: s, label: STAGE_LABELS[s] })), types: PROJECT_TYPES, partSize: PART_SIZE });
}

async function updateAccount({ db, user, request }) {
  const body = await readJson(request, 5_000);
  const name = str(body.name, 120);
  const company = str(body.company, 160);
  await db.prepare("UPDATE users SET name = ?, company = ? WHERE id = ?").bind(name || null, company || null, user.id).run();
  return json({ ok: true, user: publicUser(await findUserById(db, user.id)) });
}

/* ---------- projects ---------- */

async function listProjects({ db, user, admin, url }) {
  const includeArchived = url.searchParams.get("archived") === "1";
  const where = [];
  const binds = [user.id];
  if (!admin) {
    where.push("p.user_id = ?");
    binds.push(user.id);
  }
  if (!includeArchived) where.push("p.archived = 0");
  const sql = `
    SELECT p.*, u.email AS client_email, u.name AS client_name, u.company AS client_company,
      (SELECT count(*) FROM assets a WHERE a.project_id = p.id AND a.status = 'ready') AS file_count,
      (SELECT count(*) FROM messages m WHERE m.project_id = p.id AND m.kind IN ('request','revision') AND m.status = 'open') AS open_requests,
      (SELECT count(*) FROM tasks t WHERE t.project_id = p.id ${admin ? "" : "AND t.client_visible = 1"}) AS task_count,
      (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.done = 1 ${admin ? "" : "AND t.client_visible = 1"}) AS tasks_done,
      (SELECT count(*) FROM activity act WHERE act.project_id = p.id AND (act.actor_id IS NULL OR act.actor_id != ?1)
         AND act.created_at > COALESCE((SELECT last_seen_at FROM project_reads r WHERE r.user_id = ?1 AND r.project_id = p.id), '')) AS unseen
    FROM projects p JOIN users u ON u.id = p.user_id
    ${where.length ? "WHERE " + where.map((w, i) => w.replace("?", `?${i + 2}`)).join(" AND ") : ""}
    ORDER BY p.archived ASC, datetime(p.updated_at) DESC`;
  const { results } = await db.prepare(sql).bind(...binds).all();
  return json({
    ok: true,
    projects: results.map((p) =>
      publicProject(p, {
        client: { email: p.client_email, name: p.client_name || "", company: p.client_company || "" },
        fileCount: p.file_count,
        openRequests: p.open_requests,
        taskCount: p.task_count,
        tasksDone: p.tasks_done,
        unseen: p.unseen,
      })
    ),
  });
}

async function projectDetail({ db, user, env, admin, params }) {
  const p = await accessibleProject(db, user, env, params[0]);
  if (!p) return json({ ok: false, error: "Project not found." }, 404);

  const [client, assets, messages, tasks, activity] = await Promise.all([
    findUserById(db, p.user_id),
    db.prepare("SELECT * FROM assets WHERE project_id = ? AND status = 'ready' ORDER BY datetime(created_at) DESC").bind(p.id).all(),
    db.prepare("SELECT * FROM messages WHERE project_id = ? ORDER BY datetime(created_at) ASC").bind(p.id).all(),
    db.prepare(`SELECT * FROM tasks WHERE project_id = ? ${admin ? "" : "AND client_visible = 1"} ORDER BY sort ASC, datetime(created_at) ASC`).bind(p.id).all(),
    db.prepare("SELECT * FROM activity WHERE project_id = ? ORDER BY id DESC LIMIT 60").bind(p.id).all(),
  ]);

  // Names for everyone who appears on the page
  const ids = new Set([p.user_id]);
  assets.results.forEach((a) => ids.add(a.uploaded_by));
  messages.results.forEach((m) => ids.add(m.author_id));
  activity.results.forEach((a) => a.actor_id && ids.add(a.actor_id));
  const people = {};
  if (ids.size) {
    const list = [...ids];
    const { results } = await db
      .prepare(`SELECT id, email, name, company, role FROM users WHERE id IN (${list.map(() => "?").join(",")})`)
      .bind(...list)
      .all();
    results.forEach((u) => (people[u.id] = u));
  }
  const who = (id) => {
    const u = people[id];
    if (!u) return { id, name: "Someone", role: "client" };
    return { id: u.id, name: u.name || u.email, role: isAdmin(u, env) ? "admin" : "client" };
  };

  await db
    .prepare(
      `INSERT INTO project_reads (user_id, project_id, last_seen_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, project_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    )
    .bind(user.id, p.id, nowIso().replace("T", " ").slice(0, 19))
    .run();

  return json({
    ok: true,
    project: publicProject(p, { client: publicUser(client) }),
    assets: assets.results.map((a) => publicAsset(a, people[a.uploaded_by])),
    messages: messages.results.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      status: m.status,
      createdAt: m.created_at,
      resolvedAt: m.resolved_at,
      author: who(m.author_id),
      mine: m.author_id === user.id,
    })),
    tasks: tasks.results.map((t) => ({
      id: t.id,
      title: t.title,
      done: !!t.done,
      dueDate: t.due_date,
      clientVisible: !!t.client_visible,
      completedAt: t.completed_at,
    })),
    activity: activity.results.map((a) => ({ id: a.id, action: a.action, detail: a.detail, createdAt: a.created_at, actor: a.actor_id ? who(a.actor_id) : null })),
  });
}

/** Last-30-day site traffic for a project's live site (PostHog). */
async function projectMetrics({ db, user, env, params }) {
  const p = await accessibleProject(db, user, env, params[0]);
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  return json({ ok: true, metrics: await fetchHostMetrics(env, p.site_host) });
}

/* ---------- notes & requests ---------- */

async function postMessage(ctx) {
  const { db, user, env, admin, params, request } = ctx;
  const p = await accessibleProject(db, user, env, params[0]);
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  const body = await readJson(request, 40_000);
  const text = str(body.body, 8000);
  let kind = MESSAGE_KINDS.includes(body.kind) ? body.kind : "note";
  if (kind === "update" && !admin) kind = "note"; // updates are SWFT's posts
  if (!text) return json({ ok: false, error: "Write something first." }, 400);

  const id = randomId(12);
  await db.prepare("INSERT INTO messages (id, project_id, author_id, kind, body) VALUES (?, ?, ?, ?, ?)").bind(id, p.id, user.id, kind, text).run();
  await logActivity(db, p.id, user.id, `posted ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}`, text.slice(0, 120));

  const title = p.title || defaultTitle(p);
  if (admin) {
    const client = await findUserById(db, p.user_id);
    if (client && client.id !== user.id) {
      background(
        ctx,
        emailClient(env, {
          to: client.email,
          subject: `New ${kind === "update" ? "update" : "message"} on ${title}`,
          heading: `SWFT posted ${kind === "update" ? "an update" : "a message"}`,
          bodyHtml: `<p><strong>${escapeHtml(title)}</strong></p><blockquote style="border-left:3px solid #ddd;margin:0;padding:4px 12px;color:#333">${escapeHtml(text.slice(0, 1200)).replace(/\n/g, "<br>")}</blockquote>`,
          ctaUrl: `${portalOrigin(env)}/portal/dashboard.html#project=${p.id}`,
          ctaLabel: "Reply in the portal",
        })
      );
    }
  } else {
    background(
      ctx,
      notifyAdmin(env, {
        subject: `${kind === "request" || kind === "revision" ? "New " + kind : "New note"} from ${displayName(user)}: ${title}`,
        heading: `${displayName(user)} posted ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}`,
        bodyHtml: `<p><strong>${escapeHtml(title)}</strong></p><blockquote style="border-left:3px solid #ddd;margin:0;padding:4px 12px;color:#333">${escapeHtml(text.slice(0, 2000)).replace(/\n/g, "<br>")}</blockquote>`,
        text: `${displayName(user)} posted ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} on ${title}:\n\n${text}`,
        projectId: p.id,
      })
    );
  }
  return json({ ok: true, id });
}

async function updateMessage({ db, user, env, admin, params, request }) {
  const m = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(str(params[0], 64)).first();
  if (!m) return json({ ok: false, error: "Not found." }, 404);
  const p = await accessibleProject(db, user, env, m.project_id);
  if (!p || (!admin && m.author_id !== user.id)) return json({ ok: false, error: "Not found." }, 404);
  const body = await readJson(request, 5_000);
  const status = body.status === "done" ? "done" : "open";
  await db
    .prepare("UPDATE messages SET status = ?, resolved_at = ? WHERE id = ?")
    .bind(status, status === "done" ? nowIso() : null, m.id)
    .run();
  await logActivity(db, m.project_id, user.id, status === "done" ? `marked a ${m.kind} done` : `reopened a ${m.kind}`, m.body.slice(0, 80));
  return json({ ok: true });
}

/* ---------- links ---------- */

async function addLink(ctx) {
  const { db, user, env, admin, params, request } = ctx;
  const p = await accessibleProject(db, user, env, params[0]);
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  const body = await readJson(request, 10_000);
  const url = normUrl(body.url);
  if (!url) return json({ ok: false, error: "Enter a valid link (https://…)." }, 400);
  const name = str(body.name, 200) || new URL(url).hostname.replace(/^www\./, "");
  const category = ASSET_CATEGORIES.includes(body.category) ? body.category : "other";
  const id = randomId(12);
  await db
    .prepare("INSERT INTO assets (id, project_id, uploaded_by, kind, name, category, note, url, status) VALUES (?, ?, ?, 'link', ?, ?, ?, ?, 'ready')")
    .bind(id, p.id, user.id, name, category, str(body.note, 1000) || null, url)
    .run();
  await logActivity(db, p.id, user.id, "added a link", name);
  if (!admin) {
    background(
      ctx,
      notifyAdmin(env, {
        subject: `New link from ${displayName(user)}: ${p.title || defaultTitle(p)}`,
        heading: `${displayName(user)} shared a link`,
        bodyHtml: `<p><strong>${escapeHtml(name)}</strong><br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>${body.note ? `<p>${escapeHtml(str(body.note, 1000))}</p>` : ""}`,
        text: `${displayName(user)} shared ${url}`,
        projectId: p.id,
      })
    );
  }
  return json({ ok: true, id });
}

/* ---------- uploads (R2 multipart) ---------- */

function bucket(env) {
  if (!env.FILES) throw Object.assign(new Error("File storage is not configured."), { status: 503 });
  return env.FILES;
}

async function startUpload({ db, user, env, params, request }) {
  const p = await accessibleProject(db, user, env, params[0]);
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  const body = await readJson(request, 10_000);
  const name = str(body.name, 200) || "file";
  const size = Number(body.size) || 0;
  const type = str(body.type, 120) || "application/octet-stream";
  if (size <= 0) return json({ ok: false, error: "That file is empty." }, 400);
  if (size > MAX_FILE) return json({ ok: false, error: "Files can be up to 5 GB. Share a link for bigger ones." }, 413);

  const id = randomId(12);
  const key = `projects/${p.id}/${id}/${safeFileName(name)}`;
  const upload = await bucket(env).createMultipartUpload(key, {
    httpMetadata: { contentType: type },
    customMetadata: { projectId: p.id, uploadedBy: user.id, originalName: name.slice(0, 200) },
  });
  const category = ASSET_CATEGORIES.includes(body.category) ? body.category : categoryFor(name, type);
  await db
    .prepare(
      `INSERT INTO assets (id, project_id, uploaded_by, kind, name, category, note, r2_key, upload_id, size, content_type, status)
       VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, 'uploading')`
    )
    .bind(id, p.id, user.id, name, category, str(body.note, 1000) || null, key, upload.uploadId, size, type)
    .run();
  return json({ ok: true, assetId: id, partSize: PART_SIZE, parts: Math.ceil(size / PART_SIZE) });
}

async function uploadingAsset(db, user, env, admin, assetId) {
  const a = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(str(assetId, 64)).first();
  if (!a || a.kind !== "file" || a.status !== "uploading") return null;
  if (a.uploaded_by !== user.id && !admin) return null;
  if (!(await accessibleProject(db, user, env, a.project_id))) return null;
  return a;
}

async function uploadPart({ db, user, env, admin, params, request }) {
  const a = await uploadingAsset(db, user, env, admin, params[0]);
  if (!a) return json({ ok: false, error: "Upload not found." }, 404);
  const partNumber = Number(params[1]);
  if (!(partNumber >= 1 && partNumber <= 10000)) return json({ ok: false, error: "Bad part number." }, 400);
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_PART) return json({ ok: false, error: "Part too large." }, 413);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_PART) return json({ ok: false, error: "Bad part size." }, 400);
  const upload = bucket(env).resumeMultipartUpload(a.r2_key, a.upload_id);
  const part = await upload.uploadPart(partNumber, data);
  return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}

async function completeUpload(ctx) {
  const { db, user, env, admin, params, request } = ctx;
  const a = await uploadingAsset(db, user, env, admin, params[0]);
  if (!a) return json({ ok: false, error: "Upload not found." }, 404);
  const body = await readJson(request, 1_000_000);
  const parts = (Array.isArray(body.parts) ? body.parts : [])
    .map((p) => ({ partNumber: Number(p.partNumber), etag: str(p.etag, 200) }))
    .filter((p) => p.partNumber >= 1 && p.etag)
    .sort((x, y) => x.partNumber - y.partNumber);
  if (!parts.length) return json({ ok: false, error: "No parts uploaded." }, 400);

  const upload = bucket(env).resumeMultipartUpload(a.r2_key, a.upload_id);
  const obj = await upload.complete(parts);
  await db
    .prepare("UPDATE assets SET status = 'ready', upload_id = NULL, size = ?, created_at = datetime('now') WHERE id = ?")
    .bind(obj.size, a.id)
    .run();
  await logActivity(db, a.project_id, user.id, "uploaded a file", a.name);

  if (!admin) {
    const p = await getProject(db, a.project_id);
    background(
      ctx,
      notifyAdmin(env, {
        subject: `New ${a.category} from ${displayName(user)}: ${a.name}`,
        heading: `${displayName(user)} uploaded a file`,
        bodyHtml: `<p><strong>${escapeHtml(a.name)}</strong> (${escapeHtml(a.category)}, ${Math.max(1, Math.round(obj.size / 1048576))} MB)<br>Project: ${escapeHtml(p ? p.title || defaultTitle(p) : "")}</p>${a.note ? `<p>${escapeHtml(a.note)}</p>` : ""}`,
        text: `${displayName(user)} uploaded ${a.name}`,
        projectId: a.project_id,
      })
    );
  }
  return json({ ok: true, asset: publicAsset({ ...a, status: "ready", size: obj.size }, user) });
}

async function abortUpload({ db, user, env, admin, params }) {
  const a = await uploadingAsset(db, user, env, admin, params[0]);
  if (!a) return json({ ok: true });
  try {
    await bucket(env).resumeMultipartUpload(a.r2_key, a.upload_id).abort();
  } catch (err) {
    console.error("abort upload failed", err);
  }
  await db.prepare("DELETE FROM assets WHERE id = ?").bind(a.id).run();
  return json({ ok: true });
}

/* ---------- download / preview ---------- */

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m) return null;
  let start = m[1] === "" ? null : Number(m[1]);
  let end = m[2] === "" ? null : Number(m[2]);
  if (start === null && end === null) return null;
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) return "invalid";
  return { offset: start, length: end - start + 1 };
}

async function getFile({ db, user, env, params, request, url }) {
  const a = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(str(params[0], 64)).first();
  if (!a || a.kind !== "file" || a.status !== "ready") return json({ ok: false, error: "File not found." }, 404);
  if (!(await accessibleProject(db, user, env, a.project_id))) return json({ ok: false, error: "File not found." }, 404);

  const size = a.size || 0;
  const range = parseRange(request.headers.get("Range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const obj = await bucket(env).get(a.r2_key, range ? { range } : undefined);
  if (!obj) return json({ ok: false, error: "File is missing from storage." }, 404);

  const download = url.searchParams.get("download") === "1";
  const fileName = a.name.replace(/["\\\r\n]/g, "");
  const headers = new Headers({
    "Content-Type": a.content_type || "application/octet-stream",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    // Never run uploaded HTML/SVG as a page on this origin
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(request.method === "HEAD" ? null : obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(request.method === "HEAD" ? null : obj.body, { status: 200, headers });
}

async function deleteAsset({ db, user, env, admin, params }) {
  const a = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(str(params[0], 64)).first();
  if (!a || !(await accessibleProject(db, user, env, a.project_id))) return json({ ok: false, error: "Not found." }, 404);
  if (!admin && a.uploaded_by !== user.id) return json({ ok: false, error: "Only the person who added this can remove it." }, 403);
  if (a.kind === "file" && a.r2_key) {
    try {
      if (a.status === "uploading" && a.upload_id) await bucket(env).resumeMultipartUpload(a.r2_key, a.upload_id).abort();
      else await bucket(env).delete(a.r2_key);
    } catch (err) {
      console.error("r2 delete failed", err);
    }
  }
  await db.prepare("DELETE FROM assets WHERE id = ?").bind(a.id).run();
  await logActivity(db, a.project_id, user.id, a.kind === "link" ? "removed a link" : "removed a file", a.name);
  return json({ ok: true });
}

/* ---------- tasks ---------- */

async function createTask({ db, user, env, params, request }) {
  const p = await accessibleProject(db, user, env, params[0]);
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  const body = await readJson(request, 5_000);
  const title = str(body.title, 300);
  if (!title) return json({ ok: false, error: "Give the task a title." }, 400);
  const max = await db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM tasks WHERE project_id = ?").bind(p.id).first();
  const id = randomId(12);
  await db
    .prepare("INSERT INTO tasks (id, project_id, title, due_date, client_visible, sort) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, p.id, title, normDate(body.dueDate), body.clientVisible === false ? 0 : 1, (max?.m || 0) + 1)
    .run();
  // Hidden tasks are SWFT-only, so they stay out of the client's activity feed.
  if (body.clientVisible !== false) await logActivity(db, p.id, user.id, "added a task", title);
  return json({ ok: true, id });
}

async function updateTask({ db, user, env, admin, params, request }) {
  const t = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(str(params[0], 64)).first();
  if (!t) return json({ ok: false, error: "Not found." }, 404);
  const p = await accessibleProject(db, user, env, t.project_id);
  if (!p || (!admin && !t.client_visible)) return json({ ok: false, error: "Not found." }, 404);
  const body = await readJson(request, 5_000);
  // Clients can tick off tasks; only admins edit them.
  const done = typeof body.done === "boolean" ? (body.done ? 1 : 0) : t.done;
  const title = admin && typeof body.title === "string" ? str(body.title, 300) || t.title : t.title;
  const due = admin && "dueDate" in body ? normDate(body.dueDate) : t.due_date;
  const visible = admin && typeof body.clientVisible === "boolean" ? (body.clientVisible ? 1 : 0) : t.client_visible;
  await db
    .prepare("UPDATE tasks SET done = ?, title = ?, due_date = ?, client_visible = ?, completed_at = ? WHERE id = ?")
    .bind(done, title, due, visible, done ? t.completed_at || nowIso() : null, t.id)
    .run();
  if (done !== t.done && visible) await logActivity(db, t.project_id, user.id, done ? "completed a task" : "reopened a task", title);
  return json({ ok: true });
}

async function deleteTask({ db, user, params }) {
  const t = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(str(params[0], 64)).first();
  if (!t) return json({ ok: false, error: "Not found." }, 404);
  await db.prepare("DELETE FROM tasks WHERE id = ?").bind(t.id).run();
  if (t.client_visible) await logActivity(db, t.project_id, user.id, "removed a task", t.title);
  return json({ ok: true });
}

/* ---------- admin: clients ---------- */

async function listClients({ db, env }) {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.company, u.role, u.created_at, u.last_login_at,
        (u.password_hash IS NOT NULL) AS active,
        (SELECT count(*) FROM projects p WHERE p.user_id = u.id AND p.archived = 0) AS project_count
       FROM users u ORDER BY datetime(u.created_at) DESC`
    )
    .all();
  return json({
    ok: true,
    clients: results
      .filter((u) => !isAdmin(u, env))
      .map((u) => ({ ...publicUser(u), active: !!u.active, projectCount: u.project_count, createdAt: u.created_at, lastLoginAt: u.last_login_at })),
  });
}

async function sendInvite(ctx, client, note) {
  const { db, env } = ctx;
  const token = await createInviteToken(db, client.id);
  const link = `${portalOrigin(env)}/portal/onboard.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(client.email)}`;
  const greet = client.name ? escapeHtml(client.name.split(" ")[0]) : "there";
  return emailClient(env, {
    to: client.email,
    subject: "Your SWFT Studios client portal",
    heading: `Hi ${greet}, your portal is ready`,
    bodyHtml: `<p>This is where you'll send us photos, videos, logos and links for your project, leave notes and requests, and see where everything stands.</p>${note ? `<p>${escapeHtml(note)}</p>` : ""}<p>The link below lets you set a password. It works for 7 days.</p>`,
    ctaUrl: link,
    ctaLabel: "Set up my portal",
    idempotencyKey: `portal-invite/${client.id}/${token.slice(0, 12)}`,
  });
}

async function createClient(ctx) {
  const { db, request } = ctx;
  const body = await readJson(request, 10_000);
  const email = str(body.email, 320).toLowerCase();
  if (!isValidEmail(email)) return json({ ok: false, error: "Enter a valid email." }, 400);
  let client = await findUserByEmail(db, email);
  if (!client) {
    const id = randomId(16);
    await db
      .prepare("INSERT INTO users (id, email, name, company, role) VALUES (?, ?, ?, ?, 'client')")
      .bind(id, email, str(body.name, 120) || null, str(body.company, 160) || null)
      .run();
    client = await findUserById(db, id);
  } else {
    await db
      .prepare("UPDATE users SET name = COALESCE(?, name), company = COALESCE(?, company) WHERE id = ?")
      .bind(str(body.name, 120) || null, str(body.company, 160) || null, client.id)
      .run();
    client = await findUserById(db, client.id);
  }

  let project = null;
  const title = str(body.projectTitle, 200);
  if (title) project = await insertProject(db, ctx.user, client.id, { title, type: body.projectType, dueDate: body.dueDate, description: body.description });

  let invited = false;
  if (body.sendInvite !== false && !client.password_hash) invited = await sendInvite(ctx, client, str(body.inviteNote, 600));
  return json({ ok: true, client: publicUser(client), projectId: project?.id || null, invited });
}

async function updateClient({ db, params, request }) {
  const client = await findUserById(db, str(params[0], 64));
  if (!client) return json({ ok: false, error: "Client not found." }, 404);
  const body = await readJson(request, 5_000);
  await db
    .prepare("UPDATE users SET name = ?, company = ? WHERE id = ?")
    .bind(str(body.name ?? client.name, 120) || null, str(body.company ?? client.company, 160) || null, client.id)
    .run();
  return json({ ok: true, client: publicUser(await findUserById(db, client.id)) });
}

async function resendInvite(ctx) {
  const client = await findUserById(ctx.db, str(ctx.params[0], 64));
  if (!client) return json({ ok: false, error: "Client not found." }, 404);
  if (client.password_hash) return json({ ok: false, error: "This client already set a password. They can use “Forgot password” on the sign-in page." }, 409);
  const sent = await sendInvite(ctx, client, "");
  return json({ ok: true, invited: sent });
}

/* ---------- admin: projects ---------- */

async function insertProject(db, actor, userId, { title, type, dueDate, description, stage }) {
  const id = randomId(16);
  await db
    .prepare(
      `INSERT INTO projects (id, user_id, tier_id, status, title, type, stage, due_date, description)
       VALUES (?, ?, 'custom', 'active', ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      userId,
      str(title, 200) || "New project",
      PROJECT_TYPES.includes(type) ? type : "website",
      STAGES.includes(stage) ? stage : "intake",
      normDate(dueDate),
      str(description, 4000) || null
    )
    .run();
  await logActivity(db, id, actor?.id || null, "created the project", str(title, 200));
  return getProject(db, id);
}

async function createProject({ db, user, request }) {
  const body = await readJson(request, 20_000);
  const client = await findUserById(db, str(body.clientId, 64));
  if (!client) return json({ ok: false, error: "Pick a client." }, 400);
  if (!str(body.title, 200)) return json({ ok: false, error: "Give the project a title." }, 400);
  const p = await insertProject(db, user, client.id, body);
  return json({ ok: true, project: publicProject(p) });
}

async function updateProject(ctx) {
  const { db, user, env, params, request } = ctx;
  const p = await getProject(db, str(params[0], 64));
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  const body = await readJson(request, 20_000);

  const next = {
    title: "title" in body ? str(body.title, 200) || p.title : p.title,
    type: PROJECT_TYPES.includes(body.type) ? body.type : p.type,
    stage: STAGES.includes(body.stage) ? body.stage : p.stage,
    due_date: "dueDate" in body ? normDate(body.dueDate) : p.due_date,
    description: "description" in body ? str(body.description, 4000) || null : p.description,
    site_host: "siteHost" in body
      ? str(body.siteHost, 253).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null
      : p.site_host,
    archived: typeof body.archived === "boolean" ? (body.archived ? 1 : 0) : p.archived,
  };
  await db
    .prepare(
      `UPDATE projects SET title = ?, type = ?, stage = ?, due_date = ?, description = ?, site_host = ?, archived = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(next.title, next.type, next.stage, next.due_date, next.description, next.site_host, next.archived, p.id)
    .run();

  if (next.stage !== p.stage) {
    await logActivity(db, p.id, user.id, "moved the project to", STAGE_LABELS[next.stage]);
    const client = await findUserById(db, p.user_id);
    if (client && body.notifyClient !== false) {
      background(
        ctx,
        emailClient(env, {
          to: client.email,
          subject: `${next.title || "Your project"} is now ${STAGE_LABELS[next.stage].toLowerCase()}`,
          heading: `${next.title || "Your project"}: ${STAGE_LABELS[next.stage]}`,
          bodyHtml: `<p>Your project just moved to <strong>${escapeHtml(STAGE_LABELS[next.stage])}</strong>.</p>`,
          ctaUrl: `${portalOrigin(env)}/portal/dashboard.html#project=${p.id}`,
          ctaLabel: "See the project",
        })
      );
    }
  } else if (next.archived !== p.archived) {
    await logActivity(db, p.id, user.id, next.archived ? "archived the project" : "restored the project");
  } else {
    await logActivity(db, p.id, user.id, "updated project details");
  }
  return json({ ok: true, project: publicProject(await getProject(db, p.id)) });
}

async function deleteProject({ db, env, params, url }) {
  const p = await getProject(db, str(params[0], 64));
  if (!p) return json({ ok: false, error: "Project not found." }, 404);
  if (url.searchParams.get("confirm") !== p.id) return json({ ok: false, error: "Confirm by passing ?confirm=<project id>." }, 400);
  const { results } = await db.prepare("SELECT r2_key FROM assets WHERE project_id = ? AND kind = 'file' AND r2_key IS NOT NULL").bind(p.id).all();
  if (results.length && env.FILES) {
    const keys = results.map((r) => r.r2_key);
    for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
  }
  for (const t of ["assets", "messages", "tasks", "activity", "project_reads"]) {
    await db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).bind(p.id).run();
  }
  await db.prepare("DELETE FROM projects WHERE id = ?").bind(p.id).run();
  return json({ ok: true });
}
