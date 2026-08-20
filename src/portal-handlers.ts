/**
 * Client portal handlers for the Worker (mirrors functions/api/portal/*).
 */

/** Minimal D1 surface used by portal handlers */
export interface PortalD1 {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

export interface PortalEnv {
  DB?: PortalD1;
  POSTHOG_PERSONAL_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  PORTAL_ADMIN_SECRET?: string;
  PORTAL_ORIGIN?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  STRIPE_PRICE_GBP_REFRESH?: string;
  STRIPE_PRICE_WEBSITE_ONLY?: string;
  STRIPE_PRICE_WEBSITE_CONTENT_HALF?: string;
  STRIPE_PRICE_WEBSITE_CONTENT_FULL?: string;
  STRIPE_PRICE_CONTENT_GROWTH_RETAINER?: string;
  STRIPE_PRICE_FULL_GROWTH_PARTNER?: string;
}

const PBKDF2_ITERATIONS = 100_000;
const COOKIE_NAME = "swft_portal_session";
const SESSION_DAYS = 14;
const POSTHOG_HOST = "https://us.posthog.com";
const DEFAULT_PROJECT_ID = "486061";

const DEFAULT_PRICE_IDS: Record<string, string> = {
  "gbp-refresh": "price_1U6c9zAF4d9gCyuNIaEa8MhT",
  "website-only": "price_1U6cA5AF4d9gCyuNj65BmDU2",
  "website-content-half": "price_1U6cA8AF4d9gCyuNt2PH1qew",
  "website-content-full": "price_1U6cAAAF4d9gCyuNeB6qUFx5",
  "content-growth-retainer": "price_1U6cA8AF4d9gCyuN0Ko807my",
  "full-growth-partner": "price_1U6cAAAF4d9gCyuN6yvZR5im",
};

const DEFAULT_PAYMENT_LINK_URLS: Record<string, string> = {
  "gbp-refresh": "https://buy.stripe.com/bJe9AS0zmf4gdGN2refMA0A",
  "website-only": "https://buy.stripe.com/eVq6oGgykbS4cCJgi4fMA0v",
  "website-content-half": "https://buy.stripe.com/aFa6oGbe0e0cauB2refMA0w",
  "website-content-full": "https://buy.stripe.com/28E4gy1DqbS4byF4zmfMA0x",
  "content-growth-retainer": "https://buy.stripe.com/3cI3cube01dq9qxc1OfMA0y",
  "full-growth-partner": "https://buy.stripe.com/fZu00ia9W4pCauBaXKfMA0z",
};

const PRICE_ENV_KEYS: Record<string, keyof PortalEnv> = {
  "gbp-refresh": "STRIPE_PRICE_GBP_REFRESH",
  "website-only": "STRIPE_PRICE_WEBSITE_ONLY",
  "website-content-half": "STRIPE_PRICE_WEBSITE_CONTENT_HALF",
  "website-content-full": "STRIPE_PRICE_WEBSITE_CONTENT_FULL",
  "content-growth-retainer": "STRIPE_PRICE_CONTENT_GROWTH_RETAINER",
  "full-growth-partner": "STRIPE_PRICE_FULL_GROWTH_PARTNER",
};

const TIER_NAMES: Record<string, string> = {
  "gbp-refresh": "GBP Content Refresh",
  "website-only": "Website Only",
  "website-content-half": "Website + Content Capture",
  "website-content-full": "Website + Extended Content",
  "content-growth-retainer": "Content + Growth Retainer",
  "full-growth-partner": "Full Growth Partner",
};

function json(obj: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function bytesToHex(buf: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomId(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

async function verifyPassword(password: string, saltHex: string, hashHex: string) {
  try {
    const salt = hexToBytes(saltHex);
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      256
    );
    const derived = bytesToHex(bits);
    if (derived.length !== hashHex.length) return false;
    let ok = 0;
    for (let i = 0; i < derived.length; i++) ok |= derived.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return ok === 0;
  } catch {
    return false;
  }
}

async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function parseCookies(request: Request) {
  const out: Record<string, string> = {};
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionCookie(sessionId: string, clear = false) {
  if (clear) return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function resolveStripePriceId(env: PortalEnv, tierId: string): string | null {
  const key = PRICE_ENV_KEYS[tierId];
  if (key && env[key]) return String(env[key]).trim();
  return DEFAULT_PRICE_IDS[tierId] || null;
}

/** Payment Link URL for a tier (no STRIPE_SECRET_KEY required). Prefills email when provided. */
export function resolvePaymentLinkUrl(env: PortalEnv, tierId: string, email?: string): string | null {
  const base = DEFAULT_PAYMENT_LINK_URLS[tierId] || null;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (email) url.searchParams.set("prefilled_email", email.trim().toLowerCase());
    return url.toString();
  } catch {
    return base;
  }
}

async function getSessionUser(db: PortalD1, request: Request) {
  const sessionId = parseCookies(request)[COOKIE_NAME];
  if (!sessionId) return null;
  const row = await db
    .prepare(
      `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    )
    .bind(sessionId)
    .first<{
      id: string;
      email: string;
      password_hash: string | null;
      password_salt: string | null;
      stripe_customer_id: string | null;
      session_id: string;
      session_expires: string;
    }>();
  if (!row) return null;
  if (new Date(row.session_expires).getTime() < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }
  return row;
}

async function createSession(db: PortalD1, userId: string) {
  const id = randomId(24);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(id, userId, expires).run();
  return id;
}

/** Route portal + stripe webhook + admin APIs. Returns Response or null if not matched. */
export async function handlePortalRoutes(
  request: Request,
  env: PortalEnv,
  url: URL
): Promise<Response | null> {
  const path = url.pathname;
  const db = env.DB;

  if (
    request.method === "OPTIONS" &&
    (path.startsWith("/api/portal/") || path === "/api/stripe-webhook" || path === "/api/admin/projects")
  ) {
    return new Response(null, { status: 204 });
  }

  if (path === "/api/portal/onboard" && request.method === "POST") {
    if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
    let body: { email?: string; password?: string; inviteToken?: string; token?: string };
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const email = String(body.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 320);
    const password = String(body.password || "");
    const inviteToken = String(body.inviteToken || body.token || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Valid email is required." }, 400);
    if (password.length < 10 || password.length > 200) {
      return json({ ok: false, error: "Password must be at least 10 characters." }, 400);
    }

    let userId: string | null = null;
    if (inviteToken) {
      const tokenHash = await sha256Hex(inviteToken);
      const inv = await db
        .prepare("SELECT * FROM invite_tokens WHERE token_hash = ?")
        .bind(tokenHash)
        .first<{ user_id: string; expires_at: string }>();
      if (inv && new Date(inv.expires_at).getTime() >= Date.now()) {
        userId = inv.user_id;
        await db.prepare("DELETE FROM invite_tokens WHERE token_hash = ?").bind(tokenHash).run();
      }
    }

    let user = userId
      ? await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<{
          id: string;
          email: string;
          password_hash: string | null;
          password_salt: string | null;
        }>()
      : await db
          .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
          .bind(email)
          .first<{ id: string; email: string; password_hash: string | null; password_salt: string | null }>();

    if (user?.password_hash && user.password_salt) {
      const ok = await verifyPassword(password, user.password_salt, user.password_hash);
      if (!ok) return json({ ok: false, error: "Account already exists. Sign in instead.", code: "exists" }, 409);
    } else if (user) {
      const { salt, hash } = await hashPassword(password);
      await db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(hash, salt, user.id).run();
    } else {
      const id = randomId(16);
      const { salt, hash } = await hashPassword(password);
      await db
        .prepare("INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)")
        .bind(id, email, hash, salt)
        .run();
      user = { id, email, password_hash: hash, password_salt: salt };
    }

    const sessionId = await createSession(db, user!.id);
    return json(
      { ok: true, created: true, email: user!.email, redirect: "/portal/dashboard.html" },
      200,
      { "Set-Cookie": sessionCookie(sessionId) }
    );
  }

  if (path === "/api/portal/login" && request.method === "POST") {
    if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
    let body: { email?: string; password?: string };
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const user = await db
      .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
      .bind(email)
      .first<{ id: string; email: string; password_hash: string | null; password_salt: string | null }>();
    if (!user?.password_hash || !user.password_salt || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
      return json({ ok: false, error: "Invalid email or password." }, 401);
    }
    const sessionId = await createSession(db, user.id);
    return json({ ok: true, email: user.email, redirect: "/portal/dashboard.html" }, 200, {
      "Set-Cookie": sessionCookie(sessionId),
    });
  }

  if (path === "/api/portal/logout" && request.method === "POST") {
    const sid = parseCookies(request)[COOKIE_NAME];
    if (db && sid) await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
  }

  if (path === "/api/portal/me" && request.method === "GET") {
    if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
    const user = await getSessionUser(db, request);
    if (!user) return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    const project = await db
      .prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`)
      .bind(user.id)
      .first<{
        id: string;
        tier_id: string;
        status: string;
        site_host: string | null;
        stripe_subscription_id: string | null;
        created_at: string;
      }>();
    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        hasPassword: !!(user.password_hash && user.password_salt),
        stripeCustomerId: user.stripe_customer_id || null,
      },
      project: project
        ? {
            id: project.id,
            tierId: project.tier_id,
            tierName: TIER_NAMES[project.tier_id] || project.tier_id,
            status: project.status,
            siteHost: project.site_host || null,
            hasAnalyticsHost: !!project.site_host,
            stripeSubscriptionId: project.stripe_subscription_id || null,
            createdAt: project.created_at,
          }
        : null,
    });
  }

