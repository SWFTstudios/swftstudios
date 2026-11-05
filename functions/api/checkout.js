/**
 * POST /api/checkout  { items: [offerId], email, name?, business?, notes?, comp? }
 * Turns the cart into a Stripe Checkout Session and returns its URL.
 *   - One-time services: 50% deposit today (balance invoiced before delivery).
 *   - Monthly plans: first month today, then monthly (subscription mode).
 *   - Discount codes: Stripe promotion codes, typed on the Stripe page.
 *   - comp: true → admin-only free order: no payment, the project is created
 *     right away (status "comped") and the client gets the portal invite.
 * After paying, Stripe sends people to /order-confirmed.html to book the
 * kickoff call. The webhook (/api/stripe-webhook) creates the project.
 * Env: STRIPE_SECRET_KEY (or a restricted key), PORTAL_ORIGIN (optional)
 */
import { json, str, isValidEmail } from "../_lib/portal-auth.js";
import { priceCart, DEPOSIT_PERCENT } from "../_lib/shop.js";
import { requireAdmin, sameOrigin } from "../_lib/admin-auth.js";
import { createInviteToken, upsertPaidUser } from "../_lib/portal-db.js";
import { escapeHtml, sendLeadEmails } from "../_lib/resend.js";
import { siteOrigin } from "../_lib/subscribers.js";

const usd = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 });

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin." }, 403);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return json({ ok: false, error: "Too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const cart = priceCart(body.items);
  if (!cart.lines.length) return json({ ok: false, error: "Your cart is empty." }, 400);
  const email = str(body.email, 320).toLowerCase();
  const name = str(body.name, 120);
  const business = str(body.business, 200);
  const notes = str(body.notes, 1500);
  if (!isValidEmail(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);

  const origin = siteOrigin(env, request);
  const ids = cart.lines.map((l) => l.id);
  const summary = cart.lines.map((l) => l.name).join(", ");

  /* ---------- Admin: free (comped) order ---------- */
  if (body.comp === true) {
    const gate = await requireAdmin(context, { write: true });
    if (gate.response) return gate.response;
    const checkoutId = `comp_${crypto.randomUUID()}`;
    const { user } = await upsertPaidUser(gate.db, { email, stripeCustomerId: null, tierId: ids[0], checkoutId, subscriptionId: null, status: "comped" });
    let inviteUrl = null;
    if (user && !user.password_hash) {
      const token = await createInviteToken(gate.db, user.id);
      inviteUrl = `${origin}/portal/onboard.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    }
    await sendLeadEmails(env, {
      kind: "comp-order",
      visitorEmail: email,
      visitorName: name,
      backupStored: true,
      idempotencyBase: `comp/${checkoutId}`,
      teamSubject: `Free order created: ${business || name || email}`,
      teamHtml: `<p>${escapeHtml(gate.user.email)} created a free order for ${escapeHtml(email)}: ${escapeHtml(summary)}.</p>`,
      confirmSubject: "Your SWFT Studios project is set up",
      confirmHtml: `<p>Hi ${escapeHtml(name || "there")},</p>
        <p>Your project is set up: <strong>${escapeHtml(summary)}</strong>.</p>
        ${inviteUrl ? `<p>Create your dashboard password here: <a href="${inviteUrl}">${inviteUrl}</a></p>` : ""}
        <p>Next, book your kickoff call: <a href="https://cal.com/swftstudios/swft-meeting">cal.com/swftstudios/swft-meeting</a></p>
        <p>SWFT Studios</p>`,
    });
    return json({ ok: true, url: `/order-confirmed.html?comp=1` });
  }

  /* ---------- Stripe Checkout ---------- */
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    return json({ ok: false, code: "checkout_unavailable", error: "Online checkout isn't switched on yet. Book a call and we'll send you an invoice." }, 503);
  }

  const p = new URLSearchParams();
  p.set("mode", cart.hasMonthly ? "subscription" : "payment");
  p.set("success_url", `${origin}/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}`);
  p.set("cancel_url", `${origin}/cart.html?status=cancel`);
  p.set("customer_email", email);
  p.set("allow_promotion_codes", "true");
  p.set("billing_address_collection", "auto");
  p.set("client_reference_id", `${ids[0]}:${email}`.slice(0, 200));
  const meta = { tierId: ids[0], items: ids.join(",").slice(0, 490), name: name.slice(0, 200), business: business.slice(0, 200), notes: notes.slice(0, 490), deposit: `${DEPOSIT_PERCENT}%` };
  for (const [k, v] of Object.entries(meta)) if (v) p.set(`metadata[${k}]`, v);
  if (cart.hasMonthly) {
    for (const [k, v] of Object.entries(meta)) if (v) p.set(`subscription_data[metadata][${k}]`, v);
  } else {
    p.set("payment_intent_data[description]", `SWFT Studios: ${summary} (${DEPOSIT_PERCENT}% deposit)`.slice(0, 990));
  }

  cart.lines.forEach((l, i) => {
    const pre = `line_items[${i}]`;
    p.set(`${pre}[quantity]`, "1");
    p.set(`${pre}[price_data][currency]`, "usd");
    p.set(`${pre}[price_data][unit_amount]`, String(l.dueNowCents));
    if (l.monthly) {
      p.set(`${pre}[price_data][recurring][interval]`, "month");
      p.set(`${pre}[price_data][product_data][name]`, `${l.name} (monthly)`);
    } else {
      p.set(`${pre}[price_data][product_data][name]`, `${l.name}: ${DEPOSIT_PERCENT}% deposit`);
      p.set(`${pre}[price_data][product_data][description]`, `Starting price ${usd(l.totalCents)}. Balance of ${usd(l.laterCents)} is invoiced before delivery.`);
    }
  });

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      // Pinned API version: $0 orders (100% off promotion codes) need 2023-08-16 or later
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
      body: p.toString(),
    });
    const s = await res.json().catch(() => ({}));
    if (!res.ok || !s.url) {
      console.error("Stripe checkout error", res.status, JSON.stringify(s).slice(0, 500));
      return json({ ok: false, error: "Checkout couldn't start. Try again, or book a call and we'll invoice you." }, 502);
    }
    return json({ ok: true, url: s.url });
  } catch (err) {
    console.error("Stripe checkout fetch failed", err);
    return json({ ok: false, error: "Checkout couldn't start. Try again in a moment." }, 502);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
