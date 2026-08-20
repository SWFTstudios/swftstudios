/**
 * D1 helpers for the SWFT client portal.
 */

import {
  getSessionIdFromRequest,
  hashPassword,
  randomId,
  sessionExpiresIso,
  sha256Hex,
  verifyPassword,
} from "./portal-auth.js";

export function requireDb(env) {
  return env?.DB || null;
}

export async function findUserByEmail(db, email) {
  return db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .bind(email.toLowerCase())
    .first();
}

export async function findUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export async function createUserStub(db, { email, stripeCustomerId = null }) {
  const id = randomId(16);
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, stripe_customer_id)
       VALUES (?, ?, NULL, NULL, ?)`
    )
    .bind(id, email.toLowerCase(), stripeCustomerId)
    .run();
  return findUserById(db, id);
}

export async function setUserPassword(db, userId, password) {
  const { salt, hash } = await hashPassword(password);
  await db
    .prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .bind(hash, salt, userId)
    .run();
}

export async function upsertPaidUser(db, { email, stripeCustomerId, tierId, checkoutId, subscriptionId, status }) {
  let user = await findUserByEmail(db, email);
  if (!user) {
    user = await createUserStub(db, { email, stripeCustomerId });
  } else if (stripeCustomerId && !user.stripe_customer_id) {
    await db
      .prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?")
      .bind(stripeCustomerId, user.id)
      .run();
    user = await findUserById(db, user.id);
  }

  const existing =
    checkoutId &&
    (await db
      .prepare("SELECT * FROM projects WHERE stripe_checkout_id = ?")
      .bind(checkoutId)
      .first());

  if (existing) {
    await db
      .prepare(
        `UPDATE projects SET status = ?, stripe_subscription_id = COALESCE(?, stripe_subscription_id),
         updated_at = datetime('now') WHERE id = ?`
      )
      .bind(status || existing.status, subscriptionId || null, existing.id)
      .run();
    return { user, project: await db.prepare("SELECT * FROM projects WHERE id = ?").bind(existing.id).first() };
  }

  const projectId = randomId(16);
  await db
    .prepare(
      `INSERT INTO projects (id, user_id, tier_id, stripe_checkout_id, stripe_subscription_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(projectId, user.id, tierId, checkoutId || null, subscriptionId || null, status || "paid")
    .run();

  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
  return { user, project };
}

export async function createInviteToken(db, userId) {
  const raw = randomId(24);
  const tokenHash = await sha256Hex(raw);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare("INSERT INTO invite_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expires)
    .run();
  return raw;
}

export async function consumeInviteToken(db, rawToken) {
  if (!rawToken) return null;
  const tokenHash = await sha256Hex(rawToken);
  const row = await db
    .prepare("SELECT * FROM invite_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM invite_tokens WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  await db.prepare("DELETE FROM invite_tokens WHERE token_hash = ?").bind(tokenHash).run();
  return row.user_id;
}

export async function createSession(db, userId) {
  const id = randomId(24);
  const expiresAt = sessionExpiresIso();
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(id, userId, expiresAt)
    .run();
  return id;
}

export async function destroySession(db, sessionId) {
  if (!sessionId) return;
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

export async function getSessionUser(db, request) {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) return null;
  const row = await db
    .prepare(
      `SELECT u.*, s.id AS session_id, s.expires_at AS session_expires
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .bind(sessionId)
    .first();
  if (!row) return null;
  if (new Date(row.session_expires).getTime() < Date.now()) {
    await destroySession(db, sessionId);
    return null;
  }
  return row;
}

export async function getLatestProjectForUser(db, userId) {
  return db
    .prepare(
      `SELECT * FROM projects WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`
    )
    .bind(userId)
    .first();
}

export async function updateProjectHost(db, projectId, siteHost) {
  await db
    .prepare(
      `UPDATE projects SET site_host = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(siteHost, projectId)
    .run();
  return db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
}

export async function updateSubscriptionStatus(db, subscriptionId, status) {
  if (!subscriptionId) return;
  await db
    .prepare(
      `UPDATE projects SET status = ?, updated_at = datetime('now') WHERE stripe_subscription_id = ?`
    )
    .bind(status, subscriptionId)
    .run();
}

export async function authenticateUser(db, email, password) {
  const user = await findUserByEmail(db, email);
  if (!user || !user.password_hash || !user.password_salt) return null;
  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  return ok ? user : null;
}

export async function onboardUser(db, { email, password, inviteToken }) {
  const invitedUserId = inviteToken ? await consumeInviteToken(db, inviteToken) : null;
  let user = invitedUserId ? await findUserById(db, invitedUserId) : await findUserByEmail(db, email);

  if (user) {
    if (user.password_hash) {
      const ok = await verifyPassword(password, user.password_salt, user.password_hash);
      if (!ok) return { error: "Account already exists. Sign in instead.", code: "exists" };
      return { user, created: false };
    }
    await setUserPassword(db, user.id, password);
    return { user: await findUserById(db, user.id), created: true };
  }

  const id = randomId(16);
  const { salt, hash } = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)`
    )
    .bind(id, email.toLowerCase(), hash, salt)
    .run();
  return { user: await findUserById(db, id), created: true };
}
