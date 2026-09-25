/**
 * Hub-and-spoke CRM writes for SWFT Website Leads (Airtable).
 * Upserts People/Companies, writes the form table row, then a Pipeline Kanban row.
 *
 * Env: AIRTABLE_TOKEN (secret, needs data.records:read + write)
 * Optional table overrides: AIRTABLE_BASE_ID, AIRTABLE_TABLE_*, see DEFAULT_TABLES.
 */

export const DEFAULT_TABLES = {
  AIRTABLE_BASE_ID: "appjwRgcgS0BD4lT7",
  AIRTABLE_TABLE_COMPANIES: "tblsWplUc9TypNts6",
  AIRTABLE_TABLE_PEOPLE: "tbl8Dh908emJXZ6vj",
  AIRTABLE_TABLE_PIPELINE: "tblRnwAPc9Yz6LnHz",
  AIRTABLE_TABLE_GROWTH_AUDIT: "tbl4yRS7k6ZIYQ4zh",
  AIRTABLE_TABLE_CONTACT: "tbl1juYArQAJxoQcf",
  AIRTABLE_TABLE_BOOKINGS: "tbloX0ged1EJUOpuA",
  AIRTABLE_TABLE: "tbl2oMRm4qjOftvLQ",
};

/** @typedef {'Growth Audit'|'Project Inquiry'|'Paid Booking'|'Website Build'} FormGroup */

const FORM_GROUP_TO_TABLE = {
  "Growth Audit": "AIRTABLE_TABLE_GROWTH_AUDIT",
  "Project Inquiry": "AIRTABLE_TABLE_CONTACT",
  "Paid Booking": "AIRTABLE_TABLE_BOOKINGS",
  "Website Build": "AIRTABLE_TABLE",
};

const FORM_GROUP_TO_PIPELINE_LINK = {
  "Growth Audit": "Growth Audit",
  "Project Inquiry": "Contact Inquiry",
  "Paid Booking": "Paid Booking",
  "Website Build": "Website Build",
};

function tableId(env, key) {
  return env[key] || DEFAULT_TABLES[key];
}

function baseId(env) {
  return env.AIRTABLE_BASE_ID || DEFAULT_TABLES.AIRTABLE_BASE_ID;
}

function escapeFormula(value) {
  return String(value ?? "").replace(/'/g, "\\'");
}

function sanitize(text, max = 300) {
  return String(text ?? "")
    .replace(/(pat|key)[A-Za-z0-9.]{10,}/g, "$1[redacted]")
    .replace(/\s+/g, " ")
    .slice(0, max);
}

/**
 * One Airtable REST call. Never throws.
 * @returns {Promise<{ ok: boolean, status: number, code: string, message?: string, data?: any }>}
 */
async function airtableFetch(env, url, init = {}) {
  if (!env.AIRTABLE_TOKEN) return { ok: false, status: 0, code: "missing_token" };
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const raw = await res.text().catch(() => "");
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!res.ok) {
      const err = data?.error;
      const code = sanitize((typeof err === "string" ? err : err?.type) || `http_${res.status}`, 80);
      const message = sanitize((typeof err === "object" && err?.message) || raw);
      return { ok: false, status: res.status, code, message };
    }
    return { ok: true, status: res.status, code: "ok", data };
  } catch (err) {
    return { ok: false, status: 0, code: "network_error", message: sanitize(err?.message || err) };
  }
}

/** 401/403/404 mean the token/base/table is wrong; later calls cannot succeed either. */
function isConfigFailure(result) {
  return result.status === 401 || result.status === 403 || result.status === 404 || result.code === "missing_token";
}

