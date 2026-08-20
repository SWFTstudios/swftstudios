#!/usr/bin/env node
/**
 * SWFT Website Leads — Airtable CRM setup + migrate
 *
 * Prefers using Airtable MCP in Cursor to create schema (already done for this base).
 * This script is for:
 *   1) Printing current table IDs
 *   2) Migrating Archive — Discovery Calls into hub-and-spoke tables
 *   3) Creating any missing tables if you re-run on a fresh base
 *
 * Usage:
 *   node scripts/airtable-crm-setup.mjs            # print IDs + migrate if needed
 *   node scripts/airtable-crm-setup.mjs --dry-run  # classify only
 *
 * Requires .dev.vars AIRTABLE_TOKEN with:
 *   schema.bases:read, schema.bases:write (create only),
 *   data.records:read, data.records:write
 *
 * Base: appjwRgcgS0BD4lT7 (SWFT Website Leads)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE_ID = "appjwRgcgS0BD4lT7";
const META = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`;
const DATA = `https://api.airtable.com/v0/${BASE_ID}`;

const KNOWN = {
  Companies: "tblsWplUc9TypNts6",
  People: "tbl8Dh908emJXZ6vj",
  Pipeline: "tblRnwAPc9Yz6LnHz",
  "Growth Audits": "tbl4yRS7k6ZIYQ4zh",
  "Contact Inquiries": "tbl1juYArQAJxoQcf",
  "Paid Bookings": "tbloX0ged1EJUOpuA",
  "Website Build Requests": "tbl2oMRm4qjOftvLQ",
  "Archive — Discovery Calls": "tblGCvDi4RdGkK96L",
  "Discovery Calls": "tblGCvDi4RdGkK96L",
};

const DRY = process.argv.includes("--dry-run");

function loadToken() {
  if (process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN;
  const path = resolve(process.cwd(), ".dev.vars");
  if (!existsSync(path)) return "";
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((l) => l.startsWith("AIRTABLE_TOKEN="));
  if (!line) return "";
  return line.slice("AIRTABLE_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
}

async function api(token, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Airtable ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function parseDetails(details = "") {
  const out = {};
  for (const line of String(details).split("\n")) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function classify(fields) {
  const goal = String(fields["Primary Goal"] || "");
  const details = String(fields.Details || "");
  if (/Tier ID:|Book .+ via Stripe|Checkout:/i.test(details) || /^Book /i.test(goal)) {
    return "Paid Booking";
  }
  if (/^Growth Audit/i.test(goal) || /Desired service:/i.test(details)) {
    return "Growth Audit";
  }
  return "Project Inquiry";
}

async function listAll(token, tableId) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${DATA}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const page = await api(token, url.toString());
    records.push(...(page.records || []));
    offset = page.offset;
  } while (offset);
  return records;
}

async function findOne(token, tableId, formula) {
  const url = new URL(`${DATA}/${tableId}`);
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("maxRecords", "1");
  const page = await api(token, url.toString());
  return page.records?.[0] || null;
}

async function create(token, tableId, fields) {
  if (DRY) return { id: "dry" };
  const page = await api(token, `${DATA}/${tableId}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return page.records[0];
}

function esc(v) {
  return String(v ?? "").replace(/'/g, "\\'");
}

async function upsertCompany(token, name, extra = {}) {
  if (!name) return null;
  const table = KNOWN.Companies;
  const existing = await findOne(token, table, `{Business Name} = '${esc(name)}'`);
  if (existing) return existing.id;
  const rec = await create(token, table, {
    "Business Name": name.slice(0, 200),
    "Company Status": "Prospect",
    ...extra,
  });
  return rec.id;
}

async function upsertPerson(token, { name, email, phone, firstName, lastName, companyId }) {
  if (!email) return null;
  const table = KNOWN.People;
  const existing = await findOne(token, table, `LOWER({Email}) = '${esc(email.toLowerCase())}'`);
  if (existing) return existing.id;
  const fields = {
    Name: (name || email).slice(0, 200),
    Email: email.toLowerCase().slice(0, 320),
  };
  if (phone) fields.Phone = phone;
  if (firstName) fields["First Name"] = firstName;
  if (lastName) fields["Last Name"] = lastName;
  if (companyId) fields.Company = [companyId];
  const rec = await create(token, table, fields);
  return rec.id;
}

async function alreadyMigrated(token, email, submittedAt, formGroup) {
  const table = KNOWN.Pipeline;
  const parts = [
    `{Form Group} = '${esc(formGroup)}'`,
    submittedAt ? `IS_SAME({Submitted At}, '${esc(submittedAt)}', 'seconds')` : null,
  ].filter(Boolean);
  // Fallback: match notes containing archive marker + email
  const formula = `AND({Form Group} = '${esc(formGroup)}', FIND('${esc(email.toLowerCase())}', LOWER({Notes} & '')) )`;
  const hit = await findOne(token, table, formula);
  return !!hit;
}

async function migrateRow(token, row) {
  const f = row.fields || {};
  const formGroup = classify(f);
  const details = parseDetails(f.Details);
  const email = String(f.Email || "").trim();
  const name = String(f.Name || "").trim() || email;
  if (!email) {
    console.warn("skip row without email", row.id);
    return;
  }

  const businessName =
    details.Business || details["Business Name"] || (formGroup === "Project Inquiry" ? name : "");
  const phone = details.Phone || "";
  const website = details.Website || details["Website/Social"] || details.Social || "";
  const lastName = details["Last name"] || "";
  const sourcePage = details.Source || "";
  const submittedAt = f["Submitted At"] || row.createdTime;
  const archiveNote = `Migrated from Archive — Discovery Calls (${row.id})`;

  if (await alreadyMigrated(token, email, submittedAt, formGroup)) {
    console.log("skip already migrated", email, formGroup);
    return;
  }

  console.log(DRY ? "[dry]" : "migrate", formGroup, email, businessName || "(no company)");

  const companyId = await upsertCompany(token, businessName, {
    ...(website && /^https?:\/\//i.test(website) ? { Website: website } : {}),
    ...(phone ? { Phone: phone } : {}),
  });
  const personId = await upsertPerson(token, {
    name,
    email,
    phone,
    firstName: name.split(/\s+/)[0],
    lastName: lastName || name.split(/\s+/).slice(1).join(" "),
    companyId,
  });

  let formTable;
  let formFields;
  let pipelineLink;

  if (formGroup === "Growth Audit") {
    formTable = KNOWN["Growth Audits"];
    pipelineLink = "Growth Audit";
    formFields = {
      "First Name": name.split(/\s+/)[0],
      "Last Name": lastName || name.split(/\s+/).slice(1).join(" "),
      Email: email,
      Phone: phone,
      "Business Name": businessName || name,
      "Website or Social": website,
      "Business Category": f["Business Type"] || "",
      "Biggest Challenge": f["Primary Goal"] || "",
      "Desired Outcome": details.Outcome || f["Primary Goal"] || "",
      "Desired Service": details["Desired service"] || f["Business Type"] || "",
      Instagram: details.Instagram || details.Social || "",
      "Additional Context": f.Details || "",
      "Source Page": sourcePage,
      Status: f.Status || "New",
      "Submitted At": submittedAt,
      Person: personId ? [personId] : undefined,
    };
  } else if (formGroup === "Paid Booking") {
    formTable = KNOWN["Paid Bookings"];
    pipelineLink = "Paid Booking";
    formFields = {
      Name: name,
      Email: email,
      Business: businessName || name,
      Phone: phone,
      Website: website,
      "Tier ID": details["Tier ID"] || "",
      "Tier Name": f["Business Type"] || "",
      "Checkout amount label": details.Checkout || "",
      Notes: f.Details || "",
      "Source Page": sourcePage,
      Status: f.Status || "New",
      "Submitted At": submittedAt,
      Person: personId ? [personId] : undefined,
    };
  } else {
    formTable = KNOWN["Contact Inquiries"];
    pipelineLink = "Contact Inquiry";
    formFields = {
      Name: name,
      Email: email,
      Phone: phone,
      Business: businessName || "",
      Website: website,
      "Service needed": f["Business Type"] || "",
      Challenge: "",
      Outcome: f["Primary Goal"] || "",
      Timeline: f.Timeline || "",
      Budget: f.Budget || "",
      Details: f.Details || f["Primary Goal"] || "",
      "Source Page": sourcePage,
      Status: f.Status || "New",
      "Submitted At": submittedAt,
      Person: personId ? [personId] : undefined,
    };
  }

  Object.keys(formFields).forEach((k) => {
    if (formFields[k] === undefined || formFields[k] === "") delete formFields[k];
  });

  const formRec = await create(token, formTable, formFields);
  await create(token, KNOWN.Pipeline, {
    Lead: [name, businessName].filter(Boolean).join(" · ").slice(0, 200),
    Stage: "New",
    "Form Group": formGroup,
    "Form Type": formGroup,
    "Source Page": sourcePage,
    Notes: archiveNote,
    "Submitted At": submittedAt,
    Person: personId ? [personId] : undefined,
    Company: companyId ? [companyId] : undefined,
    [pipelineLink]: formRec.id ? [formRec.id] : undefined,
  });
}

async function main() {
  const token = loadToken();
  if (!token) {
    console.error(
      "Missing AIRTABLE_TOKEN. Set it in .dev.vars or the environment.\n" +
        "Schema was created via Airtable MCP; this script migrates data and prints IDs."
    );
    console.log("\nKnown table IDs (baked into functions/_lib/airtable-crm.js):\n");
    for (const [name, id] of Object.entries(KNOWN)) {
      if (name === "Discovery Calls") continue;
      console.log(`  ${name.padEnd(28)} ${id}`);
    }
    console.log(`\n  AIRTABLE_BASE_ID              ${BASE_ID}`);
    process.exit(1);
  }

  let tables;
  try {
    tables = await api(token, `${META}/tables`);
  } catch (err) {
    if (err.status === 403) {
      console.error(
        "Schema/data API 403. Add scopes schema.bases:read (+ write to create), data.records:read, data.records:write on base SWFT Website Leads."
      );
    }
    throw err;
  }

  const byName = Object.fromEntries((tables.tables || []).map((t) => [t.name, t.id]));
  console.log("Tables in base:");
  for (const [name, id] of Object.entries(byName)) {
    console.log(`  ${name.padEnd(28)} ${id}`);
  }

  const archiveId = byName["Archive — Discovery Calls"] || byName["Discovery Calls"] || KNOWN["Archive — Discovery Calls"];
  if (byName["Discovery Calls"] && !byName["Archive — Discovery Calls"]) {
    console.log("Renaming Discovery Calls → Archive — Discovery Calls…");
    if (!DRY) {
      await api(token, `${META}/tables/${byName["Discovery Calls"]}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "Archive — Discovery Calls",
          description: "Archived pre-CRM intake. New leads go to Contact Inquiries / Paid Bookings / Growth Audits.",
        }),
      });
    }
  }

  const rows = await listAll(token, archiveId);
  console.log(`\nMigrating ${rows.length} archive rows${DRY ? " (dry-run)" : ""}…`);
  for (const row of rows) {
    await migrateRow(token, row);
  }

  console.log("\nEnv defaults to bake / set on Pages:");
  console.log(`AIRTABLE_BASE_ID=${BASE_ID}`);
  console.log(`AIRTABLE_TABLE_COMPANIES=${byName.Companies || KNOWN.Companies}`);
  console.log(`AIRTABLE_TABLE_PEOPLE=${byName.People || KNOWN.People}`);
  console.log(`AIRTABLE_TABLE_PIPELINE=${byName.Pipeline || KNOWN.Pipeline}`);
  console.log(`AIRTABLE_TABLE_GROWTH_AUDIT=${byName["Growth Audits"] || KNOWN["Growth Audits"]}`);
  console.log(`AIRTABLE_TABLE_CONTACT=${byName["Contact Inquiries"] || KNOWN["Contact Inquiries"]}`);
  console.log(`AIRTABLE_TABLE_BOOKINGS=${byName["Paid Bookings"] || KNOWN["Paid Bookings"]}`);
  console.log(`AIRTABLE_TABLE=${byName["Website Build Requests"] || KNOWN["Website Build Requests"]}`);
  console.log(`\nCRM Home Interface (manual): Airtable → Interfaces → Create → Pipeline Kanban by Stage.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
