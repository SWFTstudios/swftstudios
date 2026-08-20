/**
 * POST /api/stripe-webhook
 * Verifies Stripe signature, provisions portal user/project, sends set-password invite.
 *
 * Env: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY (optional), DB, RESEND_API_KEY
 */
import { escapeHtml, sendResendEmail } from "../_lib/resend.js";
import {
  createInviteToken,
  requireDb,
  updateSubscriptionStatus,
  upsertPaidUser,
} from "../_lib/portal-db.js";
import { getStripeTier, tierIdFromPriceId } from "../_lib/stripe-tiers.js";
import { handleStripeEvent, verifyStripeWebhook } from "../_lib/stripe-webhook.js";

async function sendInviteEmail(env, { email, name, tierName, inviteUrl }) {
  if (!env.RESEND_API_KEY) return false;
  const greet = name ? escapeHtml(name.split(" ")[0]) : "there";
  const html = `
    <p>Hi ${greet},</p>
    <p>Thanks for booking <strong>${escapeHtml(tierName)}</strong> with SWFT Studios.</p>
    <p>Create your client portal password to track your project and site performance:</p>
    <p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>
    <p>This link expires in 7 days. If it expires, visit <a href="https://www.swftstudios.com/portal/onboard.html">portal onboarding</a> with the same email.</p>
    <p>SWFT Studios</p>
  `;
  return sendResendEmail(env, {
    to: email,
    subject: "Set up your SWFT client portal",
    html,
    idempotencyKey: `portal-invite/${email}/${Date.now()}`,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) {
    return new Response("Portal DB not configured", { status: 503 });
  }

  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  const verified = await verifyStripeWebhook(rawBody, signature, secret);
  if (!verified.ok) {
    console.error("Stripe webhook verify failed", verified.error);
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    await handleStripeEvent(env, event, {
      upsertPaidUser,
      createInviteToken,
      updateSubscriptionStatus,
      getStripeTier: getStripeTier,
      tierIdFromPriceId: (priceId) => tierIdFromPriceId(env, priceId),
      sendInviteEmail,
    });
  } catch (err) {
    console.error("Stripe webhook handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
