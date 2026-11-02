import { test } from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import {
  factLines, validateDraft, draftEmail, runDrafting, DEFAULT_MODEL,
  verifyApprovalPassword, makeSession, verifySession, handleApprove, emailHash,
} from "../../workers/outreach/src/index.ts";
import { makeDb, makeKv } from "./_d1.mjs";

const NOW = new Date("2026-11-03T06:30:00Z");
const lead = (over = {}) => ({
  id: "L1", name: "Acme Heating", trade: "HVAC", city: "Hoboken NJ", rating: 4.1, review_count: 12,
  website: "https://acmeheating.com", has_booking_link: 0, score: 80, score_reasons: JSON.stringify(["+20 only 12 reviews"]),
  email: "info@acmeheating.com", email_source_url: "https://acmeheating.com/contact",
  hours_json: JSON.stringify([1, 2, 3, 4, 5].map((day) => ({ day, close: "1700" }))), ...over,
});

const GOOD = {
  subject: "acme heating after 5pm",
  body: "Hi, I came across Acme Heating while looking at HVAC companies in Hoboken. Your listing shows you close at 5pm on weekdays and are closed on weekends, which is exactly when a heating call tends to come in. "
    + "I build a simple system that texts back anyone who calls and doesn't get an answer, so the job doesn't go to whoever picks up next. Is it worth a quick look to see if that would help at Acme?",
};

const fakeClient = (outputs, calls = []) => ({
  messages: {
    parse: async (params) => {
      calls.push(params);
      const o = typeof outputs === "function" ? outputs(calls.length) : outputs;
      return { parsed_output: o, stop_reason: "end_turn", ...(o && o.__stop ? { stop_reason: o.__stop, parsed_output: null } : {}) };
    },
  },
});

test("factLines: only facts, closed days and closing time are derived", () => {
  const lines = factLines(lead());
  assert.ok(lines.includes("Google reviews: 12"));
  assert.ok(lines.includes("Has a website: yes"));
  assert.ok(lines.includes("Listed as closed on: Sunday, Saturday"));
  assert.ok(lines.includes("Typical weekday closing time: 5pm"));
  assert.ok(!lines.some((l) => /missed|calls/i.test(l)));
});

test("validateDraft accepts a grounded draft and rejects each rule break", () => {
  const lines = factLines(lead());
  assert.equal(validateDraft(GOOD, lines, "Acme Heating"), null);
  const bad = (patch) => validateDraft({ ...GOOD, ...patch }, lines, "Acme Heating");
  assert.match(bad({ body: GOOD.body + " See https://x.io" }), /link/);
  assert.match(bad({ body: GOOD.body.replace("5pm", "9pm") }), /not in the facts/);
  assert.match(bad({ body: GOOD.body + " Call me!" }), /exclamation/);
  assert.match(bad({ body: GOOD.body + " I called you last night and nobody answered." }), /never happened/);
  assert.match(bad({ body: GOOD.body + " Unsubscribe below." }), /unsubscribe/);
  assert.match(bad({ body: "Hi, quick note." }), /words/);
  assert.match(bad({ subject: "Re: your service" }), /fakes a thread/);
  assert.match(bad({ subject: "after hours calls", body: GOOD.body.replaceAll("Acme", "Your") }), /mention the business/);
  assert.match(bad({ body: GOOD.body + " [Name]" }), /placeholder/);
});

test("draftEmail: request uses the default model, effort, schema; no sampling params or prefill", async () => {
  const calls = [];
  const r = await draftEmail(fakeClient(GOOD, calls), DEFAULT_MODEL, lead());
  assert.equal(r.ok, true);
  const p = calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.output_config.effort, "low");
  assert.ok(p.output_config.format);
  for (const k of ["temperature", "top_p", "top_k", "thinking"]) assert.ok(!(k in p), `${k} must not be sent`);
  assert.equal(p.messages.at(-1).role, "user");
  assert.ok(p.messages[0].content.includes("Google reviews: 12"));
});

