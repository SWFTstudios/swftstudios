/**
 * Cloudflare Pages Function. POST /api/book-tier
 * Books a pricing-ladder tier:
 *   1) Writes the lead to Airtable CRM (Paid Bookings + Pipeline).
 *   2) Returns the durable Stripe Payment Link for that tier (no secret key required).
 *   3) Sends Resend team notify + visitor confirmation when configured.
 *
 * Env: AIRTABLE_TOKEN, RESEND_API_KEY
 * optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_*, RESEND_FROM, NOTIFY_EMAIL,
 *   STRIPE_PAYMENT_LINK_* overrides, STRIPE_SECRET_KEY (optional Checkout fallback)
 */
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";
import { getStripeTier, resolvePaymentLinkUrl, resolveStripePriceId } from "../_lib/stripe-tiers.js";
import { storeCrmLead } from "../_lib/airtable-crm.js";

const str = (v, max = 4000) => String(v ?? "").trim().slice(0, max);

// Canonical scope + indicative one-time pricing. Do NOT accept prices or labels
// from the browser. Add-ons are ALWAYS quote-only with no Stripe redirect.
const ADD_ON_CATALOG = {
  "extra-pages": ["Additional page", "Website extras", 17500],
  "content-shoot": ["Add an original photo + video shoot", "Website extras", null],
  "booking-advanced": ["Advanced booking setup", "Website extras", null],
  "shopify-migration": ["Store or catalog migration", "Website extras", null],
  "automations": ["CRM + email follow-ups", "Website extras", null],
  "multilingual": ["Multilingual pages", "Website extras", null],
  "priority-launch": ["Priority launch", "Website extras", null],
  "extra-reels": ["Extra edited Reel", "Content extras", 12500],
  "testimonials": ["Filmed testimonial", "Content extras", 17500],
  "extra-photos": ["10 extra edited photos", "Content extras", 10000],
  "product-detail": ["Product / detail photos", "Content extras", null],
  "extra-location": ["Additional location", "Content extras", null],
  "extra-shoot": ["Extra filming hour", "Content extras", 15000],
  "raw-assets": ["Raw footage delivery", "Content extras", 10000],
  "location-profiles": ["Additional Google Business Profile", "Local visibility extras", 17500],
  "local-page": ["Local landing page", "Local visibility extras", 25000],
  "review-flow": ["Advanced review follow-up", "Local visibility extras", null],
  "monthly-visibility": ["Ongoing local content", "Local visibility extras", null],
  "social-posting": ["Social media posting", "Growth extras", null],
  "email-campaign": ["Email campaign", "Growth extras", null],
  "campaign-extra": ["Extra ad campaign", "Growth extras", null],
  "landing-campaign": ["Dedicated campaign landing page", "Growth extras", null],
  "reporting-extra": ["Deeper reporting", "Growth extras", null],
};
const usd = (cents) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
}).format(cents / 100);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
}

