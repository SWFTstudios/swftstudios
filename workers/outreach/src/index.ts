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

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

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
  /** "pbkdf2$100000$<saltHex>$<hashHex>", made by scripts/hash-approval-password.mjs */
  APPROVAL_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  /** Optional override; defaults to DEFAULT_MODEL. */
  CLAUDE_MODEL?: string;
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

// ------------------------------------------------------- Claude drafting

export const DEFAULT_MODEL = "claude-opus-5-5";
export const MAX_DRAFTS_PER_RUN = 30;
export const QUEUE_BUFFER = 5;
export const DEFAULT_MIN_SCORE = 30;

const DraftSchema = z.object({ subject: z.string(), body: z.string() });

/** The only part of the SDK we use; lets tests inject a fake. */
export interface DraftClient {
  messages: {
    parse(params: Record<string, unknown>): Promise<{ parsed_output: unknown; stop_reason: string | null }>;
  };
}

export interface DraftableLead {
  id: string;
  name: string;
  trade: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  website: string | null;
  has_booking_link: number;
  hours_json: string | null;
  score: number | null;
  score_reasons: string | null;
  email: string;
  email_source_url: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2)), m = hhmm.slice(2);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 === 0 ? 12 : h % 12}${m === "00" ? "" : ":" + m}${suffix}`;
}

/** Plain-language facts, the ONLY information Claude receives about the business. */
export function factLines(l: DraftableLead): string[] {
  const lines = [`Business name: ${l.name}`];
  if (l.trade) lines.push(`Trade: ${l.trade}`);
  if (l.city) lines.push(`Location: ${l.city}`);
  if (l.rating != null) lines.push(`Google rating: ${l.rating} stars`);
  if (l.review_count != null) lines.push(`Google reviews: ${l.review_count}`);
  lines.push(l.website ? "Has a website: yes" : "Has a website: no");
  if (l.website) lines.push(l.has_booking_link ? "Website offers online booking: yes" : "Website offers online booking: no");
  const hours: { day: number; close: string }[] = l.hours_json ? JSON.parse(l.hours_json) : [];
  if (hours.length) {
    const open = new Set(hours.map((h) => h.day));
    const closedDays = DAY_NAMES.filter((_, d) => !open.has(d));
    if (closedDays.length) lines.push(`Listed as closed on: ${closedDays.join(", ")}`);
    const weekday = hours.find((h) => h.day >= 1 && h.day <= 5);
    if (weekday) lines.push(`Typical weekday closing time: ${clock(weekday.close)}`);
  }
  return lines;
}

const SYSTEM_PROMPT = `You write one short first-contact email for Omar, a filmmaker who builds systems at SWFT Studios, to the owner of a local home-service business in New Jersey or New York.

What Omar offers: a service that automatically texts back customers who call a business and don't get an answer, so after-hours and busy-hour calls aren't lost to the next company on Google.