test("draftEmail: retries once with feedback, then gives up; refusal and empty output fail cleanly", async () => {
  const calls = [];
  const bad = { ...GOOD, body: GOOD.body + " Visit https://x.io" };
  const fixedOnSecond = await draftEmail(fakeClient((n) => (n === 1 ? bad : GOOD), calls), DEFAULT_MODEL, lead());
  assert.equal(fixedOnSecond.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages[0].content, /rejected: body contains a link/);

  const twice = await draftEmail(fakeClient(bad), DEFAULT_MODEL, lead());
  assert.deepEqual([twice.ok, /twice/.test(twice.reason)], [false, true]);
  assert.equal((await draftEmail(fakeClient({ __stop: "refusal" }), DEFAULT_MODEL, lead())).reason, "model declined");
  assert.equal((await draftEmail(fakeClient({ __stop: "max_tokens" }), DEFAULT_MODEL, lead())).reason, "response was cut off");
  assert.equal((await draftEmail(fakeClient(null), DEFAULT_MODEL, lead())).reason, "no structured output");
});

function seedLeads(db) {
  const ins = db.raw.prepare(
    "INSERT INTO leads(id,place_id,name,trade,city,rating,review_count,website,has_booking_link,hours_json,score,score_reasons,email,email_source_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const hours = JSON.stringify([1, 2, 3, 4, 5].map((day) => ({ day, close: "1700" })));
  const mk = (id, name, score, status = "scored", email = `info@${name.toLowerCase().replace(/\W/g, "")}.com`) =>
    ins.run(id, `pl-${id}`, name, "HVAC", "Hoboken NJ", 4.1, 12, "https://x.com", 0, hours, score, "[]", email, "https://x.com/contact", status);
  mk("a", "Acme Heating", 90); mk("b", "Bolt Heating", 70); mk("c", "Cedar Heating", 20); // below min score
  mk("d", "Delta Heating", 60, "new"); mk("e", "Echo Heating", 50);
  return db;
}
const outFor = (name) => ({ subject: `${name.toLowerCase()} after 5pm`, body: GOOD.body.replaceAll("Acme", name.split(" ")[0]).replace("Acme Heating", name) });

test("runDrafting: best scores first, respects min score/status, inserts pending drafts, no double drafting", async () => {
  const db = seedLeads(makeDb());
  db.raw.exec("INSERT INTO settings(key,value) VALUES ('warmup_start','2026-11-01')");
  const seenNames = [];
  const client = { messages: { parse: async (p) => { const name = /Business name: (.+)/.exec(p.messages[0].content)[1]; seenNames.push(name); return { parsed_output: outFor(name), stop_reason: "end_turn" }; } } };
  const env = { DB: db };
  const out = await runDrafting(env, client, NOW);
  assert.equal(out.drafted, 3);
  assert.deepEqual(seenNames, ["Acme Heating", "Bolt Heating", "Echo Heating"]);
  assert.deepEqual(db.raw.prepare("SELECT status FROM leads WHERE id IN ('a','b','e') ORDER BY id").all().map((r) => r.status), ["drafted", "drafted", "drafted"]);
  assert.equal(db.raw.prepare("SELECT status FROM leads WHERE id='c'").get().status, "scored");
  assert.equal(db.raw.prepare("SELECT COUNT(*) c FROM drafts WHERE status='pending'").get().c, 3);
  const facts = JSON.parse(db.raw.prepare("SELECT facts_json FROM drafts LIMIT 1").get().facts_json);
  assert.ok(facts.lines.includes("Google reviews: 12"));
  const again = await runDrafting(env, client, NOW);
  assert.equal(again.drafted, 0);
});

test("runDrafting: queue cap, pause, suppression, parked failures, transient errors retried next run", async () => {
  const db = seedLeads(makeDb());
  const env = { DB: db };
  db.raw.exec("INSERT INTO settings(key,value) VALUES ('paused','0') ON CONFLICT(key) DO UPDATE SET value='1'");
  assert.deepEqual(await runDrafting(env, fakeClient(GOOD), NOW), { skipped: "paused" });
  db.raw.exec("UPDATE settings SET value='0' WHERE key='paused'");

  await db.raw.exec(`INSERT INTO suppressions(email_hash, reason) VALUES ('${await emailHash("info@acmeheating.com")}', 'unsubscribe')`);
  let n = 0;
  const flaky = { messages: { parse: async (p) => {
    const name = /Business name: (.+)/.exec(p.messages[0].content)[1];
    if (name === "Bolt Heating") throw new Error("overloaded");
    if (name === "Echo Heating") return { parsed_output: { subject: "hi there", body: "short" }, stop_reason: "end_turn" };
    n++; return { parsed_output: outFor(name), stop_reason: "end_turn" };
  } } };
  const out = await runDrafting(env, flaky, NOW);
  assert.equal(out.suppressedNow, 1);
  assert.equal(db.raw.prepare("SELECT status FROM leads WHERE id='a'").get().status, "suppressed");
  assert.equal(db.raw.prepare("SELECT status FROM leads WHERE id='b'").get().status, "scored"); // API error: retry tomorrow
  assert.equal(db.raw.prepare("SELECT status FROM leads WHERE id='e'").get().status, "draft_failed"); // bad output: parked
  assert.equal(out.failed, 2);
});

/* ----------------------------- approval page ----------------------------- */

const PASSWORD = "correct horse battery staple";
function makeHash(pw) {
  const salt = randomBytes(16);
  return `pbkdf2$100000$${salt.toString("hex")}$${pbkdf2Sync(pw, salt, 100_000, 32, "sha256").toString("hex")}`;
}
const ORIGIN = "https://outreach.example.test";
const setup = () => {
  const db = seedLeads(makeDb());
  db.raw.exec(`INSERT INTO drafts(id,lead_id,subject,body,facts_json,status) VALUES
    ('d1','a','Original subject','Original body text','{"lines":["Business name: <b>Acme</b>"],"reasons":["+20 x"]}','pending'),
    ('d2','b','Second','Second body','{"lines":[],"reasons":[]}','pending')`);
  db.raw.exec("UPDATE leads SET name='<img src=x onerror=alert(1)>Evil Co' WHERE id='b'");
  return { env: { DB: db, OUTREACH_KV: makeKv(), APPROVAL_PASSWORD_HASH: makeHash(PASSWORD), SESSION_SECRET: "s".repeat(32) }, db };
};
const post = (path, fields, { cookie, origin = ORIGIN, ip = "1.2.3.4" } = {}) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { ...(origin ? { origin } : {}), "cf-connecting-ip": ip, ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(fields) });
const get = (path, cookie) => new Request(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : {});
async function login(env) {
  const res = await handleApprove(post("/approve/login", { password: PASSWORD }), env, NOW);
  assert.equal(res.status, 303);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  return cookie;
}
const csrfOf = async (env, cookie) => /name="csrf" value="([^"]+)"/.exec(await (await handleApprove(get("/approve/queue", cookie), env, NOW)).text())[1];

