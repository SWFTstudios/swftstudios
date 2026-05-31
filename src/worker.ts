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
}

/* Defaults for the resources provisioned for SWFT Studios. Override via env vars. */
const DEFAULTS = {
  STRIPE_PRICE_MONTHLY: "price_1Td9xhAF4d9gCyuNnjPgqkho", // $299/mo SWFT Monthly Website Plan
  STRIPE_PRICE_MAINTENANCE: "price_1Td9xiAF4d9gCyuN6rUc25R0", // $99/mo SWFT Website Maintenance
  AIRTABLE_BASE_ID: "appjwRgcgS0BD4lT7",
  AIRTABLE_TABLE: "tbl30H9M2CC7p6MqY",
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

/** Write the lead to Airtable. Returns true on success. */
async function writeToAirtable(env: Env, fields: Record<string, unknown>): Promise<boolean> {
  const token = env.AIRTABLE_TOKEN;
  if (!token) return false;
  const baseId = env.AIRTABLE_BASE_ID || DEFAULTS.AIRTABLE_BASE_ID;
  const table = env.AIRTABLE_TABLE || DEFAULTS.AIRTABLE_TABLE;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS" && (url.pathname === "/api/case-study-match" || url.pathname === "/api/build-request")) {
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
      const stored = await writeToAirtable(env, airtableFields);

      // 2) Start Stripe Checkout (best-effort).
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
