/**
 * Client notifications for project updates: the email that goes out when SWFT posts an
 * update, and the client's Notifications tab data (unread = newer than users.updates_seen_at).
 */
import { escapeHtml } from "./resend.js";
import { getOrCreatePrefs, isAllowed, origin, prefsReady, prefsUrl, savePrefs, sendPersonEmail } from "./email-prefs.js";

async function hasCol(db, sql) {
  try { await db.prepare(sql).first(); return true; } catch { return false; }
}

/** Email the client about one update and record what happened. Never throws. */
export async function emailUpdate(env, db, updateId) {
  let status = "failed";
  try {
    const u = await db.prepare(
      `SELECT pu.id, pu.body, p.name, p.tier_id, us.email FROM project_updates pu
       JOIN projects p ON p.id = pu.project_id JOIN users us ON us.id = p.user_id WHERE pu.id = ?`
    ).bind(updateId).first();
    if (!u) return "failed";
    const project = u.name || "your project";
    const dash = `${origin(env)}/portal/dashboard.html#notifications`;
    const body = escapeHtml(u.body).replace(/\n/g, "<br>");
    const r = await sendPersonEmail(env, {
      to: u.email,
      category: "project",
      subject: `New update on ${project}`,
      idempotencyKey: `project-update/${u.id}`,
      replyTo: "hello@swftstudios.com",
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.55;color:#111;max-width:560px">
<p style="color:#666;font-size:13px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px">${escapeHtml(project)}</p>
<p style="margin:0 0 16px">${body}</p>
<p><a href="${dash}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Open your dashboard</a></p>
<p style="color:#666;font-size:14px">Questions? Just reply to this email.</p>
</div>`,
      text: `${project}\n\n${u.body}\n\nOpen your dashboard: ${dash}\n\nQuestions? Just reply to this email.`,
    });
    status = r.status;
  } catch (err) {
    console.error("update email failed", err);
  }
  try { await db.prepare("UPDATE project_updates SET email_status = ? WHERE id = ?").bind(status, updateId).run(); } catch { /* pre-0009 */ }
  return status;
}

/** Notifications tab data for one client + project. */
export async function notificationsFor(env, db, user, projectId) {
  const seenReady = await hasCol(db, "SELECT updates_seen_at FROM users LIMIT 1");
  const seen = seenReady ? (await db.prepare("SELECT updates_seen_at s FROM users WHERE id = ?").bind(user.id).first())?.s : null;
  const rows = (await db.prepare(
    "SELECT id, body, created_at FROM project_updates WHERE project_id = ? ORDER BY datetime(created_at) DESC, id LIMIT 50"
  ).bind(projectId).all()).results;
  const items = rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, unread: !seen || r.created_at > seen }));
  let email = null;
  if (await prefsReady(db)) {
    const p = await getOrCreatePrefs(db, user.email);
    email = { on: isAllowed(p, "project"), prefsUrl: prefsUrl(env, p.token) };
  }
  return { items, unread: items.filter((i) => i.unread).length, email };
}

export async function markSeen(db, userId) {
  await db.prepare("UPDATE users SET updates_seen_at = datetime('now') WHERE id = ?").bind(userId).run();
}

export async function setUpdateEmails(db, email, on) {
  const p = await getOrCreatePrefs(db, email);
  return savePrefs(db, p, { changes: { project: !!on } });
}
