/**
 * Shared Resend helpers for Cloudflare Pages Functions.
 * Env: RESEND_API_KEY (secret), optional RESEND_FROM, NOTIFY_EMAIL
 */
const DEFAULT_FROM = "SWFT Studios <hello@swftstudios.com>";
const DEFAULT_NOTIFY = "hello@swftstudios.com";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send one email via Resend HTTP API.
 * Returns true on success. Never throws.
 */
export async function sendResendEmail(env, { to, subject, html, text, replyTo, idempotencyKey }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey || !to) return false;

  const from = env.RESEND_FROM || DEFAULT_FROM;
  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = replyTo;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey).slice(0, 256);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Resend error", res.status, errBody.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend fetch failed", err);
    return false;
  }
}

export function notifyAddress(env) {
  return env.NOTIFY_EMAIL || DEFAULT_NOTIFY;
}

/** Team alert + visitor confirmation. Best-effort; does not throw. */
export async function sendLeadEmails(env, { kind, visitorEmail, visitorName, teamSubject, teamHtml, confirmSubject, confirmHtml, idempotencyBase }) {
  const notify = notifyAddress(env);
  const base = idempotencyBase || `${kind}/${Date.now()}`;
  const results = { team: false, visitor: false };

  results.team = await sendResendEmail(env, {
    to: notify,
    subject: teamSubject,
    html: teamHtml,
    replyTo: visitorEmail || undefined,
    idempotencyKey: `${base}/team`,
  });

  if (visitorEmail) {
    results.visitor = await sendResendEmail(env, {
      to: visitorEmail,
      subject: confirmSubject,
      html: confirmHtml,
      replyTo: notify,
      idempotencyKey: `${base}/visitor`,
    });
  }

  return results;
}
