/**
 * GET /api/portal/me — current user + latest project (session required).
 */
import { json } from "../../_lib/portal-auth.js";
import { getLatestProjectForUser, getSessionUser, requireDb } from "../../_lib/portal-db.js";
import { getStripeTier } from "../../_lib/stripe-tiers.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = requireDb(env);
  if (!db) {
    return json({ ok: false, error: "Portal storage is not configured." }, 503);
  }

  try {
    const user = await getSessionUser(db, request);
    if (!user) {
      return json({ ok: false, error: "Not signed in.", code: "unauthorized" }, 401);
    }

    const project = await getLatestProjectForUser(db, user.id);
    const tier = project ? getStripeTier(project.tier_id) : null;

    return json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        hasPassword: !!(user.password_hash && user.password_salt),
        stripeCustomerId: user.stripe_customer_id || null,
      },
      project: project
        ? {
            id: project.id,
            tierId: project.tier_id,
            tierName: tier?.name || project.tier_id,
            status: project.status,
            siteHost: project.site_host || null,
            hasAnalyticsHost: !!project.site_host,
            stripeSubscriptionId: project.stripe_subscription_id || null,
            createdAt: project.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("portal me failed", err);
    return json({ ok: false, error: "Unable to load account." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
