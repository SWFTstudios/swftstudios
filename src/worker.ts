/**
 * SWFT static site worker: serves assets + POST /api/case-study-match
 * (replaces third-party template Worker; deterministic match with optional Workers AI)
 */
export interface Env {
  ASSETS: Fetcher;
  AI?: { run(model: string, opts: { messages: { role: string; content: string }[] }): Promise<unknown> };
  /* Secrets — set with `wrangler secret put` (or in the Cloudflare dashboard) */
  STRIPE_SECRET_KEY?: string;
  AIRTABLE_TOKEN?: string;
  /* Non-secret config — safe defaults baked in; override via vars if needed */
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_MAINTENANCE?: string;
  AIRTABLE_BASE_ID?: string;
  AIRTABLE_TABLE?: string;
  AIRTABLE_TABLE_CONTACT?: string;
  /** Airtable table id for Growth Audit leads — set via Worker vars */
  AIRTABLE_TABLE_GROWTH_AUDIT?: string;
  FORMSUBMIT_EMAIL?: string;
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

/* Where lead notifications are emailed. Override with the FORMSUBMIT_EMAIL var. */
const NOTIFY_EMAIL_DEFAULT = "hello@swftstudios.com";

type NotifyEmailData = {
  subject: string;
  name: string;
  email: string;
  fields: Record<string, unknown>;
  /** When set, FormSubmit sends this message to the visitor's email address. */
  autoresponse?: string;
};

/**
 * Send the team a notification email (and optional visitor autoresponse)
 * via FormSubmit's AJAX endpoint. Best-effort — never blocks the API response.
 * Note: FormSubmit requires a one-time activation of each recipient address.
 */
async function notifyTeamByEmail(env: Env, data: NotifyEmailData): Promise<boolean> {
  const to = env.FORMSUBMIT_EMAIL || NOTIFY_EMAIL_DEFAULT;
  const payload: Record<string, unknown> = {
    _subject: data.subject,
    _template: "table",
    _captcha: "false",
    name: data.name,
    email: data.email,
    ...data.fields,
  };
  if (data.autoresponse) payload._autoresponse = data.autoresponse;
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
        url.pathname === "/api/growth-audit")
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
        notifyTeamByEmail(env, {
          subject: "New SWFT Build Plan — Instagram → Online Business",
          email,
          name: str(body.name, 200),
          autoresponse:
            "Thanks for your website request — we've got it! Our team will review your " +
            "build plan and reach out within 48 hours with your next steps to get your site " +
            "live in 7 days or less. If it's urgent, email us anytime at hello@swftstudios.com. — SWFT Studios",
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
      const email = str(body.email, 320);
      const businessName = str(body.businessName, 200);
      const website = str(body.website, 500);
      const businessCategory = str(body.businessCategory, 200);
      const challenge = str(body.challenge, 400);
      const desiredOutcome = str(body.desiredOutcome, 4000);

      if (!firstName || !email || !businessName || !website || !businessCategory || !challenge || !desiredOutcome) {
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

      const auditTable = env.AIRTABLE_TABLE_GROWTH_AUDIT || DEFAULTS.AIRTABLE_TABLE_GROWTH_AUDIT;
      const fields: Record<string, unknown> = {
        "First Name": firstName,
        Email: email,
        Phone: str(body.phone, 40),
        "Business Name": businessName,
        "Website or Social": website,
        "Business Category": businessCategory,
        "Biggest Challenge": challenge,
        "Desired Outcome": desiredOutcome,
        Instagram: str(body.instagram, 300),
        "Monthly Budget": str(body.budget, 80),
        Timeline: str(body.timeline, 200),
        "Additional Context": str(body.details, 4000),
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
          Name: firstName,
          Email: email,
          "Business Type": businessCategory,
          "Primary Goal": `Growth Audit — ${challenge}`,
          Timeline: str(body.timeline, 200),
          Budget: str(body.budget, 80),
          Details: [
            `Business: ${businessName}`,
            `Website: ${website}`,
            `Outcome: ${desiredOutcome}`,
            `Phone: ${str(body.phone, 40)}`,
            `Instagram: ${str(body.instagram, 300)}`,
            `Context: ${str(body.details, 2000)}`,
            `UTM: ${str(body.utmSource, 80)}/${str(body.utmMedium, 80)}/${str(body.utmCampaign, 80)}`,
            `Source: ${str(body.sourcePage, 200)}`,
          ].join("\n"),
          Status: "New",
          "Submitted At": new Date().toISOString(),
        });
      }

      ctx.waitUntil(
        notifyTeamByEmail(env, {
          subject: "New SWFT Growth Audit Request",
          name: firstName,
          email,
          fields: {
            "Business Name": businessName,
            "Website or Social": website,
            "Business Category": businessCategory,
            "Biggest Challenge": challenge,
            "Desired Outcome": desiredOutcome,
            Phone: str(body.phone, 40),
            Instagram: str(body.instagram, 300),
            "Monthly Budget": str(body.budget, 80),
            Timeline: str(body.timeline, 200),
            "Additional Context": str(body.details, 4000),
            "UTM Source": str(body.utmSource, 120),
            "UTM Medium": str(body.utmMedium, 120),
            "UTM Campaign": str(body.utmCampaign, 120),
            "Source Page": str(body.sourcePage, 300),
          },
        })
      );

      return new Response(JSON.stringify({ ok: true, stored }), {
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

      const detailsParts = [
        str(body.details, 4000),
        str(body.website, 500) ? `Website/Social: ${str(body.website, 500)}` : "",
        str(body.phone, 40) ? `Phone: ${str(body.phone, 40)}` : "",
        str(body.businessName, 200) ? `Business: ${str(body.businessName, 200)}` : "",
        str(body.challenge, 400) ? `Challenge: ${str(body.challenge, 400)}` : "",
        str(body.desiredOutcome, 2000) ? `Desired outcome: ${str(body.desiredOutcome, 2000)}` : "",
      ].filter(Boolean);

      const fields: Record<string, unknown> = {
        Name: name,
        Email: email,
        "Business Type": str(body.businessType || body.serviceNeeded, 200),
        "Primary Goal": str(body.primaryGoal || body.desiredOutcome || body.challenge, 4000),
        Timeline: str(body.timeline, 200),
        Budget: str(body.budget, 200),
        Details: detailsParts.join("\n"),
        Status: "New",
        "Submitted At": new Date().toISOString(),
      };
      const stored = await writeToAirtable(env, contactTable, fields);
      ctx.waitUntil(
        notifyTeamByEmail(env, {
          subject: "New SWFT Contact Inquiry",
          name,
          email,
          fields: {
            "Business Type": str(body.businessType || body.serviceNeeded, 200),
            "Primary Goal": str(body.primaryGoal || body.desiredOutcome || body.challenge, 4000),
            Timeline: str(body.timeline, 200),
            Budget: str(body.budget, 200),
            Details: detailsParts.join("\n"),
            "Source Page": str(body.sourcePage, 300) || "contact",
          },
        })
      );
      return new Response(JSON.stringify({ ok: true, stored }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
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
