/**
 * Server-side catalog of offers that can be paid online.
 * Amounts, Price IDs and Payment Links are authoritative here; never trust
 * client-supplied prices.
 *
 * Built from data/pricing.json: every offer with a `stripe` block (written by
 * `npm run build:payments` from data/stripe-catalog.json, following the
 * offer's `pay` setting: full / deposit / monthly). To change what is sold
 * online, edit `pay` and run `npm run stripe:sync`, not this file.
 *
 * Env overrides per tier (optional): STRIPE_PAYMENT_LINK_<ID> and
 * STRIPE_PRICE_<ID>, where <ID> is the offer id upper-cased with _ for -
 * (e.g. STRIPE_PAYMENT_LINK_WEBSITE_ONLY).
 */
import pricing from "../../data/pricing.json" with { type: "json" };

function collect() {
  const tiers = {};
  const names = {};
  for (const c of pricing.categories || []) {
    for (const s of c.services || []) {
      for (const o of s.offers || []) {
        names[o.id] = o.name;
        const st = o.stripe;
        if (!st || !st.paymentLinkUrl) continue;
        tiers[o.id] = {
          id: o.id,
          name: o.name,
          mode: st.mode,
          kind: st.kind || (st.mode === "subscription" ? "monthly" : "full"),
          amountCents: st.amountCents,
          // Full starting price (a deposit charges part of it).
          totalCents: o.priceCents || st.amountCents,
          ...(st.interval ? { interval: st.interval } : {}),
          productName: st.productName,
          priceLabel: o.priceLabel,
          priceDisplay: st.priceDisplay,
          priceId: st.priceId || null,
          paymentLinkUrl: st.paymentLinkUrl,
          bookUrl: o.bookUrl || `/book/${o.id}.html`,
        };
      }
    }
  }
  return { tiers, names };
}

const { tiers: TIERS, names: NAMES } = collect();

/** Every offer that can be paid online, keyed by offer id. */
export const STRIPE_TIERS = TIERS;

const envSuffix = (tierId) => String(tierId).toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/** Display name for any offer id (online or not), e.g. for project emails. */
export function offerName(id) {
  return NAMES[String(id || "").trim()] || null;
}

export function getStripeTier(id) {
  if (!id) return null;
  return TIERS[String(id).trim()] || null;
}

/** Stripe Price ID for a tier (env override → catalog). */
export function resolveStripePriceId(env, tierId) {
  const fromEnv = env?.[`STRIPE_PRICE_${envSuffix(tierId)}`];
  if (fromEnv) return String(fromEnv).trim();
  return TIERS[tierId]?.priceId || null;
}

/**
 * Payment Link URL for a tier (env override → catalog), optionally prefilling
 * the email. Does not require STRIPE_SECRET_KEY.
 */
export function resolvePaymentLinkUrl(env, tierId, email) {
  const fromEnv = env?.[`STRIPE_PAYMENT_LINK_${envSuffix(tierId)}`];
  const base = (fromEnv && String(fromEnv).trim()) || TIERS[tierId]?.paymentLinkUrl || null;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (email) url.searchParams.set("prefilled_email", String(email).trim().toLowerCase());
    return url.toString();
  } catch {
    return base;
  }
}

/** Map a Stripe Price ID back to our tier id (for webhooks). */
export function tierIdFromPriceId(env, priceId) {
  if (!priceId) return null;
  for (const tierId of Object.keys(TIERS)) {
    if (resolveStripePriceId(env, tierId) === priceId) return tierId;
  }
  return null;
}
