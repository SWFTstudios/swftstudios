import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as signup from "../../functions/api/subscribe/index.js";
import * as confirmApi from "../../functions/api/subscribe/confirm.js";
import * as unsubApi from "../../functions/api/subscribe/unsubscribe.js";
import { cleanInterests, unsubscribeUrl } from "../../functions/_lib/subscribers.js";

/** Minimal D1 look-alike over node:sqlite, running the real migrations. */
function makeDb() {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["0001_portal.sql", "0002_admin_notes.sql", "0003_subscribers.sql"]) {
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
const ENV = { RESEND_API_KEY: "re_test", PORTAL_ORIGIN: ORIGIN };
const post = (db, path, body, { origin = ORIGIN, env = ENV } = {}) => ({
  env: { DB: db, ...env },
  request: new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  }),
});

let sent, realFetch;
beforeEach(() => {
  sent = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
    throw new Error("unexpected fetch " + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const tokenFrom = (mail) => mail.text.match(/confirm=([a-f0-9]{48})/)[1];

test("cleanInterests keeps only known topics", () => {
  assert.equal(cleanInterests(["blog", "spam", "videos", "blog"]), "blog,videos");
  assert.equal(cleanInterests("nope"), "");
});

test("sign up → pending + confirm email → confirm → active", async () => {
  const db = makeDb();
  const res = await signup.onRequestPost(post(db, "/api/subscribe", { email: "Fan@Example.com", name: "Ana", interests: ["videos", "blog"] }));
  assert.equal(res.status, 200);
  const row = db.raw.prepare("SELECT * FROM subscribers").get();
  assert.equal(row.email, "fan@example.com");
  assert.equal(row.status, "pending");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], "fan@example.com");
  const token = tokenFrom(sent[0]);
  assert.notEqual(row.confirm_token_hash, token, "token stored hashed");

  const c = await confirmApi.onRequestPost(post(db, "/api/subscribe/confirm", { token }));
  assert.equal(c.status, 200);
  const after = db.raw.prepare("SELECT * FROM subscribers").get();
  assert.equal(after.status, "active");
  assert.equal(after.interests, "videos,blog");
  assert.equal(after.confirm_token_hash, null);

  const again = await confirmApi.onRequestPost(post(db, "/api/subscribe/confirm", { token }));
  assert.equal(again.status, 400, "token is single-use");
});

test("validation, honeypot and cross-origin are rejected", async () => {
  const db = makeDb();
  assert.equal((await signup.onRequestPost(post(db, "/api/subscribe", { email: "bad", interests: ["blog"] }))).status, 400);
  assert.equal((await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: [] }))).status, 400);
  assert.equal((await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: ["blog"] }, { origin: "https://evil.example" }))).status, 403);
  const hp = await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: ["blog"], honeypot: "x" }));
  assert.equal(hp.status, 200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM subscribers").get().n, 0);
  assert.equal(sent.length, 0);
});

test("no storage → 503; no signing secret needed", async () => {
  const ok = await signup.onRequestPost(post(makeDb(), "/api/subscribe", { email: "a@b.co", interests: ["blog"] }, { env: { RESEND_API_KEY: "re_test" } }));
  assert.equal(ok.status, 200);
  const res = await signup.onRequestPost(post(null, "/api/subscribe", { email: "a@b.co", interests: ["blog"] }, { env: {} }));
  assert.equal(res.status, 503);
});

test("repeat sign-ups are throttled and answer the same", async () => {
  const db = makeDb();
  const body = { email: "a@b.co", interests: ["blog"] };
  const r1 = await (await signup.onRequestPost(post(db, "/api/subscribe", body))).json();
  const r2 = await (await signup.onRequestPost(post(db, "/api/subscribe", body))).json();
  assert.deepEqual(r1, r2);
  assert.equal(sent.length, 1, "second email held back by the cooldown");
});

test("active subscriber changing topics stays active until confirmed", async () => {
  const db = makeDb();
  await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: ["blog"] }));
  await confirmApi.onRequestPost(post(db, "/api/subscribe/confirm", { token: tokenFrom(sent[0]) }));
  db.raw.prepare("UPDATE subscribers SET confirm_sent_at = '2000-01-01T00:00:00Z'").run();
  await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: ["products"] }));
  let row = db.raw.prepare("SELECT * FROM subscribers").get();
  assert.equal(row.status, "active");
  assert.equal(row.interests, "blog");
  await confirmApi.onRequestPost(post(db, "/api/subscribe/confirm", { token: tokenFrom(sent[1]) }));
  row = db.raw.prepare("SELECT * FROM subscribers").get();
  assert.equal(row.interests, "products");
});

test("expired confirm link is refused", async () => {
  const db = makeDb();
  await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: ["blog"] }));
  db.raw.prepare("UPDATE subscribers SET confirm_expires_at = '2000-01-01T00:00:00Z'").run();
  const res = await confirmApi.onRequestPost(post(db, "/api/subscribe/confirm", { token: tokenFrom(sent[0]) }));
  assert.equal((await res.json()).reason, "expired");
});

test("unsubscribe by id, works without Origin (one-click)", async () => {
  const db = makeDb();
  await signup.onRequestPost(post(db, "/api/subscribe", { email: "a@b.co", interests: ["blog"] }));
  const { id } = db.raw.prepare("SELECT id FROM subscribers").get();
  assert.match(unsubscribeUrl(ORIGIN, id), /\/account\.html\?unsubscribe=[a-f0-9]{24}$/);
  const bad = await unsubApi.onRequestPost(post(db, "/api/subscribe/unsubscribe", { id: "not-an-id" }));
  assert.equal(bad.status, 400);
  const ok = await unsubApi.onRequestPost(post(db, `/api/subscribe/unsubscribe?id=${id}`, {}, { origin: null }));
  assert.equal(ok.status, 200);
  assert.equal(db.raw.prepare("SELECT status FROM subscribers").get().status, "unsubscribed");
});
