/**
 * One-time "set your password" links for client portal accounts.
 * Used when the owner clicks "Send login link" in admin, and when someone tries to
 * set a password on an existing account without a link (the email goes to the
 * account's own address, so only its owner can finish).
 */
import { createInviteToken } from "./portal-db.js";
import { escapeHtml } from "./resend.js";
import { origin as siteOrigin, sendPersonEmail } from "./email-prefs.js";

/** Asked-for links are capped at one per this many minutes per account (owner sends are not). */
export const LINK_COOLDOWN_MINUTES = 5;

export function loginLinkUrl(env, token, email) {
  return `${siteOrigin(env)}/portal/onboard.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

/** Was a link created for this account within the cooldown? */
export async function recentlySent(db, userId) {
  const row = await db
    .prepare("SELECT 1 FROM invite_tokens WHERE user_id = ? AND created_at > datetime('now', ?) LIMIT 1")
    .bind(userId, `-${LINK_COOLDOWN_MINUTES} minutes`)
    .first();
  return !!row;
}

/**
 * Replace any earlier links for this account with a new one and email it.
 * Returns { url, sent }. `sent` is false when Resend isn't configured or failed.
 */
export async function sendLoginLink(env, db, user, { hasPassword = !!user.password_hash } = {}) {
  await db.prepare("DELETE FROM invite_tokens WHERE user_id = ?").bind(user.id).run();
  const token = await createInviteToken(db, user.id);
  const url = loginLinkUrl(env, token, user.email);
  const what = hasPassword ? "choose a new password" : "set your password";
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:520px">
<p>Hi,</p>
<p>Here's your link to ${what} for the SWFT Studios client portal, where you can follow your project, see the schedule, share files and read updates.</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${hasPassword ? "Choose a new password" : "Set my password"}</a></p>
<p style="color:#666;font-size:14px">The link works once and expires in 7 days. If you didn't expect this, you can ignore it.</p>
</div>`;
  const text = `Here's your link to ${what} for the SWFT Studios client portal:\n\n${url}\n\nThe link works once and expires in 7 days. If you didn't expect this, you can ignore it.`;
  const r = await sendPersonEmail(env, {
    to: user.email,
    category: "account",
    essential: true, // account access: sent even if marketing-style email is turned off
    subject: hasPassword ? "Your SWFT portal login link" : "Set up your SWFT client portal",
    html,
    text,
    idempotencyKey: `login-link/${user.id}/${token.slice(0, 16)}`,
  });
  return { url, sent: r.sent };
}
