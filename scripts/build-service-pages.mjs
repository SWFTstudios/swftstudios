#!/usr/bin/env node
/**
 * Builds the service pages and service cards from data/services.json:
 *
 *   /<slug>.html                → one page per service (software, apps,
 *                                 websites, ai-employees, automations,
 *                                 marketing, content)
 *   services.html  svc:groups   → Build / Automate / Grow cards
 *   pricing.html   svc:pricing  → investment cards (one per service)
 *
 * Published prices come from data/pricing.json (`pricingOffers` ids).
 *
 *   npm run build:services
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.swftstudios.com";
const BOOK_URL = "https://cal.com/swftstudios/swft-meeting";
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const strip = (html) => String(html).replace(/<[^>]+>/g, "");

// Stroke icons (24px grid, currentColor). Same set as js/swft-nav.js.
export const ICONS = {
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  browser: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M6.5 7h.01M9 7h.01"/>',
  sparkle: '<path d="M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5 8.4 8z"/><path d="M17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  megaphone: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>',
  video: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 11 6-3.5v9L15 13"/>',
};
export const icon = (name, cls = "sv-icon") =>
  `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg></span>`;

const CHECK =
  '<svg class="sv-check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" opacity=".14"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function investment(level) {
  const n = Math.max(1, Math.min(4, Number(level) || 1));
  const signs = Array.from({ length: 4 }, (_, i) => `<span${i < n ? ' class="is-on"' : ""}>$</span>`).join("");
  return `<span class="sv-invest" aria-label="Investment level ${n} of 4"><span class="sv-invest__label">Investment</span><span class="sv-invest__signs" aria-hidden="true">${signs}</span></span>`;
}

function offerIndex(pricing) {
  const map = {};
  for (const cat of pricing.categories) for (const s of cat.services) for (const o of s.offers) map[o.id] = o;
  return map;
}

function offerHref(o) {
  return `/pricing.html${/\/mo\b/.test(o.priceLabel || "") ? "?billing=monthly" : ""}#${o.id}`;
}

function serviceCard(s) {
  return [
    `<a class="sv-card" href="/${s.slug}.html" data-mf-reveal>`,
    `  ${icon(s.icon)}`,
    `  <span class="sv-card__body"><span class="sv-card__title">${esc(s.name)}</span><span class="sv-card__line">${esc(s.menuLine)}</span></span>`,
    `  <span class="sv-card__foot"><span class="mf-label mf-label--muted">${esc(s.priceNote)}</span><span class="mf-row__icon" aria-hidden="true">↗</span></span>`,
    `</a>`,
  ].join("\n");
}

function groupsBlock(data) {
  return data.groups
    .map((g) => {
      const cards = data.services.filter((s) => s.group === g.id).map((s) => serviceCard(s)).join("\n");
      return [
        `<div class="sv-group" id="${g.id}">`,
        `  <div class="sv-group__head"><p class="mf-label">(${esc(g.label)})</p><p class="sv-group__tag">${esc(g.tagline)}</p></div>`,
        `  <div class="sv-cards">`,
        cards,
        `  </div>`,
        `</div>`,
      ].join("\n");
    })
    .join("\n");
}

function includesList(items, limit) {
  return `<ul class="sv-includes">${items
    .slice(0, limit || items.length)
    .map((t) => `<li>${CHECK}<span>${esc(t)}</span></li>`)
    .join("")}</ul>`;
}

function pricingCard(s) {
  return [
    `<article class="sv-price" id="svc-${s.slug}">`,
    `  <div class="sv-price__top">${icon(s.icon)}${investment(s.investment)}</div>`,
    `  <h3 class="sv-price__title">${esc(s.name)}</h3>`,
    `  <p class="sv-price__lead">${esc(strip(s.lead))}</p>`,
    `  <p class="mf-label mf-label--muted sv-price__label">What&rsquo;s included</p>`,
    `  ${includesList(s.includes, 4)}`,
    `  <div class="sv-price__foot">`,
    `    <span class="sv-price__note">${esc(s.priceNote)}</span>`,
    `    <div class="mf-actions"><a class="mf-btn mf-btn--sm" href="/contact.html?service=${s.slug}">Get a quote</a><a class="mf-btn mf-btn--sm mf-btn--ghost" href="/${s.slug}.html">Details</a></div>`,
    `  </div>`,
    `</article>`,
  ].join("\n");
}

function pricingBlock(data) {
  return `<div class="sv-prices">\n${data.services.map(pricingCard).join("\n")}\n</div>`;
}

function page(s, data, offers) {
  const group = data.groups.find((g) => g.id === s.group);
  const url = `${SITE}/${s.slug}.html`;
  const priced = (s.pricingOffers || []).map((id) => offers[id]).filter(Boolean);
  const related = (s.related || []).map((slug) => data.services.find((x) => x.slug === slug)).filter(Boolean);

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: s.name,
      serviceType: s.name,
      description: s.description,
      url,
      provider: { "@type": "ProfessionalService", name: "SWFT Studios", url: `${SITE}/` },
      areaServed: ["New York City", "North Jersey", "Jersey City"],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: s.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Services", item: `${SITE}/services.html` },
        { "@type": "ListItem", position: 3, name: s.name, item: url },
      ],
    },
  ];

  const outcomes = s.outcomes
    .map((o, i) => `<li class="mf-step" data-mf-reveal><p class="mf-label mf-label--muted">(0${i + 1})</p><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p></li>`)
    .join("\n          ");
  const steps = s.steps
    .map((o, i) => `<li class="mf-step" data-mf-reveal><p class="mf-label mf-label--muted">(${String.fromCharCode(65 + i)})</p><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p></li>`)
    .join("\n          ");
  const offerCards = priced.length
    ? `<ul class="mf-offers sv-offers">${priced
        .map((o) => `<li><a class="mf-offer" href="${offerHref(o)}"><b>${esc(o.name)}</b><span>${esc(o.priceLabel)}</span>${o.description ? `<p>${esc(o.description)}</p>` : ""}</a></li>`)
        .join("")}</ul>`
    : "";
  const faq = s.faq.map((f) => `<details><summary>${esc(f.q)}</summary><div><p>${esc(f.a)}</p></div></details>`).join("\n          ");
  const relatedCards = related.map((r) => serviceCard(r)).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <!-- Generated by scripts/build-service-pages.mjs from data/services.json. Edit the data, then run: npm run build:services -->
  <title>${esc(s.title)}</title>
  <meta name="description" content="${esc(s.description)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${esc(s.title)}">
  <meta property="og:description" content="${esc(s.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/images/swft-thumbnail.webp">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/css/swft-nav.css?v=20261103-services">
  <link rel="stylesheet" href="/css/services.css?v=20261103-services">
  <link href="/images/favicon.webp" rel="shortcut icon" type="image/x-icon">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body class="mf-page">
  <div id="swft-nav" data-active="services"></div>

  <main id="main">
    <section class="mf-hero mf-hero--page" aria-labelledby="svc-title">
      <div class="mf-wrap">
        <div class="mf-hero__top">
          <p class="mf-label sv-crumb"><a href="/services.html">Services</a> <span aria-hidden="true">/</span> ${esc(group.label)} <span aria-hidden="true">/</span> ${esc(s.name)}</p>
          <a class="mf-pill" href="${BOOK_URL}" target="_blank" rel="noopener" data-mf-booking><span class="mf-dot" aria-hidden="true"></span>Booking now<span data-mf-next></span></a>
        </div>
        <div class="sv-hero">
          ${icon(s.icon, "sv-icon sv-icon--lg")}
          <h1 class="mf-h1" id="svc-title">${s.h1}</h1>
        </div>
        <p class="mf-lead">${s.lead}</p>
        <div class="mf-actions mf-statement__actions">
          <a class="mf-btn" href="${BOOK_URL}" target="_blank" rel="noopener">Book a free strategy call <span class="mf-arrow" aria-hidden="true">↗</span></a>
          <a class="mf-btn mf-btn--ghost" href="/contact.html?service=${s.slug}">Get a quote</a>
        </div>
      </div>
    </section>

    <section class="mf-section mf-section--tight" aria-labelledby="outcomes-title">
      <div class="mf-wrap">
        <div class="mf-head">
          <p class="mf-label">(What changes)</p>
          <h2 class="mf-h2" id="outcomes-title">What you get</h2>
        </div>
        <ol class="mf-steps">
          ${outcomes}
        </ol>
      </div>
    </section>

    <section class="mf-section mf-section--tight" aria-labelledby="included-title">
      <div class="mf-wrap">
        <div class="mf-head">
          <p class="mf-label">(Scope)</p>
          <h2 class="mf-h2" id="included-title">What&rsquo;s included</h2>
        </div>
        ${includesList(s.includes)}
      </div>
    </section>

    <section class="mf-section mf-section--tight" aria-labelledby="process-title">
      <div class="mf-wrap">
        <div class="mf-head">
          <p class="mf-label">(How it works)</p>
          <h2 class="mf-h2" id="process-title">Four steps, no <span class="mf-script">guesswork.</span></h2>
        </div>
        <ol class="mf-steps">
          ${steps}
        </ol>
      </div>
    </section>

    <section class="mf-section mf-section--tight" id="pricing" aria-labelledby="invest-title">
      <div class="mf-wrap">
        <div class="sv-investbox" data-mf-reveal>
          <div class="sv-investbox__head">
            <div>
              <p class="mf-label">(Investment)</p>
              <h2 class="mf-h3" id="invest-title">${esc(s.priceNote)}</h2>
            </div>
            ${investment(s.investment)}
          </div>
          ${offerCards}
          <div class="mf-actions">
            <a class="mf-btn" href="/contact.html?service=${s.slug}">Get a quote <span class="mf-arrow" aria-hidden="true">↗</span></a>
            <a class="mf-btn mf-btn--ghost" href="/pricing.html#svc-${s.slug}">All pricing</a>
          </div>
        </div>
      </div>
    </section>

    <section class="mf-section mf-section--tight" aria-labelledby="faq-title">
      <div class="mf-wrap">
        <div class="mf-head">
          <p class="mf-label">(FAQ)</p>
          <h2 class="mf-h2" id="faq-title">Questions</h2>
        </div>
        <div class="mf-faq">
          ${faq}
        </div>
      </div>
    </section>

    <section class="mf-section mf-section--tight" aria-labelledby="related-title">
      <div class="mf-wrap">
        <div class="mf-head">
          <p class="mf-label">(Works well with)</p>
          <h2 class="mf-h2" id="related-title">Related services</h2>
        </div>
        <div class="sv-cards">
${relatedCards}
        </div>
      </div>
    </section>

    <section class="mf-section mf-section--tight" aria-labelledby="cta-title">
      <div class="mf-wrap">
        <div class="mf-band" data-mf-reveal>
          <p class="mf-label">(Free strategy call)</p>
          <h2 class="mf-h2" id="cta-title">Not sure where to <span class="mf-script">start?</span></h2>
          <p class="mf-body">Book a free 30-minute call. We&rsquo;ll look at how customers find you, book you and come back, and send you a plan you can use with or without us.</p>
          <div class="mf-actions">
            <a class="mf-btn" href="${BOOK_URL}" target="_blank" rel="noopener">Book a free strategy call <span class="mf-arrow" aria-hidden="true">↗</span></a>
            <a class="mf-btn mf-btn--ghost" href="/services.html">All services</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script src="/js/swft-analytics.js?v=20260930b" defer></script>
  <script src="/js/swft-nav.js?v=20261103-services" defer></script>
</body>
</html>
`;
}

function splice(html, name, content) {
  const start = `<!-- svc:${name}:start -->`;
  const end = `<!-- svc:${name}:end -->`;
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  if (a === -1 || b === -1) return html;
  return html.slice(0, a + start.length) + "\n" + content + "\n" + html.slice(b);
}

function validate(data, offers) {
  const groups = new Set(data.groups.map((g) => g.id));
  const slugs = new Set(data.services.map((s) => s.slug));
  const errors = [];
  for (const s of data.services) {
    if (!groups.has(s.group)) errors.push(`${s.slug}: unknown group "${s.group}"`);
    if (!ICONS[s.icon]) errors.push(`${s.slug}: unknown icon "${s.icon}"`);
    for (const id of s.pricingOffers || []) if (!offers[id]) errors.push(`${s.slug}: unknown pricing offer "${id}"`);
    for (const r of s.related || []) if (!slugs.has(r)) errors.push(`${s.slug}: unknown related service "${r}"`);
    for (const k of ["name", "menuLine", "title", "description", "h1", "lead", "priceNote"]) if (!s[k]) errors.push(`${s.slug}: missing ${k}`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = json("data/services.json");
  const offers = offerIndex(json("data/pricing.json"));
  validate(data, offers);
  for (const s of data.services) {
    writeFileSync(join(ROOT, `${s.slug}.html`), page(s, data, offers));
    console.log("wrote", `${s.slug}.html`);
  }
  for (const [file, name, build] of [
    ["services.html", "groups", () => groupsBlock(data)],
    ["pricing.html", "pricing", () => pricingBlock(data)],
  ]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const html = readFileSync(path, "utf8");
    const next = splice(html, name, build());
    if (next !== html) {
      writeFileSync(path, next);
      console.log("updated", file);
    }
  }
}
