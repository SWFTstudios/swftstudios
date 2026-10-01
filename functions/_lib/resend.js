/**
 * Shared Resend helpers for Cloudflare Pages Functions (and the Worker, which
 * reuses these handlers).
 * Env: RESEND_API_KEY (secret), optional RESEND_FROM, NOTIFY_EMAIL
 *
 * Every lead goes to the SWFT inbox, hello@swftstudios.com. NOTIFY_EMAIL (one
 * address or a comma-separated list) adds more recipients; it never replaces
 * the inbox, so a stale env value can't send leads somewhere else.
 */
export const LEAD_INBOX = "hello@swftstudios.com";
const DEFAULT_FROM = `SWFT Studios <${LEAD_INBOX}>`;
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

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
  if (!apiKey || !to) {
    console.error("Resend skipped: missing RESEND_API_KEY or recipient");
    return false;
  }

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

  // One retry for transient failures (rate limit, 5xx, network). The
  // Idempotency-Key makes the retry safe: Resend won't send twice.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
      const errBody = await res.text().catch(() => "");
      console.error("Resend error", res.status, `attempt ${attempt}`, errBody.slice(0, 500));
      if (!RETRY_STATUSES.has(res.status)) return false;
    } catch (err) {
      console.error("Resend fetch failed", `attempt ${attempt}`, err);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

/** All team recipients: the SWFT inbox first, plus any NOTIFY_EMAIL extras. */
export function teamRecipients(env) {
  const extra = String(env.NOTIFY_EMAIL || env.FORMSUBMIT_EMAIL || "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  const seen = new Set();
  return [LEAD_INBOX, ...extra].filter((a) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Primary address shown to visitors / used as reply-to. */
export function notifyAddress() {
  return LEAD_INBOX;
}

/** Team alert + visitor confirmation. Best-effort; does not throw. */
export async function sendLeadEmails(env, { kind, visitorEmail, visitorName, teamSubject, teamHtml, confirmSubject, confirmHtml, idempotencyBase, backupStored = false }) {
  const team = teamRecipients(env);
  const base = idempotencyBase || `${kind}/${Date.now()}`;
  const results = { team: false, visitor: false };

  results.team = await sendResendEmail(env, {
    to: team,
    subject: teamSubject,
    html: teamHtml,
    replyTo: visitorEmail || undefined,
    idempotencyKey: `${base}/team`,
  });

  // Do not assure a visitor we received an inquiry unless our team email
  // succeeded or a durable CRM backup was confirmed.
  if (visitorEmail && (results.team || backupStored)) {
    results.visitor = await sendResendEmail(env, {
      to: visitorEmail,
      subject: confirmSubject,
      html: confirmHtml,
      replyTo: LEAD_INBOX,
      idempotencyKey: `${base}/visitor`,
    });
  }

  return results;
}
