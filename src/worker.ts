/**
 * SWFT static site worker: serves assets + form APIs
 * (contact, growth-audit, book-tier, build-request, case-study-match).
 * Lead emails go through Resend when RESEND_API_KEY is set.
 */
export interface Env {
  ASSETS: Fetcher;
  AI?: { run(model: string, opts: { messages: { role: string; content: string }[] }): Promise<unknown> };
  /* Secrets — set with `wrangler secret put` (or in the Cloudflare dashboard) */
  STRIPE_SECRET_KEY?: string;
  AIRTABLE_TOKEN?: string;
  /** Resend API key for lead notify + visitor confirmation emails */
  RESEND_API_KEY?: string;
  /* Non-secret config — safe defaults baked in; override via vars if needed */
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_MAINTENANCE?: string;
  AIRTABLE_BASE_ID?: string;
  AIRTABLE_TABLE?: string;
  AIRTABLE_TABLE_CONTACT?: string;
  /** Airtable table id for Growth Audit leads — set via Worker vars */
  AIRTABLE_TABLE_GROWTH_AUDIT?: string;
  FORMSUBMIT_EMAIL?: string;
  /** Override From header, e.g. `SWFT Studios <hello@swftstudios.com>` */
  RESEND_FROM?: string;
  /** Team notify inbox (default hello@swftstudios.com) */
  NOTIFY_EMAIL?: string;
}

/* Defaults for the resources provisioned for SWFT Studios. Override via env vars. */
const DEFAULTS = {
  STRIPE_PRICE_MONTHLY: "price_1Td9xhAF4d9gCyuNnjPgqkho", // $299/mo SWFT Monthly Website Plan
  STRIPE_PRICE_MAINTENANCE: "price_1Td9xiAF4d9gCyuN6rUc25R0", // $99/mo SWFT Website Maintenance
  AIRTABLE_BASE_ID: "appjwRgcgS0BD4lT7",
  AIRTABLE_TABLE: "tbl30H9M2CC7p6MqY", // Website Build Requests
  AIRTABLE_TABLE_CONTACT: "tblGCvDi4RdGkK96L", // Discovery Calls
  /* Growth Audits table id must be set after creating the table in Airtable */
  AIRTABLE_TABLE_GROWTH_AUDIT: "",
};

type CaseStudyInput = {
  title: string;
  content: string;
  link: string;
};

type MatchBody = {
  prompt?: string;
  caseStudies?: CaseStudyInput[];
};

const MAX_PROMPT = 2000;
const MAX_CONTENT = 8000;
const MAX_ITEMS = 40;

/* In-memory rate limiter — token bucket per IP, resets after WINDOW_MS.
   Cloudflare Worker isolates are not shared across instances, so this protects
   against burst abuse within a single isolate lifetime, not globally.
   For persistent global limiting, use Workers KV or a Durable Object. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
type BucketEntry = { count: number; windowStart: number };
const rateBuckets = new Map<string, BucketEntry>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function pruneRateBuckets(): void {
  const now = Date.now();
  for (const [ip, entry] of rateBuckets) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(ip);
  }
}

function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (!origin) {
    base["Access-Control-Allow-Origin"] = "*";
    return base;
  }
  try {
    const { hostname } = new URL(origin);
    const ok =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.includes("swftstudios") ||
      hostname.endsWith(".pages.dev");
    if (ok) base["Access-Control-Allow-Origin"] = origin;
  } catch {
    /* omit ACAO — browser blocks disallowed origins */
  }
  return base;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function scoreMatch(prompt: string, cs: CaseStudyInput): number {
  const p = tokenize(prompt);
  const hay = tokenize(`${cs.title} ${cs.content}`);
  let n = 0;
  for (const w of p) {
    if (hay.has(w)) n++;
  }
  return n;
}

function pickDeterministic(prompt: string, list: CaseStudyInput[]): CaseStudyInput | null {
  if (!list.length) return null;
  let best = list[0];
  let bestScore = scoreMatch(prompt, best);
  for (let i = 1; i < list.length; i++) {
    const s = scoreMatch(prompt, list[i]);
    if (s > bestScore) {
      best = list[i];
      bestScore = s;
    }
  }
  return bestScore > 0 ? best : list[0];
}

