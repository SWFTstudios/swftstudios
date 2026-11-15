/** SWFT pricing — all checkout amounts are determined server-side. */
import { TIERS } from "./payments-catalog.js";
import { ADDONS } from "./shop-addons.js";
export const DEPOSIT_PERCENT = 50;
export const MAX_ITEMS = 12;
export function cleanIds(list) {
  const arr = Array.isArray(list) ? list : [];
  return [...new Set(arr.map((x) => String(x || "").trim()).filter((id) => TIERS[id] || ADDONS[id]))].slice(0, MAX_ITEMS);
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
    const t = TIERS[id];
    const monthly = t.mode === "subscription";
    const totalCents = monthly ? t.amountCents : t.totalCents || t.amountCents;
    const dueNowCents = monthly ? t.amountCents : Math.round((totalCents * DEPOSIT_PERCENT) / 100);
    return { id, name:t.name, monthly, kind:"package", totalCents, dueNowCents, laterCents:monthly ? 0 : totalCents - dueNowCents };
  }).concat(extras.filter((id) => !invalidAddons.includes(id)).map((id) => {
    const a = ADDONS[id], totalCents = a.priceCents;
    const dueNowCents = Math.round((totalCents * DEPOSIT_PERCENT) / 100);
    return { id, name:a.name, monthly:false, kind:"addon", totalCents, dueNowCents, laterCents:totalCents - dueNowCents };
  }));
  const sum = (k, f = () => true) => lines.filter(f).reduce((n,l) => n + l[k],0);
  return { lines, unknownIds, invalidAddons, tooMany,
    dueNowCents:sum("dueNowCents"),
    projectTotalCents:sum("totalCents",(l) => !l.monthly),
    laterCents:sum("laterCents"),
    monthlyCents:sum("totalCents",(l) => l.monthly),
    hasMonthly:lines.some((l) => l.monthly) };
}
