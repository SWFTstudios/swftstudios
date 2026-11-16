/**
 * SWFT pricing — all checkout amounts are determined server-side.
 *
 * Payment terms follow each package's `pay` in data/pricing.json (compiled into
 * TIERS by scripts/build-payments.mjs):
 *   - kind "full"     → whole price due today
 *   - kind "deposit"  → the Stripe deposit amount today (amountCents, 50%),
 *                        the balance invoiced before delivery
 *   - kind "monthly"  → first month today (subscription)
 * Add-ons inherit the terms of the qualifying package(s) in the order: a deposit
 * if any qualifying package is a deposit package, otherwise paid in full.
 * js/swft-pricing.js applies the same rules in the browser; tests keep them equal.
 */
import { TIERS } from "./payments-catalog.js";
import { ADDONS } from "./shop-addons.js";
export const MAX_ITEMS = 12;

export function cleanIds(list) {
  const arr = Array.isArray(list) ? list : [];
  return [...new Set(arr.map((x) => String(x || "").trim()).filter((id) => TIERS[id] || ADDONS[id]))].slice(0, MAX_ITEMS);
}

/** Payment terms for one package: { pay, percent, totalCents, dueNowCents }. */
export function tierTerms(t) {
  const totalCents = t.totalCents || t.amountCents;
  if (t.mode === "subscription" || t.kind === "monthly") return { pay: "monthly", percent: 100, totalCents: t.amountCents, dueNowCents: t.amountCents };
  if (t.kind === "deposit" && totalCents > t.amountCents) {
    return { pay: "deposit", percent: Math.round((t.amountCents * 100) / totalCents), totalCents, dueNowCents: t.amountCents };
  }
  return { pay: "full", percent: 100, totalCents, dueNowCents: totalCents };
}

export function priceCart(rawItems) {
  const raw = Array.isArray(rawItems) ? rawItems : [];
  const unique = [...new Set(raw.map((x) => typeof x === "string" ? x.trim() : ""))].filter(Boolean);
  const tooMany = unique.length > MAX_ITEMS;
  const unknownIds = unique.filter((id) => !TIERS[id] && !ADDONS[id]);
  const ids = unique.slice(0, MAX_ITEMS);
  const bases = ids.filter((id) => TIERS[id]);
  const extras = ids.filter((id) => ADDONS[id]);
  const invalidAddons = extras.filter((id) => !ADDONS[id].requires.some((required) => bases.includes(required)));
  const lines = bases.map((id) => {
    const t = TIERS[id], terms = tierTerms(t);
    const monthly = terms.pay === "monthly";
    return { id, name: t.name, monthly, kind: "package", pay: terms.pay, percent: terms.percent,
      totalCents: terms.totalCents, dueNowCents: terms.dueNowCents, laterCents: monthly ? 0 : terms.totalCents - terms.dueNowCents };
  }).concat(extras.filter((id) => !invalidAddons.includes(id)).map((id) => {
    const a = ADDONS[id], totalCents = a.priceCents;
    const qualifying = a.requires.filter((b) => bases.includes(b)).map((b) => tierTerms(TIERS[b]));
    const deposits = qualifying.filter((q) => q.pay === "deposit");
    const percent = deposits.length ? Math.min(...deposits.map((q) => q.percent)) : 100;
    const dueNowCents = deposits.length ? Math.round((totalCents * percent) / 100) : totalCents;
    return { id, name: a.name, monthly: false, kind: "addon", pay: deposits.length ? "deposit" : "full", percent,
      totalCents, dueNowCents, laterCents: totalCents - dueNowCents };
  }));
  const sum = (k, f = () => true) => lines.filter(f).reduce((n, l) => n + l[k], 0);
  return { lines, unknownIds, invalidAddons, tooMany,
    dueNowCents: sum("dueNowCents"),
    projectTotalCents: sum("totalCents", (l) => !l.monthly),
    laterCents: sum("laterCents"),
    monthlyCents: sum("totalCents", (l) => l.monthly),
    hasMonthly: lines.some((l) => l.monthly),
    hasDeposit: lines.some((l) => l.pay === "deposit") };
}
