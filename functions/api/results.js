/**
 * GET /api/results — public. Featured client sites whose traffic is up:
 * last 30 days of page views vs the 30 days before, from Cloudflare.
 * Only sites the owner featured in admin, and only while the change is
 * positive. Cached for 6 hours. The home page Results section reads this.
 */
import { compareZone } from "../_lib/cloudflare-analytics.js";

const TTL = 6 * 3600;

export async function onRequestGet(context) {
  const { env, request } = context;
  const cache = caches.default;
  const key = new Request(new URL("/api/results?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  let results = [];
  if (env.DB && env.CF_ANALYTICS_TOKEN) {
    try {
      const { results: rows } = await env.DB.prepare("SELECT * FROM featured_results ORDER BY created_at").all();
      const checked = await Promise.all((rows || []).map(async (r) => {
        const c = await compareZone(env, r.zone_id).catch(() => ({ ok: false }));
        if (!c.ok || !(c.change.pageViews > 0) || c.now.pageViews < 100) return null;
        return { client: r.label || r.domain, domain: r.domain, link: r.link || null, metric: "page views", days: c.days, changePercent: c.change.pageViews, now: c.now.pageViews };
      }));
      results = checked.filter(Boolean).sort((a, b) => b.changePercent - a.changePercent).slice(0, 6);
    } catch (err) {
      console.error("public results failed", err);
    }
  }
  const res = new Response(JSON.stringify({ ok: true, source: "Cloudflare", results }), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL}` },
  });
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
