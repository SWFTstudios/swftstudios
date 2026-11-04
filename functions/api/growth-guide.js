/**
 * Cloudflare Pages Function. POST /api/growth-guide
 * The Free SWFT Growth Guide (replaces the Free Growth Audit). Three kinds:
 *
 *   kind "diy"      { firstName, email }
 *       Emails the visitor a link to the online worksheet (/guide-worksheet.html)
 *       and the cal.com link to go over it together. Team gets a heads-up.
 *   kind "dfy"      { firstName, email, businessName, links, sells, customers, goal, notes }
 *       "Do it for me": visitor gets a "we received it" email; team gets the
 *       details and sends the results (with the 1-on-1 link) by hand later.
 *   kind "answers"  { firstName, email, answers: { key: value } }
 *       The visitor finished the worksheet online: both sides get a copy of
 *       the answers, the visitor gets the cal.com link.
 *
 * Every kind is saved to the CRM (Growth Audits table, form type says which),
 * the Sheets lead log via storeLead, and D1 growth_guides (admin Guides tab).
 * Env: RESEND_API_KEY, AIRTABLE_TOKEN (+ the optional ones in growth-audit.js)
 */
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";
import { storeLead } from "../_lib/leads.js";
import { siteOrigin } from "../_lib/subscribers.js";

const CAL_URL = "https://cal.com/swftstudios/swft-meeting";
const str = (v, max = 4000) => String(v ?? "").trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Worksheet questions, in order. Keys must match guide-worksheet.html.
export const QUESTIONS = [
  ["build", "seconds", "Someone landing on my website can tell what I do within ___ seconds."],
  ["build", "action", "The one thing I want visitors to do is ___."],
  ["build", "speed", "On a phone, my site loads in about ___ seconds."],
  ["build", "updated", "I last updated my website ___ ago."],
  ["build", "tracking", "I keep track of leads and customers in ___."],
  ["grow", "found", "Most new customers find me through ___."],
  ["grow", "reviews", "My Google Business Profile has ___ reviews."],
  ["grow", "rating", "My average rating is ___ stars."],
  ["grow", "posts", "I post new photos or video about ___ times a month."],
  ["grow", "adSpend", "Last month I spent $___ on ads."],
  ["grow", "adLeads", "Those ads brought in about ___ leads."],
  ["automate", "reply", "When a new lead comes in, I usually reply within ___."],
  ["automate", "followUp", "If someone doesn't book or buy, I follow up ___."],
  ["automate", "askReview", "I ask happy customers for a review ___."],
  ["automate", "bestChannel", "My best customers usually come from ___."],
  ["goals", "goal90", "In the next 90 days, I want to ___."],
  ["goals", "fixOne", "If I could fix one thing tomorrow, it would be ___."],
];
const STAGE_LABEL = { build: "Build the foundation", grow: "Grow your reach", automate: "Automate the rest", goals: "Next 90 days" };

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
}
const table = (rows) => `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">${rows}</table>`;

