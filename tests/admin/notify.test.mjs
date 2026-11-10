import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession } from "../../functions/_lib/portal-db.js";
import { sendPersonEmail } from "../../functions/_lib/email-prefs.js";
import { sendLeadEmails } from "../../functions/_lib/resend.js";
import * as adminProject from "../../functions/api/admin/project.js";
import * as notifications from "../../functions/api/portal/notifications.js";
import * as prefsApi from "../../functions/api/email-prefs/index.js";
import * as oneClick from "../../functions/api/email-prefs/unsubscribe.js";

const ORIGIN = "https://www.swftstudios.com";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const MIGRATIONS = ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql", "0004_project_progress.sql", "0008_project_files.sql", "0009_email_prefs_notifications.sql"];

function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of MIGRATIONS) sql.exec(read(`../../migrations/${f}`));
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), raw: sql };
}

let sent, realFetch;
beforeEach(() => {
  sent = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/emails")) { sent.push(JSON.parse(init.body)); return Response.json({ id: "em_1" }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

async function setup() {
  const db = makeDb();
  const { salt, hash } = await hashPassword("correct horse battery");
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-admin','elombe@swftstudios.com',?,?)").run(hash, salt);
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-tim','tim@example.com',?,?)").run(hash, salt);
  db.raw.prepare("INSERT INTO projects(id,user_id,tier_id,status,name) VALUES ('p-tim','u-tim','custom','paid','Evo Live Pro website')").run();
  return { db, admin: await createSession(db, "u-admin"), tim: await createSession(db, "u-tim") };
}
const env = (db, extra = {}) => ({ DB: db, RESEND_API_KEY: "re_test", ...extra });
const ctx = (s, path, { sid, method = "GET", body, origin = ORIGIN, e } = {}) => ({
  env: e || env(s.db),
  request: new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}), ...(origin && method !== "GET" ? { Origin: origin } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }),
});
const postUpdate = (s, body, extra = {}) => adminProject.onRequestPost(ctx(s, "/api/admin/project", { sid: s.admin, method: "POST", body: { action: "add_update", projectId: "p-tim", body, ...extra } }));
const tokenFor = (s, email) => s.db.raw.prepare("SELECT token FROM email_prefs WHERE email = ?").get(email).token;

test("posting an update emails the client with preferences footer and one-click unsubscribe", async () => {
  const s = await setup();
  const r = await (await postUpdate(s, "Homepage design is ready for review.\nTake a look <b>today</b>.")).json();
  assert.equal(r.ok, true);
  assert.equal(r.emailStatus, "sent");
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.deepEqual(m.to, ["tim@example.com"]);
  assert.match(m.subject, /New update on Evo Live Pro website/);
  assert.match(m.html, /Homepage design is ready for review\.<br>Take a look &lt;b&gt;today&lt;\/b&gt;\./);
  const t = tokenFor(s, "tim@example.com");
  assert.match(m.html, new RegExp(`/email-preferences\\.html\\?t=${t}`));
  assert.match(m.html, /Unsubscribe/);
  assert.equal(m.headers["List-Unsubscribe"], `<${ORIGIN}/api/email-prefs/unsubscribe?t=${t}&c=project>`);
  assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(m.text, /Email preferences or unsubscribe/);
  assert.equal(s.db.raw.prepare("SELECT email_status s FROM project_updates").get().s, "sent");
});

test("notify:false posts without emailing; opted-out clients are never emailed", async () => {
  const s = await setup();
  assert.equal((await (await postUpdate(s, "Quiet update", { notify: false })).json()).emailStatus, "not_sent");
  assert.equal(sent.length, 0);
  // client turns update emails off from their dashboard
  const off = await notifications.onRequestPost(ctx(s, "/api/portal/notifications", { sid: s.tim, method: "POST", body: { action: "email", on: false } }));
  assert.equal(off.status, 200);
  assert.equal((await (await postUpdate(s, "Second update")).json()).emailStatus, "opted_out");
  assert.equal(sent.length, 0);
  const n = await (await notifications.onRequestGet(ctx(s, "/api/portal/notifications", { sid: s.tim }))).json();
  assert.equal(n.email.on, false);
  assert.equal(n.items.length, 2); // still on the dashboard
});

