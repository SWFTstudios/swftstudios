import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { consumeInviteToken, createInviteToken, createSession, onboardUser, upsertPaidUser } from "../../functions/_lib/portal-db.js";
import * as onboard from "../../functions/api/portal/onboard.js";
import * as adminProject from "../../functions/api/admin/project.js";

const ORIGIN = "https://www.swftstudios.com";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const PASSWORD = "attacker-chosen-pw";

/** Minimal D1 look-alike over node:sqlite, running the real migrations. */
function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql", "0004_project_progress.sql"]) {
    sql.exec(read(`../../migrations/${f}`));
  }
  const stmt = (query, params = []) => ({
    bind: (...p) => stmt(query, p),
    run: async () => { const r = sql.prepare(query).run(...params); return { meta: { changes: Number(r.changes) } }; },
    first: async () => sql.prepare(query).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...params) }),
  });
  return { prepare: (q) => stmt(q), raw: sql };
}

const ctx = (db, path, { sid, method = "POST", body, env = {} } = {}) => ({
  env: { DB: db, ...env },
  request: new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}), Origin: ORIGIN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }),
});

const post = (db, body, env) => onboard.onRequestPost(ctx(db, "/api/portal/onboard", { body, env }));
const user = (db, email) => db.raw.prepare("SELECT * FROM users WHERE email = ?").get(email);
const sessions = (db) => db.raw.prepare("SELECT COUNT(*) n FROM sessions").get().n;
const tokens = (db, userId) => db.raw.prepare("SELECT COUNT(*) n FROM invite_tokens WHERE user_id = ?").get(userId).n;

/** A paying client as the Stripe webhook leaves them: account, project, no password. */
async function paidStub(db, email = "client@example.com") {
  const { user: u } = await upsertPaidUser(db, { email, stripeCustomerId: "cus_1", tierId: "website-only", checkoutId: "cs_1", status: "paid" });
  return u;
}

// Capture Resend calls instead of hitting the network.
let sent;
const realFetch = globalThis.fetch;
beforeEach(() => {
  sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const RESEND = { RESEND_API_KEY: "re_test" };

test("passwordless account + no token: not signed in, password untouched, invite re-sent", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  const res = await post(db, { email: "client@example.com", password: PASSWORD }, RESEND);
  assert.equal(res.status, 202);
  assert.equal(res.headers.get("Set-Cookie"), null);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "check_email");
  assert.match(data.error, /Check your email for your invite link/);
  assert.equal(user(db, "client@example.com").password_hash, null);
  assert.equal(sessions(db), 0);
  // The fresh invite goes to the account's own address, never to the requester.
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["client@example.com"]);
  assert.equal(tokens(db, stub.id), 1);
  const link = sent[0].html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
  const token = new URL(link).searchParams.get("token");
  assert.ok(token);

  // The emailed link works.
  const ok = await post(db, { email: "client@example.com", password: "the-real-client-pw", token }, RESEND);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("Set-Cookie"), /swft_portal_session=/);
});

test("passwordless account + bogus or other-user token: same neutral answer", async () => {
  const db = makeDb();
  await paidStub(db);
  const res = await post(db, { email: "client@example.com", password: PASSWORD, inviteToken: "not-a-real-token" }, RESEND);
  assert.equal(res.status, 202);
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.equal(user(db, "client@example.com").password_hash, null);
});

test("invite re-sends are rate-limited per account", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  for (let i = 0; i < 4; i++) {
    const res = await post(db, { email: "client@example.com", password: PASSWORD }, RESEND);
    assert.equal(res.status, 202);
    assert.equal((await res.json()).code, "check_email");
  }
  assert.equal(sent.length, 1);
  assert.equal(tokens(db, stub.id), 1);
  // Once the window passes, another one goes out.
  db.raw.prepare("UPDATE invite_tokens SET created_at = datetime('now', '-11 minutes')").run();
  await post(db, { email: "client@example.com", password: PASSWORD }, RESEND);
  assert.equal(sent.length, 2);
});

test("webhook invite counts toward the rate limit; no Resend key means no email but same answer", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  await createInviteToken(db, stub.id); // what the webhook does right after checkout
  await post(db, { email: "client@example.com", password: PASSWORD }, RESEND);
  assert.equal(sent.length, 0);
  const res = await post(db, { email: "other@example.com", password: PASSWORD }, {}); // brand-new account path
  assert.equal(res.status, 200);
  const db2 = makeDb();
  await paidStub(db2);
  const quiet = await post(db2, { email: "client@example.com", password: PASSWORD }, {});
  assert.equal(quiet.status, 202);
  assert.equal(sent.length, 0);
});

