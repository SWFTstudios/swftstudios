import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession } from "../../functions/_lib/portal-db.js";
import { fetchZoneTraffic } from "../../functions/_lib/cloudflare-analytics.js";
import * as adminProject from "../../functions/api/admin/project.js";
import * as adminAnalytics from "../../functions/api/admin/analytics.js";
import * as overview from "../../functions/api/admin/overview.js";
import * as portalProject from "../../functions/api/portal/project.js";

const ORIGIN = "https://www.swftstudios.com";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

function makeDb(migrations = ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql", "0004_project_progress.sql"]) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of migrations) sql.exec(read(`../../migrations/${f}`));
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), raw: sql };
}

async function setup(db) {
  db.raw.exec(read("../../scripts/seed-demo-project.sql"));
  const { salt, hash } = await hashPassword("correct horse battery");
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-admin','elombe@swftstudios.com',?,?)").run(hash, salt);
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-other','other@example.com',?,?)").run(hash, salt);
  db.raw.prepare("INSERT INTO projects(id,user_id,tier_id,status) VALUES ('p-other','u-other','website-only','paid')").run();
  db.raw.prepare("INSERT INTO admin_notes(id,project_id,body) VALUES ('n1','demo-swft-website','PRIVATE: margin is thin')").run();
  return {
    admin: await createSession(db, "u-admin"),
    demo: await createSession(db, "demo-client-elombe"),
    other: await createSession(db, "u-other"),
  };
}

const ctx = (db, path, { sid, method = "GET", body, origin = ORIGIN, env = {} } = {}) => ({
  env: { DB: db, ...env },
  request: new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}), ...(origin && method !== "GET" ? { Origin: origin } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }),
});

test("seed is idempotent and creates the demo client + project", async () => {
  const db = makeDb();
  db.raw.exec(read("../../scripts/seed-demo-project.sql"));
  db.raw.exec(read("../../scripts/seed-demo-project.sql"));
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM users WHERE email='elombekisala@gmail.com'").get().n, 1);
  const p = db.raw.prepare("SELECT * FROM projects WHERE id='demo-swft-website'").get();
  assert.equal(p.is_demo, 1);
  assert.equal(p.site_host, "swftstudios.com");
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM project_milestones WHERE project_id='demo-swft-website'").get().n, 6);
});

test("client sees their own project and progress, never admin notes", async () => {
  const db = makeDb(); const s = await setup(db);
  const r = await (await portalProject.onRequestGet(ctx(db, "/api/portal/project", { sid: s.demo }))).json();
  assert.equal(r.view.project.id, "demo-swft-website");
  assert.deepEqual([r.view.progress.done, r.view.progress.total, r.view.progress.percent], [3, 6, 50]);
  assert.equal(r.view.progress.current, "Build & tracking setup");
  assert.equal(r.view.updates.length, 3);
  assert.ok(!JSON.stringify(r).includes("PRIVATE"), "admin notes leaked");
  const other = await (await portalProject.onRequestGet(ctx(db, "/api/portal/project", { sid: s.other }))).json();
  assert.equal(other.view.project.id, "p-other");
  assert.equal((await portalProject.onRequestGet(ctx(db, "/api/portal/project"))).status, 401);
});

test("admin preview returns the same view the client sees; clients can't use it", async () => {
  const db = makeDb(); const s = await setup(db);
  const client = await (await portalProject.onRequestGet(ctx(db, "/api/portal/project", { sid: s.demo }))).json();
  const admin = await (await adminProject.onRequestGet(ctx(db, "/api/admin/project?id=demo-swft-website", { sid: s.admin }))).json();
  assert.deepEqual(admin.view, client.view);
  assert.equal((await adminProject.onRequestGet(ctx(db, "/api/admin/project?id=demo-swft-website", { sid: s.demo }))).status, 403);
  assert.equal((await adminProject.onRequestGet(ctx(db, "/api/admin/project?id=nope", { sid: s.admin }))).status, 404);
});

