/**
 * Portal email.
 *
 * - To SWFT (new uploads, requests, notes): Cloudflare Email Service REST API,
 *   sending to a verified Email Routing destination address (free on every
 *   plan). Pages Functions can't use the Worker `send_email` binding, so the
 *   REST endpoint is used instead. Needs CF_ACCOUNT_ID + CF_EMAIL_API_TOKEN
 *   (token with "Email Sending: Edit"); falls back to Resend when missing.
 * - To clients (invites, password resets, stage changes): Resend, which can
 *   reach any address.
 *
 * Env: CF_ACCOUNT_ID, CF_EMAIL_API_TOKEN, PORTAL_NOTIFY_EMAIL (default
 * hello@swftstudios.com), PORTAL_FROM_EMAIL (default hello@swftstudios.com),
 * RESEND_API_KEY, PORTAL_ORIGIN.
 * Never throws: email failures are logged and the request still succeeds.
 */
import { escapeHtml, sendResendEmail } from "./resend.js";

const DEFAULT_NOTIFY = "hello@swftstudios.com";
const DEFAULT_FROM = "hello@swftstudios.com";

export function portalOrigin(env) {
  return (env.PORTAL_ORIGIN || "https://www.swftstudios.com").replace(/\/$/, "");
}

export function adminNotifyAddress(env) {
  return env.PORTAL_NOTIFY_EMAIL || DEFAULT_NOTIFY;
}

/** Shared layout: plain, dark-on-light so it reads in every mail client. */
export function emailLayout({ heading, bodyHtml, ctaUrl, ctaLabel }) {
  const cta = ctaUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(ctaUrl)}" style="background:#050505;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(ctaLabel || "Open the portal")}</a></p>`
    : "";
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.55">
  <p style="font-weight:700;font-size:18px;margin:0 0 24px">SWFT Studios</p>
  <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(heading)}</h1>
  ${bodyHtml}
  ${cta}
  <p style="color:#777;font-size:13px;margin-top:32px">SWFT Studios &middot; Jersey City &middot; <a href="https://www.swftstudios.com" style="color:#777">swftstudios.com</a></p>
</div>`;
}

async function sendViaCloudflare(env, { to, subject, html, text }) {
  if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_API_TOKEN) return false;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_EMAIL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          from: { email: env.PORTAL_FROM_EMAIL || DEFAULT_FROM, name: "SWFT Portal" },
          subject,
          html,
          text,
        }),
      }
    );
    if (!res.ok) {
      console.error("Cloudflare email failed", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Cloudflare email error", err);
    return false;
  }
}

/** Email SWFT about client activity. */
export async function notifyAdmin(env, { subject, heading, bodyHtml, text, projectId }) {
  const ctaUrl = projectId ? `${portalOrigin(env)}/portal/admin.html#project=${projectId}` : `${portalOrigin(env)}/portal/admin.html`;
  const html = emailLayout({ heading, bodyHtml, ctaUrl, ctaLabel: "Open in admin" });
  const to = adminNotifyAddress(env);
  if (await sendViaCloudflare(env, { to, subject, html, text })) return "cloudflare";
  if (await sendResendEmail(env, { to, subject, html, text })) return "resend";
  return null;
}

/** Email a client (invites, resets, updates). */
export async function emailClient(env, { to, subject, heading, bodyHtml, ctaUrl, ctaLabel, idempotencyKey }) {
  const html = emailLayout({ heading, bodyHtml, ctaUrl, ctaLabel });
  return sendResendEmail(env, { to, subject, html, idempotencyKey });
}

export { escapeHtml };