function logFailure(op, table, result) {
  console.error("[SWFT Airtable]", `op=${op}`, `table=${table}`, `status=${result.status}`, `error=${result.code}`, result.message || "");
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {string} table
 * @param {Record<string, unknown>} fields
 */
async function createRecordDetailed(env, table, fields) {
  const result = await airtableFetch(
    env,
    `https://api.airtable.com/v0/${baseId(env)}/${encodeURIComponent(table)}`,
    { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: true }) }
  );
  if (!result.ok) {
    logFailure("create", table, result);
    return { ...result, id: null };
  }
  const id = result.data?.records?.[0]?.id || null;
  return id ? { ...result, id } : { ok: false, status: result.status, code: "no_record_id", id: null };
}

/** @returns {Promise<{ ok: boolean, id: string|null }>} */
async function createRecord(env, table, fields) {
  const r = await createRecordDetailed(env, table, fields);
  return { ok: r.ok, id: r.id };
}

async function findFirstDetailed(env, table, formula) {
  const url = new URL(`https://api.airtable.com/v0/${baseId(env)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("maxRecords", "1");
  const result = await airtableFetch(env, url.toString());
  if (!result.ok) {
    logFailure("find", table, result);
    return { ...result, id: null };
  }
  return { ...result, id: result.data?.records?.[0]?.id || null };
}

/** @returns {Promise<string|null>} */
async function findFirstId(env, table, formula) {
  return (await findFirstDetailed(env, table, formula)).id;
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ name?: string, website?: string, phone?: string, industry?: string }} company
 * @returns {Promise<string|null>}
 */
export async function findOrCreateCompany(env, company) {
  const name = String(company.name || "").trim();
  if (!name) return null;
  const table = tableId(env, "AIRTABLE_TABLE_COMPANIES");
  const existing = await findFirstId(env, table, `{Business Name} = '${escapeFormula(name)}'`);
  if (existing) return existing;

  const fields = {
    "Business Name": name.slice(0, 200),
    "Company Status": "Prospect",
  };
  if (company.website) fields.Website = String(company.website).trim().slice(0, 500);
  if (company.phone) fields.Phone = String(company.phone).trim().slice(0, 40);
  if (company.industry) fields["Industry / category"] = String(company.industry).trim().slice(0, 200);

  const created = await createRecord(env, table, fields);
  return created.id;
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ name: string, email: string, phone?: string, firstName?: string, lastName?: string, companyId?: string|null }} person
 * @returns {Promise<string|null>}
 */
export async function findOrCreatePerson(env, person) {
  const email = String(person.email || "").trim().toLowerCase();
  if (!email) return null;
  const table = tableId(env, "AIRTABLE_TABLE_PEOPLE");
  const existing = await findFirstId(env, table, `LOWER({Email}) = '${escapeFormula(email)}'`);
  if (existing) return existing;

  const fields = {
    Name: String(person.name || email).trim().slice(0, 200),
    Email: email.slice(0, 320),
  };
  if (person.phone) fields.Phone = String(person.phone).trim().slice(0, 40);
  if (person.firstName) fields["First Name"] = String(person.firstName).trim().slice(0, 120);
  if (person.lastName) fields["Last Name"] = String(person.lastName).trim().slice(0, 120);
  if (person.companyId) fields.Company = [person.companyId];

  const created = await createRecord(env, table, fields);
  return created.id;
}

/** Text field on each form table that carries the submission reference (used to dedupe retries). */
const FORM_GROUP_TO_REF_FIELD = {
  "Growth Audit": "Additional Context",
  "Project Inquiry": "Details",
  "Paid Booking": "Notes",
  "Website Build": "Anything Else",
};

export function submissionTag(submissionId) {
  return submissionId ? `[SWFT ref ${submissionId}]` : "";
}

/**
 * Write form intake + Pipeline hub and report what happened.
 * Falls back to a form-only write if the People/Companies upserts fail.
 * With `lead.submissionId`, a retry of an already-stored submission is detected
 * and not written twice.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{
 *   formGroup: FormGroup,
 *   formType?: string,
 *   formFields: Record<string, unknown>,
 *   person: { name: string, email: string, phone?: string, firstName?: string, lastName?: string },
 *   company?: { name?: string, website?: string, phone?: string, industry?: string },
 *   sourcePage?: string,
 *   utmSource?: string,
 *   utmMedium?: string,
 *   utmCampaign?: string,
 *   notes?: string,
 *   submittedAt?: string,
 *   submissionId?: string,
 * }} lead
 * @returns {Promise<{ ok: boolean, status: number, code: string, message?: string, recordId?: string|null, duplicate?: boolean, pipelineOk?: boolean }>}
 */
export async function storeCrmLeadDetailed(env, lead) {
  if (!env.AIRTABLE_TOKEN) return { ok: false, status: 0, code: "missing_token" };

  const formKey = FORM_GROUP_TO_TABLE[lead.formGroup];
  if (!formKey) {
    console.error("Unknown form group", lead.formGroup);
    return { ok: false, status: 0, code: "unknown_form_group" };
  }
  const formTable = tableId(env, formKey);
  const submittedAt = lead.submittedAt || new Date().toISOString();
  const refField = FORM_GROUP_TO_REF_FIELD[lead.formGroup];
  const tag = submissionTag(lead.submissionId);

  // Idempotency: the first call doubles as an auth/base check.
  if (tag && refField) {
    const existing = await findFirstDetailed(
      env, formTable, `FIND('${escapeFormula(tag)}', {${refField}} & '') > 0`
    );
    if (existing.id) return { ok: true, status: existing.status, code: "duplicate", duplicate: true, recordId: existing.id };
    if (isConfigFailure(existing)) return existing;
  }

  let companyId = null;
  let personId = null;
  try {
    if (lead.company?.name) {
      companyId = await findOrCreateCompany(env, lead.company);
    }
    personId = await findOrCreatePerson(env, {
      ...lead.person,
      companyId,
    });
  } catch (err) {
    console.error("CRM upsert failed; continuing with form-only write", err);
  }

  const formFields = { ...lead.formFields };
  if (personId) formFields.Person = [personId];
  if (!formFields.Status) formFields.Status = "New";
  if (!formFields["Submitted At"]) formFields["Submitted At"] = submittedAt;
  if (tag && refField) {
    formFields[refField] = [formFields[refField], tag].filter(Boolean).join("\n\n");
  }

  const formResult = await createRecordDetailed(env, formTable, formFields);
  if (!formResult.ok || !formResult.id) return formResult;

  const pipelineTable = tableId(env, "AIRTABLE_TABLE_PIPELINE");
  const linkField = FORM_GROUP_TO_PIPELINE_LINK[lead.formGroup];
  const leadLabel = [lead.person.name, lead.company?.name].filter(Boolean).join(" · ") || lead.person.email;

  const pipelineFields = {
    Lead: leadLabel.slice(0, 200),
    Stage: "New",
    "Form Group": lead.formGroup,
    "Form Type": (lead.formType || lead.formGroup).slice(0, 200),
    "Source Page": String(lead.sourcePage || "").slice(0, 300),
    "UTM Source": String(lead.utmSource || "").slice(0, 120),
    "UTM Medium": String(lead.utmMedium || "").slice(0, 120),
    "UTM Campaign": String(lead.utmCampaign || "").slice(0, 120),
    Notes: [String(lead.notes || "").slice(0, 3900), tag].filter(Boolean).join("\n\n"),
    "Submitted At": submittedAt,
  };
  if (personId) pipelineFields.Person = [personId];
  if (companyId) pipelineFields.Company = [companyId];
  if (linkField) pipelineFields[linkField] = [formResult.id];

  const pipelineResult = await createRecordDetailed(env, pipelineTable, pipelineFields);
  if (!pipelineResult.ok) {
    console.error("Pipeline write failed; form row was stored", formResult.id);
  }
  return { ok: true, status: formResult.status, code: "created", recordId: formResult.id, pipelineOk: pipelineResult.ok };
}

/** Boolean wrapper kept for existing callers. */
export async function storeCrmLead(env, lead) {
  return (await storeCrmLeadDetailed(env, lead)).ok;
}
