/**
 * Cloudflare Pages Function. POST /api/build-request
 * Handles the "Order Your Website" booking flow:
 *   1) Writes the lead to Airtable CRM (Website Build Requests + Pipeline).
 *   2) Optionally opens a Stripe Checkout session for the chosen plan.
 * Env (set in Pages → Settings → Variables and Secrets):
 *   AIRTABLE_TOKEN (secret, required to save)
 *   STRIPE_SECRET_KEY (secret, optional, enables checkout)
 *   optional overrides: AIRTABLE_BASE_ID, AIRTABLE_TABLE,
 *     AIRTABLE_TABLE_PEOPLE, AIRTABLE_TABLE_COMPANIES, AIRTABLE_TABLE_PIPELINE,
 *     STRIPE_PRICE_MONTHLY
 */
import { storeCrmLead } from "../_lib/airtable-crm.js";

const DEFAULTS = {
  STRIPE_PRICE_MONTHLY: "price_1Td9xhAF4d9gCyuNnjPgqkho",
};

const str = (v, max = 2000) => String(v ?? "").trim().slice(0, max);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function createStripeCheckout(env, data) {
  if (!env.STRIPE_SECRET_KEY) return null;
  const params = new URLSearchParams();
  params.set("success_url", `${data.origin}/swft-method.html?status=success`);
  params.set("cancel_url", `${data.origin}/swft-method.html?status=cancel#start`);
  if (data.email) params.set("customer_email", data.email);
  params.set("metadata[plan]", data.plan);
  params.set("metadata[business]", data.businessName.slice(0, 200));
  params.set("metadata[maintenance]", data.maintenance ? "yes" : "no");
  if (data.plan === "Monthly Plan") {
    params.set("mode", "subscription");
    params.set("line_items[0][price]", env.STRIPE_PRICE_MONTHLY || DEFAULTS.STRIPE_PRICE_MONTHLY);
    params.set("line_items[0][quantity]", "1");
  } else {
    const cents = Math.max(0, Math.round(data.oneTimeAmount * 100));
    params.set("mode", "payment");
    params.set("line_items[0][price_data][currency]", "usd");
    params.set("line_items[0][price_data][unit_amount]", String(cents));
    params.set("line_items[0][price_data][product_data][name]", "SWFT Custom Website Build (7-day)");
    params.set("line_items[0][quantity]", "1");
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
    if (!res.ok) return null;
    const j = await res.json();
    return j.url || null;
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const email = str(body.email, 320);
  const name = str(body.name, 200);
  const plan = str(body.plan, 40) === "Monthly Plan" ? "Monthly Plan" : "One-Time Build";
  const maintenance = body.maintenance === true || str(body.maintenance) === "Yes";
  const oneTimeAmount = Math.max(0, Math.min(100000, Number(body.oneTimeAmount) || 0));
  const businessName = str(body.businessName, 200);
  const phone = str(body.phone, 60);
  const sourcePage = str(body.sourcePage, 300);
  const utmSource = str(body.utmSource, 120);
  const utmMedium = str(body.utmMedium, 120);
  const utmCampaign = str(body.utmCampaign, 120);

  const stored = await storeCrmLead(env, {
    formGroup: "Website Build",
    formType: plan,
    person: { name, email, phone },
    company: businessName ? { name: businessName, phone } : undefined,
    sourcePage,
    utmSource,
    utmMedium,
    utmCampaign,
    notes: str(body.anythingElse, 4000),
    formFields: {
      Name: name,
      Email: email,
      Instagram: str(body.instagram, 120),
      Phone: phone,
      "Business Name": businessName,
      "What They Sell": str(body.whatYouSell, 4000),
      "Ideal Customer": str(body.idealCustomer, 4000),
      "Main Goal": str(body.mainGoal, 200),
      "Look and Feel": str(body.lookAndFeel, 4000),
      Features: str(body.features, 4000),
      "Plan Choice": plan,
      "One-Time Price": oneTimeAmount,
      "Maintenance Add-On": maintenance ? "Yes" : "No",
      "Monthly Price": "$299/mo",
      "Content Ready": str(body.contentReady, 200),
      "Has Domain": str(body.hasDomain, 200),
      Timeline: str(body.timeline, 200),
      "Anything Else": str(body.anythingElse, 4000),
      "UTM Source": utmSource,
      "UTM Medium": utmMedium,
      "UTM Campaign": utmCampaign,
      "Source Page": sourcePage,
      Status: "New",
    },
  });

  const checkoutUrl = await createStripeCheckout(env, {
    plan,
    oneTimeAmount,
    maintenance,
    email,
    businessName,
    origin,
  });

  return json({ ok: true, stored, checkoutUrl });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
