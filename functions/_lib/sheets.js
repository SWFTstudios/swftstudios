/**
 * Google Sheets lead log + backup notifier for the Pages Functions (and the
 * Worker, which reuses these handlers).
 *
 * Every form submission is appended as a row to the SWFT leads spreadsheet
 * through a small Google Apps Script web app (scripts/google-sheets-leads.gs,
 * setup in docs/GOOGLE_SHEETS_LEADS.md). The same script can email
 * hello@swftstudios.com, which is used as a fallback when Resend fails.
 *
 * Env (both secrets): GOOGLE_SHEETS_WEBHOOK_URL (the web app's /exec URL),
 *                     GOOGLE_SHEETS_SECRET (shared secret, also set in the script)
 * Without them this module does nothing and the forms behave as before.
 */
const TIMEOUT_MS = 8000;
const CELL_MAX = 5000;

export function sheetsConfigured(env) {
  return !!(env.GOOGLE_SHEETS_WEBHOOK_URL && env.GOOGLE_SHEETS_SECRET);
}

/** One spreadsheet cell: plain text, no nested data. */
function cell(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(cell).filter(Boolean).join(", ").slice(0, CELL_MAX);
  if (typeof value === "object") return JSON.stringify(value).slice(0, CELL_MAX);
  return String(value).slice(0, CELL_MAX);
}

async function post(env, payload) {
  if (!sheetsConfigured(env)) return false;
  const body = JSON.stringify({ ...payload, secret: env.GOOGLE_SHEETS_SECRET });

  // One retry for a timeout, network error or 5xx. Apps Script cold starts can
  // take a few seconds; its /exec URL answers a POST through a redirect.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        redirect: "follow",
        signal: ctrl.signal,
      });
      const text = await res.text().catch(() => "");
      let data = null;
      try { data = JSON.parse(text); } catch { /* Apps Script error pages are HTML */ }
      if (res.ok && data && data.ok === true) return true;
      console.error("Google Sheets webhook rejected", payload.action, res.status, (data && data.error) || text.slice(0, 200), `attempt ${attempt}`);
      if (res.status < 500 && res.status !== 0 && data) return false; // a clear "no" (bad secret etc.): don't retry
    } catch (err) {
      console.error("Google Sheets webhook failed", payload.action, `attempt ${attempt}`, err && err.name);
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/**
 * Append one lead as a row on the tab named after its form group.
 * @param {Record<string, string|undefined>} env
 * @param {{ formGroup: string, formType?: string, formFields: Record<string, unknown>, submittedAt?: string }} lead
 * @returns {Promise<boolean>} true when the row was saved
 */
export async function appendLeadRow(env, lead) {
  if (!sheetsConfigured(env)) return false;
  const fields = {
    "Submitted At": lead.submittedAt || new Date().toISOString(),
    Form: lead.formType || lead.formGroup,
  };
  for (const [key, value] of Object.entries(lead.formFields || {})) {
    if (key === "Submitted At" || key === "Form") continue;
    fields[key] = cell(value);
  }
  return post(env, { action: "append", sheet: lead.formGroup, fields });
}

/**
 * Ask the Apps Script to email hello@swftstudios.com (the recipient is fixed
 * inside the script, so this URL can't be used to email anyone else).
 * @returns {Promise<boolean>} true when the email was sent
 */
export async function notifyViaSheet(env, { subject, html, replyTo }) {
  if (!sheetsConfigured(env)) return false;
  return post(env, {
    action: "notify",
    subject: String(subject || "New SWFT lead").slice(0, 200),
    html: String(html || "").slice(0, 40000),
    replyTo: replyTo ? String(replyTo).slice(0, 320) : "",
  });
}