/** Prefer Payment Links (no secret key). Optional Checkout Session if STRIPE_SECRET_KEY is set. */
async function resolveCheckoutUrl(env, { tier, email, businessName, name, origin, cancelPath }) {
  const paymentLink = resolvePaymentLinkUrl(env, tier.id, email);
  if (paymentLink) return paymentLink;

  if (!env.STRIPE_SECRET_KEY) return null;

  const priceId = resolveStripePriceId(env, tier.id);
  if (!priceId) {
    console.error("Missing Stripe Price ID for tier", tier.id);
    return null;
  }

  const successUrl = `${origin}/book/thank-you.html?tier=${encodeURIComponent(tier.id)}&status=success`;
  const cancelUrl = `${origin}${cancelPath || `/book/${tier.id}.html`}?status=cancel`;

  const params = new URLSearchParams();
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  if (email) params.set("customer_email", email);
  params.set("mode", tier.mode);
  params.set("metadata[tierId]", tier.id);
  params.set("metadata[tierName]", tier.name.slice(0, 200));
  params.set("metadata[business]", businessName.slice(0, 200));
  params.set("metadata[name]", name.slice(0, 200));
  params.set("client_reference_id", `${tier.id}:${email}`.slice(0, 200));
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price]", priceId);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Stripe checkout error", res.status, errBody.slice(0, 500));
      return null;
    }
    const session = await res.json();
    return session.url || null;
  } catch (err) {
    console.error("Stripe checkout fetch failed", err);
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 50_000) {
      return json({ ok: false, error: "Payload too large" }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // Honeypot only — do not treat visible "website" as spam. Autofill used to fill
  // legacy company_website and silently block Payment Links for real leads.
  if (str(body.honeypot, 200) || str(body.swft_hp_confirm, 200)) {
    // Never return a fake-success response that leaves the client stranded on
    // the review step without a quoteRequested or checkoutUrl field.
    return json({ ok: false, error: "A hidden form field was autofilled. Refresh and try again, or email elombe@swftstudios.com." }, 400);
  }

  const tier = getStripeTier(body.tierId);
  if (!tier) {
    return json({ ok: false, error: "Unknown pricing tier." }, 400);
  }

  const name = str(body.name, 200);
  const email = str(body.email, 320);
  const businessName = str(body.businessName, 200);
  const phone = str(body.phone, 40);
  const website = str(body.website, 500);
  // Customization is intake, not a price authority. Selected add-ons always
  // require an individual quote; do not redirect these leads to a base plan.
  const rawChoices = body.customization && typeof body.customization === "object"
    ? body.customization : {};
  const rawAddOns = Array.isArray(rawChoices.addOns) ? rawChoices.addOns : [];
  if (rawAddOns.length > 24) return json({ ok: false, error: "Too many selected add-ons." }, 400);
  const seenAddOns = new Set();
  const addOns = [];
  for (const raw of rawAddOns) {
    const id = str(raw?.id, 80);
    const entry = Object.hasOwn(ADD_ON_CATALOG, id) ? ADD_ON_CATALOG[id] : null;
    const qty = raw?.quantity === undefined ? 1 : Number(raw.quantity);
    if (!entry || !Number.isInteger(qty) || qty < 1 || qty > 5) {
      return json({ ok: false, error: "Invalid add-on selection or quantity." }, 400);
    }
    if (seenAddOns.has(id)) return json({ ok: false, error: "Duplicate add-on selection." }, 400);
    seenAddOns.add(id);
    addOns.push({ id, label: entry[0], group: entry[1], priceCents: entry[2], quantity: qty });
  }
  const quoteOnly = body.quoteOnly === true || addOns.length > 0;
  const pricedSubtotalCents = addOns.reduce(
    (total, item) => total + (item.priceCents === null ? 0 : item.priceCents * item.quantity), 0
  );
  const customCount = addOns.filter((item) => item.priceCents === null).length;
  const investmentNote = tier.mode === "subscription"
    ? ("Base " + tier.priceDisplay +
        (pricedSubtotalCents ? "; ONE-TIME priced extras estimate " + usd(pricedSubtotalCents) : "") +
        (customCount ? "; " + customCount + " custom-priced " + (customCount === 1 ? "item" : "items") + " excluded" : ""))
    : ("Base " + tier.priceDisplay + "; estimated project investment " +
        usd(tier.amountCents + pricedSubtotalCents) +
        (customCount ? " PLUS " + customCount + " custom-priced " +
          (customCount === 1 ? "item" : "items") + " excluded" : ""));
  const goal = str(rawChoices.goal, 200);
  const timeline = str(rawChoices.timeline, 100);
  const platform = str(rawChoices.platform, 100);
  const personalNotes = str(body.notes, 2200);
  const customizationNotes = [
    "ORDER CUSTOMIZATION",
    "Goal: " + (goal || "Not specified"),
    "Requested add-ons: " + (addOns.length
      ? addOns.map((item) => item.label + " [" + item.group + "]" +
          " x" + item.quantity + " - " +
          (item.priceCents === null ? "custom quote" : usd(item.priceCents * item.quantity) + " indicative one-time"))
          .join(", ")
      : "None"),
    (quoteOnly ? "PRE-QUOTE ESTIMATE, NO PAYMENT: " : "BASE CHECKOUT AMOUNT: ") + investmentNote,
    "Timeline: " + (timeline || "Not specified"),
    "Platform: " + (platform || "Not specified"),
    "Request type: " + (quoteOnly ? "Custom quote - NO PAYMENT" : "Base Stripe checkout"),
    personalNotes ? "Client notes: " + personalNotes : "",
  ].filter(Boolean).join("\n");
  const notes = str(customizationNotes, 4000);
  const sourcePage = str(body.sourcePage, 300);
  const utmSource = str(body.utmSource, 120);
  const utmMedium = str(body.utmMedium, 120);
  const utmCampaign = str(body.utmCampaign, 120);

  if (!name || !email || !businessName) {
    return json({ ok: false, error: "Name, email, and business name are required." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Invalid email." }, 400);
  }

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const amountLabel = quoteOnly
    ? `Custom quote requested (no charge) · ${investmentNote}`
    : tier.mode === "subscription"
      ? `${tier.priceDisplay} (subscription)`
      : `${tier.priceDisplay} (one-time start)`;

  const stored = await storeCrmLead(env, {
    formGroup: "Paid Booking", // Existing CRM booking intake; quoteOnly is labeled explicitly below.
    formType: tier.name,
    person: { name, email, phone },
    company: { name: businessName, website, phone },
    sourcePage,
    utmSource,
    utmMedium,
    utmCampaign,
    notes,
    formFields: {
      Name: name,
      Email: email,
      Business: businessName,
      Phone: phone,
      Website: website,
      "Tier ID": tier.id,
      "Tier Name": tier.name,
      "Checkout amount label": amountLabel,
      Notes: notes,
      "UTM Source": utmSource,
      "UTM Medium": utmMedium,
      "UTM Campaign": utmCampaign,
      "Source Page": sourcePage,
      Status: "New",
    },
  });

  // Airtable is a helpful CRM backup, not a prerequisite for email delivery.
  // A valid quote must reach the SWFT inbox OR be stored durably.
  // Do not discard a customer request solely because Airtable is unavailable.

  const cancelPath =
    tier.id === "gbp-refresh" ? "/book/gbp-content-refresh.html" : `/book/${tier.id}.html`;
  const checkoutUrl = quoteOnly ? null : await resolveCheckoutUrl(env, {
    tier,
    email,
    businessName,
    name,
    origin,
    cancelPath,
  });

  if (!quoteOnly && !checkoutUrl) {
    return json(
      {
        ok: false,
        stored,
        error: "Unable to start checkout right now. Please try again or email hello@swftstudios.com.",
      },
      502
    );
  }

  const emailed = await sendLeadEmails(env, {
    kind: "book-tier",
    visitorEmail: email,
    visitorName: name,
    backupStored: stored,
    idempotencyBase: `book-tier/${tier.id}/${email.toLowerCase()}/${Date.now()}`,
    teamSubject: `${quoteOnly ? "Custom quote" : "Stripe book"}: ${tier.name}. ${businessName}`,
    teamHtml: `
      <p><strong>${quoteOnly ? "Custom order quote request - no charge" : "New tier booking (heading to Stripe)"}</strong></p>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        ${row("Tier", tier.name)}
        ${row("Checkout", amountLabel)}
        ${row("Name", name)}
        ${row("Email", email)}
        ${row("Phone", phone)}
        ${row("Business", businessName)}
        ${row("Website / Social", website)}
        ${row("Notes", notes)}
        ${row("Stored in Airtable", stored ? "Yes" : "No")}
      </table>
      <p style="color:#666;font-size:12px;">Reply to this email to respond to the lead.</p>
    `,
    confirmSubject: `${quoteOnly ? "We received your custom SWFT request" : "Next step: complete checkout for " + tier.name}. SWFT Studios`,
    confirmHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for choosing <strong>${escapeHtml(tier.name)}</strong>. ${quoteOnly ? "We have your preferences and will email you to discuss a scoped quote. No payment was taken." : "Complete Stripe Checkout to lock in your start (" + escapeHtml(tier.priceDisplay) + ")."}</p>
      <p>${quoteOnly ? "Questions in the meantime?" : "If the checkout tab closed, reopen your booking page or"} Email <a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>.</p>
      <p>SWFT Studios</p>
    `,
  });

  // Never claim success for an undelivered, unrecorded form.
  // A customer confirmation alone is not proof the owner received the lead.
  if (!stored && !emailed.team) {
    return json({
      ok: false,
      error: "We couldn't deliver your request. Please email elombe@swftstudios.com or try again shortly.",
      stored: false,
      emailDelivered: false,
    }, 503);
  }

  return json({
    ok: true,
    stored,
    checkoutUrl,
    quoteRequested: quoteOnly,
    emailDelivered: !!emailed.team,
    emailed: !!emailed.team,
    warning: !emailed.team
      ? "Your request was saved, but email delivery could not be confirmed. Please email elombe@swftstudios.com if it is urgent."
      : undefined,
    tierId: tier.id,
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