test("admin updates milestones and posts updates; writes need same-origin", async () => {
  const db = makeDb(); const s = await setup(db);
  const post = (body, o = {}) => adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid: s.admin, method: "POST", body, ...o }));
  assert.equal((await post({ action: "milestone_status", id: "demo-ms-4", status: "done" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ action: "milestone_status", id: "demo-ms-4", status: "bogus" })).status, 400);
  assert.equal((await post({ action: "milestone_status", id: "demo-ms-4", status: "done" })).status, 200);
  assert.ok(db.raw.prepare("SELECT completed_at FROM project_milestones WHERE id='demo-ms-4'").get().completed_at);
  assert.equal((await post({ action: "add_milestone", projectId: "demo-swft-website", title: "Ads launch", dueDate: "2026-12-01" })).status, 200);
  assert.equal((await post({ action: "add_milestone", projectId: "demo-swft-website", title: "X", dueDate: "12/01/2026" })).status, 400);
  assert.equal((await post({ action: "add_update", projectId: "demo-swft-website", body: "Launched!" })).status, 200);
  assert.equal((await post({ action: "rename", projectId: "demo-swft-website", name: "Renamed" })).status, 200);
  const v = await (await portalProject.onRequestGet(ctx(db, "/api/portal/project", { sid: s.demo }))).json();
  assert.equal(v.view.project.name, "Renamed");
  assert.equal(v.view.progress.done, 4);
  assert.equal(v.view.progress.total, 7);
  assert.equal(v.view.updates[0].body, "Launched!");
  const asClient = await adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid: s.demo, method: "POST", body: { action: "add_update", projectId: "demo-swft-website", body: "hi" } }));
  assert.equal(asClient.status, 403);
});

test("overview lists progress, and still works before migration 0004", async () => {
  const db = makeDb(); const s = await setup(db);
  const o = await (await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: s.admin, env: { ASSETS: { fetch: async () => new Response("[]") } } }))).json();
  const demo = o.clients.find((c) => c.id === "demo-swft-website");
  assert.equal(demo.isDemo, true);
  assert.equal(demo.progress.percent, 50);
  assert.equal(o.summary.inProgress, 1);

  const old = makeDb(["0001_portal.sql", "0002_admin_notes.sql"]);
  const { salt, hash } = await hashPassword("correct horse battery");
  old.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-admin','elombe@swftstudios.com',?,?)").run(hash, salt);
  const sid = await createSession(old, "u-admin");
  const r = await overview.onRequestGet(ctx(old, "/api/admin/overview", { sid, env: { ASSETS: { fetch: async () => new Response("[]") } } }));
  assert.equal(r.status, 200);
});

test("Cloudflare traffic: not configured, parsed totals, API errors", async () => {
  assert.equal((await fetchZoneTraffic({})).reason, "not_configured");
  const env = { CF_ANALYTICS_TOKEN: "t", CF_ZONE_ID: "z" };
  let sent;
  const ok = await fetchZoneTraffic(env, { fetchImpl: async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: { viewer: { zones: [{ httpRequests1dGroups: [
      { dimensions: { date: "2026-11-01" }, sum: { requests: 1000, cachedRequests: 250, pageViews: 300, bytes: 1 }, uniq: { uniques: 200 } },
      { dimensions: { date: "2026-11-02" }, sum: { requests: 3000, cachedRequests: 750, pageViews: 500, bytes: 1 }, uniq: { uniques: 210 } },
    ] }] } } }), { status: 200 });
  } });
  assert.equal(sent.variables.zone, "z");
  assert.deepEqual(ok.totals, { visitors: 410, requests: 4000, pageViews: 800, percentCached: 25 });
  assert.equal(ok.daily.length, 2);
  const bad = await fetchZoneTraffic(env, { fetchImpl: async () => new Response(JSON.stringify({ errors: [{ message: "not authorized" }] }), { status: 200 }) });
  assert.equal(bad.reason, "query_failed");
});

test("analytics endpoint is admin-only and degrades per source", async () => {
  const db = makeDb(); const s = await setup(db);
  assert.equal((await adminAnalytics.onRequestGet(ctx(db, "/api/admin/analytics", { sid: s.demo }))).status, 403);
  const r = await (await adminAnalytics.onRequestGet(ctx(db, "/api/admin/analytics", { sid: s.admin }))).json();
  assert.equal(r.cloudflare.reason, "not_configured");
  assert.equal(r.posthog.reason, "missing_key");
  assert.equal(r.host, "swftstudios.com");
});
