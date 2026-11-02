import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { adminEmails, isAdminEmail, sameOrigin } from "../../functions/_lib/admin-auth.js";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession } from "../../functions/_lib/portal-db.js";
import * as notes from "../../functions/api/admin/notes.js";
import * as overview from "../../functions/api/admin/overview.js";
import * as emails from "../../functions/api/admin/emails.js";
import * as login from "../../functions/api/portal/login.js";
import * as me from "../../functions/api/portal/me.js";

/** Minimal D1 look-alike over node:sqlite, running the real migrations. */
function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of ["0001_portal.sql", "0002_admin_notes.sql"]) {
    sql.exec(readFileSync(new URL(`../../migrations/${f}`, import.meta.url), "utf8"));
  }
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), raw: sql };
}

const ORIGIN = "https://www.swftstudios.com";

async function seed(db) {
  const { salt, hash } = await hashPassword("correct horse battery");
  for (const [id, email] of [["u-admin", "elombe@swftstudios.com"], ["u-client", "client@example.com"]]) {
    db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES (?,?,?,?)").run(id, email, hash, salt);
  }
  db.raw.prepare("INSERT INTO projects(id,user_id,tier_id,status,site_host) VALUES ('p1','u-client','website-only','paid','client.com')").run();
  return { adminSid: await createSession(db, "u-admin"), clientSid: await createSession(db, "u-client") };
}

const ctx = (db, path, { sid, method = "GET", body, origin = ORIGIN, env = {} } = {}) => ({
  env: { DB: db, ...env },
  request: new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}),
      ...(origin && method !== "GET" ? { Origin: origin } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }),
});

test("allowlist: defaults to the owner, case-insensitive, env override", () => {
  assert.deepEqual(adminEmails({}), ["elombe@swftstudios.com"]);
  assert.equal(isAdminEmail({}, " Elombe@SWFTstudios.com "), true);
  assert.equal(isAdminEmail({}, "someone@else.com"), false);
  assert.equal(isAdminEmail({}, ""), false);
  assert.equal(isAdminEmail({ ADMIN_EMAILS: "a@x.com, b@x.com" }, "b@x.com"), true);
  assert.equal(isAdminEmail({ ADMIN_EMAILS: "a@x.com" }, "elombe@swftstudios.com"), false);
});

test("sameOrigin requires a matching Origin header", () => {
  const mk = (origin) => new Request(`${ORIGIN}/api/admin/notes`, { method: "POST", headers: origin ? { Origin: origin } : {} });
  assert.equal(sameOrigin(mk(ORIGIN)), true);
  assert.equal(sameOrigin(mk("https://evil.example")), false);
  assert.equal(sameOrigin(mk(null)), false);
});

test("admin endpoints: 401 signed out, 403 for a client, 200 for the owner", async () => {
  const db = makeDb();
  const { adminSid, clientSid } = await seed(db);
  assert.equal((await overview.onRequestGet(ctx(db, "/api/admin/overview"))).status, 401);
  const forbidden = await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: clientSid }));
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).code, "forbidden");
  assert.equal((await emails.onRequestGet(ctx(db, "/api/admin/emails", { sid: clientSid }))).status, 403);
  assert.equal((await notes.onRequestGet(ctx(db, "/api/admin/notes", { sid: clientSid }))).status, 403);

  const ok = await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: adminSid }));
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.admin.email, "elombe@swftstudios.com");
  assert.equal(data.summary.clients, 1);
  assert.equal(data.clients[0].email, "client@example.com");
  assert.equal(data.clients[0].siteHost, "client.com");
  assert.deepEqual(data.outreach, { configured: false });
  assert.equal(data.blog.configured, false); // no ASSETS binding in this test
});

test("overview never leaks other users' password material", async () => {
  const db = makeDb();
  const { adminSid } = await seed(db);
  const text = await (await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: adminSid }))).text();
  assert.ok(!/password|salt|hash/i.test(text));
});

