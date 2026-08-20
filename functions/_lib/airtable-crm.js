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

/**
 * @param {Record<string, string|undefined>} env
 * @param {string} table
 * @param {Record<string, unknown>} fields
 * @returns {Promise<{ ok: boolean, id: string|null }>}
 */
async function createRecord(env, table, fields) {
  if (!env.AIRTABLE_TOKEN || !table) return { ok: false, id: null };
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId(env)}/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Airtable create failed", table, res.status, errBody.slice(0, 400));
      return { ok: false, id: null };
    }
    const data = await res.json();
    const id = data?.records?.[0]?.id || null;
    return { ok: !!id, id };
  } catch (err) {
    console.error("Airtable create fetch failed", err);
    return { ok: false, id: null };
  }
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {string} table
 * @param {string} formula
 * @returns {Promise<string|null>}
 */
async function findFirstId(env, table, formula) {
  if (!env.AIRTABLE_TOKEN || !table) return null;
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId(env)}/${encodeURIComponent(table)}`);
    url.searchParams.set("filterByFormula", formula);
    url.searchParams.set("maxRecords", "1");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Airtable find failed", table, res.status, errBody.slice(0, 400));
      return null;
    }
    const data = await res.json();
    return data?.records?.[0]?.id || null;
  } catch (err) {
    console.error("Airtable find fetch failed", err);
    return null;
  }
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

/**
 * Write form intake + Pipeline hub. Falls back to form-only write if hub upserts fail.
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
 * }} lead
 * @returns {Promise<boolean>}
 */
export async function storeCrmLead(env, lead) {
  if (!env.AIRTABLE_TOKEN) return false;

  const formKey = FORM_GROUP_TO_TABLE[lead.formGroup];
  if (!formKey) {
    console.error("Unknown form group", lead.formGroup);
    return false;
  }
  const formTable = tableId(env, formKey);
  const submittedAt = lead.submittedAt || new Date().toISOString();

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

  const formResult = await createRecord(env, formTable, formFields);
  if (!formResult.ok || !formResult.id) return false;

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
    Notes: String(lead.notes || "").slice(0, 4000),
    "Submitted At": submittedAt,
  };
  if (personId) pipelineFields.Person = [personId];
  if (companyId) pipelineFields.Company = [companyId];
  if (linkField) pipelineFields[linkField] = [formResult.id];

  const pipelineResult = await createRecord(env, pipelineTable, pipelineFields);
  if (!pipelineResult.ok) {
    console.error("Pipeline write failed; form row was stored", formResult.id);
  }
  return true;
}
