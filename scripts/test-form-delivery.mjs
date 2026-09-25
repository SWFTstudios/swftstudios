#!/usr/bin/env node
/**
 * Offline tests for SWFT form delivery (no network, no secrets, no Stripe charges).
 * Runs the real Pages Function handlers against mocked Resend + Airtable APIs.
 *
 *   node scripts/test-form-delivery.mjs
 */
import assert from "node:assert/strict";
import { onRequestPost as bookTier } from "../functions/api/book-tier.js";
import { onRequestPost as contact } from "../functions/api/contact.js";
import { onRequestPost as growthAudit } from "../functions/api/growth-audit.js";
import { onRequestPost as buildRequest } from "../functions/api/build-request.js";
import { onRequestGet as formHealth } from "../functions/api/form-health.js";

/* ---------------- mock upstreams ---------------- */
let world;
function resetWorld({ resend = "ok", airtable = "ok" } = {}) {
  world = {
    resend,            // "ok" | "down" (500) | "forbidden" (403 domain) | "noid" (200 without id)
    airtable,          // "ok" | "down" (503) | "unauthorized" (401)
    emails: [],        // accepted sends
    resendKeys: new Map(),
    resendCalls: 0,
    airtableRows: {},  // table -> [{id, fields}]
    airtableCalls: 0,
    stripeCalls: 0,
    otherCalls: [],
  };
}

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

let recSeq = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = (init.method || "GET").toUpperCase();

  if (url.hostname === "api.resend.com") {
    world.resendCalls++;
    if (url.pathname === "/domains") {
      return jsonRes({ data: [{ name: "swftstudios.com", status: "verified" }] });
    }
    if (world.resend === "down") return jsonRes({ statusCode: 500, name: "internal_server_error", message: "boom" }, 500);
    if (world.resend === "forbidden") {
      return jsonRes({ statusCode: 403, name: "validation_error", message: "The swftstudios.com domain is not verified." }, 403);
    }
    if (world.resend === "noid") return jsonRes({}, 200);
    const key = init.headers?.["Idempotency-Key"];
    const body = init.body;
    if (key && world.resendKeys.has(key)) {
      if (world.resendKeys.get(key).body !== body) {
        return jsonRes({ statusCode: 409, name: "invalid_idempotent_request", message: "different payload" }, 409);
      }
      return jsonRes({ id: world.resendKeys.get(key).id });
    }
    const id = `email_${world.emails.length + 1}`;
    if (key) world.resendKeys.set(key, { id, body });
    world.emails.push({ key, ...JSON.parse(body) });
    return jsonRes({ id });
  }

  if (url.hostname === "api.airtable.com") {
    world.airtableCalls++;
    if (world.airtable === "unauthorized") {
      return jsonRes({ error: { type: "AUTHENTICATION_REQUIRED", message: "Authentication required" } }, 401);
    }
    if (world.airtable === "down") return jsonRes({ error: { type: "SERVICE_UNAVAILABLE" } }, 503);
    const table = decodeURIComponent(url.pathname.split("/")[3]);
    const rows = (world.airtableRows[table] ||= []);
    if (method === "POST") {
      const { records } = JSON.parse(init.body);
      const id = `rec${String(++recSeq).padStart(14, "0")}`;
      rows.push({ id, fields: records[0].fields });
      return jsonRes({ records: [{ id, fields: records[0].fields }] });
    }
    const formula = url.searchParams.get("filterByFormula") || "";
    const find = formula.match(/^FIND\('(.+?)', \{(.+?)\} & ''\) > 0$/);
    const eq = formula.match(/^(?:LOWER\()?\{(.+?)\}\)? = '(.+)'$/);
    let match = null;
    if (find) match = rows.find((r) => String(r.fields[find[2]] || "").includes(find[1]));
    else if (eq) match = rows.find((r) => String(r.fields[eq[1]] || "").toLowerCase() === eq[2].toLowerCase());
    else if (!formula) match = rows[0];
    return jsonRes({ records: match ? [{ id: match.id, fields: match.fields }] : [] });
  }

  if (url.hostname === "api.stripe.com") {
    world.stripeCalls++;
    throw new Error("Stripe must never be called in these tests");
  }
  world.otherCalls.push(url.href);
  throw new Error(`Unexpected fetch ${url.href}`);
};