test("notes: create, list, delete; writes need same-origin; clients can't write", async () => {
  const db = makeDb();
  const { adminSid, clientSid } = await seed(db);

  const created = await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: adminSid, method: "POST", body: { projectId: "p1", body: "Call back Friday" } }));
  assert.equal(created.status, 201);
  const { note } = await created.json();

  assert.equal((await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: adminSid, method: "POST", origin: "https://evil.example", body: { projectId: "p1", body: "x" } }))).status, 403);
  assert.equal((await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: adminSid, method: "POST", origin: null, body: { projectId: "p1", body: "x" } }))).status, 403);
  assert.equal((await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: clientSid, method: "POST", body: { projectId: "p1", body: "x" } }))).status, 403);
  assert.equal((await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: adminSid, method: "POST", body: { projectId: "nope", body: "x" } }))).status, 404);
  assert.equal((await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: adminSid, method: "POST", body: { projectId: "p1", body: "  " } }))).status, 400);

  await notes.onRequestPost(ctx(db, "/api/admin/notes", { sid: adminSid, method: "POST", body: { body: "General idea" } }));
  const list = await (await notes.onRequestGet(ctx(db, "/api/admin/notes?projectId=p1", { sid: adminSid }))).json();
  assert.deepEqual(list.notes.map((n) => n.body), ["Call back Friday"]);
  const general = await (await notes.onRequestGet(ctx(db, "/api/admin/notes", { sid: adminSid }))).json();
  assert.deepEqual(general.notes.map((n) => n.body), ["General idea"]);

  const ov = await (await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: adminSid }))).json();
  assert.equal(ov.clients[0].noteCount, 1);

  assert.equal((await notes.onRequestDelete(ctx(db, `/api/admin/notes?id=${note.id}`, { sid: clientSid, method: "DELETE" }))).status, 403);
  assert.equal((await notes.onRequestDelete(ctx(db, `/api/admin/notes?id=${note.id}`, { sid: adminSid, method: "DELETE" }))).status, 200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) c FROM admin_notes WHERE project_id='p1'").get().c, 0);
});

test("overview reads the outreach DB when bound, and degrades if it can't be read", async () => {
  const db = makeDb();
  const { adminSid } = await seed(db);
  const empty = { prepare: () => ({ all: async () => ({ results: [] }) }) };
  const bound = await (await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: adminSid, env: { OUTREACH_DB: empty } }))).json();
  assert.equal(bound.outreach.configured, true);
  assert.deepEqual(bound.outreach.pendingDrafts, []);

  const broken = { prepare: () => ({ all: async () => { throw new Error("no such table: leads"); } }) };
  const res = await overview.onRequestGet(ctx(db, "/api/admin/overview", { sid: adminSid, env: { OUTREACH_DB: broken } }));
  assert.equal(res.status, 200);
  assert.match((await res.json()).outreach.error, /could not be read/);
});

test("emails: not configured / key can only send / listed", async () => {
  const db = makeDb();
  const { adminSid } = await seed(db);
  const none = await (await emails.onRequestGet(ctx(db, "/api/admin/emails", { sid: adminSid }))).json();
  assert.equal(none.configured, false);

  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 401 });
    const sendOnly = await (await emails.onRequestGet(ctx(db, "/api/admin/emails", { sid: adminSid, env: { RESEND_API_KEY: "re_x" } }))).json();
    assert.match(sendOnly.note, /only send/);

    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer re_x");
      return new Response(JSON.stringify({ data: [{ id: "e1", to: ["a@b.com"], from: "x", subject: "Hi", last_event: "delivered", created_at: "2026-11-02T10:00:00Z" }] }), { status: 200 });
    };
    const listed = await (await emails.onRequestGet(ctx(db, "/api/admin/emails", { sid: adminSid, env: { RESEND_API_KEY: "re_x" } }))).json();
    assert.equal(listed.emails[0].subject, "Hi");
    assert.equal(listed.emails[0].to, "a@b.com");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("login redirects the owner to /admin/ and clients to the portal; /me flags isAdmin", async () => {
  const db = makeDb();
  const { adminSid, clientSid } = await seed(db);
  const attempt = async (email) => (await login.onRequestPost(ctx(db, "/api/portal/login", { method: "POST", body: { email, password: "correct horse battery" } }))).json();
  assert.equal((await attempt("elombe@swftstudios.com")).redirect, "/admin/");
  assert.equal((await attempt("ELOMBE@swftstudios.com")).redirect, "/admin/");
  assert.equal((await attempt("client@example.com")).redirect, "/portal/dashboard.html");

  assert.equal((await (await me.onRequestGet(ctx(db, "/api/portal/me", { sid: adminSid }))).json()).user.isAdmin, true);
  assert.equal((await (await me.onRequestGet(ctx(db, "/api/portal/me", { sid: clientSid }))).json()).user.isAdmin, false);
});