async function tryAiMatch(
  env: Env,
  prompt: string,
  list: CaseStudyInput[]
): Promise<{ explanation: string; matchedCaseStudy: string; matchedLink: string } | null> {
  if (!env.AI) return null;
  const catalog = list
    .map((c, i) => `${i}: title=${JSON.stringify(c.title)} link=${JSON.stringify(c.link)}`)
    .join("\n");
  const sys =
    'You help pick the best case study. Reply with ONLY compact JSON: {"matchedIndex":number,"explanationHtml":"<p>1-3 short html paragraphs</p>"} — matchedIndex is the index from the catalog list (0-based). No markdown fences.';
  const user = `User question: ${prompt.slice(0, MAX_PROMPT)}\nCatalog:\n${catalog}`;
  try {
    const out = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    })) as { response?: string };
    const text = typeof out === "string" ? out : out.response ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      matchedIndex?: number;
      explanationHtml?: string;
    };
    const idx = Number(parsed.matchedIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return null;
    const pick = list[idx];
    return {
      explanation: parsed.explanationHtml ?? `<p>Recommended read: <strong>${pick.title}</strong>.</p>`,
      matchedCaseStudy: pick.title.toLowerCase(),
      matchedLink: pick.link,
    };
  } catch {
    return null;
  }
}

/* ============================================================
   Website build-request intake: store lead in Airtable +
   start a Stripe Checkout session for the chosen plan.
   ============================================================ */

type BuildRequestBody = Record<string, unknown>;

const str = (v: unknown, max = 2000): string => String(v ?? "").trim().slice(0, max);

/** Create a Stripe Checkout Session via the REST API. Returns the hosted URL or null. */
async function createStripeCheckout(
  env: Env,
  data: {
    plan: string;
    oneTimeAmount: number; // dollars
    maintenance: boolean;
    email: string;
    businessName: string;
    origin: string;
  }
): Promise<string | null> {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const params = new URLSearchParams();
  const successUrl = `${data.origin}/swft-method.html?status=success`;
  const cancelUrl = `${data.origin}/swft-method.html?status=cancel#start`;
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  if (data.email) params.set("customer_email", data.email);
  params.set("metadata[plan]", data.plan);
  params.set("metadata[business]", data.businessName.slice(0, 200));
  params.set("metadata[maintenance]", data.maintenance ? "yes" : "no");

  if (data.plan === "Monthly Plan") {
    const monthly = env.STRIPE_PRICE_MONTHLY || DEFAULTS.STRIPE_PRICE_MONTHLY;
    params.set("mode", "subscription");
    params.set("line_items[0][price]", monthly);
    params.set("line_items[0][quantity]", "1");
  } else {
    // One-Time Build — dynamic amount for the custom build.
    const cents = Math.max(0, Math.round(data.oneTimeAmount * 100));
    params.set("mode", "payment");
    params.set("line_items[0][price_data][currency]", "usd");
    params.set("line_items[0][price_data][unit_amount]", String(cents));
    params.set("line_items[0][price_data][product_data][name]", "SWFT Custom Website Build (7-day)");
    params.set("line_items[0][quantity]", "1");
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { url?: string };
    return json.url ?? null;
  } catch {
    return null;
  }
}

/* Where lead notifications are emailed. Override with NOTIFY_EMAIL (or legacy FORMSUBMIT_EMAIL). */
const NOTIFY_EMAIL_DEFAULT = "hello@swftstudios.com";
const RESEND_FROM_DEFAULT = "SWFT Studios <hello@swftstudios.com>";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function notifyAddress(env: Env): string {
  return env.NOTIFY_EMAIL || env.FORMSUBMIT_EMAIL || NOTIFY_EMAIL_DEFAULT;
}

function emailRow(label: string, value: string): string {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
}

/**
 * Send one email via Resend HTTP API.
 * Returns true on success. Never throws. Skips when RESEND_API_KEY is unset.
 */
async function sendResendEmail(
  env: Env,
  opts: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    idempotencyKey?: string;
  }
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey || !opts.to) return false;

  const from = env.RESEND_FROM || RESEND_FROM_DEFAULT;
  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.text) payload.text = opts.text;
  if (opts.replyTo) payload.reply_to = opts.replyTo;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = String(opts.idempotencyKey).slice(0, 256);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Resend error", res.status, errBody.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend fetch failed", err);
    return false;
  }
}

