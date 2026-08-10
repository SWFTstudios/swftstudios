/**
 * Cloudflare Pages Function. POST /api/growth-audit
 * Writes Free Growth Audit leads to Airtable ("Growth Audits"),
 * falling back to "Discovery Calls" when AIRTABLE_TABLE_GROWTH_AUDIT is unset.
 * Sends Resend team notify + visitor confirmation when RESEND_API_KEY is set.
 *
 * Env (Pages → Settings → Variables and Secrets):
 *   AIRTABLE_TOKEN (secret)
 *   RESEND_API_KEY (secret)
 *   optional: AIRTABLE_BASE_ID, AIRTABLE_TABLE_GROWTH_AUDIT, AIRTABLE_TABLE_CONTACT,
 *             RESEND_FROM, NOTIFY_EMAIL
 */
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";

const DEFAULTS = {
  AIRTABLE_BASE_ID: "appjwRgcgS0BD4lT7",
  AIRTABLE_TABLE_CONTACT: "tblGCvDi4RdGkK96L",
  AIRTABLE_TABLE_GROWTH_AUDIT: "",
};

const ALLOWED_SERVICES = new Set([
  "gbp-refresh",
  "website-only",
  "website-content-half",
  "website-content-full",
  "content-growth-retainer",
  "full-growth-partner",
  "not-sure",
]);

const SERVICE_LABELS = {
  "gbp-refresh": "GBP Content Refresh",
  "website-only": "Website Only",
  "website-content-half": "Website + Content Capture",
  "website-content-full": "Website + Extended Content",
  "content-growth-retainer": "Content + Growth Retainer",
  "full-growth-partner": "Full Growth Partner",
  "not-sure": "Not sure, help me choose",
};

