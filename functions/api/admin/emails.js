/**
 * GET /api/admin/emails — recent emails sent through Resend (admin only).
 * Uses Resend's "list emails" endpoint. A sending-only API key cannot list; the
 * response then says so instead of failing the dashboard.
 */
import { requireAdmin } from "../../_lib/admin-auth.js";
import { json } from "../../_lib/portal-auth.js";

export async function onRequestGet(context) {
  const gate = await requireAdmin(context);
  if (gate.response) return gate.response;
  const key = context.env.RESEND_API_KEY;
  if (!key) return json({ ok: true, configured: false, emails: [] });
  try {
    const res = await fetch("https://api.resend.com/emails?limit=50", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      return json({ ok: true, configured: true, emails: [], note: "This Resend key can only send. Use a full-access key to list sent emails here." });
    }
    if (!res.ok) return json({ ok: false, error: `Resend returned ${res.status}.` }, 502);
    const body = await res.json();
    const emails = (body.data || []).map((e) => ({
      id: e.id,
      to: Array.isArray(e.to) ? e.to.join(", ") : e.to,
      from: e.from,
      subject: e.subject,
      status: e.last_event,
      createdAt: e.created_at,
    }));
    return json({ ok: true, configured: true, emails });
  } catch (err) {
    console.error("admin emails failed", err);
    return json({ ok: false, error: "Could not reach Resend." }, 502);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
