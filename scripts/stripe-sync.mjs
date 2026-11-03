#!/usr/bin/env node
/**
 * Creates the Stripe product, price and payment link for every offer that can
 * be bought online (data/pricing.json → `pay`), and records them in
 * data/stripe-catalog.json. Safe to run again: offers whose link already
 * charges the right amount are skipped. When an offer's amount changes, a new
 * price + link are made and the old link is deactivated so nobody can pay the
 * old amount.
 *
 *   STRIPE_SECRET_KEY=sk_live_... npm run stripe:sync           create + build pages
 *   node scripts/stripe-sync.mjs --dry-run                       show the plan only
 *   STRIPE_SECRET_KEY=... node scripts/stripe-sync.mjs --only website-only,brand-film
 *
 * A restricted key needs write access to Products, Prices and Payment Links.
 * Each link: Apple Pay / Google Pay / Link / ACH as enabled in your Stripe
 * payment-method settings, phone number and an optional "Business name" field,
 * a receipt/invoice for one-time payments, metadata.tierId = offer id (read
 * by the webhook), then a redirect to /book/thank-you.html?tier=<id>.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, allOffers, chargeFor, entryMatches, productName, usd } from "./lib/payments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(",")) : null;
})();
const KEY = process.env.STRIPE_SECRET_KEY;
if (!DRY && !KEY) {
  console.error("Set STRIPE_SECRET_KEY (or run with --dry-run).");
  process.exit(1);
}

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const pricing = read("data/pricing.json");
const catalog = read("data/stripe-catalog.json");
catalog.tiers = catalog.tiers || {};

function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: body ? form(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data?.error?.message || res.status}`);
  return data;
}

async function ensureProduct(offer, entry, charge, service) {
  const name = productName(offer, charge);
  const description = (offer.description || service.summary || "").slice(0, 500) || undefined;
  if (entry?.productId) {
    try {
      const p = await stripe("POST", `/products/${entry.productId}`, { name, description, active: true });
      return p.id;
    } catch (e) {
      console.warn(`  product ${entry.productId} not usable (${e.message}); creating a new one`);
    }
  }
  const found = await stripe("GET", `/products/search?query=${encodeURIComponent(`metadata['swft_offer']:'${offer.id}'`)}`);
  const hit = (found.data || []).find((p) => p.active);
  if (hit) {
    await stripe("POST", `/products/${hit.id}`, { name, description });
    return hit.id;
  }
  const p = await stripe("POST", "/products", { name, description, metadata: { swft_offer: offer.id } });
  return p.id;
}

async function ensurePrice(offer, productId, charge) {
  const lookup = `swft_${offer.id}_${charge.kind}_${charge.amountCents}`.replace(/[^a-z0-9_]/gi, "_");
  const found = await stripe("GET", `/prices?active=true&lookup_keys[]=${encodeURIComponent(lookup)}`);
  if (found.data && found.data[0]) return found.data[0];
  return stripe("POST", "/prices", {
    product: productId,
    currency: "usd",
    unit_amount: charge.amountCents,
    lookup_key: lookup,
    nickname: `${offer.name} · ${charge.kind} ${usd(charge.amountCents)}`,
    ...(charge.mode === "subscription" ? { recurring: { interval: charge.interval || "month" } } : {}),
    metadata: { swft_offer: offer.id, kind: charge.kind },
  });
}

async function createLink(offer, price, charge) {
  const meta = { tierId: offer.id, kind: charge.kind };
  const body = {
    line_items: { 0: { price: price.id, quantity: 1 } },
    metadata: meta,
    after_completion: { type: "redirect", redirect: { url: `${SITE}/book/thank-you.html?tier=${encodeURIComponent(offer.id)}&status=success` } },
    phone_number_collection: { enabled: true },
    billing_address_collection: "auto",
    custom_fields: { 0: { key: "business", label: { type: "custom", custom: "Business name" }, type: "text", optional: true } },
  };
  if (charge.mode === "payment") {
    body.invoice_creation = { enabled: true, invoice_data: { metadata: meta, footer: charge.kind === "deposit" ? `${charge.percent}% deposit on the ${usd(offer.priceCents)} starting price. Balance invoiced before delivery.` : undefined } };
    body.payment_intent_data = { metadata: meta, description: productName(offer, charge) };
    body.customer_creation = "always";
  } else {
    body.subscription_data = { metadata: meta, description: productName(offer, charge) };
  }
  return stripe("POST", "/payment_links", body);
}

const plan = [];
for (const { offer, service } of allOffers(pricing)) {
  const charge = chargeFor(offer);
  if (!charge) continue;
  if (ONLY && !ONLY.has(offer.id)) continue;
  const entry = catalog.tiers[offer.id];
  if (entryMatches(entry, charge)) continue;
  plan.push({ offer, service, charge, entry });
}

if (!plan.length) {
  console.log("Every online offer already has a matching payment link.");
  process.exit(0);
}
console.log(`${DRY ? "Would create" : "Creating"} ${plan.length} payment link(s):`);
for (const { offer, charge, entry } of plan) {
  console.log(`- ${offer.id}: ${charge.kind} ${usd(charge.amountCents)}${charge.interval ? "/mo" : ""}${entry?.paymentLinkId ? ` (replaces ${entry.paymentLinkId})` : ""}`);
}
if (DRY) process.exit(0);

for (const { offer, service, charge, entry } of plan) {
  process.stdout.write(`${offer.id} … `);
  const productId = await ensureProduct(offer, entry, charge, service);
  const price = await ensurePrice(offer, productId, charge);
  const link = await createLink(offer, price, charge);
  if (entry?.paymentLinkId && entry.paymentLinkId !== link.id) {
    try { await stripe("POST", `/payment_links/${entry.paymentLinkId}`, { active: false }); }
    catch (e) { console.warn(`\n  could not deactivate old link ${entry.paymentLinkId}: ${e.message}`); }
  }
  catalog.tiers[offer.id] = {
    ...(entry?.bookUrl ? { bookUrl: entry.bookUrl } : {}),
    productId,
    priceId: price.id,
    paymentLinkId: link.id,
    paymentLinkUrl: link.url,
    mode: charge.mode,
    kind: charge.kind,
    amountCents: charge.amountCents,
    ...(charge.interval ? { interval: charge.interval } : {}),
  };
  catalog.livemode = link.livemode;
  catalog.updatedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(join(ROOT, "data/stripe-catalog.json"), JSON.stringify(catalog, null, 1) + "\n");
  console.log(link.url);
}
console.log("Saved data/stripe-catalog.json. Next: npm run build:payments (stripe:sync runs it for you).");