function answersHtml(answers) {
  let out = "", stage = "";
  for (const [st, key, q] of QUESTIONS) {
    const a = str(answers?.[key], 400);
    if (st !== stage) {
      stage = st;
      out += `<tr><td colspan="2" style="padding:14px 0 4px;font-weight:600;">${escapeHtml(STAGE_LABEL[st])}</td></tr>`;
    }
    out += `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#666;">${escapeHtml(q.replace("___", "…"))}</td><td style="padding:4px 0;">${a ? escapeHtml(a) : '<span style="color:#999;">(blank)</span>'}</td></tr>`;
  }
  return table(out);
}
function cleanAnswers(raw) {
  const out = {};
  for (const [, key] of QUESTIONS) {
    const v = str(raw?.[key], 400);
    if (v) out[key] = v;
  }
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 40_000) return json({ ok: false, error: "That's too much text. Shorten a few answers and try again." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  if (str(body.honeypot, 200)) return json({ ok: true });

  const kind = str(body.kind, 20);
  const firstName = str(body.firstName, 120);
  const email = str(body.email, 320);
  if (!["diy", "dfy", "answers"].includes(kind)) return json({ ok: false, error: "Pick how you want to do the guide." }, 400);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);

  const origin = siteOrigin(env, request);
  const worksheetUrl = `${origin}/guide-worksheet.html?email=${encodeURIComponent(email)}${firstName ? `&name=${encodeURIComponent(firstName)}` : ""}`;
  const hi = `<p>Hi ${escapeHtml(firstName || "there")},</p>`;
  const sign = "<p>SWFT Studios<br>hello@swftstudios.com</p>";
  const sourcePage = str(body.sourcePage, 300);
  const base = `growth-guide/${kind}/${email.toLowerCase()}/${Date.now()}`;

  let lead, mail, details = {};
  if (kind === "diy") {
    lead = { formType: "Growth Guide · Do it myself", notes: "Sent the worksheet link." };
    mail = {
      teamSubject: `Growth Guide (do it myself): ${firstName || email}`,
      teamHtml: `<p><strong>Someone started the Free SWFT Growth Guide on their own.</strong></p>${table(row("Name", firstName) + row("Email", email) + row("Source page", sourcePage))}<p style="color:#666;font-size:12px;">You'll get their answers if they send them from the worksheet.</p>`,
      confirmSubject: "Your Free SWFT Growth Guide",
      confirmHtml: `${hi}
        <p>Here's your Free SWFT Growth Guide. It takes about 10 minutes: fill in the blanks for each stage (build, grow, automate), then send your answers to yourself.</p>
        <p><a href="${worksheetUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b0b0b;color:#fff;text-decoration:none;font-weight:600;">Open my guide</a></p>
        <p>When you're done, pick a time to go over it together (free, 30 minutes): <a href="${CAL_URL}">${CAL_URL.replace("https://", "")}</a></p>
        ${sign}`,
    };
  } else if (kind === "dfy") {
    const businessName = str(body.businessName, 200);
    const links = str(body.links, 1000);
    const sells = str(body.sells, 400);
    const customers = str(body.customers, 400);
    const goal = str(body.goal, 600);
    const notes = str(body.notes, 2000);
    if (!businessName || !links || !sells || !goal) {
      return json({ ok: false, error: "Fill in your business name, links, what you sell and what you want." }, 400);
    }
    details = { businessName, links, sells, customers, goal, notes };
    lead = {
      formType: "Growth Guide · Do it for me",
      company: { name: businessName, website: /^https?:\/\//i.test(links.split(/\s|,/)[0]) ? links.split(/\s|,/)[0] : undefined },
      notes: [`Sells: ${sells}`, customers && `Customers: ${customers}`, `Goal: ${goal}`, notes && `Notes: ${notes}`].filter(Boolean).join("\n"),
      fields: { "Business Name": businessName, "Website or Social": links, "Desired Outcome": goal, "Additional Context": notes },
    };
    mail = {
      teamSubject: `Growth Guide (do it for me): ${businessName}`,
      teamHtml: `<p><strong>New "do it for me" Growth Guide.</strong> Fill in their guide and email the results with your 1-on-1 link (${CAL_URL}).</p>
        ${table(row("Name", firstName) + row("Email", email) + row("Business", businessName) + row("Links", links) + row("What they sell", sells) + row("Customers", customers) + row("90-day goal", goal) + row("Anything else", notes) + row("Source page", sourcePage))}`,
      confirmSubject: "We got your details. SWFT Studios",
      confirmHtml: `${hi}
        <p>Thanks for sending the details for <strong>${escapeHtml(businessName)}</strong>. We're working through your Free SWFT Growth Guide now.</p>
        <p>Within a few business days you'll get a second email with your results and a link to book a free 1-on-1 call to go over them.</p>
        <p>Want to add something in the meantime? Just reply to this email.</p>
        ${sign}`,
    };
  } else {
    const answers = cleanAnswers(body.answers);
    if (!Object.keys(answers).length) return json({ ok: false, error: "Fill in at least one answer first." }, 400);
    details = { answers };
    lead = { formType: "Growth Guide · Answers", notes: QUESTIONS.filter(([, k]) => answers[k]).map(([, k, q]) => `${q.replace("___", "…")} ${answers[k]}`).join("\n") };
    mail = {
      teamSubject: `Growth Guide answers: ${firstName || email}`,
      teamHtml: `<p><strong>Growth Guide answers</strong> from ${escapeHtml(firstName || "")} &lt;${escapeHtml(email)}&gt;</p>${answersHtml(answers)}`,
      confirmSubject: "Your Growth Guide answers",
      confirmHtml: `${hi}
        <p>Here's a copy of your Free SWFT Growth Guide answers. Keep it handy.</p>
        ${answersHtml(answers)}
        <p style="margin-top:20px;">Next step: pick a time to go over it together (free, 30 minutes).</p>
        <p><a href="${CAL_URL}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b0b0b;color:#fff;text-decoration:none;font-weight:600;">Pick a time</a></p>
        ${sign}`,
    };
  }

  // Keep a copy for the admin Guides tab (migration 0006). Never blocks the visitor.
  if (env.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO growth_guides (id, kind, email, first_name, business_name, details) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), kind, email, firstName || null, details.businessName || null, JSON.stringify(details)).run();
    } catch (err) {
      console.error("growth_guides insert failed", err);
    }
  }

  const saved = await storeLead(env, {
    formGroup: "Growth Audit", // same CRM table the audit used
    formType: lead.formType,
    person: { name: firstName || email, email, firstName },
    company: lead.company || { name: firstName ? `${firstName} (Growth Guide)` : "Growth Guide" },
    sourcePage,
    notes: lead.notes,
    formFields: { "First Name": firstName, Email: email, "Desired Service": lead.formType, "Source Page": sourcePage, Status: "New", ...(lead.fields || {}) },
  });
  const emailed = await sendLeadEmails(env, {
    kind: `growth-guide-${kind}`,
    visitorEmail: email,
    visitorName: firstName,
    backupStored: saved.stored,
    idempotencyBase: base,
    ...mail,
  });

  if (!saved.stored && !emailed.team) {
    return json({ ok: false, error: "We couldn't send that. Email hello@swftstudios.com or try again shortly." }, 503);
  }
  return json({ ok: true, kind, emailed: !!emailed.visitor, calUrl: CAL_URL });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
