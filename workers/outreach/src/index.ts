/**
 * SWFT outreach Worker (single file).
 *
 * Slice 1: pure logic (scoring, warmup cap, ET send-window guard, signed
 * unsubscribe tokens, email footer/headers, website email discovery) plus the
 * unsubscribe route and a cron dispatcher that records runs.
 *
 * NOT built yet (next slices): Places pull, Claude drafting, approval page,
 * Resend send, reply handling. The dispatcher records those jobs as
 * "not implemented" so nothing pretends to run.
 *
 * Email only. There is deliberately no SMS code path in this Worker.
 */

export interface Env {
  DB: D1Database;
  OUTREACH_KV: KVNamespace;
  DRY_RUN: string;
  SEND_FROM: string;
  PUBLIC_ORIGIN: string;
  MAILING_ADDRESS: string;
  CAL_BOOKING_URL: string;
  TARGET_TRADE: string;
  TARGET_CITIES: string;
  UNSUB_SIGNING_SECRET: string;
  RESEND_API_KEY?: string;
  GOOGLE_PLACES_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

// ---------------------------------------------------------------- scoring

export interface LeadFacts {
  trade?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  hasBookingLink?: boolean;
  /** Weekly hours as [{ day: 0-6 (Sun=0), close: "HHMM" }]; missing day = closed. */
  hours?: { day: number; close: string }[] | null;
}

const EMERGENCY_TRADES = ["hvac", "plumbing", "plumber", "roofing"];

/** Higher = more likely to be losing after-hours calls. Reasons are stored for the approval card. */
export function scoreLead(f: LeadFacts): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const add = (pts: number, why: string) => {
    score += pts;
    reasons.push(`+${pts} ${why}`);
  };

  const reviews = f.reviewCount ?? 0;
  if (reviews < 25) add(20, `only ${reviews} reviews`);
  else if (reviews < 75) add(10, `${reviews} reviews`);

  if (!f.website) add(25, "no website");
  else if (!f.hasBookingLink) add(15, "website has no booking link");

  if (f.rating != null && f.rating < 4.2) add(10, `rating ${f.rating}`);

  if (f.hours && f.hours.length) {
    const openDays = new Set(f.hours.map((h) => h.day));
    if (!openDays.has(0) && !openDays.has(6)) add(15, "closed weekends");
    else if (!openDays.has(0) || !openDays.has(6)) add(8, "closed one weekend day");
    if (f.hours.some((h) => Number(h.close) > 0 && Number(h.close) <= 1700)) {
      add(15, "closes at or before 5pm");
    }
  }

  if (f.trade && EMERGENCY_TRADES.includes(f.trade.toLowerCase())) add(10, "emergency-call trade");

  return { score: Math.min(100, score), reasons };
}

// ----------------------------------------------------- throttle / ET window

/** Warmup: days 1-7 -> 20/day, 8-14 -> 35, 15+ -> 50. Day 1 = warmup start date. */
export function warmupCap(warmupStart: Date, now: Date): number {
  const day = Math.floor((now.getTime() - warmupStart.getTime()) / 86_400_000) + 1;
  if (day < 1) return 0;
  if (day <= 7) return 20;
  if (day <= 14) return 35;
  return 50;
}

/** Wall-clock parts in America/New_York (handles DST). */
export function etParts(now: Date): { hour: number; weekday: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { hour: Number(get("hour")), weekday, date: `${get("year")}-${get("month")}-${get("day")}` };
}

/** Send only Mon-Fri, 9:00-10:59 ET, unpaused, and under today's cap. */
export function canSendNow(opts: {
  now: Date;
  sentToday: number;
  cap: number;
  paused: boolean;
}): { ok: boolean; remaining: number; reason?: string } {
  const { hour, weekday } = etParts(opts.now);
  if (opts.paused) return { ok: false, remaining: 0, reason: "paused" };
  if (weekday === 0 || weekday === 6) return { ok: false, remaining: 0, reason: "weekend" };
  if (hour < 9 || hour > 10) return { ok: false, remaining: 0, reason: "outside 9-11am ET" };
  const remaining = Math.max(0, opts.cap - opts.sentToday);
  return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: "daily cap reached" };
}

/** Auto-pause thresholds: bounce rate > 3% (min 20 sends) or any complaint. */
export function shouldAutoPause(stats: { sent: number; bounced: number; complained: number }): boolean {
  if (stats.complained > 0) return true;
  return stats.sent >= 20 && stats.bounced / stats.sent > 0.03;
}

// ------------------------------------------------- tokens / hashing / footer

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function emailHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(normalizeEmail(email)));
  return b64url(digest);
}