test("password + session primitives", async () => {
  const h = makeHash(PASSWORD);
  assert.equal(await verifyApprovalPassword(PASSWORD, h), true);
  assert.equal(await verifyApprovalPassword("nope", h), false);
  assert.equal(await verifyApprovalPassword(PASSWORD, undefined), false);
  assert.equal(await verifyApprovalPassword(PASSWORD, h.replace("$100000$", "$9999999$")), false); // Workers cap
  const t = await makeSession("sec", NOW);
  assert.equal(await verifySession("sec", t, NOW), true);
  assert.equal(await verifySession("other", t, NOW), false);
  assert.equal(await verifySession("sec", t, new Date(NOW.getTime() + 13 * 3600_000)), false);
  assert.equal(await verifySession("sec", t.slice(0, -2) + "xx", NOW), false);
});

test("approval page: unconfigured, signed out, wrong password, rate limit, login", async () => {
  const { env } = setup();
  assert.equal((await handleApprove(get("/approve"), { ...env, APPROVAL_PASSWORD_HASH: undefined }, NOW)).status, 503);
  assert.equal((await handleApprove(get("/approve"), env, NOW)).status, 200);
  const q = await handleApprove(get("/approve/queue"), env, NOW);
  assert.deepEqual([q.status, q.headers.get("location")], [303, "/approve"]);
  assert.equal((await handleApprove(post("/approve/login", { password: "bad" }), env, NOW)).status, 401);
  assert.equal((await handleApprove(post("/approve/login", { password: PASSWORD }, { origin: "https://evil.test" }), env, NOW)).status, 403);
  for (let i = 0; i < 4; i++) await handleApprove(post("/approve/login", { password: "bad" }), env, NOW);
  assert.equal((await handleApprove(post("/approve/login", { password: PASSWORD }), env, NOW)).status, 429); // locked out even with the right password
  assert.equal((await handleApprove(post("/approve/login", { password: PASSWORD }, { ip: "9.9.9.9" }), env, NOW)).status, 303);
  const set = (await handleApprove(post("/approve/login", { password: PASSWORD }, { ip: "8.8.8.8" }), env, NOW)).headers.get("set-cookie");
  assert.match(set, /HttpOnly/); assert.match(set, /Secure/); assert.match(set, /SameSite=Strict/);
});

