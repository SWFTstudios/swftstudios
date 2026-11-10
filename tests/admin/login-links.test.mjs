import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession, upsertPaidUser } from "../../functions/_lib/portal-db.js";
import * as onboard from "../../functions/api/portal/onboard.js";
import * as adminProject from "../../functions/api/admin/project.js";

const ORIGIN = "https://www.swftstudios.com";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

function makeDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql", "0004_project_progress.sql", "0009_email_prefs_notifications.sql"]) {
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

const ENV = { RESEND_API_KEY: "re_test", PORTAL_ORIGIN: ORIGIN };
const req = (db, path, body, { sid, env = ENV, origin = ORIGIN } = {}) => ({
  env: { DB: db, ...env },
  request: new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}) },
    body: JSON.stringify(body),
  }),
});
const signUp = (db, body, opts) => onboard.onRequestPost(req(db, "/api/portal/onboard", body, opts));
const tokenFrom = (mail) => new URL(mail.html.match(/href="([^"]+onboard\.html[^"]+)"/)[1].replace(/&amp;/g, "&")).searchParams.get("token");

let mails, realFetch;
beforeEach(() => {
  mails = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === "https://api.resend.com/emails") { mails.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

async function paidClient(db, email = "tim@example.com") {
  const { user, project } = await upsertPaidUser(db, { email, tierId: "custom", checkoutId: `cs_${email}`, status: "paid" });
  return { user, project };
}

test("an account SWFT created can't be claimed by typing its email; its owner gets a link instead", async () => {
  const db = makeDb();
  const { user } = await paidClient(db);

  const r = await signUp(db, { email: "tim@example.com", password: "attacker-password-1" });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "needs_link");
  assert.equal(r.headers.get("Set-Cookie"), null, "no session for the attacker");
  assert.equal(db.raw.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id).password_hash, null);
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ["tim@example.com"]);

  // Repeats inside the cooldown don't flood the inbox (same answer either way).
  const again = await signUp(db, { email: "TIM@example.com", password: "attacker-password-2" });
  assert.equal((await again.json()).code, "needs_link");
  assert.equal(mails.length, 1);

  // Tim uses the emailed link: password set, signed in.
  const ok = await signUp(db, { email: "tim@example.com", password: "tims-own-password", inviteToken: tokenFrom(mails[0]) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).created, true);
  assert.match(ok.headers.get("Set-Cookie"), /swft_portal_session=/);

  // The link worked once; now the account needs Tim's password.
  const reuse = await signUp(db, { email: "tim@example.com", password: "attacker-password-3", inviteToken: tokenFrom(mails[0]) });
  assert.equal((await reuse.json()).code, "exists");
});

test("a brand-new email can still create an account, and a wrong password on an existing one is refused", async () => {
  const db = makeDb();
  const r = await signUp(db, { email: "new@example.com", password: "a-good-password" });
  assert.equal(r.status, 200);
  assert.equal(mails.length, 0);
  assert.equal((await (await signUp(db, { email: "new@example.com", password: "wrong-password-x" })).json()).code, "exists");
  assert.equal((await signUp(db, { email: "new@example.com", password: "a-good-password" })).status, 200);
});

test("expired or made-up links don't set a password", async () => {
  const db = makeDb();
  const { user } = await paidClient(db);
  await signUp(db, { email: "tim@example.com", password: "whatever-password" });
  const token = tokenFrom(mails[0]);
  db.raw.prepare("UPDATE invite_tokens SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await (await signUp(db, { email: "tim@example.com", password: "tims-own-password", inviteToken: token })).json()).code, "needs_link");
  assert.equal((await (await signUp(db, { email: "tim@example.com", password: "tims-own-password", inviteToken: "f".repeat(48) })).json()).code, "needs_link");
  assert.equal(db.raw.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id).password_hash, null);
});

test("admin Send login link emails a one-time link, replaces older ones, and doubles as a password reset", async () => {
  const db = makeDb();
  const { salt, hash } = await hashPassword("owner-password-1");
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-admin','elombe@swftstudios.com',?,?)").run(hash, salt);
  db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES ('u-other','other@example.com',?,?)").run(hash, salt);
  const admin = await createSession(db, "u-admin");
  const other = await createSession(db, "u-other");
  const { user, project } = await paidClient(db);
  const send = (opts = {}) => adminProject.onRequestPost(req(db, "/api/admin/project", { action: "send_login_link", projectId: project.id }, { sid: admin, ...opts }));

  const r = await send();
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.emailed, true);
  assert.equal(d.email, "tim@example.com");
  assert.equal(d.hasPassword, false);
  assert.ok(d.url.startsWith(`${ORIGIN}/portal/onboard.html?token=`));
  assert.deepEqual(mails[0].to, ["tim@example.com"]);
  assert.equal(new URL(d.url).searchParams.get("token"), tokenFrom(mails[0]));

  // A second link replaces the first.
  const second = await (await send()).json();
  const firstToken = new URL(d.url).searchParams.get("token");
  assert.equal((await (await signUp(db, { email: "tim@example.com", password: "tims-own-password", inviteToken: firstToken })).json()).code, "needs_link");
  assert.equal((await signUp(db, { email: "tim@example.com", password: "tims-own-password", inviteToken: new URL(second.url).searchParams.get("token") })).status, 200);

  // Forgot password: a new link lets Tim choose a new one.
  const reset = await (await send()).json();
  assert.equal(reset.hasPassword, true);
  assert.equal((await signUp(db, { email: "tim@example.com", password: "brand-new-password", inviteToken: new URL(reset.url).searchParams.get("token") })).status, 200);
  assert.equal((await signUp(db, { email: "tim@example.com", password: "brand-new-password" })).status, 200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM users WHERE id = ?").get(user.id).n, 1);

  // Without Resend the link is still returned to copy by hand.
  const noMail = await (await send({ env: { PORTAL_ORIGIN: ORIGIN } })).json();
  assert.equal(noMail.emailed, false);
  assert.ok(noMail.url);

  assert.equal((await send({ sid: other })).status, 403);
  assert.equal((await send({ origin: "https://evil.example" })).status, 403);
  assert.equal((await adminProject.onRequestPost(req(db, "/api/admin/project", { action: "send_login_link", projectId: "nope" }, { sid: admin }))).status, 404);
});
