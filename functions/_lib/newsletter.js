/**
 * "New blog post / new video" emails to the subscribers list.
 *
 * Who gets it: active subscribers (double opt-in confirmed) whose interests include
 * the item's kind ("blog" or "videos"), minus anyone who opted out of all SWFT email
 * on the preferences page, minus anyone who already got this item.
 *
 * Sending uses Resend's batch endpoint (up to 100 emails per call), a few batches per
 * request so one click stays within Worker limits; the admin page keeps calling until
 * nothing is left. Each email carries that subscriber's own unsubscribe link and
 * RFC 8058 one-click List-Unsubscribe headers.
 *
 * Env: RESEND_API_KEY, optional NEWSLETTER_FROM (falls back to RESEND_FROM).
 */
import { randomId, sha256Hex } from "./portal-auth.js";
import { escapeHtml, LEAD_INBOX } from "./resend.js";
import { prefsReady, origin as siteOrigin } from "./email-prefs.js";
import { INTERESTS, oneClickUnsubscribeUrl, unsubscribeUrl } from "./subscribers.js";

export const KINDS = { blog: "Blog post", videos: "Video" };
export const BATCH_SIZE = 100;
export const BATCHES_PER_REQUEST = 5;

export async function newsletterReady(db) {
  try { await db.prepare("SELECT 1 FROM newsletter_sends LIMIT 1").first(); return true; } catch { return false; }
}

