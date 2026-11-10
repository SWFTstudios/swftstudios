/**
 * Owner-only: email subscribers about a new blog post or video.
 *
 * GET  /api/admin/newsletter
 *      { ready, configured, from, counts: { active, blog, videos }, items: [{ kind, key, title, summary, path, sent }] }
 * POST /api/admin/newsletter  { action, kind, key, subject, summary? }
 *      test → one copy to the signed-in admin (nothing recorded)
 *      send → the next batches to subscribers who haven't had it; returns { sent, remaining, failed }.
 *             Call again while remaining > 0. Safe to repeat: nobody gets the same item twice.
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json, str } from "../../_lib/portal-auth.js";
import { sendResendEmail } from "../../_lib/resend.js";
import { audienceCounts, buildEmail, fromAddress, KINDS, loadItems, newsletterReady, sendItem, sendsByItem } from "../../_lib/newsletter.js";

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const { env, request } = context;
  try {
    const items = await loadItems(env, request);
    const ready = await newsletterReady(gate.db);
    const sent = ready ? await sendsByItem(gate.db) : {};
    return json({
      ok: true,
      ready,
      configured: !!env.RESEND_API_KEY,
      from: fromAddress(env),
      counts: await audienceCounts(gate.db),
      items: items.map((i) => ({ ...i, sent: sent[`${i.kind}:${i.key}`] || null })),
    });
  } catch (err) {
    console.error("admin newsletter get failed", err);
    return json({ ok: false, error: "Could not load the newsletter." }, 500);
  }
}

export async function onRequestPost(context) {
  const gate = await requireAdmin(context, { write: true });
  if (gate.response) return gate.response;
  const { env, request } = context;
  let b;
  try { b = JSON.parse(await request.text()); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const action = str(b.action, 10);
  const kind = str(b.kind, 10);
  const subject = str(b.subject, 150);
  const summary = str(b.summary, 600);
  if (!KINDS[kind]) return json({ ok: false, error: "Unknown kind." }, 400);
  if (!subject) return json({ ok: false, error: "Write a subject line first." }, 400);
  if (!env.RESEND_API_KEY) return json({ ok: false, error: "RESEND_API_KEY is not set, so email can't be sent." }, 503);

  const item = (await loadItems(env, request)).find((i) => i.kind === kind && i.key === str(b.key, 120));
  if (!item) return json({ ok: false, error: "That post or video isn't on the site." }, 404);

  try {
    if (action === "test") {
      const mail = buildEmail(env, item, { subject, summary }, null);
      const ok = await sendResendEmail(env, { to: gate.user.email, subject: `[Test] ${subject}`, html: mail.html, text: mail.text });
      return ok ? json({ ok: true, to: gate.user.email }) : json({ ok: false, error: "Resend didn't accept the test email." }, 502);
    }
    if (action === "send") {
      if (!(await newsletterReady(gate.db))) return json({ ok: false, error: "Apply migration 0010 first." }, 503);
      const r = await sendItem(gate.db, env, item, { subject, summary });
      if (r.failed && !r.sent) return json({ ok: false, error: "Resend didn't accept the emails. Nothing was marked as sent; try again.", remaining: r.remaining }, 502);
      return json({ ok: true, ...r });
    }
    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (err) {
    console.error("admin newsletter post failed", err);
    return json({ ok: false, error: "Could not send." }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
