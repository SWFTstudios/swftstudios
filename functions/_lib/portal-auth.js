/**
 * Portal crypto helpers: password hashing (PBKDF2-SHA-256) and session cookies.
 * Passwords are never stored in plaintext.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SESSION_DAYS = 14;
const COOKIE_NAME = "swft_portal_session";

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function str(v, max = 4000) {
  return String(v ?? "").trim().slice(0, max);
}

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  if (clean.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomId(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BYTES * 8
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

export async function verifyPassword(password, saltHex, hashHex) {
  if (!password || !saltHex || !hashHex) return false;
  try {
    const salt = hexToBytes(saltHex);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      HASH_BYTES * 8
    );
    const derived = bytesToHex(bits);
    if (derived.length !== hashHex.length) return false;
    let ok = 0;
    for (let i = 0; i < derived.length; i++) {
      ok |= derived.charCodeAt(i) ^ hashHex.charCodeAt(i);
    }
    return ok === 0;
  } catch {
    return false;
  }
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordOk(password) {
  return typeof password === "string" && password.length >= 10 && password.length <= 200;
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionIdFromRequest(request) {
  return parseCookies(request)[COOKIE_NAME] || null;
}

export function sessionCookieHeader(sessionId, { clear = false } = {}) {
  if (clear) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function sessionExpiresIso() {
  const d = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export { COOKIE_NAME, SESSION_DAYS };