  if (path === "/api/portal/metrics" && request.method === "GET") {
    if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
    const user = await getSessionUser(db, request);
    if (!user) return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    const project = await db
      .prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`)
      .bind(user.id)
      .first<{ id: string; site_host: string | null }>();
    if (!project) {
      return json({
        ok: true,
        metrics: {
          ok: false,
          reason: "no_project",
          message: "No project yet. Complete a booking to see progress here.",
        },
      });
    }
    const metrics = await fetchHostMetrics(env, project.site_host);
    return json({ ok: true, projectId: project.id, metrics });
  }

  if (path === "/api/admin/projects" && request.method === "POST") {
    if (!env.PORTAL_ADMIN_SECRET) return json({ ok: false, error: "Admin API not configured." }, 503);
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token !== env.PORTAL_ADMIN_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);
    if (!db) return json({ ok: false, error: "Portal storage is not configured." }, 503);
    let body: { projectId?: string; email?: string; siteHost?: string; host?: string };
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const siteHost = String(body.siteHost || body.host || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!siteHost) return json({ ok: false, error: "siteHost is required (e.g. www.client.com)." }, 400);
    let projectId = String(body.projectId || "").trim();
    if (!projectId) {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const u = await db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first<{ id: string }>();
      if (!u) return json({ ok: false, error: "User not found." }, 404);
      const p = await db
        .prepare(`SELECT id FROM projects WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`)
        .bind(u.id)
        .first<{ id: string }>();
      if (!p) return json({ ok: false, error: "No project for that user." }, 404);
      projectId = p.id;
    }
    await db
      .prepare(`UPDATE projects SET site_host = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(siteHost, projectId)
      .run();
    const project = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
    return json({ ok: true, project });
  }

