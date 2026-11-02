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
    // Pipeline stages land in later slices; record honestly instead of faking work.
    await logRun(env, job, false, `not implemented yet (dry_run=${env.DRY_RUN})`);
  },
};
