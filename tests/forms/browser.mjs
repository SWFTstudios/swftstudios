/**
 * End-to-end: fill in every lead form in a real browser, through the real page
 * scripts and the real API handlers, and check an email reaches
 * hello@swftstudios.com and the visitor sees the right message.
 *
 * Needs Playwright (npm i -D playwright, or NODE_PATH pointing at an install).
 *   npm run test:forms:browser
 * Set CHROMIUM_PATH to use a preinstalled Chromium.
 */
import { startHarness } from "./harness.mjs";

const INBOX = "hello@swftstudios.com";
import { createRequire } from "node:module";
// require() honours NODE_PATH (ESM imports don't), so a shared Playwright install works too.
const { chromium } = createRequire(import.meta.url)("playwright");
const h = await startHarness();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failures = 0;

async function check(name, fn) {
  h.reset();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  // Keep third-party scripts out of the run; they aren't part of form delivery.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) =>
    r.request().url().startsWith("https://buy.stripe.com/")
      ? r.fulfill({ status: 200, contentType: "text/html", body: "<title>Stripe Checkout (test)</title>" })
      : r.abort()
  );
  try {
    await fn(page);
    const team = h.emails.find((e) => e.to.includes(INBOX));
    if (!team) throw new Error("no email to " + INBOX);
    console.log(`PASS  ${name}  ->  "${team.subject}"`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}: ${err.message}`);
  } finally {
    await page.close();
  }
}

async function bookFlow(page, tierPage, { quote }) {
  await page.goto(`${h.url}/book/${tierPage}`);
  await page.locator('input[name="book-goal"]').first().check();
  await page.click("[data-book-next]");
  await page.fill("#book-name", "Pat Client");
  await page.fill("#book-email", "lead@example.com");
  await page.fill("#book-business", "Client Co");
  await page.locator('[data-book-step="1"] [data-book-next]').click();
  if (quote) await page.check("#book-quote-first");
  await page.check("#book-consent");
  await page.click("#book-submit");
}

await check("Contact form", async (page) => {
  await page.goto(`${h.url}/contact.html`);
  await page.fill("#contact-name", "Jane Lead");
  await page.fill("#contact-email", "lead@example.com");
  await page.fill("#contact-business", "Acme Bakery");
  await page.fill("#contact-website", "https://acme.example");
  await page.selectOption("#contact-service", { index: 1 });
  await page.fill("#contact-challenge", "No inquiries from the site");
  await page.fill("#contact-outcome", "More bookings");
  await page.click("#contact-submit");
  await page.waitForSelector("#contact-status.is-success", { timeout: 5000 });
});

await check("Free Growth Audit", async (page) => {
  await page.goto(`${h.url}/growth-audit.html`);
  await page.fill("#first_name", "Sam");
  await page.fill("#last_name", "Owner");
  await page.fill("#email", "lead@example.com");
  await page.fill("#business_name", "Fit Studio");
  await page.click("#ga-next");
  await page.fill("#website", "https://fit.example");
  await page.click("#ga-next");
  await page.selectOption("#biggest_leak", { index: 3 });
  await page.selectOption("#desired_service", "not-sure");
  await page.click("#ga-next");
  await page.check('input[name="consent"]');
  await page.click("#ga-next");
  await page.waitForSelector('[data-step="5"]:not([hidden])', { timeout: 5000 });
});

for (const tier of [
  "gbp-content-refresh.html", "website-only.html", "website-content-half.html",
  "website-content-full.html", "content-growth-retainer.html", "full-growth-partner.html",
]) {
  await check(`Book ${tier} (checkout)`, async (page) => {
    await bookFlow(page, tier, { quote: false });
    await page.waitForURL(/buy\.stripe\.com/, { timeout: 5000 });
  });
  await check(`Book ${tier} (quote)`, async (page) => {
    await bookFlow(page, tier, { quote: true });
    await page.waitForSelector(".book-quote-success", { timeout: 5000 });
  });
}

await browser.close();
await h.close();
console.log(failures ? `\n${failures} form(s) failed` : "\nAll forms delivered to " + INBOX);
process.exit(failures ? 1 : 0);
