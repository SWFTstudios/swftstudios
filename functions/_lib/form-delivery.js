/**
 * Shared delivery outcome handling for SWFT intake forms.
 *
 * Every submission gets a stable submission ID (sent by the browser and reused on
 * retries) that drives Resend idempotency keys and Airtable de-duplication, one
 * sanitized "[SWFT Form]" log line, and one of these outcomes:
 *
 *   delivered   email accepted by Resend AND saved to Airtable      -> 200
 *   email_only  email accepted, Airtable failed/not configured       -> 200 (+ crmSaved:false)
 *   saved_only  Airtable saved, owner email failed                   -> 200 (+ warning)
 *   failed      neither                                             -> 503 (retryable) / 502
 *
 * Invalid input is rejected earlier with 400 by each handler.
 */
import { escapeHtml } from "./resend.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveSubmissionId(body) {
  const candidate = String(body?.submissionId ?? "").trim();
  if (ID_PATTERN.test(candidate)) return candidate;
  return crypto.randomUUID();
}

/**
 * Resend idempotency scope. The browser bumps `submissionAttempt` only after the
 * server has confirmed the owner email was NOT accepted, so a retry after a
 * network timeout reuses the same key (Resend de-duplicates it) while a retry
 * after a known failure gets a fresh key.
 */
export function emailScope(body, submissionId) {
  const attempt = Number(body?.submissionAttempt);
  const n = Number.isInteger(attempt) && attempt >= 0 && attempt < 100 ? attempt : 0;
  return `${submissionId}.${n}`;
}

/** Short, human-readable reference a customer can quote in an email. */
export function shortRef(submissionId) {
  return String(submissionId).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
}

function describe(result) {
  if (!result) return "not attempted";
  if (result.ok) return result.duplicate ? "already recorded (retry)" : "saved";
  return `NOT saved (${result.status || "no"} ${result.code})`;
}

/** Row for the owner email so a CRM failure is visible, not silent. */
export function crmStatusRow(crm) {
  const value = crm?.ok
    ? "Saved to Airtable"
    : `Not saved to Airtable: ${crm?.status || "-"} ${crm?.code || "unknown"}. Check the Cloudflare AIRTABLE_TOKEN.`;
  return `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;">CRM backup</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Log the outcome and build the customer-facing response.
 * @param {{ route: string, submissionId: string, crm: any, emailed: any, extra?: Record<string, unknown>, failureMessage?: string }} args
 */
export function finishSubmission({ route, submissionId, crm, emailed, extra = {}, failureMessage }) {
  const team = emailed?.teamResult || { ok: false, status: 0, code: "not_attempted" };
  const visitor = emailed?.visitorResult;
  const emailOk = !!team.ok;
  const crmOk = !!crm?.ok;
  const outcome = emailOk && crmOk ? "delivered" : emailOk ? "email_only" : crmOk ? "saved_only" : "failed";

  const log = [
    "[SWFT Form]",
    `submission_id=${submissionId}`,
    `route=${route}`,
    `outcome=${outcome}`,
    `resend_status=${team.status}`,
    `resend_error=${team.ok ? "none" : team.code}`,
    team.id ? `resend_id=${team.id}` : "",
    `visitor_email=${visitor ? (visitor.ok ? "sent" : `failed:${visitor.status}:${visitor.code}`) : "skipped"}`,
    `airtable_status=${crm?.status ?? 0}`,
    `airtable_error=${crmOk ? "none" : crm?.code || "unknown"}`,
    crm?.duplicate ? "airtable_duplicate=true" : "",
    crm?.ok && crm.pipelineOk === false ? "airtable_pipeline=failed" : "",
  ].filter(Boolean).join(" ");
  const details = [
    !team.ok && team.message ? `resend_message="${team.message}"` : "",
    !crmOk && crm?.message ? `airtable_message="${crm.message}"` : "",
  ].filter(Boolean).join(" ");
  if (outcome === "delivered") console.log(log);
  else console.error(log, details);

  const reference = shortRef(submissionId);
  const base = {
    submissionId,
    reference,
    outcome,
    emailDelivered: emailOk,
    emailed: emailOk,
    crmSaved: crmOk,
    stored: crmOk,
  };

  if (outcome === "failed") {
    const transient = !!(team.transient || crm?.status === 429 || crm?.status >= 500 || crm?.code === "network_error");
    return json({
      ...base,
      ok: false,
      retryable: true,
      // Short, non-secret codes so the owner can diagnose from a phone screenshot.
      diagnostic: `email:${team.code}${team.status ? "/" + team.status : ""} crm:${crm?.code || "unknown"}${crm?.status ? "/" + crm.status : ""}`,
      error: (failureMessage ||
        "We couldn't deliver your request. Your answers are still here, so you can try again") +
        `, or email elombe@swftstudios.com and mention reference ${reference}.`,
    }, transient ? 503 : 502);
  }

  return json({
    ...base,
    ok: true,
    ...extra,
    warning: outcome === "saved_only"
      ? `Your request was saved, but we couldn't confirm the email notification. If it's urgent, email elombe@swftstudios.com with reference ${reference}.`
      : undefined,
  }, 200);
}