  if (path === "/api/stripe-webhook" && request.method === "POST") {
    if (!db) return new Response("Portal DB not configured", { status: 503 });
    if (!env.STRIPE_WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 503 });
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") || "";
    const verified = await verifyStripeSig(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!verified) return new Response("Invalid signature", { status: 400 });
    let event: { type: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    await processStripeEvent(env, db, event);
    return json({ received: true });
  }

  return null;
}

async function verifyStripeSig(rawBody: string, signatureHeader: string, secret: string) {
  const parts: Record<string, string[]> = {};
  for (const item of signatureHeader.split(",")) {
    const [k, v] = item.split("=");
    if (k && v) {
      if (!parts[k]) parts[k] = [];
      parts[k].push(v);
    }
  }
  const timestamp = parts.t?.[0];
  const v1s = parts.v1 || [];
  if (!timestamp || !v1s.length) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(Number(timestamp)) || age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = bytesToHex(sig);
  return v1s.some((v) => v.length === expected.length && [...v].every((c, i) => (c.charCodeAt(0) ^ expected.charCodeAt(i)) === 0));
}

async function processStripeEvent(
  env: PortalEnv,
  db: PortalD1,
  event: { type: string; data?: { object?: Record<string, unknown> } }
) {
  const obj = event.data?.object;
  if (!obj) return;

  if (event.type === "checkout.session.completed") {
    const details = obj.customer_details as { email?: string; name?: string } | undefined;
    const email = String(details?.email || obj.customer_email || "")
      .trim()
      .toLowerCase();
    if (!email) return;
    const meta = (obj.metadata || {}) as Record<string, string>;
    let tierId = meta.tierId || String(obj.client_reference_id || "").split(":")[0] || "unknown";
    const status = obj.mode === "subscription" ? "active" : "paid";
    const customerId = typeof obj.customer === "string" ? obj.customer : null;
    const checkoutId = String(obj.id || "");
    const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : null;

    let user = await db
      .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
      .bind(email)
      .first<{ id: string; password_hash: string | null }>();
    if (!user) {
      const id = randomId(16);
      await db
        .prepare(`INSERT INTO users (id, email, password_hash, password_salt, stripe_customer_id) VALUES (?, ?, NULL, NULL, ?)`)
        .bind(id, email, customerId)
        .run();
      user = { id, password_hash: null };
    } else if (customerId) {
      await db.prepare("UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?").bind(customerId, user.id).run();
    }

    const existing = checkoutId
      ? await db.prepare("SELECT id FROM projects WHERE stripe_checkout_id = ?").bind(checkoutId).first()
      : null;
    if (!existing) {
      await db
        .prepare(
          `INSERT INTO projects (id, user_id, tier_id, stripe_checkout_id, stripe_subscription_id, status)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(randomId(16), user.id, tierId, checkoutId || null, subscriptionId, status)
        .run();
    }

    if (!user.password_hash && env.RESEND_API_KEY) {
      const raw = randomId(24);
      const tokenHash = await sha256Hex(raw);
      const expires = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      await db.prepare("INSERT INTO invite_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, user.id, expires).run();
      const origin = env.PORTAL_ORIGIN || "https://www.swftstudios.com";
      const inviteUrl = `${origin}/portal/onboard.html?token=${encodeURIComponent(raw)}&email=${encodeURIComponent(email)}`;
      const tierName = TIER_NAMES[tierId] || tierId;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.RESEND_FROM || "SWFT Studios <hello@swftstudios.com>",
          to: [email],
          subject: "Set up your SWFT client portal",
          html: `<p>Thanks for booking <strong>${tierName}</strong>.</p><p><a href="${inviteUrl}">Create your portal password</a></p>`,
        }),
      }).catch((err) => console.error("invite email failed", err));
    }
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subId = String(obj.id || "");
    let status = String(obj.status || "unknown");
    if (event.type === "customer.subscription.deleted") status = "canceled";
    else if (status === "active" || status === "trialing") status = "active";
    else if (status === "past_due" || status === "unpaid") status = "past_due";
    if (subId) {
      await db
        .prepare(`UPDATE projects SET status = ?, updated_at = datetime('now') WHERE stripe_subscription_id = ?`)
        .bind(status, subId)
        .run();
    }
  }
}

async function fetchHostMetrics(env: PortalEnv, siteHost: string | null) {
  if (!env.POSTHOG_PERSONAL_API_KEY) {
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
  const host = siteHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
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
        properties: [{ type: "AND", values: [{ key: "$host", value: host, operator: "icontains", type: "event" }] }],
      },
    },
  };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(trendsBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, reason: "query_failed", message: "Could not load analytics right now. Try again shortly." };
    }
    const trends = (await res.json()) as { results?: { aggregated_value?: number; data?: number[] }[] };
    const results = trends.results || [];
    const sum = (series?: { aggregated_value?: number; data?: number[] }) => {
      if (!series) return 0;
      if (typeof series.aggregated_value === "number") return series.aggregated_value;
      if (Array.isArray(series.data)) return series.data.reduce((a, b) => a + (Number(b) || 0), 0);
      return 0;
    };
    const pageviews = sum(results[0]);
    const visitors = sum(results[1]);
    if (pageviews === 0 && visitors === 0) {
      return {
        ok: true,
        host,
        empty: true,
        message: "Not tracking yet — no pageviews for this site in the last 30 days.",
        visitors: 0,
        pageviews: 0,
        topPages: [],
        range: "30d",
      };
    }
    return { ok: true, host, empty: false, visitors, pageviews, bounceRate: null, topPages: [], range: "30d" };
  } catch (err) {
    console.error("PostHog fetch failed", err);
    return {
      ok: false,
      reason: (err as { name?: string })?.name === "AbortError" ? "timeout" : "network",
      message: "Could not reach analytics. Try again shortly.",
    };
  }
}
