# SWFT Website Leads — Airtable CRM

Hub-and-spoke CRM in base **SWFT Website Leads** (`appjwRgcgS0BD4lT7`).

Website forms write through Cloudflare Pages Functions → Airtable REST. Cursor agents can also manage the base via the **Airtable MCP**.

## Architecture

```
Form (site) → Pages Function → Form table + People + Companies + Pipeline
```

| Form | API | Form table | Form Group (Pipeline) |
|---|---|---|---|
| Growth Audit | `POST /api/growth-audit` | Growth Audits | Growth Audit |
| Contact | `POST /api/contact` | Contact Inquiries | Project Inquiry |
| Book tier (Stripe) | `POST /api/book-tier` | Paid Bookings | Paid Booking |
| Instant Website | `POST /api/build-request` | Website Build Requests | Website Build |

**Pipeline** is the daily Kanban (group by **Stage**). Filter or create views by **Form Group** to see where leads came from.

Legacy **Discovery Calls** was renamed to **Archive — Discovery Calls**. Do not write new leads there.

## Table IDs (defaults in code)

| Table | ID | Env var |
|---|---|---|
| Companies | `tblsWplUc9TypNts6` | `AIRTABLE_TABLE_COMPANIES` |
| People | `tbl8Dh908emJXZ6vj` | `AIRTABLE_TABLE_PEOPLE` |
| Pipeline | `tblRnwAPc9Yz6LnHz` | `AIRTABLE_TABLE_PIPELINE` |
| Growth Audits | `tbl4yRS7k6ZIYQ4zh` | `AIRTABLE_TABLE_GROWTH_AUDIT` |
| Contact Inquiries | `tbl1juYArQAJxoQcf` | `AIRTABLE_TABLE_CONTACT` |
| Paid Bookings | `tbloX0ged1EJUOpuA` | `AIRTABLE_TABLE_BOOKINGS` |
| Website Build Requests | `tbl2oMRm4qjOftvLQ` | `AIRTABLE_TABLE` |
| Archive — Discovery Calls | `tblGCvDi4RdGkK96L` | (read-only archive) |

Base: `AIRTABLE_BASE_ID=appjwRgcgS0BD4lT7`

Baked into [`functions/_lib/airtable-crm.js`](../functions/_lib/airtable-crm.js) and [`src/worker.ts`](../src/worker.ts).

## How to work the CRM (day-to-day)

1. Open **Pipeline** → switch the Grid view to **Kanban** grouped by **Stage** (New → Contacted → Call booked → Proposal sent → Won / Lost / Nurture).
2. Drag cards as you follow up. Put the next step in **Next Action**.
3. Open a lead → linked **Person**, **Company**, and the original form payload (Growth Audit / Contact Inquiry / Paid Booking / Website Build).
4. For “where did they come from?”, use Grid views grouped by **UTM Source** or **Source Page**, or filter **Form Group**.
5. Form tables each have Status: New / In review / Converted for intake triage.

### Recommended Interface (manual)

Airtable → **Interfaces** → Create → start from **Pipeline**, Kanban by Stage, detail panel showing Person + Company + form link. Name it **CRM Home**.

## Token scopes

Personal access token (https://airtable.com/create/tokens) on base **SWFT Website Leads**:

| Scope | Needed for |
|---|---|
| `data.records:write` | Form handlers (required) |
| `data.records:read` | Person/company upsert by email (required on Pages) |
| `schema.bases:read` | Setup script / MCP inspect |
| `schema.bases:write` | One-time table create (MCP or Meta API) |

Production Pages project `swftstudios-website` secret: **`AIRTABLE_TOKEN`** (data read + write). Schema write is not required in production.

## Setup / migrate script

```bash
# .dev.vars must contain AIRTABLE_TOKEN=...
node scripts/airtable-crm-setup.mjs --dry-run
node scripts/airtable-crm-setup.mjs
```

Schema was created via Airtable MCP (Aug 2026). Archive Discovery Calls rows were migrated into People / Companies / form tables / Pipeline. Re-running the script skips rows already noted in Pipeline.

## Code map

| File | Role |
|---|---|
| [`functions/_lib/airtable-crm.js`](../functions/_lib/airtable-crm.js) | Upsert company/person; write form + pipeline |
| [`functions/api/*.js`](../functions/api/) | Form endpoints |
| [`src/worker.ts`](../src/worker.ts) | Worker mirror of the same CRM writes |
| [`scripts/airtable-crm-setup.mjs`](../scripts/airtable-crm-setup.mjs) | Print IDs + migrate archive |

## Failure cases

1. **Missing `AIRTABLE_TOKEN`** — API still returns `{ ok: true, stored: false }`; visitor success path unchanged.
2. **Token without read** — upserts fail; handler falls back to writing the form row only when possible (logged). Prefer fixing scopes.
3. **Unknown field names** — writes use `typecast: true` and only fields that exist on the CRM tables.
4. **Mis-classified migrated row** — still has a Person + Pipeline card; correct **Form Group** in Airtable (no deletes).
5. **Schema API 403** — setup script stops; expand token scopes before creating tables.

## Product notes (non-technical)

- Every website form creates a **Pipeline** card you can drag on a board.
- You can see whether someone used Growth Audit, Contact, paid booking, or Instant Website.
- UTMs and source page are stored when the visitor had them in the URL.
- Old Discovery Calls rows are kept under **Archive — Discovery Calls** for history.