test("admin sees why an email wasn't sent; no Resend key = unavailable", async () => {
  const s = await setup();
  const c = ctx(s, "/api/admin/project", { sid: s.admin, method: "POST", body: { action: "add_update", projectId: "p-tim", body: "x" }, e: { DB: s.db } });
  assert.equal((await (await adminProject.onRequestPost(c)).json()).emailStatus, "unavailable");
  const view = await (await adminProject.onRequestGet(ctx(s, "/api/admin/project?id=p-tim", { sid: s.admin }))).json();
  assert.equal(view.view.updates[0].emailStatus, "unavailable");
  assert.equal((await (await postUpdate(s, "y", { projectId: "nope" })).json()).error, "Project not found.");
});

test("notifications: unread count, mark seen, new updates are unread again", async () => {
  const s = await setup();
  s.db.raw.prepare("INSERT INTO project_updates(id,project_id,body,created_at) VALUES ('a','p-tim','one','2026-11-01 10:00:00'),('b','p-tim','two','2026-11-02 10:00:00')").run();
  let n = await (await notifications.onRequestGet(ctx(s, "/api/portal/notifications", { sid: s.tim }))).json();
  assert.equal(n.unread, 2);
  assert.deepEqual(n.items.map((i) => i.body), ["two", "one"]);
  assert.match(n.email.prefsUrl, /\/email-preferences\.html\?t=[a-f0-9]{32}$/);
  assert.equal((await notifications.onRequestPost(ctx(s, "/api/portal/notifications", { sid: s.tim, method: "POST", body: { action: "seen" } }))).status, 200);
  n = await (await notifications.onRequestGet(ctx(s, "/api/portal/notifications", { sid: s.tim }))).json();
  assert.equal(n.unread, 0);
  s.db.raw.prepare("INSERT INTO project_updates(id,project_id,body,created_at) VALUES ('c','p-tim','three',datetime('now','+1 minute'))").run();
  n = await (await notifications.onRequestGet(ctx(s, "/api/portal/notifications", { sid: s.tim }))).json();
  assert.equal(n.unread, 1);
  assert.equal(n.items[0].unread, true);
  // gates
  assert.equal((await notifications.onRequestGet(ctx(s, "/api/portal/notifications"))).status, 401);
  assert.equal((await notifications.onRequestPost(ctx(s, "/api/portal/notifications", { sid: s.tim, method: "POST", body: { action: "seen" }, origin: "https://evil.example" }))).status, 403);
});

test("preferences page API: masked email, toggles, unsubscribe from everything (incl. news list)", async () => {
  const s = await setup();
  await postUpdate(s, "hello");
  const t = tokenFor(s, "tim@example.com");
  s.db.raw.prepare("INSERT INTO subscribers(id,email,interests,status) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaa','tim@example.com','blog','active')").run();
  let v = await (await prefsApi.onRequestGet(ctx(s, `/api/email-prefs?t=${t}`))).json();
  assert.equal(v.email, "ti*@example.com");
  assert.deepEqual(v.categories.map((c) => [c.key, c.on]), [["project", true], ["account", true], ["replies", true]]);
  assert.equal(v.news, true);
  v = await (await prefsApi.onRequestPost(ctx(s, "/api/email-prefs", { method: "POST", body: { t, changes: { replies: false } } }))).json();
  assert.equal(v.categories.find((c) => c.key === "replies").on, false);
  v = await (await prefsApi.onRequestPost(ctx(s, "/api/email-prefs", { method: "POST", body: { t, allOff: true } }))).json();
  assert.equal(v.allOff, true);
  assert.equal(v.news, false);
  assert.equal(s.db.raw.prepare("SELECT status FROM subscribers").get().status, "unsubscribed");
  // turning one category back on clears "all off"
  v = await (await prefsApi.onRequestPost(ctx(s, "/api/email-prefs", { method: "POST", body: { t, changes: { project: true } } }))).json();
  assert.equal(v.allOff, false);
  assert.equal(v.categories.find((c) => c.key === "project").on, true);
  assert.equal(v.categories.find((c) => c.key === "replies").on, false);
  // bad token / bad origin
  assert.equal((await prefsApi.onRequestGet(ctx(s, "/api/email-prefs?t=nope"))).status, 404);
  assert.equal((await prefsApi.onRequestPost(ctx(s, "/api/email-prefs", { method: "POST", body: { t, allOff: true }, origin: "https://evil.example" }))).status, 403);
});

