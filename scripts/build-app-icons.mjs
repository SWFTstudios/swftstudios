#!/usr/bin/env node
/**
 * Renders the home-screen app icons (PWA + iOS) from the real brand fonts:
 * white "SWFT" over the pink "studios" script on black.
 *
 *   node scripts/build-app-icons.mjs   (needs Playwright + Chromium)
 *
 * Writes images/app/icon-{192,512}.png, icon-maskable-512.png and
 * apple-touch-icon.png (180). Referenced by manifest.webmanifest and js/swft-nav.js.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)("playwright");
const TYPES = { ".css": "text/css", ".woff2": "font/woff2", ".html": "text/html" };

const page = (pad) => `<!doctype html><html><head>
<link rel="stylesheet" href="/css/swft-fonts.css"><link rel="stylesheet" href="/css/mono.css">
<style>html,body{margin:0;background:#010101}
.i{width:512px;height:512px;display:grid;place-items:center;background:#010101}
.w{display:flex;flex-direction:column;align-items:center;transform:scale(${pad})}
.s{font:700 150px/0.9 "Inter Tight",sans-serif;letter-spacing:-0.06em;color:#fff}
.h{font-family:var(--mf-hand,cursive);font-size:120px;line-height:0.8;color:#ff2e93;transform:rotate(-6deg);margin-top:-6px}
</style></head><body><div class="i"><div class="w"><span class="s">SWFT</span><span class="h">studios</span></div></div></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/icon-")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(page(url.pathname.includes("maskable") ? 0.72 : 0.92));
  }
  try {
    const body = await readFile(join(ROOT, url.pathname));
    res.writeHead(200, { "Content-Type": TYPES[extname(url.pathname)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
for (const [name, size, kind] of [
  ["icon-512.png", 512, "any"], ["icon-192.png", 192, "any"],
  ["icon-maskable-512.png", 512, "maskable"], ["apple-touch-icon.png", 180, "any"],
]) {
  const p = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await p.goto(`http://localhost:${port}/icon-${kind}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(ROOT, "images/app", name), clip: { x: 0, y: 0, width: 512, height: 512 } });
  console.log("wrote images/app/" + name);
}
await browser.close();
server.close();
