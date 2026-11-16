/**
 * Cloudflare Pages Function. POST /api/contact
 * Writes project inquiries to Airtable CRM (Contact Inquiries + Pipeline) and
 * the Google Sheets lead log, then emails hello@swftstudios.com (Resend) with a
 * visitor confirmation. If Resend fails, the Google Sheets script emails hello@.
 *
 * Response: 200 { ok:true, stored, emailDelivered } once at least one durable
 * channel (CRM row or team email) confirmed the inquiry; 503 { ok:false,
 * code:"delivery_unavailable" } when none did, so the page never shows a false
 * success. Submissions marked [SWFT TEST] are QA: stored with Status "Test",
 * no Pipeline card, a "[TEST]" team subject and no visitor confirmation.
 * `submissionId` (from the page) makes a repeated send of the same inquiry
 * idempotent at the email provider.
 *
 * Env: AIRTABLE_TOKEN, RESEND_API_KEY, GOOGLE_SHEETS_WEBHOOK_URL, GOOGLE_SHEETS_SECRET;
 * optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_CONTACT, AIRTABLE_TABLE_PEOPLE,
 *   AIRTABLE_TABLE_COMPANIES, AIRTABLE_TABLE_PIPELINE, RESEND_FROM, NOTIFY_EMAIL
 */
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";
import { storeLead } from "../_lib/leads.js";
import { sheetsConfigured } from "../_lib/sheets.js";

const TEST_MARKER = /\[\s*SWFT\s+TEST\b/i;

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
  const submissionId = /^[A-Za-z0-9-]{8,64}$/.test(str(body.submissionId, 64)) ? str(body.submissionId, 64) : "";
  const isTest = [name, businessName, challenge, details].some((v) => TEST_MARKER.test(v));

  // Which delivery channels exist here (booleans only, never values). Logged when
  // none exists, because then every inquiry fails until a secret is restored.
  const channels = { airtable: !!env.AIRTABLE_TOKEN, resend: !!env.RESEND_API_KEY, sheets: sheetsConfigured(env) };
  if (!channels.airtable && !channels.resend && !channels.sheets) {
    console.error("contact: no delivery channel configured (AIRTABLE_TOKEN, RESEND_API_KEY and GOOGLE_SHEETS_* all unset)");
  }

  const saved = await storeLead(env, {
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
    isTest,
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
      Status: isTest ? "Test" : "New",
    },
  });

  const emailed = await sendLeadEmails(env, {
    kind: "contact",
    visitorEmail: email,
    visitorName: name,
    backupStored: saved.stored,
    sendVisitorConfirmation: !isTest,
    idempotencyBase: submissionId ? `contact/${submissionId}` : `contact/${email.toLowerCase()}/${Date.now()}`,
    teamSubject: `${isTest ? "[TEST] " : ""}Project inquiry: ${businessName || name}`,
    teamHtml: `
      <p><strong>${isTest ? "QA test inquiry (no follow-up needed)" : "New project inquiry"}</strong></p>
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
        ${row("Saved to", saved.label)}
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

  if (!saved.stored && !emailed.team) {
    console.error("contact: inquiry not delivered", JSON.stringify({ channels, stored: false, emailed: false, test: isTest }));
    return json({ ok: false, code: "delivery_unavailable",
      error: "We couldn't deliver your request. Please email hello@swftstudios.com or try again shortly."
    }, 503);
  }
  if (!saved.stored || !emailed.team) {
    console.error("contact: partial delivery", JSON.stringify({ stored: saved.stored, emailed: !!emailed.team, test: isTest }));
  }
  return json({
    ok: true,
    test: isTest || undefined,
    stored: saved.stored,
    emailDelivered: !!emailed.team,
    emailed: !!emailed.team,
    warning: !emailed.team
      ? "Your request was saved but email delivery could not be confirmed."
      : undefined
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