/* ---------------- helpers ---------------- */
const ENV = { RESEND_API_KEY: "re_test_key_123456", AIRTABLE_TOKEN: "patTESTTOKEN.123456789" };
const logs = [];
const origError = console.error;
const origLog = console.log;
console.error = (...a) => logs.push(a.join(" "));
console.log = (...a) => logs.push(a.join(" "));

async function call(handler, body, env = ENV, host = "https://swftstudios.com") {
  const request = new Request(`${host}/api/x`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handler({ request, env });
  return { status: res.status, body: await res.json() };
}

const person = {
  name: "SWFT Test Customer",
  email: "form-test@example.com",
  phone: "555-0100",
  businessName: "SWFT QA Test Business",
  website: "https://example.com",
};

const TIERS = ["gbp-refresh", "website-only", "website-content-half", "website-content-full", "content-growth-retainer", "full-growth-partner"];
const ADDONS_BY_TIER = {
  "gbp-refresh": [{ id: "location-profiles", quantity: 2 }],
  "website-only": [{ id: "extra-pages", quantity: 3 }, { id: "multilingual", quantity: 1 }],
  "website-content-half": [{ id: "extra-reels", quantity: 2 }],
  "website-content-full": [{ id: "testimonials", quantity: 1 }],
  "content-growth-retainer": [{ id: "social-posting", quantity: 1 }],
  "full-growth-partner": [{ id: "campaign-extra", quantity: 2 }],
};

function bookBody(tierId, addOns = [], extra = {}) {
  return {
    ...person,
    tierId,
    notes: "Please call after 3pm. QA test only.",
    customization: { goal: "More calls", timeline: "Within 30 days", platform: "Webflow", addOns },
    quoteOnly: addOns.length > 0,
    sourcePage: `/book/${tierId}.html`,
    ...extra,
  };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    origLog(`  ok  ${name}`);
  } catch (err) {
    origError(`  FAIL ${name}\n${err.stack}`);
    origError(logs.slice(-6).join("\n"));
    process.exitCode = 1;
  }
}

/* ---------------- tests ---------------- */
origLog("SWFT form delivery tests");

for (const tierId of TIERS) {
  await test(`${tierId} with add-ons -> custom quote, owner email, Airtable row, no Stripe`, async () => {
    resetWorld();
    const r = await call(bookTier, bookBody(tierId, ADDONS_BY_TIER[tierId], { submissionId: `qa-${tierId}-addons` }));
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.outcome, "delivered");
    assert.equal(r.body.quoteRequested, true);
    assert.equal(r.body.checkoutUrl, null);
    assert.equal(world.stripeCalls, 0);
    const team = world.emails.find((e) => e.to[0] === "elombe@swftstudios.com");
    assert.ok(team, "owner email sent");
    assert.equal(team.from, "SWFT Studios <hello@swftstudios.com>");
    for (const text of [person.name, person.email, person.businessName, "Base price", "Add-ons", "More calls", "Within 30 days", "Webflow", "Please call after 3pm", "Estimate", "Saved to Airtable"]) {
      assert.ok(team.html.includes(text), `owner email includes ${text}`);
    }
    for (const a of ADDONS_BY_TIER[tierId]) assert.ok(team.html.includes(` x${a.quantity}`), "quantity shown");
    assert.ok(world.emails.some((e) => e.to[0] === person.email), "customer confirmation sent");
    assert.equal(world.airtableRows.tbloX0ged1EJUOpuA.length, 1);
    assert.ok(world.airtableRows.tblRnwAPc9Yz6LnHz.length === 1, "pipeline row");
  });
}

await test("gbp-refresh base only -> Stripe Payment Link returned (no API charge), owner notified", async () => {
  resetWorld();
  const r = await call(bookTier, bookBody("gbp-refresh", []));
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "delivered");
  assert.equal(r.body.quoteRequested, false);
  assert.match(r.body.checkoutUrl, /^https:\/\/buy\.stripe\.com\//);
  assert.equal(world.stripeCalls, 0);
  assert.ok(world.emails.some((e) => e.subject.startsWith("Stripe book: GBP Content Refresh")));
});

await test("extended website + content base only still resolves its payment link", async () => {
  resetWorld();
  const r = await call(bookTier, bookBody("website-content-full", []));
  assert.equal(r.status, 200);
  assert.match(r.body.checkoutUrl, /buy\.stripe\.com/);
});

