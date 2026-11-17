/**
 * Customer journey in a real browser, mobile first then desktop, against the
 * real pages and API handlers with every outside service mocked (no Stripe
 * charge, no real lead, no calendar booking).
 *
 *   Home → search → build package → add/remove extras → cart → checkout (mock Stripe)
 *   Service page → contact form → success, plus the failure and double-tap paths
 *
 *   npm run test:funnel:browser      (CHROMIUM_PATH=… to use a preinstalled Chromium)
 */
import { createRequire } from "node:module";
import { startHarness } from "../forms/harness.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const h = await startHarness();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const VIEWPORTS = [
  ["mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ["desktop", { viewport: { width: 1366, height: 900 } }],
];
let failures = 0;
const text = (s) => String(s || "").replace(/\s+/g, " ").trim();
function expect(cond, msg) { if (!cond) throw new Error(msg); }

async function check(name, opts, fn) {
  h.reset();
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); // no third parties in tests
  try {
    await fn(page);
    expect(!errors.length, "page errors: " + errors.join(" | "));
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}: ${err.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}
const summary = async (page) => text(await page.locator("#swb-summary").innerText());

for (const [label, opts] of VIEWPORTS) {
  await check(`[${label}] home → search finds the builder`, opts, async (page) => {
    await page.goto(`${h.url}/index.html`);
    await page.locator("[data-swft-search-open]:visible").first().click();
    await page.locator("#swft-search-input").fill("landing page");
    await page.locator("#swft-search-results a").first().waitFor();
    const hrefs = await page.locator("#swft-search-results a").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
    expect(hrefs.some((x) => /build\.html\?service=websites/.test(x)), "no builder result: " + hrefs.join(", "));
  });

  await check(`[${label}] builder total includes extras; cart and Stripe match`, opts, async (page) => {
    // Start from a search deep link (service + goal), as customers do.
    await page.goto(`${h.url}/build.html?service=websites&goal=landing&utm_source=qa`);
    await page.locator('[data-tier="website-only"]').click();
    expect((await summary(page)).includes("$400"), "base price missing");
    await page.locator("#swb-next").click();
    await page.locator('[data-extra="extra-pages"]').click();
    let s = await summary(page);
    expect(/Additional website page/.test(s), "extra not listed: " + s);
    expect(/One-time total \$575/.test(s), "total should be $575: " + s);
    expect(/Estimated due today \$575/.test(s), "Website Only is paid in full, due today should be $575: " + s);
    expect(!/Remaining balance/.test(s), "no balance on a paid-in-full package");
    await page.locator('[data-extra="extra-pages"]').click();
    s = await summary(page);
    expect(/One-time total \$400/.test(s) && !/Additional website page/.test(s), "removing extra should return to $400: " + s);
    await page.locator('[data-extra="extra-pages"]').click();
    expect((await page.locator('[data-extra="extra-pages"]').getAttribute("aria-pressed")) === "true", "toggle state not exposed");
    await page.locator("#swb-add-cart").click();
    await page.waitForURL(/\/cart\.html/);
    await page.locator("[data-cart-summary] .cart-sum__row--due").waitFor();
    const cart = text(await page.locator("[data-cart-summary]").innerText());
    expect(/Packages \$400/.test(cart) && /Extras \$175/.test(cart) && /One-time total \$575/.test(cart), "cart breakdown: " + cart);
    expect(/Due today \$575/.test(cart), "cart due today should match builder: " + cart);
    expect(!/50% deposit/.test(text(await page.locator("main").innerText())), "cart still claims a 50% deposit");

    // Back to the builder keeps the selections.
    await page.goBack();
    await page.locator("#swb-summary dl").first().waitFor();
    s = await summary(page);
    expect(/Additional website page/.test(s) && /\$575/.test(s), "back navigation erased selections: " + s);
    await page.goForward();

    await page.fill("#cart-email", "qa@example.com");
    await page.locator("#cart-pay").click();
    await page.waitForURL(/order-confirmed\.html\?session_id=cs_test_mock/);
    expect(h.stripe.length === 1, "expected one mock Stripe session, got " + h.stripe.length);
    const st = h.stripe[0];
    expect(st["line_items[0][price_data][unit_amount]"] === "40000" && st["line_items[1][price_data][unit_amount]"] === "17500", "Stripe amounts: " + JSON.stringify(st));
  });

  await check(`[${label}] deposit package shows deposit and balance in builder and cart`, opts, async (page) => {
    await page.goto(`${h.url}/build.html?service=websites`);
    await page.locator('[data-scenario="business"], [data-scenario]').first().waitFor();
    const scenarios = await page.locator("[data-scenario]").evaluateAll((b) => b.map((x) => x.getAttribute("data-scenario")));
    // Find a scenario that offers the Website + Content Capture package.
    let found = false;
    for (const id of scenarios) {
      await page.goto(`${h.url}/build.html?service=websites&goal=${id}`);
      if (await page.locator('[data-tier="website-content-half"]').count()) { found = true; break; }
    }
    expect(found, "no scenario offers website-content-half");
    await page.locator('[data-tier="website-content-half"]').click();
    await page.locator("#swb-next").click();
    await page.locator('[data-extra="extra-photos"]').click();
    const s = await summary(page);
    expect(/One-time total \$2,100/.test(s) && /Estimated due today \$1,050/.test(s) && /Remaining balance \$1,050/.test(s), "deposit math: " + s);
    await page.locator("#swb-add-cart").click();
    await page.waitForURL(/\/cart\.html/);
    await page.locator("[data-cart-summary] .cart-sum__row--due").waitFor();
    const cart = text(await page.locator("[data-cart-summary]").innerText());
    expect(/Due today \$1,050/.test(cart) && /Balance, invoiced before delivery \$1,050/.test(cart), "cart deposit: " + cart);
    expect(/Pay deposit/.test(await page.locator("#cart-pay").innerText()), "deposit cart should say Pay deposit");
  });

  await check(`[${label}] builder works from the keyboard`, opts, async (page) => {
    await page.goto(`${h.url}/build.html?service=websites&goal=landing`);
    await page.locator('[data-tier="website-only"]').focus();
    await page.keyboard.press("Enter");
    await page.locator("#swb-next").focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-extra="extra-pages"]').focus();
    await page.keyboard.press("Space");
    expect(/\$575/.test(await summary(page)), "keyboard toggle did not update total");
  });

  await check(`[${label}] service page → contact form → success (one request on double tap)`, opts, async (page) => {
    await page.goto(`${h.url}/contact.html?service=websites&utm_source=qa_test&utm_campaign=funnel`);
    expect(await page.locator('#contact-service input[value="Websites"]').isChecked(), "?service=websites did not preselect Website");
    await page.locator("#contact-submit").click();
    await page.locator("#contact-status.is-error").waitFor();
    expect(h.contactRequests.length === 0, "empty form must not submit");
    await page.fill("#contact-name", "QA Customer");
    await page.fill("#contact-email", "qa@example.com");
    await page.fill("#contact-business", "[SWFT TEST] Local Fitness Studio");
    await page.fill("#contact-challenge", "[SWFT TEST - IGNORE] Automated QA, not a real lead.");
    await page.locator("#contact-submit").dblclick();
    await page.locator("#contact-status.is-success").waitFor();
    expect(h.contactRequests.length === 1, "double tap sent " + h.contactRequests.length + " requests");
    const sent = h.contactRequests[0];
    expect(sent.utmSource === "qa_test" && sent.utmCampaign === "funnel", "UTM not preserved: " + JSON.stringify(sent));
    expect(/^\[TEST\]/.test(h.emails.find((e) => e.to.includes("hello@swftstudios.com")).subject), "test lead not tagged");
  });

  await check(`[${label}] contact delivery failure is reported honestly and keeps the inquiry`, opts, async (page) => {
    await page.goto(`${h.url}/contact.html?service=websites`);
    h.failResend(10);
    await page.fill("#contact-name", "QA Customer");
    await page.fill("#contact-email", "qa@example.com");
    await page.fill("#contact-challenge", "[SWFT TEST] failure path");
    await page.locator("#contact-submit").click();
    await page.locator("#contact-status.is-error").waitFor();
    const msg = text(await page.locator("#contact-status").innerText());
    expect(/couldn't send/i.test(msg) && /hello@swftstudios\.com/.test(msg), "error copy: " + msg);
    expect((await page.inputValue("#contact-challenge")) === "[SWFT TEST] failure path", "inquiry text was cleared after a failure");
    expect(!(await page.locator("#contact-status.is-success").count()), "showed success after failure");
    expect(await page.locator("#contact-submit").isEnabled(), "button stays disabled after failure");
  });

  await check(`[${label}] checkout failure (even a plain-text error page) offers a call`, opts, async (page) => {
    await page.goto(`${h.url}/build.html?service=websites&goal=landing`);
    await page.locator('[data-tier="website-only"]').click();
    await page.locator("#swb-next").click();
    await page.locator("#swb-add-cart").click();
    await page.waitForURL(/\/cart\.html/);
    await page.route("**/api/checkout", (r) => r.fulfill({ status: 502, contentType: "text/plain", body: "error code: 502" }));
    await page.fill("#cart-email", "qa@example.com");
    await page.locator("#cart-pay").click();
    await page.locator("#cart-status.is-error").waitFor();
    const msg = text(await page.locator("#cart-status").innerText());
    expect(/couldn't start/i.test(msg) && /Book a call/.test(msg), "cart error copy: " + msg);
    expect(await page.locator("#cart-pay").isEnabled(), "pay button stays disabled after failure");
  });

  await check(`[${label}] free call links go to Cal.com`, opts, async (page) => {
    await page.goto(`${h.url}/build.html`);
    const hrefs = await page.locator('a[href*="cal.com"]').evaluateAll((a) => a.map((x) => x.href));
    expect(hrefs.length && hrefs.every((x) => x.startsWith("https://cal.com/swftstudios/")), "cal links: " + hrefs);
  });
}

await browser.close();
await h.close();
console.log(failures ? `\n${failures} journey check(s) failed` : "\nAll journey checks passed");
process.exit(failures ? 1 : 0);
