import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priceCart, MAX_ITEMS } from "../../functions/_lib/shop.js";
import { ADDONS } from "../../functions/_lib/shop-addons.js";
import { TIERS } from "../../functions/_lib/payments-catalog.js";
const read = (p) => JSON.parse(readFileSync(new URL("../../" + p, import.meta.url), "utf8"));
const addons = read("data/addons.json").addons;
const builder = read("data/builder-paths.json");
const search = read("data/site-search.json").entries;
const known = new Set(Object.keys(TIERS));
test("fixed extras match the published add-on catalog", () => {
  assert.deepEqual(Object.values(ADDONS), addons);
  assert.ok(addons.length > 0);
  for (const addon of addons) {
    assert.ok(Number.isInteger(addon.priceCents) && addon.priceCents > 0);
    assert.ok(addon.requires.length > 0);
    addon.requires.forEach((id) => assert.ok(known.has(id), "Invalid qualifying tier: " + id));
  }
});
test("checkout price is always recalculated; paid-in-full package + add-on due in full", () => {
  const cart = priceCart(["extra-pages","website-only"]);
  assert.equal(cart.lines[0].id, "website-only"); // Tier first for webhook provisioning
  assert.equal(cart.lines[1].id, "extra-pages");
  assert.equal(cart.projectTotalCents, 57500);
  assert.equal(cart.dueNowCents, 57500);
  assert.equal(cart.laterCents, 0);
  assert.deepEqual(cart.invalidAddons, []);
});
test("orphaned, unrelated, unknown and oversized carts cannot checkout", () => {
  assert.deepEqual(priceCart(["extra-pages"]).invalidAddons, ["extra-pages"]);
  assert.deepEqual(priceCart(["extra-pages","photo-session"]).invalidAddons, ["extra-pages"]);
  assert.deepEqual(priceCart(["free-$0","website-only"]).unknownIds, ["free-$0"]);
  const lots = [...known].slice(0,MAX_ITEMS+1);
  assert.equal(priceCart(lots).tooMany, true);
});
test("monthly pricing coexists with a one-time package", () => {
  const cart = priceCart(["website-only","website-care"]);
  assert.equal(cart.projectTotalCents, 40000);
  assert.equal(cart.monthlyCents, 15000);
  assert.equal(cart.dueNowCents, 55000);
  assert.equal(cart.hasMonthly, true);
});
test("every preconfigured scenario uses a real, purchasable package", () => {
  assert.ok(builder.services.length >= 11);
  for (const service of builder.services) for (const scenario of service.scenarios) {
    assert.ok(scenario.name && scenario.description);
    for (const id of scenario.tierIds) {
      assert.ok(known.has(id), "Unknown tier in " + service.id + ": " + id);
    }
    for (const id of scenario.proof) assert.ok(builder.proof[id], "Unknown proof " + id);
  }
  for (const list of Object.values(builder.upsells)) for (const [id] of list) assert.ok(known.has(id));
});
test("site search has safe targets and descriptive labels", () => {
  assert.ok(search.length >= 80);
  const ids = search.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of search) {
    assert.ok(entry.title && entry.kind);
    assert.match(entry.url, /^(\/($|[^/])|https:\/\/cal\.com\/swftstudios\/)/);
  }
  assert.ok(search.some(x => x.url.includes("build.html?service=websites&goal=splash")));
});
test("builder, cart and search are wired to current SWFT navigation", () => {
  const nav=readFileSync(new URL("../../js/swft-nav.js", import.meta.url),"utf8");
  const cart=readFileSync(new URL("../../js/cart.js", import.meta.url),"utf8");
  const builderJS=readFileSync(new URL("../../js/builder.js", import.meta.url),"utf8");
  assert.match(nav, /data-swft-search-open/);
  assert.match(nav, /site-search.js/);
  assert.match(nav, /\/build.html/);
  assert.match(cart, /SWFTCart = \{ add: add, addMany:/);
  assert.match(builderJS, /SWFTCart.addMany/);
  assert.match(builderJS, /data-scenario/);
});