/** Team alert + visitor confirmation. Best-effort; does not throw. */
async function sendLeadEmails(
  env: Env,
  opts: {
    kind: string;
    visitorEmail: string;
    visitorName?: string;
    teamSubject: string;
    teamHtml: string;
    confirmSubject: string;
    confirmHtml: string;
    idempotencyBase?: string;
  }
): Promise<{ team: boolean; visitor: boolean }> {
  const notify = notifyAddress(env);
  const base = opts.idempotencyBase || `${opts.kind}/${Date.now()}`;
  const results = { team: false, visitor: false };

  results.team = await sendResendEmail(env, {
    to: notify,
    subject: opts.teamSubject,
    html: opts.teamHtml,
    replyTo: opts.visitorEmail || undefined,
    idempotencyKey: `${base}/team`,
  });

  if (opts.visitorEmail) {
    results.visitor = await sendResendEmail(env, {
      to: opts.visitorEmail,
      subject: opts.confirmSubject,
      html: opts.confirmHtml,
      replyTo: notify,
      idempotencyKey: `${base}/visitor`,
    });
  }

  return results;
}

/**
 * Legacy FormSubmit notify for /api/build-request (swft-method).
 * Prefer Resend for contact / growth-audit / book-tier.
 */
async function sendFormSubmitEmail(
  env: Env,
  data: { email: string; name: string; fields: Record<string, unknown> }
): Promise<boolean> {
  const to = env.FORMSUBMIT_EMAIL || NOTIFY_EMAIL_DEFAULT;
  const autoresponse =
    "Thanks for your website request — we've got it! Our team will review your " +
    "build plan and reach out within 48 hours with your next steps to get your site " +
    "live in 7 days or less. If it's urgent, email us anytime at hello@swftstudios.com. — SWFT Studios";
  const payload: Record<string, unknown> = {
    _subject: "New SWFT Build Plan — Instagram → Online Business",
    _template: "table",
    _captcha: "false",
    _autoresponse: autoresponse,
    name: data.name,
    email: data.email,
    ...data.fields,
  };
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Server-authoritative Stripe booking catalog (keep in sync with
 * functions/_lib/stripe-tiers.js and data/pricing.json → tier.stripe).
 */
type StripeTierDef = {
  id: string;
  name: string;
  mode: "payment" | "subscription";
  amountCents: number;
  productName: string;
  priceLabel: string;
  priceDisplay: string;
  interval?: string;
};

const STRIPE_TIERS: Record<string, StripeTierDef> = {
  "gbp-refresh": {
    id: "gbp-refresh",
    name: "GBP Content Refresh",
    mode: "payment",
    amountCents: 40000,
    productName: "SWFT. GBP Content Refresh (project start)",
    priceLabel: "$400 to $600",
    priceDisplay: "$400",
  },
  "website-only": {
    id: "website-only",
    name: "Website Only",
    mode: "payment",
    amountCents: 80000,
    productName: "SWFT. Website Only (project start)",
    priceLabel: "$800 to $1,500",
    priceDisplay: "$800",
  },
  "website-content-half": {
    id: "website-content-half",
    name: "Website + Content Capture",
    mode: "payment",
    amountCents: 200000,
    productName: "SWFT. Website + Content Capture (project start)",
    priceLabel: "$2,000 to $2,800",
    priceDisplay: "$2,000",
  },
  "website-content-full": {
    id: "website-content-full",
    name: "Website + Extended Content",
    mode: "payment",
    amountCents: 300000,
    productName: "SWFT. Website + Extended Content (project start)",
    priceLabel: "$3,000 to $4,500+",
    priceDisplay: "$3,000",
  },
  "content-growth-retainer": {
    id: "content-growth-retainer",
    name: "Content + Growth Retainer",
    mode: "subscription",
    amountCents: 45000,
    interval: "month",
    productName: "SWFT. Content + Growth Retainer",
    priceLabel: "$450 to $800/mo",
    priceDisplay: "$450/mo",
  },
  "full-growth-partner": {
    id: "full-growth-partner",
    name: "Full Growth Partner",
    mode: "subscription",
    amountCents: 120000,
    interval: "month",
    productName: "SWFT. Full Growth Partner",
    priceLabel: "From $1,200/mo",
    priceDisplay: "$1,200/mo",
  },
};

function getStripeTier(id: unknown): StripeTierDef | null {
  if (!id) return null;
  return STRIPE_TIERS[String(id).trim()] || null;
}

/** Create Stripe Checkout for a pricing-ladder tier. Returns hosted URL or null. */
async function createTierCheckout(
  env: Env,
  data: {
    tier: StripeTierDef;
    email: string;
    businessName: string;
    name: string;
    origin: string;
    cancelPath?: string;
  }
): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY) return null;

  const successUrl = `${data.origin}/book/thank-you.html?tier=${encodeURIComponent(data.tier.id)}&status=success`;
  const cancelUrl = `${data.origin}${data.cancelPath || `/book/${data.tier.id}.html`}?status=cancel`;

  const params = new URLSearchParams();
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  if (data.email) params.set("customer_email", data.email);
  params.set("mode", data.tier.mode);
  params.set("metadata[tierId]", data.tier.id);
  params.set("metadata[tierName]", data.tier.name.slice(0, 200));
  params.set("metadata[business]", data.businessName.slice(0, 200));
  params.set("metadata[name]", data.name.slice(0, 200));
  params.set("client_reference_id", `${data.tier.id}:${data.email}`.slice(0, 200));
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(data.tier.amountCents));
  params.set("line_items[0][price_data][product_data][name]", data.tier.productName);
  params.set(
    "line_items[0][price_data][product_data][description]",
    `${data.tier.name}. ${data.tier.priceLabel} (starting checkout)`.slice(0, 500)
  );
  if (data.tier.mode === "subscription") {
    params.set("line_items[0][price_data][recurring][interval]", data.tier.interval || "month");
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("Stripe checkout error", res.status, errBody.slice(0, 500));
      return null;
    }
    const session = (await res.json()) as { url?: string };
    return session.url || null;
  } catch (err) {
    console.error("Stripe checkout fetch failed", err);
    return null;
  }
}

