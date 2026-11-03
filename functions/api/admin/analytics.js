/**
 * GET /api/admin/analytics — traffic for the SWFT site itself, for the owner.
 * Two sources, each degrading on its own:
 *   cloudflare: every request Cloudflare served (CF_ANALYTICS_TOKEN, CF_ZONE_ID)
 *   posthog:    pageviews and visitors from the PostHog snippet on the site
 *               (POSTHOG_PERSONAL_API_KEY), host = SITE_ANALYTICS_HOST or swftstudios.com
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json } from "../../_lib/portal-auth.js";
import { fetchZoneTraffic } from "../../_lib/cloudflare-analytics.js";
import { fetchHostMetrics } from "../../_lib/posthog-metrics.js";

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const { env } = context;
  const host = env.SITE_ANALYTICS_HOST || "swftstudios.com";
  const [cloudflare, posthog] = await Promise.all([fetchZoneTraffic(env), fetchHostMetrics(env, host)]);
  return json({ ok: true, host, cloudflare, posthog });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
