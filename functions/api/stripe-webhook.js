/**
 * POST /api/stripe-webhook
 * Verifies Stripe signature, provisions portal user/project, sends set-password invite.
 *
 * Env: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY (optional), DB, RESEND_API_KEY
 */
import {
  createInviteToken,
  requireDb,
  updateSubscriptionStatus,
  upsertPaidUser,
} from "../_lib/portal-db.js";
import { sendInviteEmail } from "../_lib/portal-invite.js";
import { getStripeTier, tierIdFromPriceId } from "../_lib/stripe-tiers.js";
import { handleStripeEvent, verifyStripeWebhook } from "../_lib/stripe-webhook.js";

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