/** Reads a site data file from the Pages deployment (ASSETS) or, for the cron Worker, the live site. */
export function jsonReader(env, request) {
  return async (path) => {
    try {
      const res = env.ASSETS && request
        ? await env.ASSETS.fetch(new URL(path, request.url))
        : await fetch(siteOrigin(env) + path, { headers: { "Cache-Control": "no-cache" } });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  };
}

/** Blog posts and videos from the site's data files, newest first, with a public link each. */
export async function loadItems(getJson) {
  const [posts, visuals] = await Promise.all([getJson("/data/blog-posts.json"), getJson("/data/visuals.json")]);
  const blog = (Array.isArray(posts) ? posts : [])
    .filter((p) => p && p.slug && p.url)
    .sort((a, b) => String(b.published || b.updated || "").localeCompare(String(a.published || a.updated || "")))
    .map((p) => ({ kind: "blog", key: String(p.slug), title: p.title || "", summary: p.description || "", path: p.url, date: p.published || p.updated || null }));
  const videos = ((visuals && visuals.videos) || [])
    .filter((v) => v && v.vimeo)
    .map((v) => {
      const key = String(v.slug || v.vimeo);
      return { kind: "videos", key, vimeo: String(v.vimeo), hash: v.hash || "", client: v.client || "", thumb: v.thumb || "", title: v.title || "", summary: v.description || "", path: `/visuals.html?p=${encodeURIComponent(key)}`, date: v.year || null };
    });
  return [...blog, ...videos];
}

const interestClause = "(',' || s.interests || ',') LIKE ?";

async function pendingWhere(db) {
  const prefs = await prefsReady(db);
  return `FROM subscribers s ${prefs ? "LEFT JOIN email_prefs ep ON ep.email = s.email" : ""}
    WHERE s.status = 'active' AND ${interestClause} ${prefs ? "AND COALESCE(ep.all_off, 0) = 0" : ""}
      AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries d WHERE d.send_id = ? AND d.subscriber_id = s.id)`;
}

/** Subscribers who should get this item and haven't yet (up to `limit`). */
async function pendingRecipients(db, kind, sendId, limit) {
  const sql = `SELECT s.id, s.email, s.name ${await pendingWhere(db)} ORDER BY s.created_at, s.id LIMIT ?`;
  return (await db.prepare(sql).bind(`%,${kind},%`, sendId || "", limit).all()).results;
}

async function pendingCount(db, kind, sendId) {
  return (await db.prepare(`SELECT COUNT(*) AS n ${await pendingWhere(db)}`).bind(`%,${kind},%`, sendId || "").first()).n;
}

/** How many subscribers would get each kind, and how many are still waiting for one item. */
export async function audienceCounts(db) {
  const prefs = await prefsReady(db);
  const count = async (kind) => (await db.prepare(
    `SELECT COUNT(*) AS n FROM subscribers s ${prefs ? "LEFT JOIN email_prefs ep ON ep.email = s.email" : ""}
     WHERE s.status = 'active' AND ${interestClause} ${prefs ? "AND COALESCE(ep.all_off, 0) = 0" : ""}`
  ).bind(`%,${kind},%`).first()).n;
  const active = (await db.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'active'").first()).n;
  return { active, blog: await count("blog"), videos: await count("videos") };
}

export async function sendsByItem(db) {
  const rows = (await db.prepare("SELECT kind, item_key, sent_count, last_sent_at FROM newsletter_sends").all()).results;
  return Object.fromEntries(rows.map((r) => [`${r.kind}:${r.item_key}`, { count: r.sent_count, at: r.last_sent_at }]));
}

/** The email for one subscriber. `subscriber` null = a test copy (no personal links). */
export function buildEmail(env, item, { subject, summary }, subscriber) {
  const origin = siteOrigin(env);
  const link = origin + item.path;
  const what = item.kind === "blog" ? "Read the post" : "Watch the video";
  const thumb = /^https:\/\//.test(item.thumb || "") ? item.thumb : item.thumb ? `${origin}/${String(item.thumb).replace(/^\/+/, "")}` : "";
  const topic = INTERESTS[item.kind].toLowerCase();
  const hello = subscriber?.name ? `Hi ${escapeHtml(subscriber.name)},` : "Hi,";
  const unsub = subscriber ? unsubscribeUrl(origin, subscriber.id) : `${origin}/account.html`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:560px">
<p>${hello}</p>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#777">New from SWFT Studios · ${escapeHtml(KINDS[item.kind])}</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${escapeHtml(subject)}</h1>
${thumb ? `<p><a href="${link}"><img src="${escapeHtml(thumb)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;border:0"></a></p>` : ""}
${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${what}</a></p>
<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 12px">
<p style="font-size:12px;line-height:1.5;color:#777;margin:0">You're getting this because you signed up for SWFT Studios ${escapeHtml(topic)}.
<a href="${unsub}" style="color:#555">Unsubscribe</a><br>SWFT Studios · ${LEAD_INBOX}</p>
</div>`;
  const text = `${subscriber?.name ? `Hi ${subscriber.name},` : "Hi,"}\n\nNew from SWFT Studios: ${subject}\n\n${summary ? summary + "\n\n" : ""}${what}: ${link}\n\n--\nYou signed up for SWFT Studios ${topic}. Unsubscribe: ${unsub}`;
  const headers = subscriber
    ? { "List-Unsubscribe": `<${oneClickUnsubscribeUrl(origin, subscriber.id)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;
  return { html, text, headers };
}

export function fromAddress(env) {
  return env.NEWSLETTER_FROM || env.RESEND_FROM || `SWFT Studios <${LEAD_INBOX}>`;
}

/** POST one Resend batch. Returns true when Resend accepted it. */
async function postBatch(env, emails, idempotencyKey) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(emails),
      });
      if (res.ok) return true;
      console.error("Resend batch error", res.status, (await res.text().catch(() => "")).slice(0, 500));
      if (![408, 425, 429, 500, 502, 503, 504].includes(res.status)) return false;
    } catch (err) {
      console.error("Resend batch fetch failed", err);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

/**
 * Send this item to the next few batches of subscribers who haven't had it.
 * Returns { sent, remaining, failed }.
 */
export async function sendItem(db, env, item, { subject, summary }) {
  let send = await db.prepare("SELECT * FROM newsletter_sends WHERE kind = ? AND item_key = ?").bind(item.kind, item.key).first();
  if (!send) {
    await db.prepare("INSERT OR IGNORE INTO newsletter_sends (id, kind, item_key, subject) VALUES (?, ?, ?, ?)")
      .bind(randomId(12), item.kind, item.key, subject).run();
    send = await db.prepare("SELECT * FROM newsletter_sends WHERE kind = ? AND item_key = ?").bind(item.kind, item.key).first();
  } else if (send.subject !== subject) {
    await db.prepare("UPDATE newsletter_sends SET subject = ? WHERE id = ?").bind(subject, send.id).run();
  }

  let sent = 0, failed = false;
  for (let b = 0; b < BATCHES_PER_REQUEST; b++) {
    const people = await pendingRecipients(db, item.kind, send.id, BATCH_SIZE);
    if (!people.length) break;
    const from = fromAddress(env);
    const emails = people.map((p) => ({ from, to: [p.email], subject, reply_to: LEAD_INBOX, ...buildEmail(env, item, { subject, summary }, p) }));
    // Same people for the same item = same key, so a retried batch is never delivered twice.
    const key = `newsletter/${send.id}/${(await sha256Hex(people.map((p) => p.id).join(","))).slice(0, 32)}`;
    if (!(await postBatch(env, emails, key))) { failed = true; break; }
    await db.prepare(
      `INSERT OR IGNORE INTO newsletter_deliveries (send_id, subscriber_id) SELECT ?, value FROM json_each(?)`
    ).bind(send.id, JSON.stringify(people.map((p) => p.id))).run();
    await db.prepare("UPDATE newsletter_sends SET sent_count = sent_count + ?, last_sent_at = datetime('now') WHERE id = ?")
      .bind(people.length, send.id).run();
    sent += people.length;
  }
  const remaining = await pendingCount(db, item.kind, send.id);
  return { sent, remaining, failed };
}

/* ---------- Automatic sending of new blog posts and videos (cron) ---------- */

export const AUTO_KINDS = ["blog", "videos"];

/**
 * A video's title, summary and thumbnail for the email. Values set in data/visuals.json win;
 * the rest come from Vimeo's oEmbed (works for unlisted videos with their hash). If Vimeo
 * can't be reached the email still goes out with a plain subject.
 */
export async function videoDetails(item) {
  let meta = null;
  if (!item.title || !item.summary || !item.thumb) {
    try {
      const page = `https://vimeo.com/${item.vimeo}${item.hash ? "/" + item.hash : ""}`;
      const res = await fetch(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(page)}`);
      if (res.ok) meta = await res.json();
    } catch { /* fall back below */ }
  }
  const clip = (t) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 300 ? t.slice(0, 297).replace(/\s+\S*$/, "") + "…" : t; };
  return {
    ...item,
    title: item.title || meta?.title || (item.client ? `New video: ${item.client}` : "New video from SWFT Studios"),
    summary: clip(item.summary || meta?.description || ""),
    thumb: item.thumb || meta?.thumbnail_url || "",
  };
}
export const AUTO_HOLD_MINUTES = 30;
const AUTO_MAX_ROUNDS = 8; // 8 × 500 = 4,000 emails per run; the rest go on the next run.

const iso = (d) => d.toISOString().replace("T", " ").slice(0, 19);

/** Per-item auto status for the admin list: { "blog:slug": { status, sendAfter } }. */
export async function autoByItem(db) {
  try {
    const rows = (await db.prepare("SELECT kind, item_key, status, first_seen_at FROM newsletter_auto").all()).results;
    return Object.fromEntries(rows.map((r) => [`${r.kind}:${r.item_key}`, {
      status: r.status,
      sendAfter: r.status === "waiting" ? iso(new Date(Date.parse(r.first_seen_at.replace(" ", "T") + "Z") + AUTO_HOLD_MINUTES * 60000)) : null,
    }]));
  } catch { return {}; }
}

/** Owner choice from admin: "skipped" (don't send automatically) or back to "waiting". */
export async function setAuto(db, kind, key, status) {
  const r = await db.prepare("UPDATE newsletter_auto SET status = ? WHERE kind = ? AND item_key = ? AND status IN ('waiting', 'skipped')")
    .bind(status, kind, key).run();
  return (r?.meta?.changes || 0) > 0;
}

/**
 * One cron run. Returns a summary: { baseline, discovered, sent: [{ key, count }], waiting }.
 * Posts that disappear from the site before their hold ends are never sent.
 */
export async function runAutoSend(db, env, getJson, now = new Date()) {
  const summary = { baseline: 0, discovered: 0, sent: [], waiting: 0 };
  const items = (await loadItems(getJson)).filter((i) => AUTO_KINDS.includes(i.kind));
  if (!items.length) return summary; // site data unreachable: change nothing

  for (const kind of AUTO_KINDS) {
    const mine = items.filter((i) => i.kind === kind);
    const known = new Set((await db.prepare("SELECT item_key FROM newsletter_auto WHERE kind = ?").bind(kind).all()).results.map((r) => r.item_key));
    const firstRun = known.size === 0;
    for (const it of mine) {
      if (known.has(it.key)) continue;
      await db.prepare("INSERT OR IGNORE INTO newsletter_auto (kind, item_key, status, first_seen_at) VALUES (?, ?, ?, ?)")
        .bind(kind, it.key, firstRun ? "baseline" : "waiting", iso(now)).run();
      if (firstRun) summary.baseline++; else summary.discovered++;
    }
  }

  if (!env.RESEND_API_KEY) return summary;
  const due = (await db.prepare("SELECT kind, item_key, first_seen_at FROM newsletter_auto WHERE status = 'waiting' ORDER BY first_seen_at").all()).results;
  const cutoff = iso(new Date(now.getTime() - AUTO_HOLD_MINUTES * 60000));
  for (const row of due) {
    const item = items.find((i) => i.kind === row.kind && i.key === row.item_key);
    if (!item || row.first_seen_at > cutoff) { summary.waiting++; continue; }
    const mail = item.kind === "videos" ? await videoDetails(item) : item;
    let count = 0, done = false;
    for (let round = 0; round < AUTO_MAX_ROUNDS; round++) {
      const r = await sendItem(db, env, mail, { subject: mail.title, summary: mail.summary });
      count += r.sent;
      if (r.failed) break;
      if (!r.remaining) { done = true; break; }
    }
    if (done) {
      await db.prepare("UPDATE newsletter_auto SET status = 'sent', sent_at = ? WHERE kind = ? AND item_key = ?").bind(iso(now), row.kind, row.item_key).run();
    } else {
      summary.waiting++;
    }
    summary.sent.push({ key: item.key, count });
  }
  return summary;
}
