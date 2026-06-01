/**
 * Cloudflare Pages Function — POST /api/contact
 * Writes the multi-step discovery form to Airtable ("Discovery Calls").
 * Env: AIRTABLE_TOKEN (secret, required); optional AIRTABLE_BASE_ID, AIRTABLE_TABLE_CONTACT.
 */
const DEFAULTS = {
  AIRTABLE_BASE_ID: "appjwRgcgS0BD4lT7",
  AIRTABLE_TABLE_CONTACT: "tblGCvDi4RdGkK96L",
};

const str = (v, max = 4000) => String(v ?? "").trim().slice(0, max);

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function writeToAirtable(env, table, fields) {
  if (!env.AIRTABLE_TOKEN) return false;
  const base = env.AIRTABLE_BASE_ID || DEFAULTS.AIRTABLE_BASE_ID;
  try {
    const res = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const table = env.AIRTABLE_TABLE_CONTACT || DEFAULTS.AIRTABLE_TABLE_CONTACT;
  const fields = {
    Name: str(body.name, 200),
    Email: str(body.email, 320),
    "Business Type": str(body.businessType, 200),
    "Primary Goal": str(body.primaryGoal, 4000),
    Timeline: str(body.timeline, 200),
    Budget: str(body.budget, 200),
    Details: str(body.details, 4000),
    Status: "New",
    "Submitted At": new Date().toISOString(),
  };

  const stored = await writeToAirtable(env, table, fields);
  return json({ ok: true, stored });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
