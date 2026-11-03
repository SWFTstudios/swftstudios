#!/usr/bin/env node
/**
 * Copies live Stripe payment links (data/stripe-catalog.json) onto the offers
 * in data/pricing.json (`stripe` + `bookUrl`), following each offer's `pay`
 * setting (full / deposit / monthly). Offers without a matching link stay
 * quote-first, and any old booking page for them becomes a redirect to the
 * offer on /pricing.html, so nobody can pay a stale amount.
 *
 *   npm run build:payments      (also rebuilds book/ pages)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPayments, allOffers } from "./lib/payments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const pricing = read("data/pricing.json");
const catalog = read("data/stripe-catalog.json");
const summary = applyPayments(pricing, catalog);
writeFileSync(join(ROOT, "data/pricing.json"), JSON.stringify(pricing, null, 2) + "\n");

// Booking pages that are no longer backed by a matching link → redirect.
const live = new Set(
  allOffers(pricing)
    .map(({ offer }) => offer.bookUrl && offer.bookUrl.replace(/^\/book\//, ""))
    .filter(Boolean)
);
const keep = new Set(["index.html", "thank-you.html", "gbp-refresh.html", ...live]);
const ids = new Set(allOffers(pricing).map(({ offer }) => offer.id));
for (const file of readdirSync(join(ROOT, "book"))) {
  if (!file.endsWith(".html") || keep.has(file)) continue;
  const id = file.replace(/\.html$/, "");
  const target = ids.has(id) ? `/pricing.html#${id}` : "/pricing.html";
  const html = readFileSync(join(ROOT, "book", file), "utf8");
  if (html.includes(`location.replace("${target}")`)) continue;
  writeFileSync(join(ROOT, "book", file), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Get a quote | SWFT Studios</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="https://www.swftstudios.com${target}">
  <meta http-equiv="refresh" content="0;url=${target}">
  <script>location.replace("${target}");</script>
</head>
<body>
  <p>This package is quoted first. See <a href="${target}">pricing</a>.</p>
</body>
</html>
`);
  console.log(`book/${file} → redirect to ${target}`);
}

console.log(`Online checkout: ${summary.online.length} (${summary.online.join(", ") || "none"})`);
console.log(`Waiting for a Stripe link (npm run stripe:sync): ${summary.waiting.length} (${summary.waiting.join(", ") || "none"})`);
console.log(`Quote first: ${summary.quote.join(", ") || "none"}`);
