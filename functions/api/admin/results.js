/**
 * /api/admin/results — client sites from Cloudflare, for the admin Analytics tab.
 *   GET   every zone: last 30 days vs the 30 before (page views, visitors) + featured flag
 *   POST  { zoneId, domain, featured, label?, link? }  feature / unfeature on the home page
 * Featured rows live in D1 featured_results (migration 0007).
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { compareZone, listZones } from "../../_lib/cloudflare-analytics.js";

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const listed = await listZones(context.env).catch(() => ({ ok: false, message: "Couldn't reach Cloudflare." }));
  if (!listed.ok) return json({ ok: true, configured: false, message: listed.message, sites: [] });
  let featured = {};
  try {
    const { results } = await gate.db.prepare("SELECT * FROM featured_results").all();
    for (const r of results || []) featured[r.zone_id] = r;
  } catch (err) {
    console.error("featured_results read failed (migration 0007?)", err);
  }
  const sites = await Promise.all(listed.zones.map(async (z) => {
    const c = await compareZone(context.env, z.id).catch(() => ({ ok: false }));
    const f = featured[z.id];
    return { zoneId: z.id, domain: z.domain, ok: c.ok, now: c.now, before: c.before, change: c.change, featured: !!f, label: f?.label || "", link: f?.link || "" };
  }));
  sites.sort((a, b) => (b.change?.pageViews ?? -1e9) - (a.change?.pageViews ?? -1e9));
  return json({ ok: true, configured: true, sites });
}

export async function onRequestPost(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  let body;
  try { body = await context.request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const zoneId = str(body.zoneId, 64);
  const domain = str(body.domain, 200);
  if (!/^[a-f0-9]{32}$/.test(zoneId) || !domain) return json({ ok: false, error: "Unknown site." }, 400);
  if (body.featured) {
    const label = str(body.label, 120) || domain;
    const link = str(body.link, 200);
    await gate.db.prepare(
      "INSERT INTO featured_results (zone_id, domain, label, link) VALUES (?, ?, ?, ?) ON CONFLICT(zone_id) DO UPDATE SET domain = excluded.domain, label = excluded.label, link = excluded.link"
    ).bind(zoneId, domain, label, /^\/[\w./-]*$/.test(link) ? link : null).run();
  } else {
    await gate.db.prepare("DELETE FROM featured_results WHERE zone_id = ?").bind(zoneId).run();
  }
  return json({ ok: true });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
