/**
 * Website leads in D1: every form submission is saved before email, the
 * team-email result is recorded, QA submissions are tagged, and only admins
 * can read or update leads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../../functions/_lib/portal-auth.js";
import { createSession } from "../../functions/_lib/portal-db.js";
import { storeLead, markLeadEmailed } from "../../functions/_lib/leads.js";
import * as leadsApi from "../../functions/api/admin/leads.js";
import { onRequestPost as contact } from "../../functions/api/contact.js";

function makeDb() {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["0001_portal.sql", "0011_leads.sql"]) {
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
async function sessions(db) {
  const { salt, hash } = await hashPassword("correct horse battery");
  for (const [id, email] of [["u-admin", "elombe@swftstudios.com"], ["u-client", "client@example.com"]]) {
    db.raw.prepare("INSERT INTO users(id,email,password_hash,password_salt) VALUES (?,?,?,?)").run(id, email, hash, salt);
  }
  return { admin: await createSession(db, "u-admin"), client: await createSession(db, "u-client") };
}
const ctx = (db, path, { sid, method = "GET", body } = {}) => ({
  env: { DB: db },
  request: new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(sid ? { Cookie: `swft_portal_session=${sid}` } : {}), ...(method !== "GET" ? { Origin: ORIGIN } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }),
});

const lead = (over = {}) => ({
  formGroup: "Project Inquiry", formType: "contact",
  person: { name: "Jane Lead", email: "Jane@Example.com", phone: "2015550123" },
  company: { name: "Acme Bakery" }, sourcePage: "/contact.html?service=websites",
  utmSource: "google", utmMedium: "cpc", utmCampaign: "fall",
  formFields: { Name: "Jane Lead", Email: "Jane@Example.com", Challenge: "No inquiries" },
  ...over,
});

test("storeLead saves to D1 before email and records the email result", async () => {
  const db = makeDb();
  const saved = await storeLead({ DB: db }, lead());
  assert.equal(saved.d1, true);
  assert.equal(saved.stored, true);
  assert.equal(saved.isTest, false);
  let row = db.raw.prepare("SELECT * FROM leads WHERE id = ?").get(saved.id);
  assert.equal(row.email, "jane@example.com");
  assert.equal(row.business, "Acme Bakery");
  assert.equal(row.utm_campaign, "fall");
  assert.equal(row.status, "new");
  assert.equal(row.email_delivered, null);
  assert.equal(JSON.parse(row.fields).Challenge, "No inquiries");
  await markLeadEmailed({ DB: db }, saved, false);
  row = db.raw.prepare("SELECT email_delivered FROM leads WHERE id = ?").get(saved.id);
  assert.equal(row.email_delivered, 0);
});

test("[SWFT TEST] leads are tagged in any field", async () => {
  const db = makeDb();
  const a = await storeLead({ DB: db }, lead({ company: { name: "[SWFT TEST] Gym" } }));
  const b = await storeLead({ DB: db }, lead({ formFields: { Notes: "[SWFT TEST - IGNORE]" } }));
  for (const s of [a, b]) {
    const row = db.raw.prepare("SELECT is_test, status FROM leads WHERE id = ?").get(s.id);
    assert.deepEqual({ ...row }, { is_test: 1, status: "test" });
  }
});

test("without D1 or a Sheet, nothing is stored (and it says so)", async () => {
  const saved = await storeLead({}, lead());
  assert.equal(saved.stored, false);
  assert.equal(saved.label, "Email only");
});

test("a missing leads table doesn't break the form", async () => {
  const sql = new DatabaseSync(":memory:");
  const db = { prepare: (q) => ({ bind: () => ({ run: async () => sql.prepare(q).run() }) }) };
  const saved = await storeLead({ DB: db }, lead());
  assert.equal(saved.d1, false);
});

test("contact: email down but D1 saved → accepted, and the lead shows Email failed", async () => {
  const db = makeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  try {
    const res = await contact(ctx(db, "/api/contact", { method: "POST", body: { name: "Jane", email: "jane@example.com", challenge: "Need a site" } }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.stored, true);
    assert.equal(body.emailDelivered, false);
  } finally { globalThis.fetch = realFetch; }
  const row = db.raw.prepare("SELECT email, email_delivered FROM leads").get();
  assert.deepEqual({ ...row }, { email: "jane@example.com", email_delivered: 0 });
});

test("admin leads API: owner only; filters, search and status updates", async () => {
  const db = makeDb();
  const sid = await sessions(db);
  await storeLead({ DB: db }, lead());
  await storeLead({ DB: db }, lead({ person: { name: "Sam", email: "sam@fit.example" }, company: { name: "Fit Studio" }, formGroup: "Growth Audit" }));
  await storeLead({ DB: db }, lead({ company: { name: "[SWFT TEST] QA" } }));

  assert.equal((await leadsApi.onRequestGet(ctx(db, "/api/admin/leads"))).status, 401);
  assert.equal((await leadsApi.onRequestGet(ctx(db, "/api/admin/leads", { sid: sid.client }))).status, 403);

  let d = await (await leadsApi.onRequestGet(ctx(db, "/api/admin/leads", { sid: sid.admin }))).json();
  assert.equal(d.ok, true);
  assert.equal(d.leads.length, 2, "test leads hidden by default");
  assert.equal(d.counts.test, 1);
  d = await (await leadsApi.onRequestGet(ctx(db, "/api/admin/leads?status=all", { sid: sid.admin }))).json();
  assert.equal(d.leads.length, 3);
  d = await (await leadsApi.onRequestGet(ctx(db, "/api/admin/leads?q=fit", { sid: sid.admin }))).json();
  assert.deepEqual(d.leads.map((l) => l.business), ["Fit Studio"]);

  const id = d.leads[0].id;
  const bad = await leadsApi.onRequestPost(ctx(db, "/api/admin/leads", { sid: sid.admin, method: "POST", body: { id, status: "paid" } }));
  assert.equal(bad.status, 400);
  const forbidden = await leadsApi.onRequestPost(ctx(db, "/api/admin/leads", { sid: sid.client, method: "POST", body: { id, status: "won" } }));
  assert.equal(forbidden.status, 403);
  const ok = await leadsApi.onRequestPost(ctx(db, "/api/admin/leads", { sid: sid.admin, method: "POST", body: { id, status: "contacted", notes: "Called Tue" } }));
  assert.equal(ok.status, 200);
  const row = db.raw.prepare("SELECT status, notes FROM leads WHERE id = ?").get(id);
  assert.deepEqual({ ...row }, { status: "contacted", notes: "Called Tue" });
});