test("valid invite token sets the password and signs in", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  const token = await createInviteToken(db, stub.id);
  await createInviteToken(db, stub.id); // a second outstanding link
  const res = await post(db, { email: "client@example.com", password: "the-real-client-pw", inviteToken: token });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Set-Cookie"), /swft_portal_session=/);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.created, true);
  assert.ok(user(db, "client@example.com").password_hash);
  assert.equal(tokens(db, stub.id), 0, "all invite links are spent once a password is set");
});

test("invite token is single-use", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  const token = await createInviteToken(db, stub.id);
  assert.equal(await consumeInviteToken(db, token), stub.id);
  assert.equal(await consumeInviteToken(db, token), null);

  const token2 = await createInviteToken(db, stub.id);
  assert.equal((await post(db, { email: "client@example.com", password: "the-real-client-pw", token: token2 })).status, 200);
  // Replaying the same link after the password is set does not change it.
  const before = user(db, "client@example.com").password_hash;
  const replay = await post(db, { email: "client@example.com", password: PASSWORD, token: token2 });
  assert.equal(replay.status, 409);
  assert.equal(user(db, "client@example.com").password_hash, before);
});

test("expired invite token is rejected and removed", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  const token = await createInviteToken(db, stub.id);
  db.raw.prepare("UPDATE invite_tokens SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
  const res = await post(db, { email: "client@example.com", password: PASSWORD, token }, RESEND);
  assert.equal(res.status, 202);
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.equal(user(db, "client@example.com").password_hash, null);
  assert.equal(await consumeInviteToken(db, token), null);
});

test("onboardUser: stub needs invite; existing password = sign-in; new email = new account", async () => {
  const db = makeDb();
  const stub = await paidStub(db);
  const r1 = await onboardUser(db, { email: "client@example.com", password: PASSWORD });
  assert.equal(r1.code, "invite_required");
  assert.equal(r1.user.id, stub.id);

  const { salt, hash } = await hashPassword("correct horse battery");
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-pw','pw@example.com',?,?)").run(hash, salt);
  assert.equal((await onboardUser(db, { email: "pw@example.com", password: "correct horse battery" })).created, false);
  assert.equal((await onboardUser(db, { email: "pw@example.com", password: PASSWORD })).code, "exists");

  const fresh = await onboardUser(db, { email: "New@Example.com", password: PASSWORD });
  assert.equal(fresh.created, true);
  assert.equal(fresh.user.email, "new@example.com");
});

test("seeded demo client can't be claimed by email alone; admin send_invite issues a working link", async () => {
  const db = makeDb();
  db.raw.exec(read("../../scripts/seed-demo-project.sql"));
  const demo = await post(db, { email: "elombekisala@gmail.com", password: PASSWORD }, RESEND);
  assert.equal(demo.status, 202);
  assert.equal(user(db, "elombekisala@gmail.com").password_hash, null);
  sent = [];

  const { salt, hash } = await hashPassword("correct horse battery");
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-admin','elombe@swftstudios.com',?,?)").run(hash, salt);
  const adminSid = await createSession(db, "u-admin");
  db.raw.prepare("INSERT INTO users(id,email) VALUES ('u-client','client2@example.com')").run();
  const clientSid = await createSession(db, "u-client");
  const call = (sid, body) => adminProject.onRequestPost(ctx(db, "/api/admin/project", { sid, body, env: RESEND }));

  assert.equal((await call(clientSid, { action: "send_invite", projectId: "demo-swft-website" })).status, 403);
  assert.equal((await call(adminSid, { action: "send_invite", projectId: "nope" })).status, 404);

  const res = await call(adminSid, { action: "send_invite", projectId: "demo-swft-website" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.emailed, true);
  assert.deepEqual(sent[0].to, ["elombekisala@gmail.com"]);
  const token = new URL(data.inviteUrl).searchParams.get("token");
  assert.equal(new URL(data.inviteUrl).searchParams.get("email"), "elombekisala@gmail.com");

  const claimed = await post(db, { email: "elombekisala@gmail.com", password: "demo-password-123", token });
  assert.equal(claimed.status, 200);
  assert.equal((await call(adminSid, { action: "send_invite", projectId: "demo-swft-website" })).status, 409);
});
