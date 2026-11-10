import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession } from "../../functions/_lib/portal-db.js";
import * as api from "../../functions/api/admin/newsletter.js";

const ORIGIN = "https://www.swftstudios.com";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const MIGRATIONS = ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql", "0004_project_progress.sql", "0009_email_prefs_notifications.sql", "0010_newsletter.sql"];

function makeDb(migrations = MIGRATIONS) {
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

// Serves the real data files the way the ASSETS binding would.
const ASSETS = { fetch: async (u) => new Response(read(`../..${new URL(u).pathname}`), { headers: { "Content-Type": "application/json" } }) };
const BLOG = JSON.parse(read("../../data/blog-posts.json"))[0];

async function setup(db) {
  const { salt, hash } = await hashPassword("correct horse battery");
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-admin','elombe@swftstudios.com',?,?)").run(hash, salt);
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-other','other@example.com',?,?)").run(hash, salt);
  return { admin: await createSession(db, "u-admin"), other: await createSession(db, "u-other") };
}

let n = 0;
function addSub(db, email, { status = "active", interests = "blog,videos", name = null } = {}) {
  const id = (++n).toString(16).padStart(24, "0");
  db.raw.prepare("INSERT INTO subscribers (id, email, name, interests, status, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))")
    .run(id, email, name, interests, status, `+${n} seconds`);
  return id;
}

const ctx = (db, { sid, method = "GET", body, origin = ORIGIN, env = {} } = {}) => ({
  env: { DB: db, ASSETS, RESEND_API_KEY: "re_test", PORTAL_ORIGIN: ORIGIN, ...env },
  request: new Request(`${ORIGIN}/api/admin/newsletter`, {
    method,
    headers: { ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}), ...(origin && method !== "GET" ? { Origin: origin } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }),
});

let batches, singles, failOn, realFetch;
beforeEach(() => {
  batches = []; singles = []; failOn = new Set();
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url === "https://api.resend.com/emails/batch") {
      batches.push({ emails: JSON.parse(init.body), key: init.headers["Idempotency-Key"] });
      if (failOn.has(batches.length)) return new Response("{}", { status: 422 });
      return new Response("{}", { status: 200 });
    }
    if (url === "https://api.resend.com/emails") { singles.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const sendBody = (extra = {}) => ({ action: "send", kind: "blog", key: BLOG.slug, subject: BLOG.title, summary: "Short summary.", ...extra });
const recipients = () => batches.flatMap((b) => b.emails.map((e) => e.to[0]));

test("GET lists posts and videos with audience counts; admins only", async () => {
  const db = makeDb();
  const s = await setup(db);
  addSub(db, "a@example.com", { interests: "blog" });
  addSub(db, "b@example.com", { interests: "videos" });
  addSub(db, "c@example.com", { status: "pending", interests: "blog" });

  const r = await api.onRequestGet(ctx(db, { sid: s.admin }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ready, true);
  assert.deepEqual(d.counts, { active: 2, blog: 1, videos: 1 });
  assert.ok(d.items.some((i) => i.kind === "blog" && i.key === BLOG.slug && i.path === BLOG.url));
  const video = d.items.find((i) => i.kind === "videos");
  assert.match(video.path, /^\/visuals\.html\?p=/);

  assert.equal((await api.onRequestGet(ctx(db, { sid: s.other }))).status, 403);
  assert.equal((await api.onRequestGet(ctx(db))).status, 401);
});

test("send goes only to confirmed subscribers who want that topic, once each, with their own unsubscribe link", async () => {
  const db = makeDb();
  const s = await setup(db);
  const yes = addSub(db, "yes@example.com", { interests: "blog", name: "Ana" });
  addSub(db, "videos-only@example.com", { interests: "videos" });
  addSub(db, "pending@example.com", { status: "pending", interests: "blog" });
  addSub(db, "gone@example.com", { status: "unsubscribed", interests: "blog" });
  addSub(db, "all-off@example.com", { interests: "blog" });
  db.raw.prepare("INSERT INTO email_prefs (email, token, all_off) VALUES ('all-off@example.com', ?, 1)").run("f".repeat(32));

  const r = await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, sent: 1, remaining: 0, failed: false });
  assert.deepEqual(recipients(), ["yes@example.com"]);
  const mail = batches[0].emails[0];
  assert.equal(mail.subject, BLOG.title);
  assert.equal(mail.reply_to, "hello@swftstudios.com");
  assert.match(mail.html, /Hi Ana,/);
  assert.ok(mail.html.includes(`${ORIGIN}${BLOG.url}`));
  assert.ok(mail.html.includes(`/account.html?unsubscribe=${yes}`));
  assert.equal(mail.headers["List-Unsubscribe"], `<${ORIGIN}/api/subscribe/unsubscribe?id=${yes}>`);
  assert.equal(mail.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  // Sending again reaches nobody; a new subscriber gets only their copy.
  batches = [];
  assert.equal((await (await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }))).json()).sent, 0);
  assert.equal(batches.length, 0);
  addSub(db, "new@example.com", { interests: "blog,products" });
  await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }));
  assert.deepEqual(recipients(), ["new@example.com"]);

  const listed = await (await api.onRequestGet(ctx(db, { sid: s.admin }))).json();
  assert.equal(listed.items.find((i) => i.key === BLOG.slug).sent.count, 2);
});

