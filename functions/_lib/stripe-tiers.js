/**
 * Server-side Stripe booking catalog for offer-ladder tiers.
 * Amounts and Price IDs are authoritative — never trust client-supplied prices.
 * Keep in sync with data/pricing.json → tier.stripe and data/stripe-catalog.json.
 *
 * Booking currently uses Payment Links (no STRIPE_SECRET_KEY required).
 * Price IDs remain for Checkout Session fallback when a secret key is available.
 */

/** Default Price IDs from live Stripe catalog (data/stripe-catalog.json). Override via env. */
export const DEFAULT_STRIPE_PRICE_IDS = {
  "gbp-refresh": "price_1U6c9zAF4d9gCyuNIaEa8MhT",
  "website-only": "price_1U6cA5AF4d9gCyuNj65BmDU2",
  "website-content-half": "price_1U6cA8AF4d9gCyuNt2PH1qew",
  "website-content-full": "price_1U6cAAAF4d9gCyuNeB6qUFx5",
  "content-growth-retainer": "price_1U6cA8AF4d9gCyuN0Ko807my",
  "full-growth-partner": "price_1U6cAAAF4d9gCyuN6yvZR5im",
};

/** Live Payment Link URLs (data/stripe-catalog.json). Override via env STRIPE_PAYMENT_LINK_*. */
export const DEFAULT_PAYMENT_LINK_URLS = {
  "gbp-refresh": "https://buy.stripe.com/bJe9AS0zmf4gdGN2refMA0A",
  "website-only": "https://buy.stripe.com/eVq6oGgykbS4cCJgi4fMA0v",
  "website-content-half": "https://buy.stripe.com/aFa6oGbe0e0cauB2refMA0w",
  "website-content-full": "https://buy.stripe.com/28E4gy1DqbS4byF4zmfMA0x",
  "content-growth-retainer": "https://buy.stripe.com/3cI3cube01dq9qxc1OfMA0y",
  "full-growth-partner": "https://buy.stripe.com/fZu00ia9W4pCauBaXKfMA0z",
};

export const STRIPE_PRICE_ENV_KEYS = {
  "gbp-refresh": "STRIPE_PRICE_GBP_REFRESH",
  "website-only": "STRIPE_PRICE_WEBSITE_ONLY",
  "website-content-half": "STRIPE_PRICE_WEBSITE_CONTENT_HALF",
  "website-content-full": "STRIPE_PRICE_WEBSITE_CONTENT_FULL",
  "content-growth-retainer": "STRIPE_PRICE_CONTENT_GROWTH_RETAINER",
  "full-growth-partner": "STRIPE_PRICE_FULL_GROWTH_PARTNER",
};

export const STRIPE_PAYMENT_LINK_ENV_KEYS = {
  "gbp-refresh": "STRIPE_PAYMENT_LINK_GBP_REFRESH",
  "website-only": "STRIPE_PAYMENT_LINK_WEBSITE_ONLY",
  "website-content-half": "STRIPE_PAYMENT_LINK_WEBSITE_CONTENT_HALF",
  "website-content-full": "STRIPE_PAYMENT_LINK_WEBSITE_CONTENT_FULL",
  "content-growth-retainer": "STRIPE_PAYMENT_LINK_CONTENT_GROWTH_RETAINER",
  "full-growth-partner": "STRIPE_PAYMENT_LINK_FULL_GROWTH_PARTNER",
};

export const STRIPE_TIERS = {
  "gbp-refresh": {
    id: "gbp-refresh",
    name: "GBP Content Refresh",
    mode: "payment",
    amountCents: 40000,
    productName: "SWFT. GBP Content Refresh (project start)",
    priceLabel: "$400 to $600",
    priceDisplay: "$400",
  },
  "website-only": {
    id: "website-only",
    name: "Website Only",
    mode: "payment",
    amountCents: 80000,
    productName: "SWFT. Website Only (project start)",
    priceLabel: "$800 to $1,500",
    priceDisplay: "$800",
  },
  "website-content-half": {
    id: "website-content-half",
    name: "Website + Content Capture",
    mode: "payment",
    amountCents: 200000,
    productName: "SWFT. Website + Content Capture (project start)",
    priceLabel: "$2,000 to $2,800",
    priceDisplay: "$2,000",
  },
  "website-content-full": {
    id: "website-content-full",
    name: "Website + Extended Content",
    mode: "payment",
    amountCents: 300000,
    productName: "SWFT. Website + Extended Content (project start)",
    priceLabel: "$3,000 to $4,500+",
    priceDisplay: "$3,000",
  },
  "content-growth-retainer": {
    id: "content-growth-retainer",
    name: "Content + Growth Retainer",
    mode: "subscription",
    amountCents: 45000,
    interval: "month",
    productName: "SWFT. Content + Growth Retainer",
    priceLabel: "$450 to $800/mo",
    priceDisplay: "$450/mo",
  },
  "full-growth-partner": {
    id: "full-growth-partner",
    name: "Full Growth Partner",
    mode: "subscription",
    amountCents: 120000,
    interval: "month",
    productName: "SWFT. Full Growth Partner",
    priceLabel: "From $1,200/mo",
    priceDisplay: "$1,200/mo",
  },
};

export function getStripeTier(id) {
  if (!id) return null;
  return STRIPE_TIERS[String(id).trim()] || null;
}

/** Resolve reusable Stripe Price ID for a tier (env override → catalog default). */
export function resolveStripePriceId(env, tierId) {
  const envKey = STRIPE_PRICE_ENV_KEYS[tierId];
  if (envKey && env?.[envKey]) return String(env[envKey]).trim();
  return DEFAULT_STRIPE_PRICE_IDS[tierId] || null;
}

/**
 * Resolve Payment Link URL for a tier, optionally prefilling email.
 * Does not require STRIPE_SECRET_KEY.
 */
export function resolvePaymentLinkUrl(env, tierId, email) {
  const envKey = STRIPE_PAYMENT_LINK_ENV_KEYS[tierId];
  const base =
    (envKey && env?.[envKey] && String(env[envKey]).trim()) || DEFAULT_PAYMENT_LINK_URLS[tierId] || null;
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
  for (const [tierId, envKey] of Object.entries(STRIPE_PRICE_ENV_KEYS)) {
    const resolved = (env?.[envKey] && String(env[envKey]).trim()) || DEFAULT_STRIPE_PRICE_IDS[tierId];
    if (resolved === priceId) return tierId;
  }
  return null;
}
