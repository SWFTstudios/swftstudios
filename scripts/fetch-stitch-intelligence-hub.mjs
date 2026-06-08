#!/usr/bin/env node
/**
 * Fetch Stitch "Intelligence Hub" screen assets for local reference.
 * Reads API key from ~/.cursor/mcp.json — never commit keys.
 *
 * Usage: node scripts/fetch-stitch-intelligence-hub.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "reference", "stitch-intelligence-hub");
const imagesDir = path.join(root, "images", "resources-hub");

const PROJECT = "projects/12697226020282763592";
const SCREEN_ID = "912eb1ea9b3748f1b64ef26ba5006cb8";

function loadKey() {
  const mcpPath = path.join(process.env.HOME || "", ".cursor", "mcp.json");
  const raw = fs.readFileSync(mcpPath, "utf8");
  const key = JSON.parse(raw).mcpServers?.stitch?.headers?.["X-Goog-Api-Key"];
  if (!key) throw new Error("Missing stitch X-Goog-Api-Key in ~/.cursor/mcp.json");
  return key;
}

async function mcpCall(key, name, args) {
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const json = await res.json();
  const text = json.result?.content?.[0]?.text;
  if (!text) throw new Error(JSON.stringify(json.error || json));
  return JSON.parse(text);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const key = loadKey();
  const list = await mcpCall(key, "list_screens", { projectId: PROJECT });
  const screen = list.screens.find((s) => s.name?.includes(SCREEN_ID));
  if (!screen) throw new Error(`Screen ${SCREEN_ID} not found`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "screen.json"), JSON.stringify(screen, null, 2));

  const htmlUrl = screen.htmlCode.downloadUrl;
  const imageUrl = screen.screenshot.downloadUrl;

  const htmlRes = await fetch(htmlUrl);
  fs.writeFileSync(path.join(outDir, "source.html"), await htmlRes.text());
  await download(imageUrl, path.join(outDir, "screenshot.png"));

  console.log("Wrote reference/stitch-intelligence-hub/");
  console.log("Re-run curl on image URLs in source.html if you need fresh assets in images/resources-hub/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
