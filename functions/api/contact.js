/**
 * Cloudflare Pages Function. POST /api/contact
 * Writes project inquiries to Airtable CRM (Contact Inquiries + Pipeline).
 * Sends Resend team notify + visitor confirmation when RESEND_API_KEY is set.
 *
 * Env: AIRTABLE_TOKEN, RESEND_API_KEY;
 * optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_CONTACT, AIRTABLE_TABLE_PEOPLE,
 *   AIRTABLE_TABLE_COMPANIES, AIRTABLE_TABLE_PIPELINE, RESEND_FROM, NOTIFY_EMAIL
 */
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";
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

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (str(body.honeypot, 200) || str(body.company_website, 200)) {
    return json({ ok: true, stored: false });
  }

  const name = str(body.name, 200);
  const email = str(body.email, 320);
  if (!name || !email) {
    return json({ ok: false, error: "Name and email are required." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Invalid email." }, 400);
  }

  const phone = str(body.phone, 40);
  const businessName = str(body.businessName, 200);
  const website = str(body.website, 500);
  const businessType = str(body.businessType || body.serviceNeeded, 200);
  const challenge = str(body.challenge, 400);
  const desiredOutcome = str(body.desiredOutcome || body.primaryGoal, 4000);
  const timeline = str(body.timeline, 200);
  const budget = str(body.budget, 200);
  const details = str(body.details, 4000);
  const sourcePage = str(body.sourcePage, 300);
  const utmSource = str(body.utmSource, 120);
  const utmMedium = str(body.utmMedium, 120);
  const utmCampaign = str(body.utmCampaign, 120);

  const stored = await storeCrmLead(env, {
    formGroup: "Project Inquiry",
    formType: "contact",
    person: { name, email, phone },
    company: businessName
      ? { name: businessName, website, phone, industry: businessType }
      : undefined,
    sourcePage,
    utmSource,
    utmMedium,
    utmCampaign,
    notes: details,
    formFields: {
      Name: name,
      Email: email,
      Phone: phone,
      Business: businessName,
      Website: website,
      "Service needed": businessType,
      Challenge: challenge,
      Outcome: desiredOutcome,
      Timeline: timeline,
      Budget: budget,
      Details: details,
      "UTM Source": utmSource,
      "UTM Medium": utmMedium,
      "UTM Campaign": utmCampaign,
      "Source Page": sourcePage,
      Status: "New",
    },
  });

  const emailed = await sendLeadEmails(env, {
    kind: "contact",
    visitorEmail: email,
    visitorName: name,
    idempotencyBase: `contact/${email.toLowerCase()}/${Date.now()}`,
    teamSubject: `Project inquiry: ${businessName || name}`,
    teamHtml: `
      <p><strong>New project inquiry</strong></p>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        ${row("Name", name)}
        ${row("Email", email)}
        ${row("Phone", phone)}
        ${row("Business", businessName)}
        ${row("Website / Social", website)}
        ${row("Service needed", businessType)}
        ${row("Challenge", challenge)}
        ${row("Desired outcome", desiredOutcome)}
        ${row("Timeline", timeline)}
        ${row("Budget", budget)}
        ${row("Details", details)}
        ${row("Source page", sourcePage)}
        ${row("Stored in Airtable", stored ? "Yes" : "No")}
      </table>
      <p style="color:#666;font-size:12px;">Reply to this email to respond to the lead.</p>
    `,
    confirmSubject: "We got your project inquiry. SWFT Studios",
    confirmHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for reaching out. We received your project inquiry and will follow up within one business day.</p>
      <p>Questions sooner? Reply to this message or email hello@swftstudios.com.</p>
      <p>SWFT Studios</p>
    `,
  });

  return json({ ok: true, stored, emailed: !!(emailed.team || emailed.visitor) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
