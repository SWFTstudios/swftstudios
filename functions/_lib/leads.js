/**
 * Save a form submission where it should live:
 *   1. D1 `leads` table (migration 0011): the primary record, shown in the
 *      admin Leads tab. Saved before any email is attempted.
 *   2. Google Sheets lead log, when GOOGLE_SHEETS_* is configured (optional).
 * Either one counts as a durable copy. After the team email is attempted,
 * markLeadEmailed() records whether it went out, so the admin can see leads
 * whose notification failed.
 */
import { appendLeadRow } from "./sheets.js";

export const TEST_MARKER = /\[\s*SWFT\s+TEST\b/i;

const cut = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/** True for QA submissions marked [SWFT TEST] in a name, business or any field. */
export function isTestLead(lead) {
  if (lead.isTest) return true;
  const values = [lead.person?.name, lead.company?.name, lead.notes, ...Object.values(lead.formFields || {})];
  return values.some((v) => typeof v === "string" && TEST_MARKER.test(v));
}

async function saveToD1(env, lead, id, isTest) {
  const db = env.DB;
  if (!db) {
    console.error("Leads: D1 binding DB is not configured for this environment");
    return false;
  }
  const f = lead.formFields || {};
  try {
    await db.prepare(
      `INSERT INTO leads (id, form_group, form_type, name, email, phone, business, source_page,
         utm_source, utm_medium, utm_campaign, fields, is_test, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      cut(lead.formGroup, 60) || "Unknown",
      cut(lead.formType, 120),
      cut(lead.person?.name ?? f.Name, 200),
      cut(lead.person?.email ?? f.Email, 320)?.toLowerCase() ?? null,
      cut(lead.person?.phone ?? f.Phone, 40),
      cut(lead.company?.name ?? f.Business, 200),
      cut(lead.sourcePage, 300),
      cut(lead.utmSource, 120),
      cut(lead.utmMedium, 120),
      cut(lead.utmCampaign, 120),
      JSON.stringify(f).slice(0, 20000),
      isTest ? 1 : 0,
      isTest ? "test" : "new",
      lead.submittedAt || new Date().toISOString().replace("T", " ").slice(0, 19)
    ).run();
    return true;
  } catch (err) {
    // Most likely: migration 0011 not applied. Logged without lead details.
    console.error("Leads: D1 insert failed", String(err && err.message || err).slice(0, 200));
    return false;
  }
}

/**
 * @param {Record<string, any>} env
 * @param {{ formGroup: string, formType?: string, person?: {name?:string,email?:string,phone?:string},
 *   company?: {name?:string}, sourcePage?: string, utmSource?: string, utmMedium?: string,
 *   utmCampaign?: string, notes?: string, isTest?: boolean, formFields?: Record<string, unknown>,
 *   submittedAt?: string }} lead
 * @returns {Promise<{ id: string, d1: boolean, sheet: boolean, stored: boolean, isTest: boolean, label: string }>}
 */
export async function storeLead(env, lead) {
  const id = crypto.randomUUID();
  const isTest = isTestLead(lead);
  const [d1, sheet] = await Promise.all([
    saveToD1(env, lead, id, isTest),
    appendLeadRow(env, lead).catch((err) => { console.error("Sheets store threw", err); return false; }),
  ]);
  const where = [d1 && "Admin leads (D1)", sheet && "Google Sheet"].filter(Boolean);
  return { id, d1, sheet, stored: d1 || sheet, isTest, label: where.length ? where.join(" + ") : "Email only" };
}

/** Record whether the team notification went out for a stored lead. Never throws. */
export async function markLeadEmailed(env, saved, delivered) {
  if (!saved?.d1 || !env.DB) return;
  try {
    await env.DB.prepare("UPDATE leads SET email_delivered = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(delivered ? 1 : 0, saved.id).run();
  } catch (err) {
    console.error("Leads: could not record email status", String(err && err.message || err).slice(0, 200));
  }
}
