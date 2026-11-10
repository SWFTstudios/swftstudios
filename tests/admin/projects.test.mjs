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

/* ---------- default steps, editing, billing label ---------- */
import { upsertPaidUser } from "../../functions/_lib/portal-db.js";
import { DEFAULT_STEPS } from "../../functions/_lib/default-steps.js";
import { handleStripeEvent } from "../../functions/_lib/stripe-webhook.js";
import { getProjectView, seedDefaultSteps } from "../../functions/_lib/projects.js";

const stepsOf = (db, id) => db.raw.prepare("SELECT title, status, sort_order, completed_at FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(id);

test("a paid checkout creates the account, the project and the default steps", async () => {
  const db = makeDb();
  const { user, project } = await upsertPaidUser(db, { email: "New.Client@Example.com", stripeCustomerId: "cus_1", tierId: "custom", checkoutId: "cs_1", status: "paid" });
  assert.equal(user.email, "new.client@example.com");
  const steps = stepsOf(db, project.id);
  assert.deepEqual(steps.map((s) => s.title), DEFAULT_STEPS.map((s) => s.title));
  assert.equal(steps.find((s) => s.title === "Deposit paid").status, "done");
  assert.ok(steps.find((s) => s.title === "Deposit paid").completed_at);
  assert.equal(steps.find((s) => s.title === "Initial call").status, "upcoming");

  // Stripe retries the same event: no duplicate project, no duplicate steps.
  await upsertPaidUser(db, { email: "new.client@example.com", tierId: "custom", checkoutId: "cs_1", status: "paid" });
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM projects").get().n, 1);
  assert.equal(stepsOf(db, project.id).length, DEFAULT_STEPS.length);
  assert.equal(await seedDefaultSteps(db, project.id), 0);
});

test("provisioning still works before migration 0004 (no steps table)", async () => {
  const db = makeDb(["0001_portal.sql"]);
  const { user, project } = await upsertPaidUser(db, { email: "early@example.com", tierId: "website-only", checkoutId: "cs_2", status: "paid" });
  assert.ok(user.id && project.id);
});

test("a checkout with no tier metadata is a custom project, not 'unknown'", async () => {
  const db = makeDb();
  const sent = [];
  const out = await handleStripeEvent({ DB: db }, {
    type: "checkout.session.completed",
    data: { object: { id: "cs_3", mode: "payment", customer: "cus_3", customer_details: { email: "tim@example.com", name: "Tim" }, metadata: {} } },
  }, {
    upsertPaidUser,
    createInviteToken: async () => "tok",
    updateSubscriptionStatus: async () => {},
    getStripeTier: () => null,
    tierIdFromPriceId: () => null,
    sendInviteEmail: async (_e, m) => { sent.push(m); },
  });
  assert.equal(out.tierId, "custom");
  assert.equal(db.raw.prepare("SELECT tier_id FROM projects").get().tier_id, "custom");
  assert.equal(sent[0].tierName, "your project");
  const view = await getProjectView(db, db.raw.prepare("SELECT id FROM projects").get().id);
  assert.equal(view.project.tierName, "Custom project");
  assert.equal(view.project.billing, "one_time");
  assert.equal(view.milestones.length, DEFAULT_STEPS.length);
});

test("billing is 'subscription' only when Stripe gave a subscription id", async () => {
  const db = makeDb();
  const { project } = await upsertPaidUser(db, { email: "sub@example.com", tierId: "content-growth-retainer", checkoutId: "cs_4", subscriptionId: "sub_1", status: "active" });
  assert.equal((await getProjectView(db, project.id)).project.billing, "subscription");
});

test("admin edits and reorders steps; clients can't; bad input is rejected", async () => {
  const db = makeDb();
  const s = await setup(db);
  const { project } = await upsertPaidUser(db, { email: "c@example.com", tierId: "custom", checkoutId: "cs_5", status: "paid" });
  const [first, second] = db.raw.prepare("SELECT id, title FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(project.id);
  const post = (body, sid = s.admin) => adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid, method: "POST", body }));

  assert.equal((await post({ action: "edit_milestone", id: first.id, title: "Intro call + CMS review", detail: "Talk through the CMS connection.", dueDate: "2026-11-20" })).status, 200);
  const edited = db.raw.prepare("SELECT title, detail, due_date FROM project_milestones WHERE id = ?").get(first.id);
  assert.deepEqual({ ...edited }, { title: "Intro call + CMS review", detail: "Talk through the CMS connection.", due_date: "2026-11-20" });
  assert.equal((await post({ action: "edit_milestone", id: first.id, title: "", dueDate: "" })).status, 400);
  assert.equal((await post({ action: "edit_milestone", id: first.id, title: "x", dueDate: "11/20/2026" })).status, 400);

  // Move the second step up: it now comes first. Moving the first up again is a no-op.
  assert.equal((await post({ action: "move_milestone", id: second.id, direction: "up" })).status, 200);
  assert.equal(stepsOf(db, project.id)[0].title, second.title);
  assert.equal((await post({ action: "move_milestone", id: second.id, direction: "up" })).status, 200);
  assert.equal(stepsOf(db, project.id)[0].title, second.title);
  assert.equal((await post({ action: "move_milestone", id: second.id, direction: "down" })).status, 200);
  assert.equal(stepsOf(db, project.id)[0].title, "Intro call + CMS review");
  assert.equal((await post({ action: "move_milestone", id: second.id, direction: "sideways" })).status, 400);

  // A custom step added after the call (e.g. CMS connection) lands at the end with a description.
  assert.equal((await post({ action: "add_milestone", projectId: project.id, title: "CMS connection", detail: "Connect the site to your Stagera system." })).status, 200);
  const last = stepsOf(db, project.id).at(-1);
  assert.equal(last.title, "CMS connection");

  assert.equal((await post({ action: "edit_milestone", id: first.id, title: "hack" }, s.other)).status, 403);
});