/** Token = base64url(email) + "." + HMAC. Never expires: an unsubscribe link must keep working. */
export async function signUnsubToken(email: string, secret: string): Promise<string> {
  const payload = b64url(enc.encode(normalizeEmail(email)));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyUnsubToken(token: string, secret: string): Promise<string | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    return normalizeEmail(atob(padded));
  } catch {
    return null;
  }
}

export function unsubUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/u/${token}`;
}

/** CAN-SPAM: physical address + working opt-out in every message. */
export function emailFooter(mailingAddress: string, unsubscribeUrl: string): string {
  return [
    "",
    "--",
    "Omar, SWFT Studios",
    mailingAddress,
    `Not interested? Unsubscribe here and I won't email again: ${unsubscribeUrl}`,
  ].join("\n");
}

/** RFC 8058 one-click headers. */
export function unsubHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ---------------------------------------------------- email discovery

const GENERIC_LOCALPARTS = ["info", "office", "contact", "hello", "service", "services", "sales", "support", "admin", "dispatch", "scheduling"];

/**
 * Pull a business address from a page's HTML. Only generic role mailboxes on the
 * business's own domain; no guessing patterns, no personal addresses.
 */
export function extractBusinessEmail(html: string, siteHost: string): string | null {
  const host = siteHost.replace(/^www\./, "").toLowerCase();
  const found = new Set<string>();
  const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  for (const m of html.matchAll(re)) found.add(m[0].toLowerCase());
  const candidates = [...found].filter((e) => {
    const [local, domain] = e.split("@");
    return domain === host || domain.endsWith(`.${host}`);
  }).filter((e) => GENERIC_LOCALPARTS.includes(e.split("@")[0]));
  candidates.sort(
    (a, b) => GENERIC_LOCALPARTS.indexOf(a.split("@")[0]) - GENERIC_LOCALPARTS.indexOf(b.split("@")[0]),
  );
  return candidates[0] ?? null;
}

// ------------------------------------------------- Places pull + discovery

/** Per-run caps keep us inside Worker subrequest limits and the Places budget. */
export const MAX_PLACES_PAGES = 2; // 20 results per page
export const MAX_DISCOVER_PER_RUN = 20;
export const STALE_DAYS = 30; // Places terms: non-place_id fields may be cached ~30 days

const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "yelp.com", "linkedin.com", "x.com", "twitter.com", "youtube.com", "tiktok.com", "nextdoor.com", "angi.com", "homeadvisor.com", "thumbtack.com", "mapquest.com", "yellowpages.com"];
const BOOKING_RE = /calendly\.com|housecallpro|jobber\.com|servicetitan|acuityscheduling|setmore|squareup\.com\/appointments|(schedule|book)[\s-]*(online|now|service|an?[\s-]*appointment)/i;

export interface PlacesPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    periods?: { open?: { day: number; hour: number; minute: number }; close?: { day: number; hour: number; minute: number } }[];
  };
}

export interface ParsedPlace {
  placeId: string;
  name: string;
  phone: string | null;
  website: string | null;
  websiteHost: string | null;
  rating: number | null;
  reviewCount: number | null;
  hours: { day: number; close: string }[];
  address: string | null;
}

export function normalizePhone(p?: string | null): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? ten : null;
}

export function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Places periods -> latest closing time per open day ("HHMM"). Missing day = closed. 24h/overnight -> "2359". */
export function hoursFromPeriods(periods: NonNullable<PlacesPlace["regularOpeningHours"]>["periods"]): { day: number; close: string }[] {
  const byDay = new Map<number, string>();
  for (const p of periods ?? []) {
    if (!p.open) continue;
    const sameDay = p.close && p.close.day === p.open.day;
    const close = sameDay ? String(p.close!.hour).padStart(2, "0") + String(p.close!.minute).padStart(2, "0") : "2359";
    const prev = byDay.get(p.open.day);
    if (!prev || close > prev) byDay.set(p.open.day, close);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, close]) => ({ day, close }));
}

