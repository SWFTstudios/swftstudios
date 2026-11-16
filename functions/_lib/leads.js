/**
 * Save a form submission to the Google Sheets lead log (when configured).
 * The team email to hello@ (functions/_lib/resend.js) is the primary record;
 * the Sheet is an optional durable copy and a fallback mailer if Resend is down.
 */
import { appendLeadRow } from "./sheets.js";

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ formGroup: string, formType?: string, formFields?: Record<string, unknown>, submittedAt?: string }} lead
 *   Extra fields callers pass (person, company, UTM, notes, isTest) are accepted and ignored here.
 * @returns {Promise<{ sheet: boolean, stored: boolean, label: string }>}
 */
export async function storeLead(env, lead) {
  const sheet = await appendLeadRow(env, lead).catch((err) => { console.error("Sheets store threw", err); return false; });
  return { sheet, stored: sheet, label: sheet ? "Google Sheet" : "Email only" };
}