test("one-click unsubscribe: POST turns the category off, GET only redirects", async () => {
  const s = await setup();
  await postUpdate(s, "hello");
  const t = tokenFor(s, "tim@example.com");
  const get = await oneClick.onRequestGet(ctx(s, `/api/email-prefs/unsubscribe?t=${t}&c=project`));
  assert.equal(get.status, 302);
  assert.match(get.headers.get("Location"), /\/email-preferences\.html\?t=.+&off=project$/);
  assert.equal(s.db.raw.prepare("SELECT off FROM email_prefs").get().off, "");
  // mail apps POST with no Origin
  const post = await oneClick.onRequestPost(ctx(s, `/api/email-prefs/unsubscribe?t=${t}&c=project`, { method: "POST", origin: null }));
  assert.equal(post.status, 200);
  assert.equal(s.db.raw.prepare("SELECT off FROM email_prefs").get().off, "project");
  await oneClick.onRequestPost(ctx(s, `/api/email-prefs/unsubscribe?t=${t}&c=all`, { method: "POST", origin: null }));
  assert.equal(s.db.raw.prepare("SELECT all_off FROM email_prefs").get().all_off, 1);
  assert.equal((await oneClick.onRequestPost(ctx(s, `/api/email-prefs/unsubscribe?t=bad`, { method: "POST", origin: null }))).status, 400);
});

test("every person-facing email gets the footer; essential replies go out even after opting out", async () => {
  const s = await setup();
  const e = env(s.db);
  // opted out of everything
  await sendPersonEmail(e, { to: "lead@example.com", category: "replies", subject: "x", html: "<p>x</p>" });
  s.db.raw.prepare("UPDATE email_prefs SET all_off = 1 WHERE email = 'lead@example.com'").run();
  sent.length = 0;
  assert.equal((await sendPersonEmail(e, { to: "lead@example.com", category: "account", subject: "x", html: "<p>x</p>" })).status, "opted_out");
  assert.equal(sent.length, 0);
  // they fill in the contact form again: the confirmation still goes, with the footer
  const r = await sendLeadEmails(e, { kind: "contact", visitorEmail: "Lead@Example.com", teamSubject: "t", teamHtml: "<p>t</p>", confirmSubject: "Thanks", confirmHtml: "<p>Thanks</p>" });
  assert.equal(r.visitor, true);
  const visitor = sent.find((m) => m.subject === "Thanks");
  assert.match(visitor.html, /Email preferences/);
  assert.ok(visitor.headers["List-Unsubscribe"]);
  // team alert to SWFT's own inbox has no client footer
  const team = sent.find((m) => m.subject === "t");
  assert.doesNotMatch(team.html, /Email preferences/);
});

test("overview gives the project list activity, last update and overdue counts", async () => {
  const s = await setup();
  const overview = await import("../../functions/api/admin/overview.js");
  s.db.raw.prepare("INSERT INTO project_milestones(id,project_id,title,status,due_date,sort_order) VALUES ('m1','p-tim','Design','upcoming','2020-01-01',1),('m2','p-tim','Build','upcoming','2999-01-01',2),('m3','p-tim','Call','done',NULL,0)").run();
  s.db.raw.prepare("UPDATE project_milestones SET completed_at='2026-11-05 12:00:00' WHERE id='m3'").run();
  s.db.raw.prepare("INSERT INTO project_updates(id,project_id,body,created_at) VALUES ('u1','p-tim','hi','2026-11-08 09:00:00')").run();
  s.db.raw.prepare("UPDATE projects SET created_at='2026-10-01 00:00:00', updated_at='2026-10-01 00:00:00' WHERE id='p-tim'").run();
  const r = await (await overview.onRequestGet({ env: { DB: s.db, ASSETS: { fetch: async () => new Response("", { status: 404 }) } }, request: new Request(`${ORIGIN}/api/admin/overview`, { headers: { Cookie: `swft_portal_session=${s.admin}` } }) })).json();
  const c = r.clients.find((x) => x.id === "p-tim");
  assert.equal(c.overdue, 1);
  assert.equal(c.lastUpdateAt, "2026-11-08 09:00:00");
  assert.equal(c.activityAt, "2026-11-08 09:00:00");
  assert.deepEqual([c.progress.done, c.progress.total], [1, 3]);
});
