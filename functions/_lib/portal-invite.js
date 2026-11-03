/**
 * Client portal invite links: build, email, and re-send (rate-limited).
 *
 * An account without a password (created by the Stripe webhook, or seeded by
 * staff) can only be claimed with a one-time invite token sent to its email.
 */
import { createInviteToken } from "./portal-db.js";
import { escapeHtml, sendResendEmail } from "./resend.js";

/** Minimum gap between invite emails to the same account (self-service re-sends). */
export const INVITE_RESEND_MINUTES = 10;

export function inviteUrlFor(env, token, email) {
  const origin = env?.PORTAL_ORIGIN || "https://www.swftstudios.com";
  return `${origin}/portal/onboard.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

/** Email the set-password link. Returns true when Resend accepted it. Never throws. */
export async function sendInviteEmail(env, { email, name = "", tierName = "", inviteUrl }) {
  if (!env?.RESEND_API_KEY) return false;
  const greet = name ? escapeHtml(String(name).split(" ")[0]) : "there";
  const intro = tierName
    ? `<p>Thanks for booking <strong>${escapeHtml(tierName)}</strong> with SWFT Studios.</p>`
    : `<p>Here is your link to the SWFT Studios client portal.</p>`;
  const html = `
    <p>Hi ${greet},</p>
    ${intro}
    <p>Create your client portal password to track your project and site performance:</p>
    <p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>
    <p>This link works once and expires in 7 days. If it expires, visit <a href="https://www.swftstudios.com/portal/onboard.html">portal onboarding</a> with the same email and we will send a new one.</p>
    <p>If you did not ask for this, you can ignore this email.</p>
    <p>SWFT Studios</p>
  `;
  return sendResendEmail(env, {
    to: email,
    subject: "Set up your SWFT client portal",
    html,
    idempotencyKey: `portal-invite/${email}/${Date.now()}`,
  });
}

/** Was an invite issued to this user within the last `minutes`? */
async function recentlyInvited(db, userId, minutes) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM invite_tokens
       WHERE user_id = ? AND datetime(created_at) > datetime('now', ?)`
    )
    .bind(userId, `-${Number(minutes)} minutes`)
    .first();
  return Number(row?.n || 0) > 0;
}

/**
 * Self-service re-send for an account that has no password yet. At most one
 * email per INVITE_RESEND_MINUTES per account; the caller always answers with
 * the same neutral message, whether or not an email went out.
 * Returns { sent, reason? }.
 */
export async function resendInviteIfAllowed(db, env, user) {
  if (!user || user.password_hash) return { sent: false, reason: "has_password" };
  if (!env?.RESEND_API_KEY) return { sent: false, reason: "email_not_configured" };
  if (await recentlyInvited(db, user.id, INVITE_RESEND_MINUTES)) return { sent: false, reason: "rate_limited" };
  // Drop this user's expired tokens so the table doesn't grow forever.
  await db
    .prepare("DELETE FROM invite_tokens WHERE user_id = ? AND expires_at < ?")
    .bind(user.id, new Date().toISOString())
    .run();
  const token = await createInviteToken(db, user.id);
  const sent = await sendInviteEmail(env, { email: user.email, inviteUrl: inviteUrlFor(env, token, user.email) });
  return { sent };
}

/**
 * Staff action: issue a fresh invite for an account without a password, email
 * it when Resend is configured, and return the link (no rate limit).
 */
export async function issueInvite(db, env, user) {
  if (!user) return { error: "not_found" };
  if (user.password_hash) return { error: "has_password" };
  const token = await createInviteToken(db, user.id);
  const inviteUrl = inviteUrlFor(env, token, user.email);
  const emailed = await sendInviteEmail(env, { email: user.email, inviteUrl });
  return { inviteUrl, emailed };
}
