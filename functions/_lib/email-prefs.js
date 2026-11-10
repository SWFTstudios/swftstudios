/**
 * Email preferences + opt-out for every email SWFT sends to a person (not the team inbox).
 *
 * Every person-facing email goes through sendPersonEmail(), which:
 *   1. finds or creates the recipient's email_prefs row (migration 0009),
 *   2. skips the send if they turned that category off (or opted out of everything),
 *   3. adds a footer with "Email preferences" and "Unsubscribe" links, and
 *   4. adds List-Unsubscribe + List-Unsubscribe-Post headers (RFC 8058 one-click).
 *
 * `essential: true` is only for an email the person asked for this minute (a confirm
 * link, a password reset). It still carries the footer but ignores opt-outs.
 * Marketing lists keep their own double opt-in (subscribers table); the preferences
 * page shows and can turn off that list too.
 */
import { randomId } from "./portal-auth.js";
import { escapeHtml, sendResendEmail } from "./resend.js";

export const CATEGORIES = {
  project: { label: "Project updates", hint: "When SWFT posts an update on your project." },
  account: { label: "Account and payments", hint: "Portal setup links and payment confirmations." },
  replies: { label: "Replies to your requests", hint: "Confirmations when you contact us or book, and Growth Guide results." },
};

export function origin(env) {
  const o = String(env?.PORTAL_ORIGIN || "").replace(/\/+$/, "");
  return /^https:\/\//.test(o) ? o : "https://www.swftstudios.com";
}

export async function prefsReady(db) {
  try { await db.prepare("SELECT 1 FROM email_prefs LIMIT 1").first(); return true; } catch { return false; }
}

export async function getOrCreatePrefs(db, email) {
  const addr = String(email || "").trim().toLowerCase();
  if (!addr) return null;
  let row = await db.prepare("SELECT * FROM email_prefs WHERE email = ?").bind(addr).first();
  if (row) return row;
  await db.prepare("INSERT OR IGNORE INTO email_prefs (email, token) VALUES (?, ?)").bind(addr, randomId(16)).run();
  return db.prepare("SELECT * FROM email_prefs WHERE email = ?").bind(addr).first();
}

export async function prefsByToken(db, token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ""))) return null;
  return db.prepare("SELECT * FROM email_prefs WHERE token = ?").bind(token).first();
}

const offList = (row) => String(row?.off || "").split(",").filter((c) => CATEGORIES[c]);

export function isAllowed(row, category) {
  if (!row) return true;
  if (row.all_off) return false;
  return !offList(row).includes(category);
}

/** Turn categories on/off. `changes` = { project: true, account: false, ... }, allOff optional. */
export async function savePrefs(db, row, { changes = {}, allOff } = {}) {
  const off = new Set(offList(row));
  for (const [c, on] of Object.entries(changes)) {
    if (!CATEGORIES[c]) continue;
    if (on) off.delete(c); else off.add(c);
  }
  let all = allOff == null ? row.all_off : allOff ? 1 : 0;
  // Turning any category back on means they want email again.
  if (Object.values(changes).some(Boolean)) all = 0;
  await db.prepare("UPDATE email_prefs SET off = ?, all_off = ?, updated_at = datetime('now') WHERE email = ?")
    .bind([...off].join(","), all, row.email).run();
  return db.prepare("SELECT * FROM email_prefs WHERE email = ?").bind(row.email).first();
}

export function prefsView(row) {
  return {
    allOff: !!row.all_off,
    categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, hint: c.hint, on: isAllowed({ ...row, all_off: 0 }, key) })),
  };
}

export function prefsUrl(env, token) {
  return `${origin(env)}/email-preferences.html?t=${token}`;
}

export function oneClickUrl(env, token, category) {
  return `${origin(env)}/api/email-prefs/unsubscribe?t=${token}&c=${category || "all"}`;
}

export function footerHtml(env, token, category) {
  const label = CATEGORIES[category]?.label?.toLowerCase() || "these emails";
  return `<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 12px">
<p style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#777;margin:0">
You're getting this because of your SWFT Studios ${escapeHtml(label)}.
<a href="${prefsUrl(env, token)}" style="color:#555">Email preferences</a> ·
<a href="${prefsUrl(env, token)}&off=${encodeURIComponent(category || "all")}" style="color:#555">Unsubscribe</a><br>
SWFT Studios · hello@swftstudios.com</p>`;
}

export function footerText(env, token) {
  return `\n\n--\nEmail preferences or unsubscribe: ${prefsUrl(env, token)}\nSWFT Studios · hello@swftstudios.com`;
}

/**
 * Send one email to a person with their preferences applied.
 * Returns { sent: boolean, status: "sent" | "opted_out" | "failed" | "unavailable" }. Never throws.
 */
export async function sendPersonEmail(env, { to, category, subject, html, text, replyTo, idempotencyKey, essential = false }) {
  const db = env?.DB;
  let row = null;
  try {
    if (db && (await prefsReady(db))) row = await getOrCreatePrefs(db, to);
  } catch (err) {
    console.error("email prefs lookup failed", err);
  }
  if (row && !essential && !isAllowed(row, category)) return { sent: false, status: "opted_out" };
  if (!env?.RESEND_API_KEY) return { sent: false, status: "unavailable" };
  const extra = row
    ? {
        html: html + footerHtml(env, row.token, category),
        text: text ? text + footerText(env, row.token) : undefined,
        headers: { "List-Unsubscribe": `<${oneClickUrl(env, row.token, category)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }
    : { html, text };
  const sent = await sendResendEmail(env, { to, subject, replyTo, idempotencyKey, ...extra });
  return { sent, status: sent ? "sent" : "failed" };
}
