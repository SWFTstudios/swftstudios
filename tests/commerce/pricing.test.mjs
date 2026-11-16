/**
 * Package pricing: builder ↔ cart ↔ checkout must agree, and every amount the
 * customer sees follows the package's published payment terms.
 *   npm run test:commerce
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { priceCart } from "../../functions/_lib/shop.js";
import { TIERS } from "../../functions/_lib/payments-catalog.js";
import { onRequestPost as checkout } from "../../functions/api/checkout.js";

const require = createRequire(import.meta.url);
const Pricing = require("../../js/swft-pricing.js");
const read = (p) => JSON.parse(readFileSync(new URL("../../" + p, import.meta.url), "utf8"));
const pricing = read("data/pricing.json");
const addonData = read("data/addons.json");
const builderPaths = read("data/builder-paths.json");
const catalog = Pricing.buildCatalog(pricing, addonData);
const client = (ids) => Pricing.quote(ids, catalog);
const offers = pricing.categories.flatMap((c) => c.services.flatMap((s) => s.offers || []));
const tierIds = Object.keys(TIERS);
const addonIds = addonData.addons.map((a) => a.id);

test("regression: builder catalog prices every fixed-price extra", () => {
  for (const id of addonIds) assert.ok(catalog[id], "extra missing from browser catalog: " + id);
  for (const id of tierIds) assert.ok(catalog[id] && !catalog[id].addon, "package missing: " + id);
});

test("Website Only $400 + extra page $175 = $575, removing it returns to $400", () => {
  const withPage = client(["website-only", "extra-pages"]);
  assert.equal(withPage.oneTimeCents, 57500);
  assert.equal(withPage.packageCents, 40000);
  assert.equal(withPage.extrasCents, 17500);
  assert.equal(withPage.dueNowCents, 57500, "Website Only is paid in full, so its extra is too");
  assert.equal(withPage.laterCents, 0);
  const without = client(["website-only"]);
  assert.equal(without.oneTimeCents, 40000);
  assert.equal(without.dueNowCents, 40000);
  const server = priceCart(["website-only", "extra-pages"]);
  assert.equal(server.projectTotalCents, 57500);
  assert.equal(server.dueNowCents, 57500);
});

test("published pay terms are the single source for every package", () => {
  for (const o of offers.filter((x) => x.pay && x.stripe)) {
    const t = TIERS[o.id];
    assert.ok(t, "purchasable offer missing from server catalog: " + o.id);
    assert.equal(t.kind, o.pay.type === "monthly" ? "monthly" : o.pay.type, "terms differ for " + o.id);
    const line = priceCart([o.id]).lines[0];
    assert.equal(line.pay, o.pay.type, o.id);
    assert.equal(line.totalCents, o.priceCents, o.id);
    // What we charge today equals the Stripe price/Payment Link amount.
    assert.equal(line.dueNowCents, t.amountCents, o.id);
    if (o.pay.type === "deposit") {
      assert.equal(line.dueNowCents, Math.round(o.priceCents * o.pay.percent / 100), o.id);
      assert.equal(line.laterCents, o.priceCents - line.dueNowCents, o.id);
    } else assert.equal(line.laterCents, 0, o.id);
  }
});

test("deposit package: deposit today, remaining balance shown; add-on follows the deposit", () => {
  const q = client(["website-content-half", "extra-photos"]);
  assert.equal(q.oneTimeCents, 210000);
  assert.equal(q.dueNowCents, 100000 + 5000);
  assert.equal(q.laterCents, 100000 + 5000);
  assert.equal(q.lines.find((l) => l.id === "extra-photos").pay, "deposit");
});

test("add-on with both a full-pay and a deposit qualifying package uses the deposit", () => {
  const ids = ["website-only", "website-content-half", "extra-pages"];
  const extra = client(ids).lines.find((l) => l.id === "extra-pages");
  assert.equal(extra.pay, "deposit");
  assert.equal(extra.dueNowCents, 8750);
  assert.deepEqual(priceCart(ids).lines.find((l) => l.id === "extra-pages").dueNowCents, 8750);
});

test("recurring and one-time charges are separate", () => {
  const q = client(["website-only", "website-care"]);
  assert.equal(q.oneTimeCents, 40000);
  assert.equal(q.monthlyCents, 15000);
  assert.equal(q.dueNowCents, 55000);
  assert.equal(q.hasMonthly, true);
  const s = priceCart(["website-only", "website-care"]);
  assert.equal(s.projectTotalCents, 40000);
  assert.equal(s.monthlyCents, 15000);
});

test("unsupported add-on combinations are rejected in the browser and on the server", () => {
  for (const a of addonData.addons) {
    const unrelated = tierIds.find((t) => !a.requires.includes(t));
    assert.deepEqual(client([a.id]).invalidAddons, [a.id]);
    assert.deepEqual(priceCart([a.id]).invalidAddons, [a.id]);
    assert.equal(Pricing.eligible(a.id, [unrelated], catalog), false);
    assert.deepEqual(priceCart([unrelated, a.id]).invalidAddons, [a.id]);
    for (const base of a.requires) assert.equal(Pricing.eligible(a.id, [base], catalog), true);
  }
});

function sameQuote(ids) {
  const c = client(ids), s = priceCart(ids);
  const pick = (l) => ({ id: l.id, pay: l.pay, totalCents: l.totalCents, dueNowCents: l.dueNowCents, laterCents: l.laterCents, monthly: l.monthly });
  assert.deepEqual(c.lines.map(pick), s.lines.map(pick), "line mismatch for " + ids.join("+"));
  assert.equal(c.dueNowCents, s.dueNowCents, ids.join("+"));
  assert.equal(c.oneTimeCents, s.projectTotalCents, ids.join("+"));
  assert.equal(c.laterCents, s.laterCents, ids.join("+"));
  assert.equal(c.monthlyCents, s.monthlyCents, ids.join("+"));
  assert.deepEqual(c.invalidAddons, s.invalidAddons, ids.join("+"));
}

test("builder/cart math equals the server for every package, extra and pairing", () => {
  let n = 0;
  for (const t of tierIds) {
    sameQuote([t]); n++;
    for (const a of addonIds) { sameQuote([t, a]); n++; }
    for (const u of tierIds) if (u !== t) { sameQuote([t, u]); n++; }
  }
  // Every builder scenario with all its eligible extras and suggested pairings.
  for (const service of builderPaths.services) for (const g of service.scenarios) for (const tier of g.tierIds) {
    const extras = addonData.addons.filter((a) => a.requires.includes(tier)).map((a) => a.id);
    const pairs = (builderPaths.upsells[tier] || []).map((p) => p[0]).filter((id) => TIERS[id]);
    sameQuote([tier, ...extras, ...pairs].slice(0, 12)); n++;
  }
  assert.ok(n > 500);
});

test("Stripe receives server-computed amounts, never browser prices", async () => {
  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.stripe.com/v1/checkout/sessions");
    sent = new URLSearchParams(init.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_mock" }), { status: 200 });
  };
  try {
    const body = { items: ["website-only", "extra-pages"], email: "qa@example.com", prices: { "website-only": 1 }, amount: 1, dueNowCents: 1 };
    const res = await checkout({
      request: new Request("https://www.swftstudios.com/api/checkout", { method: "POST", headers: { Origin: "https://www.swftstudios.com", "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      env: { STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    assert.equal(res.status, 200);
    assert.equal(sent.get("mode"), "payment");
    assert.equal(sent.get("line_items[0][price_data][unit_amount]"), "40000");
    assert.equal(sent.get("line_items[0][price_data][product_data][name]"), "Website Only");
    assert.equal(sent.get("line_items[1][price_data][unit_amount]"), "17500");
    assert.match(sent.get("payment_intent_data[description]"), /paid in full/);
    assert.equal(sent.get("metadata[terms]"), "website-only:full,extra-pages:full");
    assert.equal(sent.get("metadata[dueNow]"), "$575");
  } finally { globalThis.fetch = realFetch; }
});

test("Stripe deposit lines say deposit and carry the balance", async () => {
  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init) => { sent = new URLSearchParams(init.body); return new Response(JSON.stringify({ url: "https://checkout.stripe.com/x" }), { status: 200 }); };
  try {
    await checkout({
      request: new Request("https://www.swftstudios.com/api/checkout", { method: "POST", headers: { Origin: "https://www.swftstudios.com" }, body: JSON.stringify({ items: ["brand-film", "raw-assets", "video-plan"], email: "qa@example.com" }) }),
      env: { STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    assert.equal(sent.get("mode"), "subscription");
    assert.equal(sent.get("line_items[0][price_data][unit_amount]"), "90000");
    assert.equal(sent.get("line_items[0][price_data][product_data][name]"), "Brand Film: 50% deposit");
    assert.equal(sent.get("line_items[1][price_data][recurring][interval]"), "month");
    assert.equal(sent.get("line_items[2][price_data][unit_amount]"), "5000");
    assert.equal(sent.get("metadata[balance]"), "$950");
  } finally { globalThis.fetch = realFetch; }
});
