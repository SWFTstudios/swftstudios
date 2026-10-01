/**
 * Pricing page data + renderer. What the page shows must match what customers
 * are actually charged and quoted, so this fails if the figures drift apart.
 *   npm run test:pricing
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const data = JSON.parse(read("data/pricing.json"));
const tiers = [...data.projectTiers.tiers, ...data.ongoingTiers.tiers];

function shootMinutes(s) {
  const m = /(\d+)\s*(hrs?|min)/i.exec(s);
  return m ? Number(m[1]) * (/hr/i.test(m[2]) ? 60 : 1) : 0;
}
const firstNumber = (s) => { const m = /\d+/.exec(s); return m ? Number(m[0]) : 0; };

test("every package's displayed price matches what Stripe will charge", () => {
  assert.equal(tiers.length, 6);
  for (const t of tiers) {
    const shown = Number((/\$([\d,]+)/.exec(t.priceLabel) || [])[1]?.replace(/,/g, ""));
    assert.equal(shown * 100, t.stripe.amountCents, `${t.id}: ${t.priceLabel} vs ${t.stripe.amountCents} cents`);
    assert.equal(/\/mo/.test(t.priceLabel), t.stripe.mode === "subscription", `${t.id}: monthly label vs Stripe mode`);
  }
});

test("the comparison figures match each package's counted scope", () => {
  for (const t of tiers) {
    const c = t.compare, n = t.baseCounts;
    assert.equal(firstNumber(c.pages), n.pages, `${t.id} pages`);
    assert.equal(firstNumber(c.photos), n.photos, `${t.id} photos`);
    assert.equal(firstNumber(c.videos), n.videos, `${t.id} videos`);
    assert.equal(shootMinutes(c.shoot), n.shootMinutes, `${t.id} shoot minutes`);
    // 0 means "not included" and must be shown as an em dash, never "0"
    for (const k of ["pages", "photos", "videos", "shoot"]) {
      const zero = k === "shoot" ? n.shootMinutes === 0 : n[k] === 0;
      assert.equal(c[k] === "—", zero, `${t.id} ${k}: dash only when nothing is included`);
    }
    // Monthly packages say "/ mo" on every recurring amount
    if (t.stripe.mode === "subscription") {
      for (const k of ["photos", "videos", "shoot"]) assert.match(c[k], /\/ mo$/, `${t.id} ${k}`);
    }
  }
});

test("every package spells out what's included, what you provide and what isn't", () => {
  for (const t of tiers) {
    assert.ok(t.includes.length >= 5, `${t.id} includes`);
    assert.ok(t.youProvide.length >= 1, `${t.id} youProvide`);
    assert.ok(t.notIncluded.length >= 2, `${t.id} notIncluded`);
    for (const r of data.compareRows) assert.ok(t.compare[r.key] !== undefined, `${t.id} compare.${r.key}`);
  }
});

test("published extras use the same rates the booking form and the quote handler use", () => {
  const server = read("functions/api/book-tier.js");
  const form = read("js/book-tier-form.js");
  for (const e of data.extras.priced) {
    const sm = new RegExp(`"${e.id}":\\s*\\["([^"]+)",\\s*"[^"]+",\\s*(\\d+)\\]`).exec(server);
    assert.ok(sm, `${e.id} missing from the quote handler`);
    assert.equal(sm[2], String(e.price * 100), `${e.id}: handler rate`);
    assert.equal(sm[1], e.label, `${e.id}: label`);
    const fm = new RegExp(`"${e.id}":\\s*\\{\\s*cents:\\s*(\\d+)`).exec(form);
    assert.ok(fm, `${e.id} missing from the booking form`);
    assert.equal(fm[1], String(e.price * 100), `${e.id}: booking form rate`);
  }
  for (const q of data.extras.quoted) {
    const sm = new RegExp(`"${q.id}":\\s*\\["[^"]+",\\s*"[^"]+",\\s*null\\]`).exec(server);
    assert.ok(sm, `${q.id} should be a quote-only extra in the handler`);
  }
});

/* ---- renderer, run without a browser ---- */
const win = {};
vm.runInNewContext(read("js/pricing-detail.js"), { window: win });
const { SwftPricingDetail } = win;

test("stat parsing: 'Up to 3 hrs / mo' and an em dash", () => {
  // (spread: the script runs in its own realm, so copy into plain objects before comparing)
  assert.deepEqual({ ...SwftPricingDetail.parseStat("Up to 3 hrs / mo") }, { lead: "Up to", num: "3", unit: "hrs", per: "/ mo" });
  assert.deepEqual({ ...SwftPricingDetail.parseStat("90 min") }, { lead: "", num: "90", unit: "min", per: "" });
  assert.equal(SwftPricingDetail.parseStat("—"), null);
});

test("the page renders every package with its tiles, lists and a comparison table", () => {
  const root = { innerHTML: "" };
  SwftPricingDetail.mount(root, data);
  const html = root.innerHTML;
  assert.equal((html.match(/<article class="pp-card/g) || []).length, 6);
  assert.equal((html.match(/class="pp-tile( |")/g) || []).length, 24);
  assert.equal((html.match(/pp-tile is-off/g) || []).length, 6, "six unincluded tiles are marked as such");
  for (const t of tiers) {
    assert.ok(html.includes(`id="${t.id}"`), `anchor #${t.id}`);
    assert.ok(html.includes(t.bookUrl), `${t.id} booking link`);
    assert.ok(html.includes(t.name.replace(/&/g, "&amp;")), `${t.id} name`);
  }
  for (const id of ["compare", "project-tiers", "ongoing", "extras", "how-it-works", "fair"]) assert.ok(html.includes(`id="${id}"`), `section #${id}`);
  assert.match(html, /<table class="pp-table">/);
  assert.equal((html.match(/<tr><th scope="row">/g) || []).length, data.compareRows.length);
  assert.ok(!/<script/i.test(html), "no raw script injection");
});

test("copy from the data is escaped", () => {
  const evil = structuredClone(data);
  evil.projectTiers.tiers[0].name = '<img src=x onerror=alert(1)>';
  evil.extras.priced[0].label = '"><b>x</b>';
  const root = { innerHTML: "" };
  SwftPricingDetail.mount(root, evil);
  assert.ok(!root.innerHTML.includes("<img src=x"));
  assert.ok(!root.innerHTML.includes("<b>x</b>"));
});
