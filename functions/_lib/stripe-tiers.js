/**
 * Server-side Stripe booking catalog for offer-ladder tiers.
 * Amounts are authoritative, never trust client-supplied prices.
 * Keep in sync with data/pricing.json → tier.stripe fields.
 */
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