await test("PRODUCTION REPRO: secrets not visible to runtime -> 502 with reference + diagnostic, not success", async () => {
  resetWorld();
  const r = await call(bookTier, bookBody("gbp-refresh", ADDONS_BY_TIER["gbp-refresh"]), {});
  assert.equal(r.status, 502);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.outcome, "failed");
  assert.equal(r.body.diagnostic, "email:missing_api_key crm:missing_token");
  assert.match(r.body.error, /reference [A-Z0-9]{8}/);
  assert.ok(!("quoteRequested" in r.body));
  assert.equal(world.resendCalls + world.airtableCalls, 0);
  assert.ok(logs.some((l) => l.includes("[SWFT Form]") && l.includes("outcome=failed") && l.includes("resend_error=missing_api_key")));
});

await test("Resend unavailable, Airtable ok -> saved_only with warning (visitor still confirmed)", async () => {
  resetWorld({ resend: "down" });
  const r = await call(bookTier, bookBody("website-only", ADDONS_BY_TIER["website-only"]));
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "saved_only");
  assert.equal(r.body.emailDelivered, false);
  assert.equal(r.body.crmSaved, true);
  assert.match(r.body.warning, /couldn't confirm the email/);
  assert.ok(logs.some((l) => l.includes("resend_status=500") && l.includes("resend_error=internal_server_error")));
});

