/**
 * Server-side PostHog Query API helpers for client-site metrics.
 * Always filter by staff-assigned site_host — never trust client-supplied hosts.
 */

const POSTHOG_HOST = "https://us.posthog.com";
const DEFAULT_PROJECT_ID = "486061";

export async function fetchHostMetrics(env, siteHost) {
  const apiKey = env.POSTHOG_PERSONAL_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "missing_key", message: "Analytics is not configured yet." };
  }
  if (!siteHost) {
    return {
      ok: false,
      reason: "no_host",
      message: "Analytics pending — we install tracking when your site is live.",
    };
  }

  const projectId = env.POSTHOG_PROJECT_ID || DEFAULT_PROJECT_ID;
  const host = String(siteHost).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const overviewQuery = {
    kind: "WebOverviewQuery",
    dateRange: { date_from: "-30d" },
    properties: [
      {
        key: "$host",
        value: [host, `www.${host}`.replace(/^www\.www\./, "www.")],
        operator: "exact",
        type: "event",
      },
    ],
  };

  // Prefer Trends for reliable pageviews + unique users filtered by $host
  const trendsBody = {
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        series: [
          { kind: "EventsNode", event: "$pageview", name: "Pageviews", math: "total" },
          { kind: "EventsNode", event: "$pageview", name: "Visitors", math: "dau" },
        ],
        dateRange: { date_from: "-30d", date_to: null },
        interval: "day",
        filterTestAccounts: true,
        properties: [
          {
            type: "AND",
            values: [
              {
                key: "$host",
                value: host,
                operator: "icontains",
                type: "event",
              },
            ],
          },
        ],
      },
    },
  };

  const topPagesBody = {
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        series: [{ kind: "EventsNode", event: "$pageview", name: "Pageviews", math: "total" }],
        dateRange: { date_from: "-30d", date_to: null },
        interval: "day",
        breakdownFilter: { breakdown: "$pathname", breakdown_type: "event" },
        filterTestAccounts: true,
        properties: [
          {
            type: "AND",
            values: [
              {
                key: "$host",
                value: host,
                operator: "icontains",
                type: "event",
              },
            ],
          },
        ],
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const [trendsRes, pagesRes] = await Promise.all([
      fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trendsBody),
        signal: controller.signal,
      }),
      fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(topPagesBody),
        signal: controller.signal,
      }),
    ]);
    clearTimeout(timeout);

    if (!trendsRes.ok) {
      const errText = await trendsRes.text().catch(() => "");
      console.error("PostHog trends error", trendsRes.status, errText.slice(0, 400));
      return {
        ok: false,
        reason: "query_failed",
        message: "Could not load analytics right now. Try again shortly.",
      };
    }

    const trends = await trendsRes.json();
    const pagesJson = pagesRes.ok ? await pagesRes.json() : null;

    const results = trends?.results || trends?.result || [];
    const pageviewsSeries = Array.isArray(results) ? results[0] : null;
    const visitorsSeries = Array.isArray(results) ? results[1] : null;

    const sumSeries = (series) => {
      if (!series) return 0;
      const data = series.data || series.count || [];
      if (typeof series.aggregated_value === "number") return series.aggregated_value;
      if (Array.isArray(data)) return data.reduce((a, b) => a + (Number(b) || 0), 0);
      return Number(series.count) || 0;
    };

    const pageviews = sumSeries(pageviewsSeries);
    const visitors = sumSeries(visitorsSeries);

    const topPages = [];
    const pageResults = pagesJson?.results || pagesJson?.result || [];
    if (Array.isArray(pageResults)) {
      for (const row of pageResults.slice(0, 8)) {
        const path = row.breakdown_value || row.label || row.action?.custom_name || "(unknown)";
        const views = sumSeries(row);
        if (views > 0) topPages.push({ path: String(path), pageviews: views });
      }
      topPages.sort((a, b) => b.pageviews - a.pageviews);
    }

    if (pageviews === 0 && visitors === 0) {
      return {
        ok: true,
        host,
        empty: true,
        message: "Not tracking yet — no pageviews for this site in the last 30 days.",
        visitors: 0,
        pageviews: 0,
        bounceRate: null,
        topPages: [],
        range: "30d",
        overviewQueryIgnored: !!overviewQuery,
      };
    }

    return {
      ok: true,
      host,
      empty: false,
      visitors,
      pageviews,
      bounceRate: null,
      topPages: topPages.slice(0, 5),
      range: "30d",
    };
  } catch (err) {
    console.error("PostHog fetch failed", err);
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      reason: aborted ? "timeout" : "network",
      message: aborted
        ? "Analytics timed out. Try again shortly."
        : "Could not reach analytics. Try again shortly.",
    };
  }
}