test("large lists go out in batches of 100, five batches per request", async () => {
  const db = makeDb();
  const s = await setup(db);
  for (let i = 0; i < 650; i++) addSub(db, `p${i}@example.com`, { interests: "blog" });

  const first = await (await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }))).json();
  assert.deepEqual(first, { ok: true, sent: 500, remaining: 150, failed: false });
  assert.deepEqual(batches.map((b) => b.emails.length), [100, 100, 100, 100, 100]);
  const second = await (await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }))).json();
  assert.deepEqual(second, { ok: true, sent: 150, remaining: 0, failed: false });
  assert.equal(new Set(recipients()).size, 650);
});

test("a rejected batch stops the run, keeps what was sent, and a retry finishes without duplicates", async () => {
  const db = makeDb();
  const s = await setup(db);
  for (let i = 0; i < 250; i++) addSub(db, `p${i}@example.com`, { interests: "blog" });
  failOn.add(2);

  const r = await (await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }))).json();
  assert.deepEqual(r, { ok: true, sent: 100, remaining: 150, failed: true });

  const okBefore = batches.filter((_, i) => !failOn.has(i + 1)).flatMap((b) => b.emails.map((e) => e.to[0]));
  const retry = await (await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }))).json();
  assert.equal(retry.remaining, 0);
  const okAll = batches.filter((_, i) => !failOn.has(i + 1)).flatMap((b) => b.emails.map((e) => e.to[0]));
  assert.equal(okAll.length, 250);
  assert.equal(new Set(okAll).size, 250);
  assert.equal(okBefore.length, 100);
  // The retried batch reuses the failed batch's idempotency key (same people).
  assert.equal(batches[1].key, batches[2].key);

  failOn = new Set([1]);
  batches = [];
  addSub(db, "late@example.com", { interests: "blog" });
  const allFail = await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }));
  assert.equal(allFail.status, 502);
});

test("test sends one copy to the admin and records nothing; bad input is rejected", async () => {
  const db = makeDb();
  const s = await setup(db);
  addSub(db, "a@example.com", { interests: "blog" });
  const post = (body, opts = {}) => api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body, ...opts }));

  const t = await post(sendBody({ action: "test" }));
  assert.equal(t.status, 200);
  assert.equal(singles.length, 1);
  assert.deepEqual(singles[0].to, ["elombe@swftstudios.com"]);
  assert.match(singles[0].subject, /^\[Test\] /);
  assert.equal(batches.length, 0);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM newsletter_sends").get().n, 0);

  assert.equal((await post(sendBody({ kind: "spam" }))).status, 400);
  assert.equal((await post(sendBody({ subject: "" }))).status, 400);
  assert.equal((await post(sendBody({ key: "not-a-post" }))).status, 404);
  assert.equal((await post(sendBody(), { origin: "https://evil.example" })).status, 403);
  assert.equal((await api.onRequestPost(ctx(db, { sid: s.other, method: "POST", body: sendBody() }))).status, 403);
  assert.equal((await post(sendBody(), { env: { RESEND_API_KEY: "" } })).status, 503);
  assert.equal(batches.length, 0);
});

test("without migration 0010 the list still loads and sending says what to do", async () => {
  const db = makeDb(MIGRATIONS.slice(0, -1));
  const s = await setup(db);
  const d = await (await api.onRequestGet(ctx(db, { sid: s.admin }))).json();
  assert.equal(d.ready, false);
  const r = await api.onRequestPost(ctx(db, { sid: s.admin, method: "POST", body: sendBody() }));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /migration 0010/);
});