Rules:
- 60 to 110 words, plain text, no markdown, no bullet points.
- Open with ONE specific, true observation taken only from the facts provided. Never state anything the facts don't say. Don't invent numbers.
- You have not called this business and don't know how many calls they miss. Never claim you tested, called, or measured anything. Frame it as a question or a possibility, not a diagnosis.
- Warm and plain-spoken, like one local operator writing to another. No hype, no flattery, no buzzwords, no exclamation marks, no emojis.
- End with a low-pressure question about whether it's worth a quick look.
- Do not include a greeting name (you don't know it; start with "Hi,"), signature, links, phone numbers, pricing, or unsubscribe text. Those are added separately.
- The subject line: under 60 characters, specific, lowercase-friendly, no clickbait, no "Re:" or "Fwd:".`;

export function buildUserPrompt(lines: string[]): string {
  return `Facts about the business (use only these):\n${lines.map((l) => `- ${l}`).join("\n")}\n\nWrite the subject and body.`;
}

/** Returns a reason string if the draft breaks a rule, otherwise null. */
export function validateDraft(d: { subject: string; body: string }, lines: string[], businessName: string): string | null {
  const subject = d.subject.trim(), body = d.body.trim();
  if (subject.length < 3 || subject.length > 70) return "subject length out of range";
  if (/^(re|fwd?):/i.test(subject)) return "subject fakes a thread";
  const words = body.split(/\s+/).length;
  if (words < 40 || words > 140) return `body has ${words} words`;
  if (/https?:|www\.|\.com\b/i.test(body)) return "body contains a link";
  if (/unsubscribe/i.test(body)) return "body contains unsubscribe text";
  if (/[{}\[\]<>]/.test(body)) return "body contains placeholder or markup characters";
  if (/!/.test(body)) return "body contains an exclamation mark";
  if (/\b(I|we|Omar)\s+(called|phoned|tested|tried calling|noticed (that )?(you|your) (missed|didn't answer))/i.test(body)) {
    return "body claims a call or test that never happened";
  }
  const factText = lines.join(" ");
  for (const num of body.match(/\d[\d,.]*/g) ?? []) {
    const n = num.replace(/[,.]+$/, "");
    if (!factText.includes(n)) return `number "${n}" is not in the facts`;
  }
  const first = businessName.split(/\s+/)[0].toLowerCase();
  if (first.length > 2 && !(body + subject).toLowerCase().includes(first)) return "does not mention the business";
  return null;
}

export async function draftEmail(
  client: DraftClient,
  model: string,
  lead: DraftableLead,
): Promise<{ ok: true; subject: string; body: string; lines: string[] } | { ok: false; reason: string }> {
  const lines = factLines(lead);
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    // Thinking is always on for this model; effort is the control. No sampling params (rejected by the API).
    const res = await client.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(lines) + feedback }],
      output_config: { effort: "low", format: zodOutputFormat(DraftSchema) },
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "model declined" };
    if (res.stop_reason === "max_tokens") return { ok: false, reason: "response was cut off" };
    const parsed = DraftSchema.safeParse(res.parsed_output);
    if (!parsed.success) return { ok: false, reason: "no structured output" };
    const problem = validateDraft(parsed.data, lines, lead.name);
    if (!problem) return { ok: true, subject: parsed.data.subject.trim(), body: parsed.data.body.trim(), lines };
    feedback = `\n\nYour previous attempt was rejected: ${problem}. Fix that and keep every other rule.`;
    if (attempt === 1) return { ok: false, reason: `validation failed twice: ${problem}` };
  }
  return { ok: false, reason: "unreachable" };
}

async function getSetting(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

/** Draft emails for the best scored leads until the approval queue holds tomorrow's cap plus a small buffer. */
export async function runDrafting(env: Env, client: DraftClient, now: Date): Promise<Record<string, unknown>> {
  if ((await getSetting(env, "paused")) === "1") return { skipped: "paused" };
  const start = await getSetting(env, "warmup_start");
  const cap = start ? warmupCap(new Date(start), new Date(now.getTime() + 86_400_000)) : 20;
  const minScore = Number((await getSetting(env, "min_score")) ?? DEFAULT_MIN_SCORE);
  const queued = (await env.DB.prepare("SELECT COUNT(*) AS n FROM drafts WHERE status IN ('pending','approved')").first<{ n: number }>())?.n ?? 0;
  const want = Math.min(MAX_DRAFTS_PER_RUN, Math.max(0, cap + QUEUE_BUFFER - queued));
  if (!want) return { drafted: 0, queued, cap, note: "queue already full" };

  const rows = await env.DB.prepare(
    `SELECT id, name, trade, city, rating, review_count, website, has_booking_link, hours_json, score, score_reasons, email, email_source_url
     FROM leads WHERE status = 'scored' AND email IS NOT NULL AND score >= ?1 ORDER BY score DESC LIMIT ?2`,
  ).bind(minScore, want).all<DraftableLead>();

  const model = env.CLAUDE_MODEL || DEFAULT_MODEL;
  let drafted = 0, failed = 0, suppressedNow = 0;
  const failures: string[] = [];
  for (const lead of rows.results) {
    if (await isSuppressed(env, lead.email)) {
      await env.DB.prepare("UPDATE leads SET status = 'suppressed' WHERE id = ?1").bind(lead.id).run();
      suppressedNow++;
      continue;
    }
    let result: Awaited<ReturnType<typeof draftEmail>>;
    try {
      result = await draftEmail(client, model, lead);
    } catch (err) {
      // Transient API trouble: leave the lead 'scored' so tomorrow retries it.
      failures.push(`${lead.name}: API error: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`);
      failed++;
      continue;
    }
    if (!result.ok) {
      // Model output we can't use: park the lead so it isn't retried (and billed) every night.
      await env.DB.prepare("UPDATE leads SET status = 'draft_failed' WHERE id = ?1").bind(lead.id).run();
      failures.push(`${lead.name}: ${result.reason}`);
      failed++;
      continue;
    }
    const facts = JSON.stringify({ lines: result.lines, score: lead.score, reasons: lead.score_reasons ? JSON.parse(lead.score_reasons) : [] });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO drafts(id, lead_id, subject, body, facts_json, status) VALUES (?1,?2,?3,?4,?5,'pending')")
        .bind(crypto.randomUUID(), lead.id, result.subject, result.body, facts),
      env.DB.prepare("UPDATE leads SET status = 'drafted' WHERE id = ?1").bind(lead.id),
    ]);
    drafted++;
  }
  return { drafted, failed, suppressedNow, queued, cap, model, failures: failures.slice(0, 5) };
}

// ---------------------------------------------------------- approval page

const SESSION_COOKIE = "swft_approve";
const SESSION_TTL_SEC = 12 * 3600;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SEC = 900;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** stored = "pbkdf2$<iterations>$<saltHex>$<hashHex>" (Workers caps PBKDF2 at 100000 iterations). */
export async function verifyApprovalPassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!password || !stored) return false;
  const [scheme, iter, saltHex, hashHex] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2" || !(iterations >= 1000 && iterations <= 100_000) || !saltHex || !hashHex || hashHex.length % 2) return false;
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: hexToBytes(saltHex), iterations, hash: "SHA-256" }, key, (hashHex.length / 2) * 8));
    const want = hexToBytes(hashHex);
    let diff = bits.length ^ want.length;
    for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ (want[i] ?? 0);
    return diff === 0;
  } catch {
    return false;
  }
}

export async function makeSession(secret: string, now: Date): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${Math.floor(now.getTime() / 1000) + SESSION_TTL_SEC}.${nonce}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(secret: string | undefined, token: string | null | undefined, now: Date): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  if (Number(exp) * 1000 < now.getTime()) return false;
  const expected = await hmac(secret, `${exp}.${nonce}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export const csrfFor = (secret: string, session: string) => hmac(secret, `csrf.${session}`);

function cookieOf(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function sameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function page(title: string, body: string, status = 200, extra: Record<string, string> = {}): Response {
  const css = "body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;background:#0b0b0c;color:#eee}"
    + "input,textarea{width:100%;box-sizing:border-box;background:#161618;color:#eee;border:1px solid #333;border-radius:8px;padding:.6rem;font:inherit}"
    + "textarea{min-height:11rem}button{font:inherit;border-radius:999px;border:1px solid #444;background:#222;color:#eee;padding:.5rem 1.1rem;cursor:pointer}"
    + "button.go{background:#fff;color:#000}.card{border:1px solid #2a2a2c;border-radius:14px;padding:1rem;margin:1rem 0}"
    + "small,.muted{color:#999}.row{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.7rem}.warn{color:#f5b942}code{background:#161618;padding:.1rem .3rem;border-radius:4px}";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${css}</style><body>${body}</body>`,
    { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

const redirect = (to: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...extra } });

function loginPage(message = "", status = 200): Response {
  return page("Approve", `<h1>Outreach approvals</h1>${message ? `<p class="warn">${esc(message)}</p>` : ""}
<form method="post" action="/approve/login"><label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>
<div class="row"><button class="go">Sign in</button></div></form>`, status);
}

interface QueueRow { id: string; subject: string; body: string; facts_json: string; lead_id: string; name: string; city: string | null; email: string | null; email_source_url: string | null; score: number | null }

async function queuePage(env: Env, session: string, notice = ""): Promise<Response> {
  const csrf = await csrfFor(env.SESSION_SECRET!, session);
  const rows = (await env.DB.prepare(
    `SELECT d.id, d.subject, d.body, d.facts_json, d.lead_id, l.name, l.city, l.email, l.email_source_url, l.score
     FROM drafts d JOIN leads l ON l.id = d.lead_id WHERE d.status = 'pending' ORDER BY l.score DESC, d.created_at LIMIT 25`).all<QueueRow>()).results;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM drafts WHERE status = 'pending'").first<{ n: number }>())?.n ?? 0;
  const cards = rows.map((r) => {
    let facts: { lines?: string[]; reasons?: string[] } = {};
    try { facts = JSON.parse(r.facts_json); } catch { /* show without facts */ }
    return `<div class="card"><h3 style="margin:0">${esc(r.name)} <small>${esc(r.city)} · score ${esc(r.score)}</small></h3>
<p class="muted">To: <code>${esc(r.email)}</code> · found on ${esc(r.email_source_url)}</p>
<details><summary>Facts Claude was given</summary><ul>${(facts.lines ?? []).map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p class="muted">Why it scored: ${esc((facts.reasons ?? []).join("; "))}</p></details>
<form method="post" action="/approve/${esc(r.id)}/approve"><input type="hidden" name="csrf" value="${esc(csrf)}">
<label>Subject<input name="subject" value="${esc(r.subject)}" maxlength="120"></label>
<label>Body<textarea name="body" maxlength="2500">${esc(r.body)}</textarea></label>
<small class="muted">The address and unsubscribe link are added automatically when it sends.</small>
<div class="row"><button class="go">Approve</button></div></form>
<form method="post" action="/approve/${esc(r.id)}/reject"><input type="hidden" name="csrf" value="${esc(csrf)}"><div class="row"><button>Reject</button></div></form></div>`;
  }).join("");
  return page("Approve", `<h1>${total} to review</h1>${notice ? `<p class="warn">${esc(notice)}</p>` : ""}${cards || '<p class="muted">Nothing waiting. Drafts appear after the 06:30 UTC run.</p>'}
<form method="post" action="/approve/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><div class="row"><button>Sign out</button></div></form>`);
}

export async function handleApprove(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  const url = new URL(request.url);
  if (!env.APPROVAL_PASSWORD_HASH || !env.SESSION_SECRET) {
    return page("Not configured", "<h1>Not configured</h1><p>Set the APPROVAL_PASSWORD_HASH and SESSION_SECRET secrets.</p>", 503);
  }
  const session = cookieOf(request, SESSION_COOKIE);
  const authed = await verifySession(env.SESSION_SECRET, session, now);
  const path = url.pathname.replace(/\/+$/, "");

  if (request.method === "GET") {
    if (path === "/approve") return authed ? redirect("/approve/queue") : loginPage();
    if (path === "/approve/queue") return authed ? queuePage(env, session!) : redirect("/approve");
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!sameOriginPost(request)) return page("Blocked", "<h1>Blocked</h1><p>Cross-site request.</p>", 403);
  const form = await request.formData();

  if (path === "/approve/login") {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const key = `approve-login:${ip}`;
    const tries = Number((await env.OUTREACH_KV.get(key)) ?? 0);
    if (tries >= LOGIN_MAX_ATTEMPTS) return loginPage("Too many attempts. Try again in 15 minutes.", 429);
    if (!(await verifyApprovalPassword(String(form.get("password") ?? ""), env.APPROVAL_PASSWORD_HASH))) {
      await env.OUTREACH_KV.put(key, String(tries + 1), { expirationTtl: LOGIN_WINDOW_SEC });
      return loginPage("Wrong password.", 401);
    }
    await env.OUTREACH_KV.delete(key);
    const token = await makeSession(env.SESSION_SECRET, now);
    return redirect("/approve/queue", { "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/approve; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}` });
  }

  if (!authed) return redirect("/approve");
  if (String(form.get("csrf") ?? "") !== (await csrfFor(env.SESSION_SECRET, session!))) return page("Blocked", "<h1>Blocked</h1><p>Bad form token. Reload and try again.</p>", 403);

  if (path === "/approve/logout") {
    return redirect("/approve", { "set-cookie": `${SESSION_COOKIE}=; Path=/approve; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }

  const m = path.match(/^\/approve\/([\w-]+)\/(approve|reject)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const [, id, action] = m;
  const draft = await env.DB.prepare(
    "SELECT d.id, d.subject, d.body, d.lead_id, l.email FROM drafts d JOIN leads l ON l.id = d.lead_id WHERE d.id = ?1 AND d.status = 'pending'",
  ).bind(id).first<{ id: string; subject: string; body: string; lead_id: string; email: string | null }>();
  if (!draft) return queuePage(env, session!, "That draft was already handled.");

  if (action === "reject") {
    await env.DB.batch([
      env.DB.prepare("UPDATE drafts SET status = 'rejected' WHERE id = ?1").bind(id),
      env.DB.prepare("UPDATE leads SET status = 'dead' WHERE id = ?1").bind(draft.lead_id),
    ]);
    return queuePage(env, session!, "Rejected.");
  }

  const subject = String(form.get("subject") ?? "").trim().slice(0, 120);
  const body = String(form.get("body") ?? "").trim().slice(0, 2500);
  if (!subject || !body) return queuePage(env, session!, "Subject and body can't be empty.");
  if (!draft.email || (await isSuppressed(env, draft.email))) {
    await env.DB.batch([
      env.DB.prepare("UPDATE drafts SET status = 'rejected' WHERE id = ?1").bind(id),
      env.DB.prepare("UPDATE leads SET status = 'suppressed' WHERE id = ?1").bind(draft.lead_id),
    ]);
    return queuePage(env, session!, "That address is suppressed, so the draft was dropped.");
  }
  const edited = subject !== draft.subject || body !== draft.body ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare("UPDATE drafts SET status = 'approved', subject = ?2, body = ?3, edited_by_human = ?4, approved_at = datetime('now') WHERE id = ?1").bind(id, subject, body, edited),
    env.DB.prepare("UPDATE leads SET status = 'queued' WHERE id = ?1").bind(draft.lead_id),
  ]);
  return queuePage(env, session!, edited ? "Approved with your edits." : "Approved.");
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
    if (url.pathname === "/approve" || url.pathname.startsWith("/approve/")) return handleApprove(request, env);
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
    if (job === "score-and-draft") {
      try {
        if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set");
        const summary = await runDrafting(env, new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) as unknown as DraftClient, new Date(event.scheduledTime));
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