const str = (v, max = 4000) => String(v ?? "").trim().slice(0, max);

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function writeToAirtable(env, table, fields) {
  if (!env.AIRTABLE_TOKEN || !table) return false;
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

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 100_000) {
      return json({ ok: false, error: "Payload too large" }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  /* Honeypot, bots fill this; humans never see it */
  if (str(body.honeypot, 200) || str(body.company_website, 200)) {
    return json({ ok: true, stored: false });
  }

  const firstName = str(body.firstName, 120);
  const lastName = str(body.lastName, 120);
  const email = str(body.email, 320);
  const businessName = str(body.businessName, 200);
  const websiteUrl = str(body.websiteUrl || body.website, 500);
  const instagram = str(body.instagram, 300);
  const presence = websiteUrl || instagram || str(body.website, 500);
  const desiredServiceRaw = str(body.desiredService, 80);
  const desiredService = ALLOWED_SERVICES.has(desiredServiceRaw) ? desiredServiceRaw : "";
  const desiredServiceLabel =
    str(body.desiredServiceLabel, 200) || SERVICE_LABELS[desiredService] || desiredService;
  const details = str(body.details, 4000);
  const photoLinks = str(body.photoLinks, 1000);
  const phone = str(body.phone, 40);

  /* Legacy aliases still accepted for older clients */
  const businessCategory =
    str(body.businessCategory, 200) || desiredServiceLabel || "Growth Audit";
  const challenge = str(body.challenge, 400) || desiredServiceLabel || "Growth Audit inquiry";
  const desiredOutcome =
    str(body.desiredOutcome, 4000) || details || `Discuss ${desiredServiceLabel || "next steps"}`;

  if (!firstName || !email || !businessName || !presence || !desiredService) {
    return json({ ok: false, error: "Missing required fields." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Invalid email." }, 400);
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const additionalContext = [details, photoLinks ? `Photo links: ${photoLinks}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const auditTable = env.AIRTABLE_TABLE_GROWTH_AUDIT || DEFAULTS.AIRTABLE_TABLE_GROWTH_AUDIT;
  let stored = false;

  if (auditTable) {
    stored = await writeToAirtable(env, auditTable, {
      "First Name": firstName,
      Email: email,
      Phone: phone,
      "Business Name": businessName,
      "Website or Social": presence,
      "Business Category": businessCategory,
      "Biggest Challenge": challenge,
      "Desired Outcome": desiredOutcome,
      Instagram: instagram,
      "Additional Context": [
        lastName ? `Last name: ${lastName}` : "",
        desiredServiceLabel ? `Desired service: ${desiredServiceLabel}` : "",
        additionalContext,
      ]
        .filter(Boolean)
        .join("\n"),
      "UTM Source": str(body.utmSource, 120),
      "UTM Medium": str(body.utmMedium, 120),
      "UTM Campaign": str(body.utmCampaign, 120),
      "Source Page": str(body.sourcePage, 300),
      Status: "New",
      "Submitted At": new Date().toISOString(),
    });
  } else {
    /* Fallback: Discovery Calls so leads are never silently dropped */
    const contactTable = env.AIRTABLE_TABLE_CONTACT || DEFAULTS.AIRTABLE_TABLE_CONTACT;
    stored = await writeToAirtable(env, contactTable, {
      Name: fullName || firstName,
      Email: email,
      "Business Type": desiredServiceLabel || businessCategory,
      "Primary Goal": `Growth Audit. ${desiredServiceLabel || challenge}`,
      Details: [
        `Business: ${businessName}`,
        lastName ? `Last name: ${lastName}` : "",
        `Website: ${websiteUrl}`,
        `Social: ${instagram}`,
        `Desired service: ${desiredServiceLabel}`,
        `Phone: ${phone}`,
        `Photo links: ${photoLinks}`,
        `Context: ${str(details, 2000)}`,
        `UTM: ${str(body.utmSource, 80)}/${str(body.utmMedium, 80)}/${str(body.utmCampaign, 80)}`,
        `Source: ${str(body.sourcePage, 200)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      Status: "New",
      "Submitted At": new Date().toISOString(),
    });
  }

  const idempotencyBase = `growth-audit/${email.toLowerCase()}/${Date.now()}`;
  const emailed = await sendLeadEmails(env, {
    kind: "growth-audit",
    visitorEmail: email,
    visitorName: firstName,
    idempotencyBase,
    teamSubject: `Growth Audit: ${businessName}${desiredServiceLabel ? ` (${desiredServiceLabel})` : ""}`,
    teamHtml: `
      <p><strong>New Growth Audit request</strong></p>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        ${row("Name", fullName || firstName)}
        ${row("Email", email)}
        ${row("Phone", phone)}
        ${row("Business", businessName)}
        ${row("Website", websiteUrl)}
        ${row("Social", instagram)}
        ${row("Desired service", desiredServiceLabel)}
        ${row("Details", details)}
        ${row("Photo links", photoLinks)}
        ${row("UTM", [str(body.utmSource, 80), str(body.utmMedium, 80), str(body.utmCampaign, 80)].filter(Boolean).join(" / "))}
        ${row("Source page", str(body.sourcePage, 200))}
        ${row("Stored in Airtable", stored ? "Yes" : "No")}
      </table>
      <p style="color:#666;font-size:12px;">Reply to this email to respond to the lead.</p>
    `,
    confirmSubject: "We got your Growth Audit request. SWFT Studios",
    confirmHtml: `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Thanks for requesting a Free Growth Audit for <strong>${escapeHtml(businessName)}</strong>.</p>
      <p>We'll review your site and send personalized recommendations to this email within a few business days.</p>
      <p>If you haven't booked a call yet, you can pick a time here: <a href="https://cal.com/swftstudios/swft-meeting">cal.com/swftstudios/swft-meeting</a>.</p>
      <p>Questions in the meantime? Just reply to this message or email hello@swftstudios.com.</p>
      <p>SWFT Studios</p>
    `,
  });

  return json({ ok: true, stored, emailed: !!(emailed.team || emailed.visitor) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
