/**
 * Cloudflare Pages Function. GET /api/form-health
 * Read-only diagnostics for form delivery. Never returns secret values and never sends email.
 *
 *   /api/form-health          which settings this deployment can see (booleans only)
 *   /api/form-health?live=1   also checks the Airtable token (reads 1 row) and the
 *                             Resend key/domain (GET /domains) with sanitized codes.
 */
import { DEFAULT_TABLES } from "../_lib/airtable-crm.js";

const LIVE_COOLDOWN_MS = 15_000;
let lastLiveCheck = 0;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

async function probe(url, headers) {
  try {
    const res = await fetch(url, { headers });
    const raw = await res.text().catch(() => "");
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    return { res, data };
  } catch (err) {
    return { res: null, data: null, error: String(err?.message || err).slice(0, 120) };
  }
}

async function checkAirtable(env) {
  if (!env.AIRTABLE_TOKEN) return { ok: false, code: "missing_token" };
  const base = env.AIRTABLE_BASE_ID || DEFAULT_TABLES.AIRTABLE_BASE_ID;
  const table = env.AIRTABLE_TABLE_BOOKINGS || DEFAULT_TABLES.AIRTABLE_TABLE_BOOKINGS;
  const { res, data, error } = await probe(
    `https://api.airtable.com/v0/${base}/${table}?maxRecords=1&fields%5B%5D=Status`,
    { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
  );
  if (!res) return { ok: false, code: "network_error", message: error };
  if (res.ok) return { ok: true, status: res.status, code: "token_can_read_bookings" };
  const err = data?.error;
  return { ok: false, status: res.status, code: (typeof err === "string" ? err : err?.type) || `http_${res.status}` };
}

async function checkResend(env) {
  if (!env.RESEND_API_KEY) return { ok: false, code: "missing_api_key" };
  const { res, data, error } = await probe("https://api.resend.com/domains", {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
  });
  if (!res) return { ok: false, code: "network_error", message: error };
  if (res.ok) {
    const domains = Array.isArray(data?.data) ? data.data : [];
    const d = domains.find((x) => x?.name === "swftstudios.com");
    return {
      ok: !!d && d.status === "verified",
      status: res.status,
      code: d ? `domain_${d.status}` : "domain_swftstudios.com_not_found",
      domains: domains.map((x) => ({ name: x?.name, status: x?.status })),
    };
  }
  const name = data?.name || `http_${res.status}`;
  // A send-only key cannot list domains but is valid for sending.
  if (name === "restricted_api_key") {
    return { ok: true, status: res.status, code: "valid_send_only_key_domain_unchecked" };
  }
  return { ok: false, status: res.status, code: name };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const report = {
    host: url.host,
    runtime: env.ASSETS && !env.CF_PAGES ? "worker" : "pages",
    deployment: {
      branch: env.CF_PAGES_BRANCH || null,
      commit: env.CF_PAGES_COMMIT_SHA ? String(env.CF_PAGES_COMMIT_SHA).slice(0, 7) : null,
    },
    config: {
      RESEND_API_KEY: !!env.RESEND_API_KEY,
      AIRTABLE_TOKEN: !!env.AIRTABLE_TOKEN,
      RESEND_FROM: env.RESEND_FROM ? "custom" : "default (SWFT Studios <hello@swftstudios.com>)",
      NOTIFY_EMAIL: env.NOTIFY_EMAIL ? "custom" : "default (elombe@swftstudios.com)",
      AIRTABLE_BASE_ID: env.AIRTABLE_BASE_ID ? "custom" : "default",
    },
  };

  if (url.searchParams.get("live") === "1") {
    const now = Date.now();
    if (now - lastLiveCheck < LIVE_COOLDOWN_MS) {
      return json({ ...report, live: "rate_limited_try_again_in_15s" }, 429);
    }
    lastLiveCheck = now;
    const [airtable, resend] = await Promise.all([checkAirtable(env), checkResend(env)]);
    report.live = { airtable, resend };
  }
  return json(report);
}