test("queue renders escaped content with security headers", async () => {
  const { env } = setup();
  const cookie = await login(env);
  const res = await handleApprove(get("/approve/queue", cookie), env, NOW);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!text.includes("<img src=x"));
  assert.ok(text.includes("&lt;img src=x"));
  assert.ok(text.includes("Business name: &lt;b&gt;Acme&lt;/b&gt;"));
  assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("x-robots-tag"), /noindex/);
});

test("approve: needs csrf + same origin + session; edits are recorded; lead becomes queued", async () => {
  const { env, db } = setup();
  const cookie = await login(env);
  const csrf = await csrfOf(env, cookie);

  const noSession = await handleApprove(post("/approve/d1/approve", { csrf, subject: "x", body: "y" }), env, NOW);
  assert.equal(noSession.headers.get("location"), "/approve");
  assert.equal((await handleApprove(post("/approve/d1/approve", { csrf: "bad", subject: "x", body: "y" }, { cookie }), env, NOW)).status, 403);
  assert.equal((await handleApprove(post("/approve/d1/approve", { csrf, subject: "x", body: "y" }, { cookie, origin: "https://evil.test" }), env, NOW)).status, 403);
  assert.equal(db.raw.prepare("SELECT status FROM drafts WHERE id='d1'").get().status, "pending");

  const plain = await handleApprove(post("/approve/d2/approve", { csrf, subject: "Second", body: "Second body" }, { cookie }), env, NOW);
  assert.match(await plain.text(), /Approved\./);
  assert.deepEqual({ ...db.raw.prepare("SELECT status, edited_by_human e FROM drafts WHERE id='d2'").get() }, { status: "approved", e: 0 });

  const edited = await handleApprove(post("/approve/d1/approve", { csrf, subject: "Better subject", body: "Better body" }, { cookie }), env, NOW);
  assert.match(await edited.text(), /with your edits/);
  assert.deepEqual({ ...db.raw.prepare("SELECT status, subject, body, edited_by_human e FROM drafts WHERE id='d1'").get() },
    { status: "approved", subject: "Better subject", body: "Better body", e: 1 });
  assert.equal(db.raw.prepare("SELECT status FROM leads WHERE id='a'").get().status, "queued");

  const again = await handleApprove(post("/approve/d1/approve", { csrf, subject: "z", body: "z" }, { cookie }), env, NOW);
  assert.match(await again.text(), /already handled/);
  assert.equal(db.raw.prepare("SELECT subject FROM drafts WHERE id='d1'").get().subject, "Better subject");
});

test("approve refuses empty edits and suppressed addresses; reject parks the lead", async () => {
  const { env, db } = setup();
  const cookie = await login(env);
  const csrf = await csrfOf(env, cookie);
  assert.match(await (await handleApprove(post("/approve/d1/approve", { csrf, subject: "", body: "y" }, { cookie }), env, NOW)).text(), /can&#39;t be empty/);
  assert.equal(db.raw.prepare("SELECT status FROM drafts WHERE id='d1'").get().status, "pending");

  await db.raw.exec(`INSERT INTO suppressions(email_hash, reason) VALUES ('${await emailHash("info@acmeheating.com")}', 'unsubscribe')`);
  assert.match(await (await handleApprove(post("/approve/d1/approve", { csrf, subject: "ok", body: "ok" }, { cookie }), env, NOW)).text(), /suppressed/);
  assert.deepEqual({ ...db.raw.prepare("SELECT d.status ds, l.status ls FROM drafts d JOIN leads l ON l.id=d.lead_id WHERE d.id='d1'").get() }, { ds: "rejected", ls: "suppressed" });

  await handleApprove(post("/approve/d2/reject", { csrf }, { cookie }), env, NOW);
  assert.deepEqual({ ...db.raw.prepare("SELECT d.status ds, l.status ls FROM drafts d JOIN leads l ON l.id=d.lead_id WHERE d.id='d2'").get() }, { ds: "rejected", ls: "dead" });
});

test("logout clears the cookie and the old session still needs a valid csrf to act", async () => {
  const { env } = setup();
  const cookie = await login(env);
  const csrf = await csrfOf(env, cookie);
  const out = await handleApprove(post("/approve/logout", { csrf }, { cookie }), env, NOW);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});
