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
import { storeCrmLeadDetailed } from "../_lib/airtable-crm.js";
import { crmStatusRow, emailScope, finishSubmission, resolveSubmissionId, shortRef } from "../_lib/form-delivery.js";
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";

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

  if (!name || !email) {
    return json({ ok: false, error: "Name and email are required." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Invalid email." }, 400);
  }

  const submissionId = resolveSubmissionId(body);
  const crm = await storeCrmLeadDetailed(env, {
    submissionId,
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
  const stored = crm.ok;

  const checkoutUrl = await createStripeCheckout(env, {
    plan,
    oneTimeAmount,
    maintenance,
    email,
    businessName,
    origin,
  });

  const buildDetails = [
    ["Plan", plan],
    ["One-time amount requested", "$" + oneTimeAmount.toFixed(2)],
    ["Monthly maintenance", maintenance ? "Yes" : "No"],
    ["Business", businessName],
    ["Name", name],
    ["Email", email],
    ["Phone", phone],
    ["Instagram", str(body.instagram, 120)],
    ["What they sell", str(body.whatYouSell, 4000)],
    ["Ideal customer", str(body.idealCustomer, 4000)],
    ["Main goal", str(body.mainGoal, 200)],
    ["Look and feel", str(body.lookAndFeel, 4000)],
    ["Features", str(body.features, 4000)],
    ["Content ready", str(body.contentReady, 200)],
    ["Has domain", str(body.hasDomain, 200)],
    ["Timeline", str(body.timeline, 200)],
    ["Anything else", str(body.anythingElse, 4000)],
    ["Source page", sourcePage]
  ];
  const emailRows = buildDetails.filter(([, value]) => value).map(([label, value]) =>
    '<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">' +
      escapeHtml(label) + '</td><td>' + escapeHtml(value) + '</td></tr>'
  ).join("");
  const emailed = await sendLeadEmails(env, {
    kind: "website-build",
    visitorEmail: email,
    visitorName: name,
    backupStored: stored,
    idempotencyBase: `website-build/${emailScope(body, submissionId)}`,
    teamSubject: `New website build request: ${businessName || name}`,
    teamHtml: '<p><strong>New SWFT website build request</strong></p><table>' +
      emailRows + '<tr><td style="padding:6px 12px 6px 0;color:#666">Reference</td><td>' +
      shortRef(submissionId) + '</td></tr>' + crmStatusRow(crm) + '</table>',
    confirmSubject: "We received your SWFT website build request",
    confirmHtml: '<p>Hi ' + escapeHtml(name) +
      ',</p><p>We received your website build details and will contact you about next steps.</p>' +
      '<p>Questions? Reply to this email or write to elombe@swftstudios.com.</p>'
  });

  return finishSubmission({
    route: "/api/build-request",
    submissionId,
    crm,
    emailed,
    extra: { checkoutUrl },
    failureMessage: "We couldn't deliver your build request. Your answers are still here, so you can try again",
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