/** Write a record to an Airtable table. Returns true on success. */
async function writeToAirtable(env: Env, table: string, fields: Record<string, unknown>): Promise<boolean> {
  const token = env.AIRTABLE_TOKEN;
  if (!token) return false;
  const baseId = env.AIRTABLE_BASE_ID || DEFAULTS.AIRTABLE_BASE_ID;
  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    /* Clean marketing URLs (no .html) */
    if (request.method === "GET" || request.method === "HEAD") {
      if (
        url.pathname === "/book/gbp-refresh.html" ||
        url.pathname === "/book/gbp-refresh" ||
        url.pathname === "/book/gbp-refresh/"
      ) {
        const dest = new URL("/book/gbp-content-refresh.html", url.origin);
        dest.search = url.search;
        return Response.redirect(dest.toString(), 301);
      }

      const cleanRoutes: Record<string, string> = {
        "/growth-audit": "/growth-audit.html",
        "/growth-audit/": "/growth-audit.html",
        "/growth-audit/thank-you": "/growth-audit/thank-you.html",
        "/growth-audit/thank-you/": "/growth-audit/thank-you.html",
      };
      const assetPath = cleanRoutes[url.pathname];
      if (assetPath) {
        const rewritten = new URL(request.url);
        rewritten.pathname = assetPath;
        return env.ASSETS.fetch(new Request(rewritten.toString(), request));
      }
    }

    if (
      request.method === "OPTIONS" &&
      (url.pathname === "/api/case-study-match" ||
        url.pathname === "/api/build-request" ||
        url.pathname === "/api/contact" ||
        url.pathname === "/api/growth-audit" ||
        url.pathname === "/api/book-tier")
    ) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "POST" && url.pathname === "/api/build-request") {
      pruneRateBuckets();
      const clientIp =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "unknown";
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ ok: false, error: "Too many requests. Try again in a minute." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60", ...corsHeaders(origin) },
        });
      }

      let body: BuildRequestBody;
      try {
        const raw = await request.text();
        if (raw.length > 100_000) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          });
        }
        body = JSON.parse(raw) as BuildRequestBody;
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const email = str(body.email, 320);
      const plan = str(body.plan, 40) === "Monthly Plan" ? "Monthly Plan" : "One-Time Build";
      const maintenance = body.maintenance === true || str(body.maintenance) === "Yes";
      const oneTimeAmount = Math.max(0, Math.min(100000, Number(body.oneTimeAmount) || 0));
      const businessName = str(body.businessName, 200);

      // Build a same-origin redirect base from the request URL (so success/cancel land back here).
      const reqOrigin = `${url.protocol}//${url.host}`;

      // 1) Store the lead (best-effort).
      const airtableFields: Record<string, unknown> = {
        Name: str(body.name, 200),
        Email: email,
        Instagram: str(body.instagram, 120),
        Phone: str(body.phone, 60),
        "Business Name": businessName,
        "What They Sell": str(body.whatYouSell, 4000),
        "Ideal Customer": str(body.idealCustomer, 4000),
        "Main Goal": str(body.mainGoal, 200),
        "Look and Feel": str(body.lookAndFeel, 4000),
        Features: str(body.features, 4000),
        "Plan Choice": plan,
        "One-Time Price": oneTimeAmount,
        "Maintenance Add-On": maintenance ? "Yes" : "No",
        "Monthly Price": "$299/mo",
        "Content Ready": str(body.contentReady, 200),
        "Has Domain": str(body.hasDomain, 200),
        Timeline: str(body.timeline, 200),
        "Anything Else": str(body.anythingElse, 4000),
        Status: "New",
        "Submitted At": new Date().toISOString(),
      };
      const buildTable = env.AIRTABLE_TABLE || DEFAULTS.AIRTABLE_TABLE;
      const stored = await writeToAirtable(env, buildTable, airtableFields);

      // 2) Email the team a notification + send the visitor a confirmation
      //    (48-hour autoresponse). Runs in the background so it never blocks
      //    the response / Stripe redirect.
      ctx.waitUntil(
        sendFormSubmitEmail(env, {
          email,
          name: str(body.name, 200),
          fields: {
            Instagram: str(body.instagram, 120),
            Phone: str(body.phone, 60),
            "Business Name": businessName,
            "What They Sell": str(body.whatYouSell, 4000),
            "Main Goal": str(body.mainGoal, 200),
            Features: str(body.features, 4000),
            "Plan Choice": plan,
            "One-Time Price": `$${oneTimeAmount}`,
            "Maintenance Add-On": maintenance ? "Yes" : "No",
            "Monthly Price": "$299/mo",
            Timeline: str(body.timeline, 200),
            "Anything Else": str(body.anythingElse, 4000),
          },
        })
      );

      // 3) Start Stripe Checkout (best-effort).
      const checkoutUrl = await createStripeCheckout(env, {
        plan,
        oneTimeAmount,
        maintenance,
        email,
        businessName,
        origin: reqOrigin,
      });

      return new Response(JSON.stringify({ ok: true, stored, checkoutUrl }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/growth-audit") {
      pruneRateBuckets();
      const clientIp =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "unknown";
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ ok: false, error: "Too many requests. Try again in a minute." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60", ...corsHeaders(origin) },
        });
      }

      let body: BuildRequestBody;
      try {
        const raw = await request.text();
        if (raw.length > 100_000) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          });
        }
        body = JSON.parse(raw) as BuildRequestBody;
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      /* Honeypot — bots fill this; humans never see it */
      if (str(body.honeypot, 200) || str(body.company_website, 200)) {
        return new Response(JSON.stringify({ ok: true, stored: false }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const firstName = str(body.firstName, 120);
      const lastName = str(body.lastName, 120);
      const email = str(body.email, 320);
      const businessName = str(body.businessName, 200);
      const websiteUrl = str(body.websiteUrl || body.website, 500);
      const instagram = str(body.instagram, 300);
      const presence = websiteUrl || instagram || str(body.website, 500);
      const desiredService = str(body.desiredService, 80);
      const desiredServiceLabel = str(body.desiredServiceLabel, 200) || desiredService;
      const details = str(body.details, 4000);
      const photoLinks = str(body.photoLinks, 1000);
      const businessCategory =
        str(body.businessCategory, 200) || desiredServiceLabel || "Growth Audit";
      const challenge = str(body.challenge, 400) || desiredServiceLabel || "Growth Audit inquiry";
      const desiredOutcome =
        str(body.desiredOutcome, 4000) || details || `Discuss ${desiredServiceLabel || "next steps"}`;

      if (!firstName || !email || !businessName || !presence || !desiredService) {
        return new Response(JSON.stringify({ ok: false, error: "Missing required fields." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid email." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      const additionalContext = [details, photoLinks ? `Photo links: ${photoLinks}` : ""]
        .filter(Boolean)
        .join("\n\n");

      const auditTable = env.AIRTABLE_TABLE_GROWTH_AUDIT || DEFAULTS.AIRTABLE_TABLE_GROWTH_AUDIT;
      const fields: Record<string, unknown> = {
        "First Name": firstName,
        Email: email,
        Phone: str(body.phone, 40),
        "Business Name": businessName,
        "Website or Social": presence,
        "Business Category": businessCategory,
        "Biggest Challenge": challenge,
        "Desired Outcome": desiredOutcome,
        Instagram: instagram,
        "Additional Context": [
          lastName ? `Last name: ${lastName}` : "",
          desiredServiceLabel ? `Desired service: ${desiredServiceLabel}` : "",
          additionalContext,
        ]
          .filter(Boolean)
          .join("\n"),
        "UTM Source": str(body.utmSource, 120),
        "UTM Medium": str(body.utmMedium, 120),
        "UTM Campaign": str(body.utmCampaign, 120),
        "Source Page": str(body.sourcePage, 300),
        Status: "New",
        "Submitted At": new Date().toISOString(),
      };

      let stored = false;
      if (auditTable) {
        stored = await writeToAirtable(env, auditTable, fields);
      } else {
        /* Fallback: store in Discovery Calls so leads are never silently dropped */
        const contactTable = env.AIRTABLE_TABLE_CONTACT || DEFAULTS.AIRTABLE_TABLE_CONTACT;
        stored = await writeToAirtable(env, contactTable, {
          Name: fullName || firstName,
          Email: email,
          "Business Type": desiredServiceLabel || businessCategory,
          "Primary Goal": `Growth Audit — ${desiredServiceLabel || challenge}`,
          Details: [
            `Business: ${businessName}`,
            lastName ? `Last name: ${lastName}` : "",
            `Website: ${websiteUrl}`,
            `Social: ${instagram}`,
            `Desired service: ${desiredServiceLabel}`,
            `Phone: ${str(body.phone, 40)}`,
            `Photo links: ${photoLinks}`,
            `Context: ${str(details, 2000)}`,
            `UTM: ${str(body.utmSource, 80)}/${str(body.utmMedium, 80)}/${str(body.utmCampaign, 80)}`,
            `Source: ${str(body.sourcePage, 200)}`,
          ]
            .filter(Boolean)
            .join("\n"),
          Status: "New",
          "Submitted At": new Date().toISOString(),
        });
      }

      const phone = str(body.phone, 40);
      const emailed = await sendLeadEmails(env, {
        kind: "growth-audit",
        visitorEmail: email,
        visitorName: firstName,
        idempotencyBase: `growth-audit/${email.toLowerCase()}/${Date.now()}`,
        teamSubject: `Growth Audit: ${businessName}${desiredServiceLabel ? ` (${desiredServiceLabel})` : ""}`,
        teamHtml: `
      <p><strong>New Growth Audit request</strong></p>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        ${emailRow("Name", fullName || firstName)}
        ${emailRow("Email", email)}
        ${emailRow("Phone", phone)}
        ${emailRow("Business", businessName)}
        ${emailRow("Website", websiteUrl)}
        ${emailRow("Social", instagram)}
        ${emailRow("Desired service", desiredServiceLabel)}
        ${emailRow("Details", details)}
        ${emailRow("Photo links", photoLinks)}
        ${emailRow("UTM", [str(body.utmSource, 80), str(body.utmMedium, 80), str(body.utmCampaign, 80)].filter(Boolean).join(" / "))}
        ${emailRow("Source page", str(body.sourcePage, 200))}
        ${emailRow("Stored in Airtable", stored ? "Yes" : "No")}
      </table>
      <p style="color:#666;font-size:12px;">Reply to this email to respond to the lead.</p>
    `,
        confirmSubject: "We got your Growth Audit request. SWFT Studios",
        confirmHtml: `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Thanks for requesting a Free Growth Audit for <strong>${escapeHtml(businessName)}</strong>.</p>
      <p>We'll review your site and send personalized recommendations to this email within a few business days.</p>
      <p>If you haven't booked a call yet, you can pick a time here: <a href="https://cal.com/swftstudios/swft-meeting">cal.com/swftstudios/swft-meeting</a>.</p>
      <p>Questions in the meantime? Just reply to this message or email hello@swftstudios.com.</p>
      <p>SWFT Studios</p>
    `,
      });

      return new Response(JSON.stringify({ ok: true, stored, emailed: !!(emailed.team || emailed.visitor) }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/contact") {
      pruneRateBuckets();
      const clientIp =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "unknown";
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ ok: false, error: "Too many requests. Try again in a minute." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60", ...corsHeaders(origin) },
        });
      }

      let body: BuildRequestBody;
      try {
        const raw = await request.text();
        if (raw.length > 100_000) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          });
        }
        body = JSON.parse(raw) as BuildRequestBody;
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      if (str(body.honeypot, 200) || str(body.company_website, 200)) {
        return new Response(JSON.stringify({ ok: true, stored: false }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const contactTable = env.AIRTABLE_TABLE_CONTACT || DEFAULTS.AIRTABLE_TABLE_CONTACT;
      const name = str(body.name, 200);
      const email = str(body.email, 320);
      if (!name || !email) {
        return new Response(JSON.stringify({ ok: false, error: "Name and email are required." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid email." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const phone = str(body.phone, 40);
      const businessName = str(body.businessName, 200);
      const website = str(body.website, 500);
      const businessType = str(body.businessType || body.serviceNeeded, 200);
      const challenge = str(body.challenge, 400);
      const desiredOutcome = str(body.desiredOutcome || body.primaryGoal, 4000);
      const timeline = str(body.timeline, 200);
      const budget = str(body.budget, 200);
      const details = str(body.details, 4000);

      const detailsParts = [
        details,
        website ? `Website/Social: ${website}` : "",
        phone ? `Phone: ${phone}` : "",
        businessName ? `Business: ${businessName}` : "",
        challenge ? `Challenge: ${challenge}` : "",
        desiredOutcome ? `Desired outcome: ${desiredOutcome}` : "",
      ].filter(Boolean);

      const fields: Record<string, unknown> = {
        Name: name,
        Email: email,
        "Business Type": businessType,
        "Primary Goal": desiredOutcome || str(body.primaryGoal, 4000),
        Timeline: timeline,
        Budget: budget,
        Details: detailsParts.join("\n"),
        Status: "New",
        "Submitted At": new Date().toISOString(),
      };
      const stored = await writeToAirtable(env, contactTable, fields);

      const emailed = await sendLeadEmails(env, {
        kind: "contact",
        visitorEmail: email,
        visitorName: name,
        idempotencyBase: `contact/${email.toLowerCase()}/${Date.now()}`,
        teamSubject: `Project inquiry: ${businessName || name}`,
        teamHtml: `
      <p><strong>New project inquiry</strong></p>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        ${emailRow("Name", name)}
        ${emailRow("Email", email)}
        ${emailRow("Phone", phone)}
        ${emailRow("Business", businessName)}
        ${emailRow("Website / Social", website)}
        ${emailRow("Service needed", businessType)}
        ${emailRow("Challenge", challenge)}
        ${emailRow("Desired outcome", desiredOutcome)}
        ${emailRow("Timeline", timeline)}
        ${emailRow("Budget", budget)}
        ${emailRow("Details", details)}
        ${emailRow("Stored in Airtable", stored ? "Yes" : "No")}
      </table>
      <p style="color:#666;font-size:12px;">Reply to this email to respond to the lead.</p>
    `,
        confirmSubject: "We got your project inquiry. SWFT Studios",
        confirmHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for reaching out. We received your project inquiry and will follow up within one business day.</p>
      <p>Questions sooner? Reply to this message or email hello@swftstudios.com.</p>
      <p>SWFT Studios</p>
    `,
      });

      return new Response(JSON.stringify({ ok: true, stored, emailed: !!(emailed.team || emailed.visitor) }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/book-tier") {
      pruneRateBuckets();
      const clientIp =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "unknown";
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ ok: false, error: "Too many requests. Try again in a minute." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60", ...corsHeaders(origin) },
        });
      }

      let body: BuildRequestBody;
      try {
        const raw = await request.text();
        if (raw.length > 50_000) {
          return new Response(JSON.stringify({ ok: false, error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          });
        }
        body = JSON.parse(raw) as BuildRequestBody;
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      if (str(body.honeypot, 200) || str(body.company_website, 200)) {
        return new Response(JSON.stringify({ ok: true, stored: false, checkoutUrl: null }), {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const tier = getStripeTier(body.tierId);
      if (!tier) {
        return new Response(JSON.stringify({ ok: false, error: "Unknown pricing tier." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const name = str(body.name, 200);
      const email = str(body.email, 320);
      const businessName = str(body.businessName, 200);
      const phone = str(body.phone, 40);
      const website = str(body.website, 500);
      const notes = str(body.notes, 4000);

      if (!name || !email || !businessName) {
        return new Response(
          JSON.stringify({ ok: false, error: "Name, email, and business name are required." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          }
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid email." }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const reqOrigin = `${url.protocol}//${url.host}`;
      const amountLabel =
        tier.mode === "subscription"
          ? `${tier.priceDisplay} (subscription)`
          : `${tier.priceDisplay} (one-time start)`;

      const table = env.AIRTABLE_TABLE_CONTACT || DEFAULTS.AIRTABLE_TABLE_CONTACT;
      const fields: Record<string, unknown> = {
        Name: name,
        Email: email,
        "Business Type": tier.name,
        "Primary Goal": `Book ${tier.name} via Stripe (${amountLabel})`,
        Details: [
          `Business: ${businessName}`,
          phone ? `Phone: ${phone}` : "",
          website ? `Website/Social: ${website}` : "",
          `Tier ID: ${tier.id}`,
          `Checkout: ${amountLabel}`,
          `Published range: ${tier.priceLabel}`,
          notes ? `Notes: ${notes}` : "",
          `UTM: ${str(body.utmSource, 80)}/${str(body.utmMedium, 80)}/${str(body.utmCampaign, 80)}`,
          `Source: ${str(body.sourcePage, 300)}`,
        ]
          .filter(Boolean)
          .join("\n"),
        Status: "New",
        "Submitted At": new Date().toISOString(),
      };

      const stored = await writeToAirtable(env, table, fields);

      const cancelPath =
        tier.id === "gbp-refresh" ? "/book/gbp-content-refresh.html" : `/book/${tier.id}.html`;
      const checkoutUrl = await createTierCheckout(env, {
        tier,
        email,
        businessName,
        name,
        origin: reqOrigin,
        cancelPath,
      });

      if (!checkoutUrl && !env.STRIPE_SECRET_KEY) {
        return new Response(
          JSON.stringify({
            ok: false,
            stored,
            error:
              "Checkout is temporarily unavailable. Email hello@swftstudios.com or request a Growth Audit.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          }
        );
      }

      if (!checkoutUrl) {
        return new Response(
          JSON.stringify({
            ok: false,
            stored,
            error: "Unable to start checkout right now. Please try again or email hello@swftstudios.com.",
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          }
        );
      }

      const emailed = await sendLeadEmails(env, {
        kind: "book-tier",
        visitorEmail: email,
        visitorName: name,
        idempotencyBase: `book-tier/${tier.id}/${email.toLowerCase()}/${Date.now()}`,
        teamSubject: `Stripe book: ${tier.name}. ${businessName}`,
        teamHtml: `
      <p><strong>New tier booking (heading to Stripe)</strong></p>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        ${emailRow("Tier", tier.name)}
        ${emailRow("Checkout", amountLabel)}
        ${emailRow("Name", name)}
        ${emailRow("Email", email)}
        ${emailRow("Phone", phone)}
        ${emailRow("Business", businessName)}
        ${emailRow("Website / Social", website)}
        ${emailRow("Notes", notes)}
        ${emailRow("Stored in Airtable", stored ? "Yes" : "No")}
      </table>
      <p style="color:#666;font-size:12px;">Reply to this email to respond to the lead.</p>
    `,
        confirmSubject: `Next step: complete checkout for ${tier.name}. SWFT Studios`,
        confirmHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for choosing <strong>${escapeHtml(tier.name)}</strong>. Complete Stripe Checkout to lock in your start (${escapeHtml(tier.priceDisplay)}).</p>
      <p>If the checkout tab closed, reopen your booking page or email <a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>.</p>
      <p>SWFT Studios</p>
    `,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          stored,
          checkoutUrl,
          emailed: !!(emailed.team || emailed.visitor),
          tierId: tier.id,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        }
      );
    }

    if (request.method === "POST" && url.pathname === "/api/case-study-match") {
      pruneRateBuckets();
      const clientIp =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ||
        "unknown";
      if (!checkRateLimit(clientIp)) {
        return new Response(JSON.stringify({ error: "Too many requests. Try again in a minute." }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            ...corsHeaders(origin),
          },
        });
      }

      let body: MatchBody;
      try {
        const raw = await request.text();
        if (raw.length > 500_000) {
          return new Response(JSON.stringify({ error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
          });
        }
        body = JSON.parse(raw) as MatchBody;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      const prompt = String(body.prompt ?? "").trim().slice(0, MAX_PROMPT);
      const rawList = Array.isArray(body.caseStudies) ? body.caseStudies : [];
      const caseStudies: CaseStudyInput[] = rawList.slice(0, MAX_ITEMS).map((c) => ({
        title: String(c.title ?? "").slice(0, 512),
        content: String(c.content ?? "").slice(0, MAX_CONTENT),
        link: String(c.link ?? "").slice(0, 2048),
      }));

      if (!prompt) {
        return new Response(JSON.stringify({ error: "prompt required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
        });
      }

      let ai = await tryAiMatch(env, prompt, caseStudies);
      if (!ai) {
        const pick = pickDeterministic(prompt, caseStudies);
        if (!pick) {
          return new Response(
            JSON.stringify({
              explanation: "<p>No case studies were provided.</p>",
              matchedCaseStudy: "",
              matchedLink: "",
            }),
            { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
          );
        }
        ai = {
          explanation: `<p>Here is the closest match to your question: <strong>${pick.title}</strong>.</p><p>Open the article for the full breakdown.</p>`,
          matchedCaseStudy: pick.title.toLowerCase(),
          matchedLink: pick.link,
        };
      }

      return new Response(
        JSON.stringify({
          explanation: ai.explanation,
          matchedCaseStudy: ai.matchedCaseStudy,
          matchedLink: ai.matchedLink,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    return env.ASSETS.fetch(request);
  },
};
