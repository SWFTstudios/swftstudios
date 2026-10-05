/**
 * Save a form submission everywhere it should live: the Airtable CRM and the
 * Google Sheets lead log, in parallel. Either one counts as a durable copy.
 * Neither is a prerequisite for the other, or for the email to hello@.
 */
import { storeCrmLead } from "./airtable-crm.js";
import { appendLeadRow } from "./sheets.js";

/**
 * @param {Record<string, string|undefined>} env
 * @param {Parameters<typeof storeCrmLead>[1]} lead same shape storeCrmLead takes
 * @returns {Promise<{ airtable: boolean, sheet: boolean, stored: boolean, label: string }>}
 */
export async function storeLead(env, lead) {
  const [airtable, sheet] = await Promise.all([
    storeCrmLead(env, lead).catch((err) => { console.error("Airtable store threw", err); return false; }),
    appendLeadRow(env, lead).catch((err) => { console.error("Sheets store threw", err); return false; }),
  ]);
  const where = [airtable && "Airtable", sheet && "Google Sheet"].filter(Boolean);
  return { airtable, sheet, stored: airtable || sheet, label: where.length ? where.join(" + ") : "No" };
}