export function parsePlace(p: PlacesPlace): ParsedPlace | null {
  if (!p.id || !p.displayName?.text) return null;
  const host = hostOf(p.websiteUri);
  return {
    placeId: p.id,
    name: p.displayName.text,
    phone: normalizePhone(p.nationalPhoneNumber),
    website: p.websiteUri ?? null,
    websiteHost: host && !SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`)) ? host : null,
    rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? null,
    hours: hoursFromPeriods(p.regularOpeningHours?.periods),
    address: p.formattedAddress ?? null,
  };
}

export function detectBookingLink(html: string): boolean {
  return BOOKING_RE.test(html);
}

/** Rotate through TARGET_CITIES one per day so each run is a single, cheap search. */
export function pickCity(cities: string, now: Date): string {
  const list = cities.split(";").map((c) => c.trim()).filter(Boolean);
  if (!list.length) throw new Error("TARGET_CITIES is empty");
  return list[Math.floor(now.getTime() / 86_400_000) % list.length];
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const PLACES_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.websiteUri", "places.rating", "places.userRatingCount", "places.regularOpeningHours", "nextPageToken",
].join(",");

export async function searchPlaces(apiKey: string, query: string, doFetch: Fetcher): Promise<PlacesPlace[]> {
  const out: PlacesPlace[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PLACES_PAGES; page++) {
    const res = await doFetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACES_MASK },
      body: JSON.stringify({ textQuery: query, pageSize: 20, regionCode: "US", ...(pageToken ? { pageToken } : {}) }),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { places?: PlacesPlace[]; nextPageToken?: string };
    out.push(...(data.places ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** Insert new leads, refresh known ones, skip branches that share a phone or website host. */
export async function upsertLeads(env: Env, places: ParsedPlace[], city: string, trade: string, now: Date): Promise<{ inserted: number; refreshed: number; duplicates: number }> {
  let inserted = 0, refreshed = 0, duplicates = 0;
  const stamp = now.toISOString();
  for (const p of places) {
    const known = await env.DB.prepare("SELECT id FROM leads WHERE place_id = ?1").bind(p.placeId).first<{ id: string }>();
    if (known) {
      await env.DB.prepare(
        "UPDATE leads SET name=?2, phone=?3, website=?4, website_host=?5, rating=?6, review_count=?7, hours_json=?8, places_fetched_at=?9 WHERE id=?1",
      ).bind(known.id, p.name, p.phone, p.website, p.websiteHost, p.rating, p.reviewCount, JSON.stringify(p.hours), stamp).run();
      refreshed++;
      continue;
    }
    const dupe = await env.DB.prepare(
      "SELECT id FROM leads WHERE (?1 IS NOT NULL AND phone = ?1) OR (?2 IS NOT NULL AND website_host = ?2) LIMIT 1",
    ).bind(p.phone, p.websiteHost).first();
    if (dupe) { duplicates++; continue; }
    await env.DB.prepare(
      "INSERT INTO leads(id, place_id, name, trade, phone, website, website_host, rating, review_count, hours_json, city, status, places_fetched_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'new',?12)",
    ).bind(crypto.randomUUID(), p.placeId, p.name, trade, p.phone, p.website, p.websiteHost, p.rating, p.reviewCount, JSON.stringify(p.hours), city, stamp).run();
    inserted++;
  }
  return { inserted, refreshed, duplicates };
}

const UA = "SWFTStudiosBot/1.0 (+https://www.swftstudios.com; looks for a public business contact address)";

async function getPage(url: string, doFetch: Fetcher): Promise<string | null> {
  try {
    const res = await doFetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

/** Fetch homepage (+ /contact pages if needed). Returns the email, where it was found, and booking-link detection. */
export async function discoverFromWebsite(host: string, doFetch: Fetcher): Promise<{ email: string | null; sourceUrl: string | null; hasBookingLink: boolean }> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { email: null, sourceUrl: null, hasBookingLink: false }; // no IP literals / odd hosts
  let hasBookingLink = false, email: string | null = null, sourceUrl: string | null = null;
  for (const path of ["/", "/contact", "/contact-us"]) {
    const url = `https://${host}${path}`;
    const page = await getPage(url, doFetch);
    if (!page) continue;
    if (detectBookingLink(page)) hasBookingLink = true;
    const found = extractBusinessEmail(page, host);
    if (found) { email = found; sourceUrl = url; break; }
  }
  return { email, sourceUrl, hasBookingLink };
}

export async function isSuppressed(env: Env, email: string): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 AS x FROM suppressions WHERE email_hash = ?1").bind(await emailHash(email)).first());
}

/** Find an email for 'new' leads, score them, and set status scored | no_email | suppressed. */
export async function discoverAndScore(env: Env, doFetch: Fetcher): Promise<{ scored: number; noEmail: number; suppressed: number }> {
  const rows = await env.DB.prepare(
    "SELECT id, trade, website, website_host, rating, review_count, hours_json FROM leads WHERE status = 'new' ORDER BY created_at LIMIT ?1",
  ).bind(MAX_DISCOVER_PER_RUN).all<{ id: string; trade: string | null; website: string | null; website_host: string | null; rating: number | null; review_count: number | null; hours_json: string | null }>();
  let scored = 0, noEmail = 0, suppressed = 0;
  for (const r of rows.results) {
    const found = r.website_host ? await discoverFromWebsite(r.website_host, doFetch) : { email: null, sourceUrl: null, hasBookingLink: false };
    const { score, reasons } = scoreLead({
      trade: r.trade, website: r.website, rating: r.rating, reviewCount: r.review_count,
      hasBookingLink: found.hasBookingLink, hours: r.hours_json ? JSON.parse(r.hours_json) : null,
    });
    let status = "scored";
    if (!found.email) { status = "no_email"; noEmail++; }
    else if (await isSuppressed(env, found.email)) { status = "suppressed"; suppressed++; }
    else scored++;
    await env.DB.prepare(
      "UPDATE leads SET email=?2, email_source_url=?3, has_booking_link=?4, score=?5, score_reasons=?6, status=?7 WHERE id=?1",
    ).bind(r.id, found.email, found.sourceUrl, found.hasBookingLink ? 1 : 0, score, JSON.stringify(reasons), status).run();
  }
  return { scored, noEmail, suppressed };
}

