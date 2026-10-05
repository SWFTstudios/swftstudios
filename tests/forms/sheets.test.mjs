/**
 * Google Sheets lead log + email fallback.
 *   1. The Pages Function handlers: every form appends a row, and when Resend
 *      fails the Sheets script emails hello@ instead. Outbound calls are
 *      intercepted (see harness.mjs); no network, no secrets.
 *   2. The Apps Script itself (scripts/google-sheets-leads.gs), run in a vm
 *      against fake SpreadsheetApp / MailApp objects.
 *
 *   npm run test:forms
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { startHarness } from "./harness.mjs";

const INBOX = "hello@swftstudios.com";
const SECRET = "test-shared-secret";
const SCRIPT_URL = "https://script.google.com/macros/s/TEST/exec";
const visitor = { email: "lead@example.com" };

/* ---------------- handlers ---------------- */

let h;
before(async () => {
  h = await startHarness({ env: { GOOGLE_SHEETS_WEBHOOK_URL: SCRIPT_URL, GOOGLE_SHEETS_SECRET: SECRET } });
});
after(() => h.close());
beforeEach(() => h.reset());

async function post(path, body) {
  const res = await fetch(h.url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const appends = () => h.sheets.filter((s) => s.action === "append");
const notifies = () => h.sheets.filter((s) => s.action === "notify");
const teamEmail = () => h.emails.find((e) => e.to.includes(INBOX));

test("contact form appends a row to the Project Inquiry tab", async () => {
  const r = await post("/api/contact", {
    name: "Jane Lead", email: visitor.email, phone: "2015550123", businessName: "Acme Bakery",
    challenge: "No inquiries", details: "Two locations", sourcePage: "/contact.html",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.stored, true, "a Sheets row counts as stored");
  assert.equal(appends().length, 1);
  const row = appends()[0];
  assert.equal(row.sheet, "Project Inquiry");
  assert.equal(row.secret, SECRET);
  assert.equal(row.fields.Name, "Jane Lead");
  assert.equal(row.fields.Email, visitor.email);
  assert.equal(row.fields.Business, "Acme Bakery");
  assert.equal(row.fields.Challenge, "No inquiries");
  assert.ok(row.fields["Submitted At"], "timestamped");
  assert.equal(row.fields.Form, "contact");
  // Resend still emails hello@, and says where the lead was saved.
  assert.ok(teamEmail());
  assert.match(teamEmail().html, /Saved to/);
  assert.match(teamEmail().html, /Google Sheet/);
  assert.equal(notifies().length, 0, "no fallback email when Resend works");
});

test("growth audit, booking quote and website build each land on their own tab", async () => {
  await post("/api/growth-audit", {
    firstName: "Sam", lastName: "Owner", email: visitor.email, businessName: "Fit Studio",
    website: "https://fit.example", desiredService: "not-sure",
    biggestLeak: "Convert", challenge: "Convert", details: "x",
  });
  await post("/api/book-tier", {
    tierId: "website-only", quoteOnly: true, name: "Pat", email: visitor.email, businessName: "Client Co",
    customization: { goal: "More bookings", addOns: [] },
  });
  await post("/api/build-request", {
    name: "Bo Builder", email: visitor.email, businessName: "Build Co", plan: "One-Time Build",
  });
  assert.deepEqual(appends().map((a) => a.sheet).sort(), ["Growth Audit", "Paid Booking", "Website Build"]);
  for (const a of appends()) {
    assert.ok(a.fields.Email || a.fields["Email"], `${a.sheet} row has the email`);
    assert.ok(a.fields["Submitted At"]);
    for (const v of Object.values(a.fields)) assert.equal(typeof v, "string", `${a.sheet}: every cell is plain text`);
  }
});

test("when Resend fails, the Sheets script emails hello@ and the form still succeeds", async () => {
  h.failResend(10);
  const r = await post("/api/contact", { name: "Fallback Test", email: visitor.email, businessName: "Fallback Co" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.emailDelivered, true, "delivered through the Sheets fallback");
  assert.equal(h.emails.length, 0, "Resend sent nothing");
  assert.equal(notifies().length, 1);
  const n = notifies()[0];
  assert.equal(n.secret, SECRET);
  assert.match(n.subject, /Project inquiry: Fallback Co/);
  assert.match(n.html, /Fallback Test/);
  assert.equal(n.replyTo, visitor.email);
  assert.equal(n.to, undefined, "the recipient is fixed inside the script, never sent by the site");
  assert.equal(appends().length, 1, "the row was still logged");
});

test("if the Sheets script is down but Resend works, the lead is still emailed", async () => {
  h.failSheets(10);
  const r = await post("/api/contact", { name: "Sheet Down", email: visitor.email, businessName: "Down Co" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.stored, false, "nothing was saved to a CRM or sheet");
  assert.ok(teamEmail(), "hello@ still got the email");
});

test("if both Resend and Sheets are down and nothing was saved, the form reports failure", async () => {
  h.failResend(10);
  h.failSheets(10);
  const r = await post("/api/contact", { name: "All Down", email: visitor.email });
  assert.equal(r.status, 503);
  assert.equal(r.body.ok, false);
  assert.match(r.body.error, /hello@swftstudios\.com/);
});

test("without the env vars the Sheets code does nothing", async () => {
  const bare = await startHarness({}); // replaces the fetch interceptor; restored by close()
  try {
    const res = await fetch(bare.url + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Sheets", email: visitor.email }),
    });
    assert.equal(res.status, 200);
    assert.equal(bare.sheets.length, 0);
    assert.ok(bare.emails.find((e) => e.to.includes(INBOX)));
  } finally {
    await bare.close();
  }
});

/* ---------------- Apps Script ---------------- */

function loadScript({ secret = SECRET, spreadsheetId } = {}) {
  const tabs = new Map();
  const mails = [];
  const calls = [];

  class FakeSheet {
    constructor(name) { this.name = name; this.rows = []; this.frozen = 0; }
    getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
    getLastRow() { return this.rows.length; }
    setFrozenRows(n) { this.frozen = n; }
    getRange(row, col, nrows, ncols) {
      const sheet = this;
      return {
        getValues() {
          return Array.from({ length: nrows }, (_, i) =>
            Array.from({ length: ncols }, (_, j) => (sheet.rows[row - 1 + i] || [])[col - 1 + j] ?? ""));
        },
        setValues(vals) {
          calls.push(["setValues", sheet.name, row, vals[0].length]);
          vals.forEach((v, i) => {
            const r = (sheet.rows[row - 1 + i] = sheet.rows[row - 1 + i] || []);
            v.forEach((x, j) => { r[col - 1 + j] = x; });
          });
        },
        setNumberFormat(f) { calls.push(["setNumberFormat", sheet.name, row, f]); },
        setFontWeight() {},
      };
    }
  }
  const ss = {
    getSheetByName: (n) => tabs.get(n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); tabs.set(n, s); return s; },
  };
  const props = { SHARED_SECRET: secret, ...(spreadsheetId ? { SPREADSHEET_ID: spreadsheetId } : {}) };
  const sandbox = {
    console,
    JSON, Object, String, Array, Number, Math,
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    MailApp: { sendEmail: (m) => mails.push(m) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL("../../scripts/google-sheets-leads.gs", import.meta.url), "utf8"), sandbox);
  const run = (payload) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
  return { run, tabs, mails, calls, doGet: () => JSON.parse(sandbox.doGet().text) };
}

test("script: rejects a wrong or missing secret and writes nothing", () => {
  const s = loadScript();
  assert.deepEqual(s.run({ secret: "nope", action: "append", sheet: "Growth Audit", fields: { Name: "x" } }), { ok: false, error: "unauthorized" });
  assert.deepEqual(s.run({ action: "append", sheet: "Growth Audit", fields: { Name: "x" } }), { ok: false, error: "unauthorized" });
  assert.deepEqual(s.run({ secret: "", action: "notify", subject: "x" }), { ok: false, error: "unauthorized" });
  assert.equal(s.tabs.size, 0);
  assert.equal(s.mails.length, 0);
});

test("script: creates the tab with a header row, appends rows, and adds columns for new fields", () => {
  const s = loadScript();
  assert.deepEqual(s.run({ secret: SECRET, action: "append", sheet: "Growth Audit", fields: { "Submitted At": "t1", Name: "Ann", Email: "a@x.co" } }), { ok: true });
  const tab = s.tabs.get("Growth Audit");
  assert.deepEqual(tab.rows[0], ["Submitted At", "Name", "Email"]);
  assert.deepEqual(tab.rows[1], ["t1", "Ann", "a@x.co"]);
  assert.equal(tab.frozen, 1);

  // Second lead: columns in a different order plus one new field.
  s.run({ secret: SECRET, action: "append", sheet: "Growth Audit", fields: { Email: "b@x.co", Name: "Bo", "Submitted At": "t2", Instagram: "@bo" } });
  assert.deepEqual(tab.rows[0], ["Submitted At", "Name", "Email", "Instagram"]);
  assert.deepEqual(tab.rows[2], ["t2", "Bo", "b@x.co", "@bo"]);
  // The first row keeps its alignment (no Instagram value yet).
  assert.deepEqual(tab.rows[1].slice(0, 3), ["t1", "Ann", "a@x.co"]);
});

test("script: values are stored as plain text, so formulas never run", () => {
  const s = loadScript();
  s.run({ secret: SECRET, action: "append", sheet: "Project Inquiry", fields: { Name: "=HYPERLINK(\"http://evil.example\",\"x\")", Phone: "+1 (201) 555-0123", Zip: "07302" } });
  const idx = s.calls.findIndex((c) => c[0] === "setNumberFormat" && c[3] === "@");
  assert.ok(idx >= 0, "the row is formatted as plain text");
  const dataWrite = s.calls.findIndex((c, i) => c[0] === "setValues" && c[2] === 2);
  assert.ok(idx < dataWrite, "plain-text format is applied before the values are written");
  const row = s.tabs.get("Project Inquiry").rows[1];
  assert.equal(row[0], "=HYPERLINK(\"http://evil.example\",\"x\")");
  assert.equal(row[2], "07302", "leading zeros survive");
});

test("script: only the four form tabs are writable", () => {
  const s = loadScript();
  assert.deepEqual(s.run({ secret: SECRET, action: "append", sheet: "Anything Else", fields: { a: "b" } }), { ok: false, error: "unknown sheet" });
  assert.deepEqual(s.run({ secret: SECRET, action: "append", sheet: "Growth Audit", fields: {} }), { ok: false, error: "no fields" });
  assert.deepEqual(s.run({ secret: SECRET, action: "delete" }), { ok: false, error: "unknown action" });
  assert.equal(s.tabs.size, 0);
});

test("script: notify emails only hello@swftstudios.com, whatever the request says", () => {
  const s = loadScript();
  assert.deepEqual(s.run({
    secret: SECRET, action: "notify", to: "attacker@evil.example", cc: "attacker@evil.example",
    subject: "Project inquiry: Acme\r\nBcc: attacker@evil.example", html: "<p>lead</p>", replyTo: "lead@example.com",
  }), { ok: true });
  assert.equal(s.mails.length, 1);
  const m = s.mails[0];
  assert.equal(m.to, INBOX);
  assert.equal(m.cc, undefined);
  assert.equal(m.replyTo, "lead@example.com");
  assert.doesNotMatch(m.subject, /[\r\n]/);
  assert.equal(m.htmlBody, "<p>lead</p>");
  // A bad reply-to falls back to the inbox rather than being used.
  s.run({ secret: SECRET, action: "notify", subject: "s", html: "h", replyTo: "a@b.co, attacker@evil.example" });
  assert.equal(s.mails[1].replyTo, INBOX);
});

test("script: a reachable deployment answers GET without revealing anything", () => {
  assert.deepEqual(loadScript().doGet(), { ok: true, service: "swft-leads" });
});

test("script: an unset SHARED_SECRET rejects everything (including an empty secret)", () => {
  const s = loadScript({ secret: undefined });
  assert.deepEqual(s.run({ secret: "", action: "append", sheet: "Growth Audit", fields: { a: "b" } }), { ok: false, error: "unauthorized" });
  assert.equal(s.tabs.size, 0);
});
