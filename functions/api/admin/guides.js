/**
 * /api/admin/guides — Free SWFT Growth Guide requests (admin only).
 *   GET                       latest 100 requests, newest first
 *   POST { id, results }      emails the results to the person with the
 *                             1-on-1 booking link, marks the request "sent"
 * Rows come from /api/growth-guide (table growth_guides, migration 0006).
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { escapeHtml, LEAD_INBOX, sendResendEmail } from "../../_lib/resend.js";
import { QUESTIONS } from "../growth-guide.js";

const CAL_URL = "https://cal.com/swftstudios/swft-meeting";

function parse(details) {
  try { return JSON.parse(details || "{}") || {}; } catch { return {}; }
}

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  try {
    const { results } = await gate.db
      .prepare("SELECT * FROM growth_guides ORDER BY datetime(created_at) DESC LIMIT 100")
      .all();
    const guides = (results || []).map((r) => ({
      id: r.id,
      kind: r.kind,
      email: r.email,
      firstName: r.first_name,
      businessName: r.business_name,
      details: parse(r.details),
      status: r.status,
      results: r.results,
      resultsSentAt: r.results_sent_at,
      createdAt: r.created_at,
    }));
    return json({ ok: true, guides, questions: QUESTIONS.map(([stage, key, q]) => ({ stage, key, q })) });
  } catch (err) {
    console.error("admin guides list failed", err);
    return json({ ok: false, error: "Could not load guides. Has migration 0006 been applied?" }, 500);
  }
}

// Plain text from the composer → simple email HTML. Lines starting with "- "
// become a list; a line ending in nothing else after a blank line is a heading.
function resultsHtml(text) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return blocks.map((b) => {
    const lines = b.split("\n").filter((l) => l.trim());
    if (!lines.length) return "";
    const bullets = lines.filter((l) => /^\s*[-•]\s+/.test(l));
    if (bullets.length && bullets.length === lines.length - 1 && !/^\s*[-•]\s+/.test(lines[0])) {
      return `<p style="margin:18px 0 6px;font-weight:600;">${escapeHtml(lines[0])}</p><ul style="margin:0;padding-left:20px;">${bullets.map((l) => `<li style="margin:4px 0;">${escapeHtml(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    if (bullets.length === lines.length) {
      return `<ul style="margin:0;padding-left:20px;">${lines.map((l) => `<li style="margin:4px 0;">${escapeHtml(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
  }).join("");
}

export async function onRequestPost(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const id = str(body.id, 80);
  const results = str(body.results, 12000);
  if (!id || results.length < 20) return json({ ok: false, error: "Write the results first." }, 400);

  const row = await gate.db.prepare("SELECT * FROM growth_guides WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "That request no longer exists." }, 404);

  const name = row.first_name || "there";
  const biz = row.business_name ? ` for ${escapeHtml(row.business_name)}` : "";
  const html = `<p>Hi ${escapeHtml(name)},</p>
    <p>Here are your Free SWFT Growth Guide results${biz}.</p>
    ${resultsHtml(results)}
    <p style="margin-top:22px;">Want to go over them together? Book a free 1-on-1 call (30 minutes):</p>
    <p><a href="${CAL_URL}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b0b0b;color:#fff;text-decoration:none;font-weight:600;">Book my 1-on-1</a></p>
    <p>Or just reply to this email with questions.</p>
    <p>SWFT Studios<br>hello@swftstudios.com</p>`;

  const sent = await sendResendEmail(context.env, {
    to: row.email,
    subject: `Your Free SWFT Growth Guide results${row.business_name ? `: ${row.business_name}` : ""}`,
    html,
    replyTo: LEAD_INBOX,
    // One send per version of the text, so a double click can't email twice
    idempotencyKey: `guide-results/${id}/${results.length}`,
  });
  if (!sent) return json({ ok: false, error: "The email didn't send. Check RESEND_API_KEY and try again." }, 502);

  await gate.db
    .prepare("UPDATE growth_guides SET status = 'sent', results = ?, results_sent_at = datetime('now') WHERE id = ?")
    .bind(results, id)
    .run();
  return json({ ok: true });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
