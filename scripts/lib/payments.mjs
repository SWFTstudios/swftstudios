/**
 * Online payments: one place that turns an offer's `pay` setting
 * (data/pricing.json) plus its Stripe objects (data/stripe-catalog.json) into
 * what the site shows and charges.
 *
 *   pay.type = "full"     pay the starting price now
 *   pay.type = "deposit"  pay pay.percent (default 50) of it now; the balance
 *                         is invoiced before delivery
 *   pay.type = "monthly"  subscription at the starting price per month
 *   no pay               quote first (no online checkout)
 *
 * An offer is only bookable online when the catalog holds a payment link whose
 * amount and mode match what `pay` asks for, so the site never shows a pay
 * button that would charge the wrong amount.
 *
 * Used by scripts/build-payments.mjs and scripts/stripe-sync.mjs.
 */
export const SITE = "https://www.swftstudios.com";
export const BOOK_URL = "https://cal.com/swftstudios/swft-meeting";

export const usd = (cents) =>
  "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 });

export function allOffers(pricing) {
  const out = [];
  for (const c of pricing.categories || [])
    for (const s of c.services || [])
      for (const o of s.offers || []) out.push({ offer: o, service: s, category: c });
  return out;
}

/** What Stripe should charge for an offer, or null when it is quote-first. */
export function chargeFor(offer) {
  const pay = offer.pay;
  if (!pay || !offer.priceCents) return null;
  if (pay.type === "full") return { kind: "full", mode: "payment", amountCents: offer.priceCents };
  if (pay.type === "deposit") {
    const percent = pay.percent || 50;
    return { kind: "deposit", mode: "payment", percent, amountCents: Math.round((offer.priceCents * percent) / 100) };
  }
  if (pay.type === "monthly") return { kind: "monthly", mode: "subscription", interval: "month", amountCents: offer.priceCents };
  return null;
}

export function productName(offer, charge) {
  if (charge.kind === "deposit") return `SWFT. ${offer.name} (${charge.percent}% deposit)`;
  if (charge.kind === "monthly") return /monthly/i.test(offer.name) ? `SWFT. ${offer.name}` : `SWFT. ${offer.name} (monthly)`;
  return `SWFT. ${offer.name}`;
}

/** Customer-facing copy for the booking page and checkout. */
export function chargeCopy(offer, charge) {
  const amount = usd(charge.amountCents);
  const total = usd(offer.priceCents);
  if (charge.kind === "deposit") {
    return {
      priceDisplay: `${amount} deposit`,
      ctaLabel: `Pay ${amount} deposit to start`,
      billingNote: `${charge.percent}% deposit on the ${total} starting price. The balance is invoiced before delivery. Your deposit is fully refundable until work starts; extras are quoted before you pay for them.`,
    };
  }
  if (charge.kind === "monthly") {
    return {
      priceDisplay: `${amount}/mo`,
      ctaLabel: `Start at ${amount}/mo`,
      billingNote: `Billed monthly, month-to-month. Cancel anytime. The ${amount}/mo plan covers the monthly deliverables above; extras are quoted first.`,
    };
  }
  return {
    priceDisplay: amount,
    ctaLabel: `Pay ${amount} to start`,
    billingNote: `Paid in full. ${amount} covers the included scope above and is fully refundable until work starts; extras are quoted before you pay for them.`,
  };
}

/** A catalog entry is usable only if it charges exactly what `pay` asks for. */
export function entryMatches(entry, charge) {
  return !!(entry && entry.paymentLinkUrl && entry.amountCents === charge.amountCents && entry.mode === charge.mode);
}

export function bookPath(offer) {
  return offer.bookUrl || `/book/${offer.id}.html`;
}

/**
 * Writes `stripe` + `bookUrl` onto every offer from the catalog; removes them
 * where there is no matching link. Returns a summary.
 */
export function applyPayments(pricing, catalog) {
  const tiers = (catalog && catalog.tiers) || {};
  const summary = { online: [], waiting: [], quote: [] };
  for (const { offer } of allOffers(pricing)) {
    const charge = chargeFor(offer);
    if (!charge) {
      delete offer.stripe;
      delete offer.bookUrl;
      summary.quote.push(offer.id);
      continue;
    }
    const entry = tiers[offer.id];
    if (!entryMatches(entry, charge)) {
      delete offer.stripe;
      delete offer.bookUrl;
      summary.waiting.push(offer.id);
      continue;
    }
    const copy = chargeCopy(offer, charge);
    offer.bookUrl = entry.bookUrl || bookPath(offer);
    offer.stripe = {
      mode: charge.mode,
      kind: charge.kind,
      ...(charge.percent ? { percent: charge.percent } : {}),
      amountCents: charge.amountCents,
      ...(charge.interval ? { interval: charge.interval } : {}),
      productName: productName(offer, charge),
      ctaLabel: copy.ctaLabel,
      priceDisplay: copy.priceDisplay,
      billingNote: copy.billingNote,
      priceId: entry.priceId,
      paymentLinkUrl: entry.paymentLinkUrl,
    };
    summary.online.push(offer.id);
  }
  return summary;
}
