/**
 * Shared Resend helpers for Cloudflare Pages Functions.
 * Env: RESEND_API_KEY (secret), optional RESEND_FROM, NOTIFY_EMAIL
 */
const DEFAULT_FROM = "SWFT Studios <hello@swftstudios.com>";
const DEFAULT_NOTIFY = "elombe@swftstudios.com";
const RESEND_URL = "https://api.resend.com/emails";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip anything that looks like an API key before it reaches a log line. */
function sanitize(text, max = 300) {
  return String(text ?? "")
    .replace(/re_[A-Za-z0-9_]{6,}/g, "re_[redacted]")
    .replace(/\s+/g, " ")
    .slice(0, max);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one email via the Resend HTTP API and report exactly what happened.
 * Never throws. Retries once on 429 / 5xx / network errors with the SAME
 * Idempotency-Key, so a retry can never deliver twice.
 *
 * @returns {Promise<{ ok: boolean, status: number, code: string, message?: string, id?: string, transient?: boolean, duplicate?: boolean }>}
 */
export async function sendResendEmailDetailed(env, { to, subject, html, text, replyTo, idempotencyKey }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, status: 0, code: "missing_api_key" };
  if (!to) return { ok: false, status: 0, code: "missing_recipient" };

  const payload = {
    from: env.RESEND_FROM || DEFAULT_FROM,
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

  let result = { ok: false, status: 0, code: "not_attempted" };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(600);
    try {
      const res = await fetch(RESEND_URL, { method: "POST", headers, body: JSON.stringify(payload) });
      const raw = await res.text().catch(() => "");
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

      if (res.ok && data && data.id) {
        return { ok: true, status: res.status, code: "accepted", id: String(data.id) };
      }
      if (res.ok) {
        // A 2xx without a message id is not proof Resend accepted anything.
        result = { ok: false, status: res.status, code: "no_message_id", message: sanitize(raw) };
        break;
      }
      const name = sanitize(data?.name || data?.error?.name || "", 80) || `http_${res.status}`;
      const message = sanitize(data?.message || data?.error?.message || raw);
      // 409: this idempotency key was already used by an accepted send (e.g. a retry
      // after a timeout). The original message went out; do not send another.
      if (res.status === 409 && name === "invalid_idempotent_request") {
        return { ok: true, status: res.status, code: "duplicate", duplicate: true };
      }
      const transient = res.status === 429 || res.status >= 500 || name === "concurrent_idempotent_requests";
      result = { ok: false, status: res.status, code: name, message, transient };
      if (!transient) break;
    } catch (err) {
      result = { ok: false, status: 0, code: "network_error", message: sanitize(err?.message || err), transient: true };
    }
  }
  return result;
}

/**
 * Send one email via Resend HTTP API.
 * Returns true on success. Never throws. Kept boolean for existing callers.
 */
export async function sendResendEmail(env, opts) {
  const result = await sendResendEmailDetailed(env, opts);
  if (!result.ok) {
    console.error("[SWFT Resend]", `status=${result.status}`, `error=${result.code}`, result.message || "");
  }
  return result.ok;
}

export function notifyAddress(env) {
  return env.NOTIFY_EMAIL || env.FORMSUBMIT_EMAIL || DEFAULT_NOTIFY;
}

/**
 * Team alert + visitor confirmation. Best-effort; does not throw.
 * `idempotencyBase` should be stable per submission so retries never send twice.
 *
 * @returns {Promise<{ team: boolean, visitor: boolean, teamResult: object, visitorResult: object|null }>}
 */
export async function sendLeadEmails(env, { kind, visitorEmail, visitorName, teamSubject, teamHtml, confirmSubject, confirmHtml, idempotencyBase, backupStored = false }) {
  const notify = notifyAddress(env);
  const base = idempotencyBase || `${kind}/${Date.now()}`;

  const teamResult = await sendResendEmailDetailed(env, {
    to: notify,
    subject: teamSubject,
    html: teamHtml,
    replyTo: visitorEmail || undefined,
    idempotencyKey: `${base}/team`,
  });

  // Do not assure a visitor we received an inquiry unless our team email
  // succeeded or a durable CRM backup was confirmed.
  let visitorResult = null;
  if (visitorEmail && (teamResult.ok || backupStored)) {
    visitorResult = await sendResendEmailDetailed(env, {
      to: visitorEmail,
      subject: confirmSubject,
      html: confirmHtml,
      replyTo: notify,
      idempotencyKey: `${base}/visitor`,
    });
  }

  return {
    team: teamResult.ok,
    visitor: !!visitorResult?.ok,
    teamResult,
    visitorResult,
  };
}
