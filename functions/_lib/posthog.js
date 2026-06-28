/**
 * Lightweight PostHog capture for Cloudflare Pages Functions.
 * Uses the HTTP capture API — no npm dependencies (Pages skips npm install by default).
 */

function posthogHost(env) {
  return String(env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
}

/**
 * @param {Record<string, unknown>} env
 * @param {{ distinctId: string, event: string, properties?: Record<string, unknown> }} payload
 * @returns {Promise<void>}
 */
export async function captureEvent(env, { distinctId, event, properties = {} }) {
  const apiKey = env.POSTHOG_API_KEY;
  if (!apiKey || !distinctId || !event) return;

  try {
    await fetch(`${posthogHost(env)}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "pages-functions" },
      }),
    });
  } catch {
    /* analytics must not block responses */
  }
}
