/**
 * Cloudflare Pages Function — POST /api/book-tier
 * Books a pricing-ladder tier:
 *   1) Writes the lead to Airtable ("Discovery Calls").
 *   2) Creates a Stripe Checkout session (payment or subscription).
 *   3) Sends Resend team notify + visitor confirmation when configured.
 *
 * Env: AIRTABLE_TOKEN, STRIPE_SECRET_KEY, RESEND_API_KEY
 * optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_CONTACT, RESEND_FROM, NOTIFY_EMAIL
 */
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";
import { getStripeTier } from "../_lib/stripe-tiers.js";

const DEFAULTS = {
  AIRTABLE_BASE_ID: "appjwRgcgS0BD4lT7",
  AIRTABLE_TABLE_CONTACT: "tblGCvDi4RdGkK96L",
};

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

async function writeToAirtable(env, table, fields) {
  if (!env.AIRTABLE_TOKEN) return false;
  const base = env.AIRTABLE_BASE_ID || DEFAULTS.AIRTABLE_BASE_ID;
  try {
    const res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function createStripeCheckout(env, { tier, email, businessName, name, origin, cancelPath }) {
  if (!env.STRIPE_SECRET_KEY) return null;

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
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(tier.amountCents));
  params.set("line_items[0][price_data][product_data][name]", tier.productName);
  params.set(
    "line_items[0][price_data][product_data][description]",
    `${tier.name} — ${tier.priceLabel} (starting checkout)`.slice(0, 500)
  );

  if (tier.mode === "subscription") {
    params.set("line_items[0][price_data][recurring][interval]", tier.interval || "month");
  }

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

  const table = env.AIRTABLE_TABLE_CONTACT || DEFAULTS.AIRTABLE_TABLE_CONTACT;
  const fields = {
    Name: name,
    Email: email,
    "Business Type": tier.name,
    "Primary Goal": `Book ${tier.name} via Stripe (${amountLabel})`,
    Details: [
      `Business: ${businessName}`,
      phone ? `Phone: ${phone}` : "",
      website ? `Website/Social: ${website}` : "",
      `Tier ID: ${tier.id}`,
      `Checkout: ${amountLabel}`,
      `Published range: ${tier.priceLabel}`,
      notes ? `Notes: ${notes}` : "",
      `UTM: ${str(body.utmSource, 80)}/${str(body.utmMedium, 80)}/${str(body.utmCampaign, 80)}`,
      `Source: ${str(body.sourcePage, 300)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    Status: "New",
    "Submitted At": new Date().toISOString(),
  };

  const stored = await writeToAirtable(env, table, fields);

  const checkoutUrl = await createStripeCheckout(env, {
    tier,
    email,
    businessName,
    name,
    origin,
    cancelPath: `/book/${tier.id}.html`,
  });

  if (!checkoutUrl && !env.STRIPE_SECRET_KEY) {
    return json(
      {
        ok: false,
        stored,
        error: "Checkout is temporarily unavailable. Email hello@swftstudios.com or request a Growth Audit.",
      },
      503
    );
  }

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
    teamSubject: `Stripe book: ${tier.name} — ${businessName}`,
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
    confirmSubject: `Next step: complete checkout for ${tier.name} — SWFT Studios`,
    confirmHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for choosing <strong>${escapeHtml(tier.name)}</strong>. Complete Stripe Checkout to lock in your start (${escapeHtml(tier.priceDisplay)}).</p>
      <p>If the checkout tab closed, reopen your booking page or email <a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>.</p>
      <p>— SWFT Studios</p>
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
