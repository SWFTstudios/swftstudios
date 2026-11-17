/**
 * /api/admin/leads — website form leads (admin only).
 *   GET  ?status=new|contacted|won|lost|spam|test|all  (default: everything except test)
 *        &form=<form_group>  &q=<name/email/business search>
 *        latest 200, newest first, plus counts per status
 *   POST { id, status?, notes? }   update a lead's status and private notes
 * Rows come from functions/_lib/leads.js (table leads, migration 0011).
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";

const STATUSES = ["new", "contacted", "won", "lost", "spam", "test"];

function parse(fields) {
  try { return JSON.parse(fields || "{}") || {}; } catch { return {}; }
}

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status") || "";
  const form = str(url.searchParams.get("form"), 60);
  const q = str(url.searchParams.get("q"), 120).toLowerCase();
  const where = [], binds = [];
  if (status === "all") { /* everything */ }
  else if (STATUSES.includes(status)) { where.push("status = ?"); binds.push(status); }
  else where.push("status != 'test'");
  if (form) { where.push("form_group = ?"); binds.push(form); }
  if (q) {
    where.push("(LOWER(COALESCE(name,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ? OR LOWER(COALESCE(business,'')) LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    binds.push(like, like, like);
  }
  try {
    const { results } = await gate.db
      .prepare(`SELECT * FROM leads ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY datetime(created_at) DESC LIMIT 200`)
      .bind(...binds).all();
    const counts = await gate.db.prepare("SELECT status, COUNT(*) AS n FROM leads GROUP BY status").all();
    const failed = await gate.db.prepare("SELECT COUNT(*) AS n FROM leads WHERE email_delivered = 0 AND status != 'test'").first();
    return json({
      ok: true,
      leads: (results || []).map((r) => ({
        id: r.id, formGroup: r.form_group, formType: r.form_type, name: r.name, email: r.email, phone: r.phone,
        business: r.business, sourcePage: r.source_page, utmSource: r.utm_source, utmMedium: r.utm_medium,
        utmCampaign: r.utm_campaign, fields: parse(r.fields), isTest: !!r.is_test,
        emailDelivered: r.email_delivered === null ? null : !!r.email_delivered,
        status: r.status, notes: r.notes || "", createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      counts: Object.fromEntries((counts.results || []).map((c) => [c.status, c.n])),
      emailFailed: failed?.n || 0,
      statuses: STATUSES,
    });
  } catch (err) {
    console.error("admin leads list failed", String(err && err.message || err).slice(0, 200));
    return json({ ok: false, error: "Could not load leads. Has migration 0011 been applied?" }, 500);
  }
}

export async function onRequestPost(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const id = str(body.id, 64);
  if (!id) return json({ ok: false, error: "Missing lead id." }, 400);
  const sets = [], binds = [];
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return json({ ok: false, error: "Unknown status." }, 400);
    sets.push("status = ?"); binds.push(body.status);
  }
  if (body.notes !== undefined) { sets.push("notes = ?"); binds.push(str(body.notes, 4000)); }
  if (!sets.length) return json({ ok: false, error: "Nothing to update." }, 400);
  const r = await gate.db.prepare(`UPDATE leads SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(...binds, id).run();
  if (!r.meta || !r.meta.changes) return json({ ok: false, error: "Lead not found." }, 404);
  return json({ ok: true });
}
