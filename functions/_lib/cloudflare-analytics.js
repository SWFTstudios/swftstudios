/**
 * Website traffic for swftstudios.com from Cloudflare's GraphQL Analytics API
 * (the same numbers as the zone Overview in the Cloudflare dashboard).
 *
 * Env: CF_ANALYTICS_TOKEN (API token with Zone > Analytics > Read for the
 * zone; a Wrangler secret, never sent to the browser) and CF_ZONE_ID.
 *
 * What it counts: every request Cloudflare served for the domain, including
 * bots and asset files. "Unique visitors" are unique IP addresses per day,
 * summed over the range, so it reads higher than the people-based numbers in
 * PostHog or Google Analytics.
 */
const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

const QUERY = `query SiteTraffic($zone: String!, $since: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 40, filter: { date_geq: $since }, orderBy: [date_ASC]) {
        dimensions { date }
        sum { requests cachedRequests pageViews bytes }
        uniq { uniques }
      }
    }
  }
}`;

export async function fetchZoneTraffic(env, { days = 30, fetchImpl = fetch } = {}) {
  const token = env.CF_ANALYTICS_TOKEN;
  const zone = env.CF_ZONE_ID;
  if (!token || !zone) {
    return { ok: false, reason: "not_configured", message: "Add the CF_ANALYTICS_TOKEN secret and CF_ZONE_ID variable to show Cloudflare traffic here." };
  }
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { zone, since } }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || (body.errors && body.errors.length)) {
      console.error("Cloudflare analytics error", res.status, JSON.stringify(body?.errors || body).slice(0, 400));
      return { ok: false, reason: "query_failed", message: "Cloudflare analytics could not be read. Check the token has Zone Analytics: Read for this zone." };
    }
    const groups = body.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    const daily = groups.map((g) => ({
      date: g.dimensions.date,
      requests: g.sum.requests || 0,
      cached: g.sum.cachedRequests || 0,
      pageViews: g.sum.pageViews || 0,
      visitors: g.uniq.uniques || 0,
    }));
    const total = (k) => daily.reduce((a, d) => a + d[k], 0);
    const requests = total("requests");
    return {
      ok: true,
      range: `${days}d`,
      totals: {
        visitors: total("visitors"),
        requests,
        pageViews: total("pageViews"),
        percentCached: requests ? Math.round((total("cached") / requests) * 1000) / 10 : 0,
      },
      daily,
    };
  } catch (err) {
    console.error("Cloudflare analytics fetch failed", err);
    return { ok: false, reason: err?.name === "AbortError" ? "timeout" : "network", message: "Could not reach Cloudflare analytics. Try again shortly." };
  }
}
