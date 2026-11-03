/**
 * Lead form delivery: every form must email hello@swftstudios.com.
 * Runs the real Pages Function handlers with Resend intercepted (no network,
 * no secrets).  npm run test:forms
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";
import { STRIPE_TIERS } from "../../functions/_lib/stripe-tiers.js";

const INBOX = "hello@swftstudios.com";
let h;

before(async () => {
  // A stale NOTIFY_EMAIL must add a recipient, never replace the inbox.
  h = await startHarness({ env: { NOTIFY_EMAIL: "elombe@swftstudios.com" } });
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

function teamEmail() {
  return h.emails.find((e) => e.to.includes(INBOX));
}

const visitor = { email: "lead@example.com" };

test("contact form emails hello@ with the lead and confirms to the visitor", async () => {
  const r = await post("/api/contact", {
    name: "Jane Lead", email: visitor.email, phone: "2015550123", businessName: "Acme Bakery",
    website: "https://acme.example", businessType: "Website + Content", challenge: "No inquiries",
    desiredOutcome: "More bookings", timeline: "30 days", budget: "$2,000 - $3,000", details: "Two locations",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.emailDelivered, true);
  const team = teamEmail();
  assert.ok(team, "team email sent to hello@");
  assert.deepEqual(team.to, [INBOX, "elombe@swftstudios.com"]);
  assert.match(team.subject, /Project inquiry: Acme Bakery/);
  assert.equal(team.reply_to, visitor.email, "reply goes straight to the lead");
  assert.match(team.html, /No inquiries/);
  const confirm = h.emails.find((e) => e.to.includes(visitor.email));
  assert.ok(confirm, "visitor confirmation sent");
  assert.equal(confirm.reply_to, INBOX);
});

test("growth audit emails hello@ including the biggest leak", async () => {
  const r = await post("/api/growth-audit", {
    firstName: "Sam", lastName: "Owner", email: visitor.email, businessName: "Fit Studio",
    website: "https://fit.example", websiteUrl: "https://fit.example",
    desiredService: "not-sure", desiredServiceLabel: "Not sure, help me choose",
    biggestLeak: "Convert: visitors don't reach out or buy",
    challenge: "Convert: visitors don't reach out or buy", details: "Mostly Instagram traffic",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const team = teamEmail();
  assert.ok(team);
  assert.match(team.subject, /Growth Audit: Fit Studio/);
  assert.match(team.html, /Biggest leak/);
  assert.match(team.html, /visitors don&#39;t reach out or buy/);
});

// Every offer with a live payment link (data/pricing.json → stripe, built
// from data/stripe-catalog.json by npm run build:payments).
const TIERS = Object.keys(STRIPE_TIERS);

test("online tiers come from the catalog and charge what `pay` says", () => {
  assert.ok(TIERS.length >= 3);
  for (const t of Object.values(STRIPE_TIERS)) {
    assert.match(t.paymentLinkUrl, /^https:\/\/buy\.stripe\.com\//);
    if (t.kind === "deposit") assert.ok(t.amountCents < t.totalCents, t.id);
    else assert.equal(t.amountCents, t.totalCents, t.id);
  }
});

test("booking an offer without a live link is refused (no stale amounts)", async () => {
  const r = await post("/api/book-tier", {
    tierId: "app-mvp", name: "Pat Client", email: visitor.email, businessName: "Client Co",
    customization: { goal: "More bookings", addOns: [] },
  });
  assert.equal(r.body.ok, false, JSON.stringify(r.body));
  assert.equal(r.body.checkoutUrl, undefined);
});

for (const tierId of TIERS) {
  test(`booking (${tierId}) checkout: emails hello@ and returns a Stripe link`, async () => {
    const r = await post("/api/book-tier", {
      tierId, name: "Pat Client", email: visitor.email, businessName: "Client Co",
      customization: { goal: "More bookings", addOns: [] },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.match(r.body.checkoutUrl, /^https:\/\/buy\.stripe\.com\//);
    const team = teamEmail();
    assert.ok(team);
    assert.match(team.subject, /^Stripe book: /);
  });

  test(`booking (${tierId}) quote request: emails hello@, no checkout`, async () => {
    const r = await post("/api/book-tier", {
      tierId, quoteOnly: true, name: "Pat Client", email: visitor.email, businessName: "Client Co",
      customization: { goal: "More bookings", addOns: [] },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.quoteRequested, true);
    assert.equal(r.body.checkoutUrl, null);
    assert.match(teamEmail().subject, /^Custom quote: /);
  });
}

test("a transient Resend failure is retried and still reaches hello@", async () => {
  h.failResend(1);
  const r = await post("/api/contact", { name: "Retry Test", email: visitor.email, businessName: "Retry Co" });
  assert.equal(r.status, 200);
  assert.equal(r.body.emailDelivered, true);
  assert.ok(teamEmail());
});

test("if email can't be delivered and nothing was stored, the form reports failure (no fake success)", async () => {
  h.failResend(10);
  for (const [path, body] of [
    ["/api/contact", { name: "Down Test", email: visitor.email }],
    ["/api/growth-audit", { firstName: "Down", email: visitor.email, businessName: "Down Co", website: "https://d.example", desiredService: "not-sure" }],
    ["/api/book-tier", { tierId: "gbp-refresh", quoteOnly: true, name: "Down", email: visitor.email, businessName: "Down Co", customization: {} }],
  ]) {
    const r = await post(path, body);
    assert.equal(r.status, 503, path);
    assert.equal(r.body.ok, false, path);
    assert.match(r.body.error, /hello@swftstudios\.com/, path);
  }
});

test("spam honeypot is not emailed", async () => {
  await post("/api/contact", { name: "Bot", email: "bot@example.com", company_website: "spam" });
  assert.equal(h.emails.length, 0);
});
