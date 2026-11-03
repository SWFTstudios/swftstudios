/**
 * GET /api/admin/overview — everything the owner dashboard needs in one call.
 * Admin session required (see _lib/admin-auth.js).
 *
 * Sections degrade independently: a missing OUTREACH_DB binding or blog index
 * reports { configured: false } instead of failing the whole dashboard.
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json } from "../../_lib/portal-auth.js";
import { getStripeTier, offerName } from "../../_lib/stripe-tiers.js";

async function clients(db) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.tier_id, p.status, p.site_host, p.stripe_subscription_id, p.created_at,
              u.email,
              (SELECT COUNT(*) FROM admin_notes n WHERE n.project_id = p.id) AS note_count
       FROM projects p JOIN users u ON u.id = p.user_id
       ORDER BY datetime(p.created_at) DESC LIMIT 200`
    )
    .all();
  return results.map((r) => ({
    id: r.id,
    email: r.email,
    tierId: r.tier_id,
    tierName: getStripeTier(r.tier_id)?.name || offerName(r.tier_id) || r.tier_id,
    status: r.status,
    siteHost: r.site_host || null,
    subscribed: !!r.stripe_subscription_id,
    noteCount: r.note_count,
    createdAt: r.created_at,
  }));
}

async function outreach(odb) {
  if (!odb) return { configured: false };
  try {
    const q = async (sql) => (await odb.prepare(sql).all()).results;
    const [byStatus, pending, recentSends, replies, runs] = await Promise.all([
      q("SELECT status, COUNT(*) AS n FROM leads GROUP BY status"),
      q(`SELECT d.id, d.subject, l.name AS lead, l.city, l.score, d.created_at
         FROM drafts d JOIN leads l ON l.id = d.lead_id WHERE d.status = 'pending' ORDER BY l.score DESC LIMIT 25`),
      q(`SELECT s.id, s.status, s.sent_at, l.name AS lead, d.subject
         FROM sends s JOIN leads l ON l.id = s.lead_id JOIN drafts d ON d.id = s.draft_id ORDER BY s.sent_at DESC LIMIT 25`),
      q(`SELECT r.id, r.class, r.reply_status, r.received_at, substr(r.raw_text, 1, 300) AS excerpt, l.name AS lead
         FROM replies r LEFT JOIN leads l ON l.id = r.lead_id ORDER BY r.received_at DESC LIMIT 25`),
      q("SELECT job, ok, detail, started_at FROM runs ORDER BY id DESC LIMIT 10"),
    ]);
    return { configured: true, leadsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])), pendingDrafts: pending, recentSends, replies, runs };
  } catch (err) {
    console.error("admin overview: outreach query failed", err);
    return { configured: true, error: "Outreach database is bound but could not be read (migrations applied?)." };
  }
}

async function blogPosts(env, request) {
  try {
    const res = await env.ASSETS.fetch(new URL("/data/blog-posts.json", request.url));
    if (!res.ok) return { configured: false };
    return { configured: true, posts: await res.json() };
  } catch {
    return { configured: false };
  }
}

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const { env, request } = context;
  try {
    const [clientList, outreachData, blog] = await Promise.all([
      clients(gate.db),
      outreach(env.OUTREACH_DB),
      blogPosts(env, request),
    ]);
    const active = clientList.filter((c) => c.status === "active" || c.status === "paid").length;
    return json({
      ok: true,
      admin: { email: gate.user.email },
      summary: { clients: clientList.length, activeClients: active, pastDue: clientList.filter((c) => c.status === "past_due").length },
      clients: clientList,
      outreach: outreachData,
      blog,
      emails: { configured: !!env.RESEND_API_KEY },
    });
  } catch (err) {
    console.error("admin overview failed", err);
    return json({ ok: false, error: "Could not load the dashboard." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