/** Drop stale Places-derived rows that never got contacted (30-day cache limit). */
export async function purgeStale(env: Env, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();
  const res = await env.DB.prepare(
    "DELETE FROM leads WHERE status IN ('new','scored','no_email') AND places_fetched_at < ?1 AND id NOT IN (SELECT lead_id FROM drafts)",
  ).bind(cutoff).run();
  return res.meta?.changes ?? 0;
}

export async function runPlacesPull(env: Env, doFetch: Fetcher, now: Date): Promise<Record<string, unknown>> {
  if (!env.GOOGLE_PLACES_KEY) throw new Error("GOOGLE_PLACES_KEY secret is not set");
  const city = pickCity(env.TARGET_CITIES, now);
  const places = await searchPlaces(env.GOOGLE_PLACES_KEY, `${env.TARGET_TRADE} in ${city}`, doFetch);
  const parsed = places.map(parsePlace).filter((p): p is ParsedPlace => !!p);
  const up = await upsertLeads(env, parsed, city, env.TARGET_TRADE, now);
  const disc = await discoverAndScore(env, doFetch);
  const purged = await purgeStale(env, now);
  return { city, found: parsed.length, ...up, ...disc, purged };
}

// ------------------------------------------------------------ handlers

const html = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SWFT Studios</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">${body}</body>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });

async function suppress(env: Env, email: string, reason: string): Promise<void> {
  const hash = await emailHash(email);
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO suppressions(email_hash, email, reason) VALUES (?1, ?2, ?3)").bind(hash, normalizeEmail(email), reason),
    env.DB.prepare("UPDATE leads SET status = 'suppressed' WHERE lower(email) = ?1").bind(normalizeEmail(email)),
    env.DB.prepare("UPDATE drafts SET status = 'rejected' WHERE status IN ('pending','approved') AND lead_id IN (SELECT id FROM leads WHERE lower(email) = ?1)").bind(normalizeEmail(email)),
  ]);
}

async function handleUnsub(request: Request, env: Env, token: string): Promise<Response> {
  const email = await verifyUnsubToken(token, env.UNSUB_SIGNING_SECRET);
  if (!email) return html("<h1>Link not valid</h1><p>Reply to the email and I'll remove you by hand.</p>", 400);

  // POST = confirm button, or RFC 8058 one-click from the mail client.
  if (request.method === "POST") {
    await suppress(env, email, "unsubscribe");
    return html("<h1>You're unsubscribed</h1><p>I won't email you again.</p>");
  }
  if (request.method === "GET") {
    return html(
      `<h1>Unsubscribe</h1><p>Stop emails to <b>${email.replace(/[<>&"]/g, "")}</b>?</p><form method="post"><button>Yes, unsubscribe</button></form>`,
    );
  }
  return new Response("Method not allowed", { status: 405 });
}

async function logRun(env: Env, job: string, ok: boolean, detail: string): Promise<void> {
  await env.DB.prepare("INSERT INTO runs(job, ok, detail) VALUES (?1, ?2, ?3)").bind(job, ok ? 1 : 0, detail).run();
}

const CRON_JOBS: Record<string, string> = {
  "0 6 * * *": "places-pull",
  "30 6 * * *": "score-and-draft",
  "0 14,15 * * 1-5": "send",
  "0 12 * * *": "digest",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return new Response("ok");
    const m = url.pathname.match(/^\/u\/([\w.-]+)$/);
    if (m) return handleUnsub(request, env, m[1]);
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const job = CRON_JOBS[event.cron] ?? event.cron;
    if (job === "places-pull") {
      try {
        const summary = await runPlacesPull(env, fetch, new Date(event.scheduledTime));
        await logRun(env, job, true, JSON.stringify(summary));
      } catch (err) {
        await logRun(env, job, false, String(err instanceof Error ? err.message : err).slice(0, 500));
      }
      return;
    }
    // Remaining stages land in later slices; record honestly instead of faking work.
    await logRun(env, job, false, `not implemented yet (dry_run=${env.DRY_RUN})`);
  },
};
