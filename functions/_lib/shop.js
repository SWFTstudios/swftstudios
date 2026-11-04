/**
 * Shop pricing (cart → what's due today). Prices always come from the
 * generated catalog (functions/_lib/payments-catalog.js ← data/pricing.json),
 * never from the browser.
 *
 * Rule: every project starts with a 50% deposit. Monthly plans start with
 * the first month today, then bill monthly.
 */
import { TIERS } from "./payments-catalog.js";

export const DEPOSIT_PERCENT = 50;
export const MAX_ITEMS = 12;

export function cleanIds(list) {
  const arr = Array.isArray(list) ? list : [];
  return [...new Set(arr.map((x) => String(x || "").trim()).filter((id) => TIERS[id]))].slice(0, MAX_ITEMS);
}

export function priceCart(ids) {
  const lines = cleanIds(ids).map((id) => {
    const t = TIERS[id];
    const monthly = t.mode === "subscription";
    const totalCents = monthly ? t.amountCents : t.totalCents || t.amountCents;
    const dueNowCents = monthly ? t.amountCents : Math.round((totalCents * DEPOSIT_PERCENT) / 100);
    return { id, name: t.name, monthly, totalCents, dueNowCents, laterCents: monthly ? 0 : totalCents - dueNowCents };
  });
  const sum = (k, f = () => true) => lines.filter(f).reduce((n, l) => n + l[k], 0);
  return {
    lines,
    dueNowCents: sum("dueNowCents"),
    projectTotalCents: sum("totalCents", (l) => !l.monthly),
    laterCents: sum("laterCents"),
    monthlyCents: sum("totalCents", (l) => l.monthly),
    hasMonthly: lines.some((l) => l.monthly),
  };
}
