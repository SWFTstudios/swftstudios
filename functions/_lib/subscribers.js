/**
 * Email updates list: double opt-in subscribe, confirm, unsubscribe.
 * Storage: D1 `subscribers` (migrations/0003_subscribers.sql).
 * Env: DB, SESSION_SECRET (signs unsubscribe links), RESEND_API_KEY,
 *      optional PORTAL_ORIGIN (link host), RESEND_FROM.
 *
 * Privacy: responses never reveal whether an address is already on the
 * list. Confirm tokens are random, stored as SHA-256, valid 7 days.
 */
import { randomId, sha256Hex } from "./portal-auth.js";
import { escapeHtml, sendResendEmail } from "./resend.js";

export const INTERESTS = {
  videos: "New films & videos",
  blog: "Blog posts & guides",
  products: "New products & offers",
};
const CONFIRM_DAYS = 7;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000; // one confirm email per address per 5 minutes

export function cleanInterests(list) {
  const arr = Array.isArray(list) ? list : String(list || "").split(",");
  const out = [...new Set(arr.map((s) => String(s).trim()).filter((s) => INTERESTS[s]))];
  return out.join(",");
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${value}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function unsubscribeSig(env, id) {
  return hmacHex(env.SESSION_SECRET, id);
}

export function siteOrigin(env, request) {
  const fromEnv = String(env.PORTAL_ORIGIN || "").replace(/\/+$/, "");
  if (/^https:\/\//.test(fromEnv)) return fromEnv;
  return new URL(request.url).origin;
}

/**
 * Add or refresh a subscription and email a confirm link.
 * Returns { sent } — always resolves the same shape whatever the row's state.
 */
export async function subscribe(db, env, request, { email, name, interests, sourcePage }) {
  const now = Date.now();
  const token = randomId(24);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(now + CONFIRM_DAYS * 864e5).toISOString();
  const sentAt = new Date(now).toISOString();

  const row = await db.prepare("SELECT * FROM subscribers WHERE email = ?").bind(email).first();
  if (row && row.confirm_sent_at && now - Date.parse(row.confirm_sent_at) < RESEND_COOLDOWN_MS) {
    return { sent: false, throttled: true };
  }

  let id;
  if (!row) {
    id = randomId(12);
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, name, interests, pending_interests, status, confirm_token_hash, confirm_expires_at, confirm_sent_at, source_page)
         VALUES (?, ?, ?, '', ?, 'pending', ?, ?, ?, ?)`
      )
      .bind(id, email, name || null, interests, tokenHash, expires, sentAt, sourcePage || null)
      .run();
  } else {
    id = row.id;
    // Active stays active until the new link is used; unsubscribed goes back to pending.
    const status = row.status === "active" ? "active" : "pending";
    await db
      .prepare(
        `UPDATE subscribers SET name = COALESCE(?, name), pending_interests = ?, status = ?,
           confirm_token_hash = ?, confirm_expires_at = ?, confirm_sent_at = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(name || null, interests, status, tokenHash, expires, sentAt, id)
      .run();
  }

  const origin = siteOrigin(env, request);
  const confirmUrl = `${origin}/account.html?confirm=${token}`;
  const list = interests.split(",").map((k) => INTERESTS[k]).filter(Boolean);
  const hello = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const sent = await sendResendEmail(env, {
    to: email,
    subject: "Confirm your SWFT Studios updates",
    idempotencyKey: `subscribe-${id}-${tokenHash.slice(0, 16)}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:520px">
<p>${hello}</p>
<p>Tap the button to confirm you want emails from SWFT Studios about:</p>
<ul>${list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
<p><a href="${confirmUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Confirm my email</a></p>
<p style="color:#666;font-size:14px">The link works for ${CONFIRM_DAYS} days. If you didn't ask for this, ignore this email and you won't hear from us.</p>
</div>`,
    text: `${name ? `Hi ${name},` : "Hi,"}\n\nConfirm you want emails from SWFT Studios about: ${list.join(", ")}.\n\n${confirmUrl}\n\nThe link works for ${CONFIRM_DAYS} days. If you didn't ask for this, ignore this email.`,
  });
  return { sent };
}

/** Use a confirm token. Returns { ok, reason? }. */
export async function confirm(db, token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return { ok: false, reason: "invalid" };
  const hash = await sha256Hex(token);
  const row = await db.prepare("SELECT * FROM subscribers WHERE confirm_token_hash = ?").bind(hash).first();
  if (!row) return { ok: false, reason: "invalid" };
  if (Date.parse(row.confirm_expires_at) < Date.now()) return { ok: false, reason: "expired" };
  await db
    .prepare(
      `UPDATE subscribers SET status = 'active', interests = COALESCE(pending_interests, interests), pending_interests = NULL,
         confirm_token_hash = NULL, confirm_expires_at = NULL, confirmed_at = datetime('now'), unsubscribed_at = NULL,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(row.id)
    .run();
  return { ok: true };
}

/** Unsubscribe with a signed link. Returns { ok }. */
export async function unsubscribe(db, env, id, sig) {
  if (!env.SESSION_SECRET || !/^[a-f0-9]{24}$/.test(String(id || ""))) return { ok: false };
  const expected = await unsubscribeSig(env, id);
  if (!safeEqual(expected, String(sig || ""))) return { ok: false };
  await db
    .prepare(
      `UPDATE subscribers SET status = 'unsubscribed', confirm_token_hash = NULL, confirm_expires_at = NULL,
         unsubscribed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(id)
    .run();
  return { ok: true }; // same answer for an unknown id: nothing to leak
}

/** Unsubscribe URL to put in every email sent to a subscriber (and List-Unsubscribe). */
export async function unsubscribeUrl(env, origin, id) {
  return `${origin}/account.html?unsubscribe=${id}&sig=${await unsubscribeSig(env, id)}`;
}
