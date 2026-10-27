/**
 * GET /api/availability — next open slot on the SWFT Cal.com booking page.
 *
 * Powers the "Booking now · Next opening Thu Oct 30" pills (js/mono.js).
 * Reads public slots for cal.com/swftstudios/swft-meeting from the Cal.com
 * v2 API. CAL_API_KEY is optional (only needed if the event type is
 * private); CAL_USERNAME / CAL_EVENT_SLUG override the defaults.
 * Responses are cached at the edge for 15 minutes.
 *
 * Response: { ok: true, next: ISO string | null, openDays: number, bookingUrl }
 * or { ok: false } when Cal.com can't be reached (the pill then just says
 * "Booking now").
 */
const CAL_API = "https://api.cal.com/v2/slots";
const CAL_API_VERSION = "2024-09-04";
const DEFAULT_USERNAME = "swftstudios";
const DEFAULT_EVENT_SLUG = "swft-meeting";
const TIME_ZONE = "America/New_York";
const WINDOW_DAYS = 21;
const CACHE_SECONDS = 900;

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${status === 200 && body.ok ? CACHE_SECONDS : 60}`,
    },
  });
}

/** Cal.com has returned slots as { data: { "2026-10-30": [{ start }] } } (v2,
 *  2024-09-04) and as { data: { slots: { "2026-10-30": [{ time }] } } }
 *  (older versions). Flatten either into sorted ISO start times. */
export function extractSlots(payload) {
  const data = payload && payload.data;
  if (!data || typeof data !== "object") return [];
  const byDay = data.slots && typeof data.slots === "object" ? data.slots : data;
  const out = [];
  for (const day of Object.keys(byDay)) {
    const list = byDay[day];
    if (!Array.isArray(list)) continue;
    for (const slot of list) {
      const start = typeof slot === "string" ? slot : slot && (slot.start || slot.time);
      if (start && !Number.isNaN(Date.parse(start))) out.push(start);
    }
  }
  return out.sort((a, b) => Date.parse(a) - Date.parse(b));
}

export async function getAvailability(env = {}, now = new Date(), fetchImpl = fetch) {
  const username = env.CAL_USERNAME || DEFAULT_USERNAME;
  const slug = env.CAL_EVENT_SLUG || DEFAULT_EVENT_SLUG;
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const url = new URL(CAL_API);
  url.searchParams.set("username", username);
  url.searchParams.set("eventTypeSlug", slug);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("timeZone", TIME_ZONE);

  const headers = { "cal-api-version": CAL_API_VERSION, Accept: "application/json" };
  if (env.CAL_API_KEY) headers.Authorization = `Bearer ${env.CAL_API_KEY}`;

  const res = await fetchImpl(url.toString(), { headers });
  if (!res.ok) throw new Error(`Cal.com slots ${res.status}`);
  const slots = extractSlots(await res.json()).filter((s) => Date.parse(s) > now.getTime());
  const days = new Set(slots.map((s) => s.slice(0, 10)));
  return {
    ok: true,
    next: slots[0] || null,
    openDays: days.size,
    bookingUrl: `https://cal.com/${username}/${slug}`,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(new URL("/api/availability", request.url).toString(), { method: "GET" });

  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  try {
    const response = respond(await getAvailability(env));
    if (cache) {
      const put = cache.put(cacheKey, response.clone());
      if (context.waitUntil) context.waitUntil(put);
      else await put;
    }
    return response;
  } catch (err) {
    console.error("availability lookup failed", err);
    return respond({ ok: false });
  }
}