test("defaults put Final approval and Final payment right before Launch", () => {
  const t = DEFAULT_STEPS.map((s) => s.title);
  const i = t.indexOf("Launch");
  assert.deepEqual(t.slice(i - 2, i + 1), ["Final approval", "Final payment", "Launch"]);
  assert.ok(t.indexOf("Review & revisions") < t.indexOf("Final approval"));
  assert.match(DEFAULT_STEPS[i - 1].detail, /before launch/i);
});

test("drag reorder saves the whole order, shows on the client's side, and rejects stale or foreign lists", async () => {
  const db = makeDb();
  const s = await setup(db);
  const { project } = await upsertPaidUser(db, { email: "r@example.com", tierId: "custom", checkoutId: "cs_r", status: "paid" });
  const other = await upsertPaidUser(db, { email: "r2@example.com", tierId: "custom", checkoutId: "cs_r2", status: "paid" });
  const ids = db.raw.prepare("SELECT id FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(project.id).map((r) => r.id);
  const post = (body, sid = s.admin) => adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid, method: "POST", body }));

  const reversed = [...ids].reverse();
  assert.equal((await post({ action: "reorder_milestones", projectId: project.id, ids: reversed })).status, 200);
  assert.deepEqual(db.raw.prepare("SELECT id FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(project.id).map((r) => r.id), reversed);

  // The client sees the new order.
  const view = await getProjectView(db, project.id);
  assert.deepEqual(view.milestones.map((m) => m.id), reversed);

  // Missing a step (stale page), duplicate ids, unknown ids, another project's ids, empty list: nothing changes.
  for (const bad of [reversed.slice(1), [...reversed, reversed[0]], [...reversed.slice(1), "nope"], db.raw.prepare("SELECT id FROM project_milestones WHERE project_id = ?").all(other.project.id).map((r) => r.id)]) {
    assert.equal((await post({ action: "reorder_milestones", projectId: project.id, ids: bad })).status, 409);
  }
  assert.equal((await post({ action: "reorder_milestones", projectId: project.id, ids: [] })).status, 400);
  assert.deepEqual(db.raw.prepare("SELECT id FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(project.id).map((r) => r.id), reversed);

  // Clients and cross-origin writes are refused.
  assert.equal((await post({ action: "reorder_milestones", projectId: project.id, ids }, s.other)).status, 403);
  const xo = await adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid: s.admin, method: "POST", origin: "https://evil.example", body: { action: "reorder_milestones", projectId: project.id, ids } }));
  assert.equal(xo.status, 403);
});

/* ---------- completion dates ---------- */
import { isFutureDate, isValidDate } from "../../functions/_lib/projects.js";

test("date helpers: real calendar days only; future means beyond tomorrow UTC", () => {
  assert.equal(isValidDate("2026-11-10"), true);
  for (const bad of ["2026-02-31", "2026-13-01", "11/10/2026", "2026-1-5", "", null, "2026-11-10T00:00:00Z"]) assert.equal(isValidDate(bad), false, String(bad));
  const now = new Date("2026-11-10T15:00:00Z");
  assert.equal(isFutureDate("2026-11-10", now), false);
  assert.equal(isFutureDate("2026-11-11", now), false); // slack for time zones ahead of UTC
  assert.equal(isFutureDate("2026-11-12", now), true);
});

