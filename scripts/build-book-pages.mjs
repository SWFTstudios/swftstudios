#!/usr/bin/env node
/**
 * Build Stripe booking pages from data/pricing.json
 * Output: book/<basename from bookUrl or id>.html + book/index.html
 *
 * Run: node scripts/build-book-pages.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "book");

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bookBasename(tier) {
  const raw = tier.bookUrl || `/book/${tier.id}.html`;
  const name = String(raw).replace(/^\/book\//, "").replace(/^\//, "");
  return name.endsWith(".html") ? name : `${name}.html`;
}

function collectTiers(data) {
  const project = (data.projectTiers && data.projectTiers.tiers) || [];
  const ongoing = (data.ongoingTiers && data.ongoingTiers.tiers) || [];
  return [...project, ...ongoing].filter((t) => t && t.id && t.stripe);
}

function renderIncludes(items) {
  if (!items || !items.length) return "";
  return (
    '<ul class="book-includes" role="list">' +
    items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") +
    "</ul>"
  );
}

function pageShell({ title, description, canonical, bodyClass, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="https://www.swftstudios.com/images/swft-thumbnail.webp">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/css/swft-nav.css">
  <link rel="stylesheet" href="/css/page-shell.css">
  <link rel="stylesheet" href="/css/contact-page.css">
  <link rel="stylesheet" href="/css/growth-audit.css">
  <link rel="stylesheet" href="/css/book-tier.css">
  <link href="/images/favicon.webp" rel="shortcut icon" type="image/x-icon">
</head>
<body class="${escapeHtml(bodyClass)}">
  <div id="swft-nav" data-active="pricing"></div>
  <main>
    <div class="ps-shell">
${body}
    </div>
  </main>
  <script src="/js/swft-analytics.js"></script>
  <script src="/js/swft-nav.js"></script>
</body>
</html>
`;
}

function renderTierPage(tier) {
  const stripe = tier.stripe;
  const title = `Book ${tier.name} | SWFT Studios`;
  const description = `${tier.description} Customize your request, then book the base at ${stripe.priceDisplay} or ask for a custom quote.`;
  const canonical = `https://www.swftstudios.com/book/${bookBasename(tier)}`;
  const modeLabel = stripe.mode === "subscription" ? "Monthly retainer" : "One-time project";
  const cta = stripe.ctaLabel || `Pay ${stripe.priceDisplay} to start`;

  const body = `
      <header class="ps-hero ps-hero--left book-page">
        <p class="ps-eyebrow">${escapeHtml(modeLabel)}</p>
        <h1 class="ps-title">Make <span class="ps-accent">${escapeHtml(tier.name)}</span> yours.</h1>
        <p class="ps-lead">Build a request that feels like your business. Choose the features, content and details you want, one step at a time.</p>
        <div class="book-price-chip" aria-label="Checkout amount">
          <strong>${escapeHtml(tier.priceLabel)}</strong>
          <span>${stripe.mode === "subscription" ? "Base monthly plan" : "Base project"} · Extra requests quoted separately</span>
        </div>
      </header>

      <div class="book-flow-progress" aria-label="Order progress">
        <span data-book-progress="0" aria-current="step">01 <b>Customize</b></span>
        <span data-book-progress="1">02 <b>Your business</b></span>
        <span data-book-progress="2">03 <b>Review</b></span>
      </div>
      <div class="book-grid">
        <aside class="book-inclusions" aria-label="Project details">
          <h2 class="ps-title" style="font-size:1.25rem;margin-bottom:1rem;">Good to know</h2>
          ${
            tier.scopeDriver
              ? `<p class="book-note">${escapeHtml(tier.scopeDriver)}</p>`
              : ""
          }
          <p class="book-note">${escapeHtml(stripe.billingNote || "")}</p>
          <p class="book-alt">Not sure this is the right fit? <a href="/growth-audit?plan=${encodeURIComponent(tier.id)}">Get a Free Growth Audit</a> or <a href="/website-pricing.html#${escapeHtml(tier.id)}">compare all pricing</a>.</p>
        </aside>

        <div class="ga-form-card book-order-panel">
          <div id="book-status" class="ga-status" role="alert" hidden></div>
          <form id="book-tier-form" data-tier-id="${escapeHtml(tier.id)}" data-base-price="${escapeHtml(stripe.priceDisplay)}" data-billing-mode="${escapeHtml(stripe.mode)}" novalidate>
            <section class="book-step" data-book-step="0" aria-label="Customize your order">
              <p class="book-step-kicker">01 / MAKE IT YOURS</p>
              <h2>What are we creating together?</h2>
              <p class="book-step-lead">Here is what you already get at the starting price. Then make it yours with extras, only if you need them.</p>
              <div class="book-base-included" aria-labelledby="book-base-heading">
                <div class="book-base-header">
                  <p class="book-base-eyebrow">YOUR BASE PACKAGE <span class="book-base-badge">Included</span></p>
                  <h3 id="book-base-heading">${escapeHtml(tier.name)}</h3>
                  <strong class="book-base-price">${escapeHtml(tier.priceLabel)}</strong>
                  <p class="book-base-intro">Everything below is part of your starting package — not an add-on.</p>
                </div>
                ${renderIncludes(tier.includes)}
                <p class="book-base-scope">${escapeHtml(tier.baseScopeNote || tier.scopeDriver || "We confirm the final included scope with you before work begins.")}</p>
              </div>
              <div id="book-configurator"></div>
              <div class="book-actions"><button type="button" class="book-action-primary" data-book-next>Continue to your details →</button></div>
            </section>
            <section class="book-step" data-book-step="1" aria-label="Your business details" hidden>
              <p class="book-step-kicker">02 / THE DETAILS</p>
              <h2>Tell us about your business</h2>
              <p class="book-step-lead">A few details help us make your order feel like yours.</p>
            <div class="ga-hp" aria-hidden="true">
              <label for="swft_hp_confirm">Leave blank</label>
              <input type="text" id="swft_hp_confirm" name="swft_hp_confirm" tabindex="-1" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" value="">
            </div>
            <div class="ga-field">
              <label for="book-name">Name <span class="req">*</span></label>
              <input type="text" id="book-name" name="name" required autocomplete="name" placeholder="Jane Smith">
            </div>
            <div class="ga-field">
              <label for="book-email">Email <span class="req">*</span></label>
              <input type="email" id="book-email" name="email" required autocomplete="email" placeholder="name@example.com">
            </div>
            <div class="ga-field">
              <label for="book-phone">Phone <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>
              <input type="tel" id="book-phone" name="phone" autocomplete="tel" placeholder="(201) 555-0123">
            </div>
            <div class="ga-field">
              <label for="book-business">Business name <span class="req">*</span></label>
              <input type="text" id="book-business" name="businessName" required autocomplete="organization" placeholder="Acme Corporation">
            </div>
            <div class="ga-field">
              <label for="book-website">Website or social</label>
              <input type="text" id="book-website" name="website" placeholder="https:// or @handle">
            </div>
            <div class="ga-field">
              <label for="book-timeline">When would you like to get started?</label>
              <select id="book-timeline" name="timeline"><option value="">Choose a timeline (optional)</option><option>As soon as possible</option><option>Within 2–4 weeks</option><option>Within 1–2 months</option><option>Just exploring</option></select>
            </div>
            <div class="ga-field">
              <label for="book-platform">Preferred platform (if applicable)</label>
              <select id="book-platform" name="platform"><option value="">Open to your recommendation</option><option>Webflow</option><option>Shopify</option><option>Keep my existing site</option><option>Not sure / not building a site</option></select>
            </div>
            <div class="ga-field">
              <label for="book-notes">Tell us what you&#39;re envisioning</label>
              <textarea id="book-notes" name="notes" rows="3" placeholder="Locations, timelines, content you already have…"></textarea>
            </div>
            <div class="book-actions"><button type="button" class="book-action-back" data-book-back>← Back</button><button type="button" class="book-action-primary" data-book-next>Review your order →</button></div>
            </section>
            <section class="book-step" data-book-step="2" aria-label="Review and confirm" hidden>
              <p class="book-step-kicker">03 / ALMOST THERE</p>
              <h2>Review your order</h2>
              <p class="book-step-lead">Make sure we have it right before sending your request.</p>
              <div class="book-base-review" aria-label="Included in your base package">
                <h3>Included in your base package <span>✓ No add-on charge</span></h3>
                ${renderIncludes(tier.includes)}
              </div>
              <div id="book-order-summary" aria-live="polite"></div>
              <label class="book-quote-option" for="book-quote-first"><input type="checkbox" id="book-quote-first"><span><strong>I&#39;d like a quote before paying</strong><small>No payment today. We&#39;ll review your request and email a scoped quote.</small></span></label>
              <p id="book-payment-explainer" class="book-payment-explainer"></p>
            <div class="ga-field">
              <label for="book-consent" style="text-transform:none;letter-spacing:0;font-weight:500;display:flex;gap:0.55rem;align-items:flex-start;line-height:1.4;">
                <input type="checkbox" id="book-consent" name="consent" required style="margin-top:0.2rem;flex:0 0 auto;width:auto;min-height:0;">
                <span id="book-consent-label">I understand this starts checkout at <strong>${escapeHtml(stripe.priceDisplay)}</strong> for the base ${stripe.mode === "subscription" ? "monthly plan" : "project"}; optional extras require my approval of a separate quote. <span class="req">*</span></span>
              </label>
            </div>
            <div class="book-actions"><button type="button" class="book-action-back" data-book-back>← Back</button>
            <button type="submit" id="book-submit" class="button is-course w-inline-block book-submit" style="flex:1;min-width:11rem;border:0;cursor:pointer;">
              <div class="button_bg"></div>
              <div class="button_text">${escapeHtml(cta)}</div>
            </button></div>
            </section>
          </form>
          <noscript><p class="book-note">JavaScript is needed to customize your order. <a href="/growth-audit">Tell us about your project here instead.</a></p></noscript>
        </div>
      </div>`;

  return pageShell({
    title,
    description,
    canonical,
    bodyClass: "ps-page book-page",
    body,
  }).replace(
    '<script src="/js/swft-nav.js"></script>\n</body>',
    '<script src="/js/swft-nav.js"></script>\n  <script src="/js/book-tier-form.js"></script>\n</body>'
  );
}

function renderIndex(tiers) {
  const cards = tiers
    .map((tier) => {
      const stripe = tier.stripe;
      return (
        `<a class="book-hub-card" href="${escapeHtml(bookBasename(tier))}">` +
        `<h2>${escapeHtml(tier.name)}</h2>` +
        `<div class="book-hub-price">${escapeHtml(tier.priceLabel)}</div>` +
        `${tier.priceNote ? `<p>${escapeHtml(tier.priceNote)}</p>` : ""}` +
        `<p>${escapeHtml(tier.description)}</p>` +
        `</a>`
      );
    })
    .join("\n");

  const body = `
      <header class="ps-hero ps-hero--left">
        <p class="ps-eyebrow">Stripe booking</p>
        <h1 class="ps-title">Choose your <span class="ps-accent">offer</span></h1>
        <p class="ps-lead">Each page collects your details and opens Stripe Checkout at the starting price for that tier.</p>
      </header>
      <div class="book-hub-grid">
${cards}
      </div>
      <p class="book-alt">Prefer a recommendation first? <a href="/growth-audit">Get a Free Growth Audit</a>.</p>
`;

  return pageShell({
    title: "Book a SWFT Offer | SWFT Studios",
    description:
      "Book GBP Content Refresh, Website Only, Website + Content, or a growth retainer with secure Stripe Checkout.",
    canonical: "https://www.swftstudios.com/book/",
    bodyClass: "ps-page book-page",
    body,
  });
}

function renderThankYou() {
  const body = `
      <header class="ps-hero ps-hero--left">
        <p class="ps-eyebrow">Payment received</p>
        <h1 class="ps-title">You&rsquo;re booked. We&rsquo;ll take it from here.</h1>
        <p class="ps-lead">Thanks for starting with SWFT. Check your email for a confirmation. We&rsquo;ll reach out within one business day to confirm scope and schedule.</p>
      </header>
      <div class="ga-steps">
        <article class="ga-step">
          <div class="ga-step-num">01</div>
          <h3>We review your intake</h3>
          <p>We confirm the tier, assets you already have, and the final scope and project total before work begins.</p>
        </article>
        <article class="ga-step">
          <div class="ga-step-num">02</div>
          <h3>We lock the schedule</h3>
          <p>Shoot dates (if needed), kickoff, and launch targets get scheduled with you directly.</p>
        </article>
        <article class="ga-step">
          <div class="ga-step-num">03</div>
          <h3>We build</h3>
          <p>Site, content, and GBP work moves according to the offer you selected.</p>
        </article>
      </div>
      <div class="ga-cal" style="margin-top:2rem;">
        <h2>Want a live kickoff call?</h2>
        <p>Optional — grab a time on the calendar if you want to talk through details sooner.</p>
        <a href="https://cal.com/swftstudios/swft-meeting" target="_blank" rel="noopener noreferrer" class="button is-course w-inline-block">
          <div class="button_bg"></div>
          <div class="button_text">Book a kickoff call</div>
        </a>
      </div>
      <p class="book-alt" style="margin-top:1.5rem;">Questions? <a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a></p>
`;

  return pageShell({
    title: "Booking Confirmed | SWFT Studios",
    description: "Your SWFT Stripe booking is confirmed. We'll follow up to lock scope and schedule.",
    canonical: "https://www.swftstudios.com/book/thank-you.html",
    bodyClass: "ps-page book-page ga-page",
    body,
  }).replace(
    '<meta name="description"',
    '<meta name="robots" content="noindex">\n  <meta name="description"'
  );
}

const pricing = readJson("data/pricing.json");
const tiers = collectTiers(pricing);
if (!tiers.length) {
  console.error("No tiers with stripe config found in data/pricing.json");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "index.html"), renderIndex(tiers));
writeFileSync(join(OUT_DIR, "thank-you.html"), renderThankYou());
for (const tier of tiers) {
  const file = bookBasename(tier);
  writeFileSync(join(OUT_DIR, file), renderTierPage(tier));
  console.log(`Wrote book/${file}`);
}

writeFileSync(
  join(OUT_DIR, "gbp-refresh.html"),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>GBP Content Refresh | SWFT Studios</title>
  <link rel="canonical" href="https://www.swftstudios.com/book/gbp-content-refresh.html">
  <meta http-equiv="refresh" content="0;url=/book/gbp-content-refresh.html">
  <script>location.replace("/book/gbp-content-refresh.html" + location.search);</script>
</head>
<body>
  <p>This offer is at <a href="/book/gbp-content-refresh.html">GBP Content Refresh</a>.</p>
</body>
</html>
`
);
console.log("Wrote book/gbp-refresh.html (redirect to gbp-content-refresh.html)");
console.log(`Wrote book/index.html and book/thank-you.html (${tiers.length} tiers)`);