await test("Airtable unauthorized, Resend ok -> email_only; owner email flags CRM failure; stops after first 401", async () => {
  resetWorld({ airtable: "unauthorized" });
  const r = await call(bookTier, bookBody("website-content-half", ADDONS_BY_TIER["website-content-half"], { submissionId: "qa-airtable-401" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "email_only");
  assert.equal(world.airtableCalls, 1, "short-circuits on auth failure");
  const team = world.emails.find((e) => e.to[0] === "elombe@swftstudios.com");
  assert.ok(team.html.includes("Not saved to Airtable: 401 AUTHENTICATION_REQUIRED"));
  assert.ok(logs.some((l) => l.includes("airtable_status=401") && l.includes("airtable_error=AUTHENTICATION_REQUIRED")));
});

await test("Both unavailable -> 503 retryable, no customer confirmation, no success fields", async () => {
  resetWorld({ resend: "down", airtable: "down" });
  const r = await call(bookTier, bookBody("content-growth-retainer", ADDONS_BY_TIER["content-growth-retainer"]));
  assert.equal(r.status, 503);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.retryable, true);
  assert.equal(world.emails.length, 0);
});

await test("Resend domain not verified (403) is surfaced with its error name", async () => {
  resetWorld({ resend: "forbidden", airtable: "unauthorized" });
  const r = await call(bookTier, bookBody("gbp-refresh", ADDONS_BY_TIER["gbp-refresh"]));
  assert.equal(r.status, 502);
  assert.equal(r.body.diagnostic, "email:validation_error/403 crm:AUTHENTICATION_REQUIRED/401");
  assert.ok(logs.some((l) => l.includes("domain is not verified")), "sanitized message in logs");
  assert.ok(!logs.some((l) => l.includes(ENV.RESEND_API_KEY) || l.includes(ENV.AIRTABLE_TOKEN)), "no secrets in logs");
});

await test("Resend 2xx without message id is NOT treated as delivered", async () => {
  resetWorld({ resend: "noid", airtable: "unauthorized" });
  const r = await call(contact, { ...person, submissionId: "qa-noid-000" });
  assert.equal(r.body.ok, false);
  assert.match(r.body.diagnostic, /email:no_message_id/);
});

await test("Retry of the same submission -> one Airtable row, one owner email", async () => {
  resetWorld();
  const body = bookBody("full-growth-partner", ADDONS_BY_TIER["full-growth-partner"], { submissionId: "qa-retry-12345" });
  const a = await call(bookTier, body);
  const b = await call(bookTier, body);
  assert.equal(a.body.ok && b.body.ok, true);
  assert.equal(world.airtableRows.tbloX0ged1EJUOpuA.length, 1, "no duplicate CRM row");
  assert.equal(world.airtableRows.tblRnwAPc9Yz6LnHz.length, 1, "no duplicate pipeline row");
  assert.equal(world.emails.filter((e) => e.to[0] === "elombe@swftstudios.com").length, 1, "no duplicate owner email");
  assert.equal(a.body.reference, b.body.reference);
});

await test("Retry after a temporary failure succeeds (attempt bumps the email key)", async () => {
  resetWorld({ resend: "down", airtable: "down" });
  const body = bookBody("gbp-refresh", ADDONS_BY_TIER["gbp-refresh"], { submissionId: "qa-temp-fail-1" });
  const first = await call(bookTier, body);
  assert.equal(first.status, 503);
  world.resend = "ok";
  world.airtable = "ok";
  const second = await call(bookTier, { ...body, submissionAttempt: 1 });
  assert.equal(second.status, 200);
  assert.equal(second.body.outcome, "delivered");
  assert.equal(world.emails.filter((e) => e.to[0] === "elombe@swftstudios.com").length, 1);
});

await test("Invalid email and missing fields -> 400 before any upstream call", async () => {
  resetWorld();
  const bad = await call(bookTier, { ...bookBody("gbp-refresh"), email: "not-an-email" });
  const missing = await call(bookTier, { tierId: "gbp-refresh", email: "a@b.co" });
  const contactBad = await call(contact, { name: "x", email: "nope" });
  const auditMissing = await call(growthAudit, { email: "a@b.co" });
  const buildMissing = await call(buildRequest, { name: "x" });
  for (const r of [bad, missing, contactBad, auditMissing, buildMissing]) assert.equal(r.status, 400);
  assert.equal(world.resendCalls + world.airtableCalls, 0);
});

await test("Invalid add-on / quantity rejected", async () => {
  resetWorld();
  const r1 = await call(bookTier, bookBody("gbp-refresh", [{ id: "free-money", quantity: 1 }]));
  const r2 = await call(bookTier, bookBody("gbp-refresh", [{ id: "extra-pages", quantity: 9 }]));
  assert.equal(r1.status, 400);
  assert.equal(r2.status, 400);
});

await test("Autofilled honeypot -> explicit 400, never fake success (all forms)", async () => {
  resetWorld();
  for (const h of [bookTier, contact, growthAudit]) {
    const r = await call(h, { ...bookBody("gbp-refresh"), honeypot: "https://autofill.example" });
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
  }
});

await test("Contact form -> delivered with full details", async () => {
  resetWorld();
  const r = await call(contact, {
    ...person, serviceNeeded: "Website", challenge: "No leads", desiredOutcome: "More leads",
    timeline: "ASAP", budget: "$5k", details: "QA details", sourcePage: "/contact.html",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "delivered");
  const team = world.emails.find((e) => e.to[0] === "elombe@swftstudios.com");
  for (const t of ["No leads", "More leads", "QA details", "$5k"]) assert.ok(team.html.includes(t));
  assert.equal(world.airtableRows.tbl1juYArQAJxoQcf.length, 1);
});

await test("Growth Audit -> delivered", async () => {
  resetWorld();
  const r = await call(growthAudit, {
    firstName: "SWFT", lastName: "Tester", email: person.email, businessName: person.businessName,
    websiteUrl: "https://example.com", desiredService: "gbp-refresh", details: "QA growth audit",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "delivered");
  assert.equal(world.airtableRows.tbl4yRS7k6ZIYQ4zh.length, 1);
});

await test("Website Build (swft-method) -> delivered, no Stripe without secret", async () => {
  resetWorld();
  const r = await call(buildRequest, { ...person, plan: "One-Time Build", oneTimeAmount: 999, whatYouSell: "Cakes" });
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, "delivered");
  assert.equal(r.body.checkoutUrl, null);
  assert.equal(world.stripeCalls, 0);
});

await test("form-health reports presence only and never leaks secret values", async () => {
  resetWorld();
  const res = await formHealth({ request: new Request("https://swftstudios.com/api/form-health?live=1"), env: ENV });
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.config.RESEND_API_KEY, true);
  assert.equal(body.config.AIRTABLE_TOKEN, true);
  assert.equal(body.live.airtable.ok, true);
  assert.equal(body.live.resend.code, "domain_verified");
  assert.ok(!text.includes(ENV.RESEND_API_KEY) && !text.includes(ENV.AIRTABLE_TOKEN));
  const empty = await (await formHealth({ request: new Request("https://swftstudios.com/api/form-health"), env: {} })).json();
  assert.equal(empty.config.RESEND_API_KEY, false);
});

console.error = origError;
console.log = origLog;
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