test("marking a step done takes the picked date; the client sees that day; undone clears it", async () => {
  const db = makeDb();
  const s = await setup(db);
  const { project } = await upsertPaidUser(db, { email: "d@example.com", tierId: "custom", checkoutId: "cs_d", status: "paid" });
  const call = db.raw.prepare("SELECT id FROM project_milestones WHERE project_id = ? AND title = 'Initial call'").get(project.id).id;
  const post = (body, sid = s.admin) => adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid, method: "POST", body }));
  const completed = () => db.raw.prepare("SELECT status, completed_at FROM project_milestones WHERE id = ?").get(call);

  // Done with a past date: stored as noon UTC so every US/EU time zone shows the same calendar day.
  assert.equal((await post({ action: "milestone_status", id: call, status: "done", completedOn: "2026-11-05" })).status, 200);
  assert.deepEqual({ ...completed() }, { status: "done", completed_at: "2026-11-05 12:00:00" });
  assert.equal((await getProjectView(db, project.id)).milestones.find((m) => m.id === call).completedAt, "2026-11-05 12:00:00");

  // Change the date later with the calendar.
  assert.equal((await post({ action: "set_milestone_date", id: call, date: "2026-11-03" })).status, 200);
  assert.equal(completed().completed_at, "2026-11-03 12:00:00");

  // Re-selecting Done without a date keeps the existing completion date.
  assert.equal((await post({ action: "milestone_status", id: call, status: "done" })).status, 200);
  assert.equal(completed().completed_at, "2026-11-03 12:00:00");

  // Rejected: future, impossible, malformed, and clearing a done step's date. Nothing changes.
  for (const date of ["2099-01-01", "2026-02-31", "yesterday"]) assert.equal((await post({ action: "set_milestone_date", id: call, date })).status, 400);
  assert.equal((await post({ action: "set_milestone_date", id: call, date: "" })).status, 400);
  assert.equal((await post({ action: "milestone_status", id: call, status: "done", completedOn: "2099-01-01" })).status, 400);
  assert.equal(completed().completed_at, "2026-11-03 12:00:00");

  // Back to in progress clears the completion date; the same field now sets the target date.
  assert.equal((await post({ action: "milestone_status", id: call, status: "in_progress" })).status, 200);
  assert.equal(completed().completed_at, null);
  assert.equal((await post({ action: "set_milestone_date", id: call, date: "2026-12-01" })).status, 200);
  assert.equal(db.raw.prepare("SELECT due_date FROM project_milestones WHERE id = ?").get(call).due_date, "2026-12-01");
  assert.equal((await post({ action: "set_milestone_date", id: call, date: "" })).status, 200); // clears the target
  assert.equal(db.raw.prepare("SELECT due_date FROM project_milestones WHERE id = ?").get(call).due_date, null);

  // Unknown step, clients and cross-origin writes.
  assert.equal((await post({ action: "set_milestone_date", id: "nope", date: "2026-11-01" })).status, 404);
  assert.equal((await post({ action: "set_milestone_date", id: call, date: "2026-11-01" }, s.other)).status, 403);
});

import { spreadDates } from "../../functions/_lib/projects.js";

test("spreadDates: even steps, last on the end day, weekends pulled back to Friday", () => {
  // 2026-11-10 is a Tuesday; three weeks later is Tuesday 2026-12-01.
  const d = spreadDates("2026-11-10", "2026-12-01", 7);
  assert.equal(d.length, 7);
  assert.equal(d.at(-1), "2026-12-01");
  assert.deepEqual([...d].sort(), d);
  for (const x of d) assert.ok(![0, 6].includes(new Date(`${x}T00:00:00Z`).getUTCDay()), `${x} is a weekend`);
  assert.deepEqual(spreadDates("2026-11-10", "2026-11-14", 1), ["2026-11-13"]);
  assert.deepEqual(spreadDates("2026-11-10", "2026-12-01", 0), []);
});

test("schedule_milestones dates only the steps not done, in order; admin-only; bad windows rejected", async () => {
  const db = makeDb();
  const s = await setup(db);
  const { project } = await upsertPaidUser(db, { email: "sched@example.com", tierId: "custom", checkoutId: "cs_sched", status: "paid" });
  const steps = db.raw.prepare("SELECT id FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(project.id);
  db.raw.prepare("UPDATE project_milestones SET status = 'done', completed_at = '2026-11-09 12:00:00' WHERE id = ?").run(steps[0].id);
  const post = (body, sid = s.admin) => adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid, method: "POST", body }));

  const r = await post({ action: "schedule_milestones", projectId: project.id, start: "2026-11-10", end: "2026-12-01" });
  assert.equal(r.status, 200);
  const rows = db.raw.prepare("SELECT status, due_date FROM project_milestones WHERE project_id = ? ORDER BY sort_order").all(project.id);
  const open = rows.filter((x) => x.status !== "done");
  assert.equal((await r.json()).scheduled, open.length);
  assert.ok(rows.filter((x) => x.status === "done").every((x) => x.due_date === null));
  const due = open.map((x) => x.due_date);
  assert.ok(due.every(Boolean));
  assert.deepEqual([...due].sort(), due);
  assert.equal(due.at(-1), "2026-12-01");

  assert.equal((await post({ action: "schedule_milestones", projectId: project.id, start: "2026-12-01", end: "2026-11-10" })).status, 400);
  assert.equal((await post({ action: "schedule_milestones", projectId: project.id, start: "2026-11-10", end: "nope" })).status, 400);
  assert.equal((await post({ action: "schedule_milestones", projectId: "missing", start: "2026-11-10", end: "2026-12-01" })).status, 404);
  assert.equal((await post({ action: "schedule_milestones", projectId: project.id, start: "2026-11-10", end: "2026-12-01" }, s.other)).status, 403);
});
