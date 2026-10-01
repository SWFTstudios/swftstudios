/**
 * Local harness for the lead forms.
 *
 * Serves the site from the repo root and routes the form endpoints to the real
 * Pages Function handlers. Outbound calls are intercepted: Resend emails are
 * recorded (and can be forced to fail), Google Sheets script calls are
 * recorded (and can be forced to fail), Airtable is off (no token), Stripe
 * Payment Links come from the handlers' built-in defaults.
 *
 *   import { startHarness } from "./harness.mjs";
 *   const h = await startHarness();   // h.url, h.emails, h.sheets, h.failResend(n), h.failSheets(n), h.close()
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { onRequestPost as contact } from "../../functions/api/contact.js";
import { onRequestPost as growthAudit } from "../../functions/api/growth-audit.js";
import { onRequestPost as bookTier } from "../../functions/api/book-tier.js";
import { onRequestPost as buildRequest } from "../../functions/api/build-request.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES = {
  "/api/contact": contact,
  "/api/growth-audit": growthAudit,
  "/api/book-tier": bookTier,
  "/api/build-request": buildRequest,
};
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

export async function startHarness({ env: extraEnv = {} } = {}) {
  const emails = [];
  const sheets = [];
  let failNext = 0;
  let failSheetsNext = 0;
  const realFetch = globalThis.fetch;

  // Intercept the handlers' outbound requests.
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      const payload = JSON.parse(init.body);
      if (failNext > 0) {
        failNext--;
        return new Response('{"message":"simulated outage"}', { status: 503 });
      }
      emails.push({ ...payload, idempotencyKey: init.headers?.["Idempotency-Key"] });
      return new Response(JSON.stringify({ id: `test_${emails.length}` }), { status: 200 });
    }
    if (url.startsWith("https://script.google.com/")) {
      if (failSheetsNext > 0) {
        failSheetsNext--;
        return new Response("<html>Error</html>", { status: 200 }); // Apps Script errors come back as HTML
      }
      sheets.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.startsWith("https://api.airtable.com/") || url.startsWith("https://api.stripe.com/")) {
      throw new Error(`unexpected outbound call in test: ${url}`);
    }
    return realFetch(input, init);
  };

  const env = { RESEND_API_KEY: "re_test_key", ...extraEnv };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      const handler = req.method === "POST" && ROUTES[url.pathname];
      if (handler) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request(url.href.replace("http://localhost", `http://${req.headers.host}`), {
          method: "POST",
          headers: { "Content-Type": req.headers["content-type"] || "application/json" },
          body: Buffer.concat(chunks),
        });
        const response = await handler({ request, env });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let path = decodeURIComponent(url.pathname);
      if (path === "/growth-audit") path = "/growth-audit.html";
      if (path.endsWith("/")) path += "index.html";
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) throw new Error("bad path");
      await stat(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    emails,
    sheets,
    failResend(n) { failNext = n; },
    failSheets(n) { failSheetsNext = n; },
    reset() { emails.length = 0; sheets.length = 0; failNext = 0; failSheetsNext = 0; },
    close() {
      globalThis.fetch = realFetch;
      return new Promise((r) => server.close(r));
    },
  };
}
