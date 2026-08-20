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

  if (str(body.honeypot, 200) || str(body.company_website, 200)) {
    return json({ ok: true, stored: false, checkoutUrl: null });
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
  const notes = str(body.notes, 4000);
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
  const amountLabel =
    tier.mode === "subscription"
      ? `${tier.priceDisplay} (subscription)`
      : `${tier.priceDisplay} (one-time start)`;

  const stored = await storeCrmLead(env, {
    formGroup: "Paid Booking",
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

  const cancelPath =
    tier.id === "gbp-refresh" ? "/book/gbp-content-refresh.html" : `/book/${tier.id}.html`;
  const checkoutUrl = await resolveCheckoutUrl(env, {
    tier,
    email,
    businessName,
    name,
    origin,
    cancelPath,
  });

  if (!checkoutUrl) {
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
    idempotencyBase: `book-tier/${tier.id}/${email.toLowerCase()}/${Date.now()}`,
    teamSubject: `Stripe book: ${tier.name}. ${businessName}`,
    teamHtml: `
      <p><strong>New tier booking (heading to Stripe)</strong></p>
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
    confirmSubject: `Next step: complete checkout for ${tier.name}. SWFT Studios`,
    confirmHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for choosing <strong>${escapeHtml(tier.name)}</strong>. Complete Stripe Checkout to lock in your start (${escapeHtml(tier.priceDisplay)}).</p>
      <p>If the checkout tab closed, reopen your booking page or email <a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>.</p>
      <p>SWFT Studios</p>
    `,
  });

  return json({
    ok: true,
    stored,
    checkoutUrl,
    emailed: !!(emailed.team || emailed.visitor),
    tierId: tier.id,
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
