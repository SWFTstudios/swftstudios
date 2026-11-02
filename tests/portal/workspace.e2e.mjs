/**
 * End-to-end check of the client workspace API against a local server.
 *
 *   npx wrangler d1 migrations apply swft-portal --local
 *   npx wrangler dev --port 8790          # (drop the "ai" binding if offline)
 *   PORTAL_URL=http://127.0.0.1:8790 node tests/portal/workspace.e2e.mjs
 *
 * Seeds an admin and a client invite straight into the local D1 with
 * `wrangler d1 execute --local`, then drives the API like the browser does:
 * sign-in, client + project creation, invite onboarding, chunked upload,
 * download with Range, links, notes/requests, tasks, permissions.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { hashPassword, randomId, sha256Hex } from "../../functions/_lib/portal-auth.js";

const BASE = process.env.PORTAL_URL || "http://127.0.0.1:8790";
const CONFIG = process.env.WRANGLER_CONFIG || "wrangler.jsonc";
const PERSIST = process.env.WRANGLER_PERSIST ? ["--persist-to", process.env.WRANGLER_PERSIST] : [];
const ADMIN_EMAIL = "hello@swftstudios.com";
const run = Date.now().toString(36);

function d1(sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", "swft-portal", "--local", "-c", CONFIG, ...PERSIST, "--command", sql], { stdio: "pipe" });
}

class Browser {
  constructor() { this.cookie = ""; }
  async req(method, path, body, headers = {}) {
    const init = { method, headers: { Origin: BASE, ...headers } };
    if (this.cookie) init.headers.Cookie = this.cookie;
    if (body instanceof Uint8Array) init.body = body;
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
    const res = await fetch(BASE + path, init);
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
}

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["PASS", name]); console.log("PASS ", name); }
  catch (err) { results.push(["FAIL", name]); console.log("FAIL ", name, "\n     ", err.message); }
}

const admin = new Browser();
const client = new Browser();
const stranger = new Browser();
const adminPw = "admin-pass-" + run;
const clientPw = "client-pass-" + run;
const clientEmail = `client-${run}@example.com`;
let clientId, projectId, assetId, linkId, requestId, taskId, hiddenTaskId;

// Seed the admin account (the forgot-password email would do this in production)
const { salt, hash } = await hashPassword(adminPw);
d1(`INSERT INTO users (id, email, password_hash, password_salt, role) VALUES ('${randomId(16)}', '${ADMIN_EMAIL}', '${hash}', '${salt}', 'admin')
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt`);

await step("admin signs in and is sent to the admin dashboard", async () => {
  const r = await admin.req("POST", "/api/portal/login", { email: ADMIN_EMAIL, password: adminPw });
  assert.equal(r.status, 200);
  assert.equal(r.data.redirect, "/portal/admin.html");
});

await step("admin creates a client with a first project", async () => {
  const r = await admin.req("POST", "/api/admin/clients", { email: clientEmail, name: "Pat Client", company: "Client Co", projectTitle: "Spring launch site", projectType: "website", sendInvite: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  clientId = r.data.client.id;
  projectId = r.data.projectId;
  assert.ok(projectId);
});

await step("onboarding without an invite token is refused", async () => {
  const r = await stranger.req("POST", "/api/portal/onboard", { email: clientEmail, password: "hijack-password-1" });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, "invite_required");
});

await step("client sets a password from an invite link", async () => {
  const raw = randomId(24);
  d1(`INSERT INTO invite_tokens (token_hash, user_id, expires_at) VALUES ('${await sha256Hex(raw)}', '${clientId}', '2099-01-01T00:00:00Z')`);
  const r = await client.req("POST", "/api/portal/onboard", { email: clientEmail, password: clientPw, token: raw });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.redirect, "/portal/dashboard.html");
});

await step("client sees only their project", async () => {
  const r = await client.req("GET", "/api/portal/projects");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.projects.map((p) => p.id), [projectId]);
});

await step("client cannot call admin routes", async () => {
  const r = await client.req("GET", "/api/admin/clients");
  assert.equal(r.status, 403);
});

const fileBytes = new Uint8Array(12 * 1024 * 1024 + 123).map((_, i) => i % 251);
await step("client uploads a 12 MB file in two parts", async () => {
  const start = await client.req("POST", `/api/portal/projects/${projectId}/uploads`, { name: "b-roll clip.mp4", size: fileBytes.length, type: "video/mp4", note: "Raw footage" });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  assetId = start.data.assetId;
  const partSize = start.data.partSize;
  const parts = [];
  for (let n = 1, off = 0; off < fileBytes.length; n++, off += partSize) {
    const r = await client.req("PUT", `/api/portal/uploads/${assetId}/parts/${n}`, fileBytes.subarray(off, off + partSize), { "Content-Type": "application/octet-stream" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    parts.push({ partNumber: r.data.partNumber, etag: r.data.etag });
  }
  assert.equal(parts.length, 2);
  const done = await client.req("POST", `/api/portal/uploads/${assetId}/complete`, { parts });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.asset.category, "video");
  assert.equal(done.data.asset.size, fileBytes.length);
});

await step("admin downloads the file, including a byte range", async () => {
  const full = await admin.req("GET", `/api/portal/files/${assetId}?download=1`);
  assert.equal(full.status, 200);
  assert.equal(full.data.length, fileBytes.length);
  assert.match(full.headers.get("content-disposition"), /attachment/);
  const part = await admin.req("GET", `/api/portal/files/${assetId}`, undefined, { Range: "bytes=100-199" });
  assert.equal(part.status, 206);
  assert.equal(part.data.length, 100);
  assert.equal(part.data[0], fileBytes[100]);
});

await step("a stranger can't read the file", async () => {
  const r = await stranger.req("GET", `/api/portal/files/${assetId}`);
  assert.equal(r.status, 401);
});

await step("client shares a link", async () => {
  const r = await client.req("POST", `/api/portal/projects/${projectId}/links`, { url: "drive.google.com/drive/folders/abc", name: "Brand folder", category: "brand" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  linkId = r.data.id;
});

await step("client posts a request; admin replies with an update", async () => {
  const r = await client.req("POST", `/api/portal/projects/${projectId}/messages`, { kind: "request", body: "Can we add a gallery page?" });
  assert.equal(r.status, 200);
  requestId = r.data.id;
  const u = await client.req("POST", `/api/portal/projects/${projectId}/messages`, { kind: "update", body: "Clients can't post updates" });
  assert.equal(u.status, 200);
  const a = await admin.req("POST", `/api/portal/projects/${projectId}/messages`, { kind: "update", body: "Gallery added to the plan." });
  assert.equal(a.status, 200);
});

await step("admin resolves the request", async () => {
  const r = await admin.req("PATCH", `/api/portal/messages/${requestId}`, { status: "done" });
  assert.equal(r.status, 200);
});

await step("admin adds tasks; hidden tasks stay hidden from the client", async () => {
  const t = await admin.req("POST", `/api/admin/projects/${projectId}/tasks`, { title: "Send brand assets", dueDate: "2026-11-05" });
  assert.equal(t.status, 200);
  taskId = t.data.id;
  const h = await admin.req("POST", `/api/admin/projects/${projectId}/tasks`, { title: "Internal: color grade", clientVisible: false });
  hiddenTaskId = h.data.id;
  const detail = await client.req("GET", `/api/portal/projects/${projectId}`);
  assert.deepEqual(detail.data.tasks.map((x) => x.id), [taskId]);
  assert.ok(!detail.data.activity.some((a) => /Internal/.test(a.detail || "")), "hidden task leaked into activity");
});

await step("client ticks off a task but can't rename it", async () => {
  const r = await client.req("PATCH", `/api/portal/tasks/${taskId}`, { done: true, title: "renamed" });
  assert.equal(r.status, 200);
  const detail = await client.req("GET", `/api/portal/projects/${projectId}`);
  const t = detail.data.tasks.find((x) => x.id === taskId);
  assert.equal(t.done, true);
  assert.equal(t.title, "Send brand assets");
  const hidden = await client.req("PATCH", `/api/portal/tasks/${hiddenTaskId}`, { done: true });
  assert.equal(hidden.status, 404);
});

await step("admin moves the stage; detail shows files, messages and activity", async () => {
  const r = await admin.req("PATCH", `/api/admin/projects/${projectId}`, { stage: "production", dueDate: "2026-12-01" });
  assert.equal(r.status, 200);
  assert.equal(r.data.project.stage, "production");
  const d = await client.req("GET", `/api/portal/projects/${projectId}`);
  assert.equal(d.data.project.stageLabel, "In production");
  assert.equal(d.data.assets.length, 2);
  assert.equal(d.data.messages.length, 3);
  assert.equal(d.data.messages[1].kind, "note"); // the client's "update" was stored as a note
  assert.ok(d.data.activity.length >= 6);
});

await step("admin project list shows counts and unseen activity", async () => {
  const r = await admin.req("GET", "/api/portal/projects");
  const p = r.data.projects.find((x) => x.id === projectId);
  assert.equal(p.client.email, clientEmail);
  assert.equal(p.fileCount, 2);
  assert.equal(p.openRequests, 0);
});

await step("cross-site writes are blocked", async () => {
  const r = await client.req("POST", `/api/portal/projects/${projectId}/messages`, { body: "x" }, { Origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

await step("client removes their link; admin removes the file from R2", async () => {
  assert.equal((await client.req("DELETE", `/api/portal/assets/${linkId}`)).status, 200);
  assert.equal((await admin.req("DELETE", `/api/portal/assets/${assetId}`)).status, 200);
  assert.equal((await admin.req("GET", `/api/portal/files/${assetId}`)).status, 404);
});

await step("forgot password answers the same for unknown emails", async () => {
  const r = await stranger.req("POST", "/api/portal/forgot", { email: "nobody@example.com" });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

await step("reset link sets a new password and signs in", async () => {
  const raw = randomId(24);
  d1(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ('${await sha256Hex(raw)}', '${clientId}', '2099-01-01T00:00:00Z')`);
  const fresh = new Browser();
  const r = await fresh.req("POST", "/api/portal/reset", { token: raw, password: "brand-new-pass-1" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const again = await fresh.req("POST", "/api/portal/reset", { token: raw, password: "brand-new-pass-2" });
  assert.equal(again.status, 400);
  const login = await new Browser().req("POST", "/api/portal/login", { email: clientEmail, password: "brand-new-pass-1" });
  assert.equal(login.status, 200);
});

const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
