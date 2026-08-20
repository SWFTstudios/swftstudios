/**
 * Stripe webhook signature verification (no Stripe SDK).
 * https://docs.stripe.com/webhooks/signatures
 */

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function verifyStripeWebhook(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || !rawBody) return { ok: false, error: "missing" };

  const parts = {};
  for (const item of signatureHeader.split(",")) {
    const [k, v] = item.split("=");
    if (k && v) {
      if (!parts[k]) parts[k] = [];
      parts[k].push(v);
    }
  }
  const timestamp = parts.t?.[0];
  const v1s = parts.v1 || [];
  if (!timestamp || !v1s.length) return { ok: false, error: "malformed" };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(Number(timestamp)) || age > 300) {
    return { ok: false, error: "timestamp" };
  }

  const signed = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = bytesToHex(sig);

  const match = v1s.some((v) => timingSafeEqual(v, expected));
  if (!match) return { ok: false, error: "signature" };
  return { ok: true };
}

/**
 * Handle checkout.session.completed and subscription lifecycle events.
 */
export async function handleStripeEvent(env, event, deps) {
  const {
    upsertPaidUser,
    createInviteToken,
    updateSubscriptionStatus,
    getStripeTier,
    tierIdFromPriceId,
    sendInviteEmail,
  } = deps;

  const type = event.type;
  const obj = event.data?.object;
  if (!obj) return { handled: false };

  if (type === "checkout.session.completed") {
    const email = (obj.customer_details?.email || obj.customer_email || "").trim().toLowerCase();
    if (!email) {
      console.error("checkout.session.completed missing email", obj.id);
      return { handled: false, error: "no_email" };
    }

    let tierId = obj.metadata?.tierId || null;
    if (!tierId && obj.client_reference_id) {
      tierId = String(obj.client_reference_id).split(":")[0] || null;
    }

    // Payment Links may only have metadata on the link; try line items via price map later if needed
    if (!tierId) {
      console.warn("checkout without tierId metadata", obj.id);
      tierId = "unknown";
    }

    const status = obj.mode === "subscription" ? "active" : "paid";
    const { user } = await upsertPaidUser(env.DB, {
      email,
      stripeCustomerId: typeof obj.customer === "string" ? obj.customer : obj.customer?.id || null,
      tierId,
      checkoutId: obj.id,
      subscriptionId: typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id || null,
      status,
    });

    const tier = getStripeTier(tierId);
    let inviteUrl = null;
    if (user && !user.password_hash) {
      try {
        const token = await createInviteToken(env.DB, user.id);
        const origin = env.PORTAL_ORIGIN || "https://www.swftstudios.com";
        inviteUrl = `${origin}/portal/onboard.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        if (sendInviteEmail) {
          await sendInviteEmail(env, {
            email,
            name: obj.customer_details?.name || obj.metadata?.name || "",
            tierName: tier?.name || tierId,
            inviteUrl,
          });
        }
      } catch (err) {
        console.error("invite token/email failed", err);
      }
    }

    return { handled: true, email, tierId, inviteUrl: !!inviteUrl };
  }

  if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const subId = obj.id;
    let status = obj.status || "unknown";
    if (type === "customer.subscription.deleted") status = "canceled";
    else if (status === "active" || status === "trialing") status = "active";
    else if (status === "past_due" || status === "unpaid") status = "past_due";
    await updateSubscriptionStatus(env.DB, subId, status);
    return { handled: true, subscriptionId: subId, status };
  }

  // Optional: map price id if metadata missing on future events
  void tierIdFromPriceId;

  return { handled: false };
}
