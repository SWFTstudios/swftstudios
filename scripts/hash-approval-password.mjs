#!/usr/bin/env node
/**
 * Makes the value for the APPROVAL_PASSWORD_HASH secret of the outreach Worker.
 *
 *   node scripts/hash-approval-password.mjs
 *   (prompts for the password without echoing it, prints pbkdf2$100000$<salt>$<hash>)
 *
 * Then: cd workers/outreach && npx wrangler secret put APPROVAL_PASSWORD_HASH
 * Also set SESSION_SECRET to a long random string: openssl rand -hex 32
 * Cloudflare Workers caps PBKDF2 at 100000 iterations, so that is what we use.
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const ITERATIONS = 100_000;

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s); };
    rl.question(prompt, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

const password = process.env.APPROVAL_PASSWORD || (await ask("New approval password (14+ chars): "));
if (password.length < 14) {
  console.error("Use at least 14 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
console.log(`pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${hash.toString("hex")}`);
