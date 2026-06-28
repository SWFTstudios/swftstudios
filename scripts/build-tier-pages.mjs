#!/usr/bin/env node
/**
 * Build tier detail pages from data/pricing.json + swft-method + weekend JSON
 * Output: pricing/{tier-id}/index.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET = '../../';
const CAL_DEFAULT = 'https://cal.com/swftstudios/swft-meeting';

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('en-US');
}

function buildCaseStudyMap(index) {
  const map = new Map();
  index.forEach((item) => map.set(item.slug, item));
  return map;
}

function renderCaseStudies(caseStudies, csMap, warnings) {
  if (!caseStudies?.length) return '';
  const cards = caseStudies
    .map((cs) => {
      const meta = csMap.get(cs.slug);
      if (!meta) {
        warnings.push(`Case study slug not found: ${cs.slug}`);
        return '';
      }
      const img = meta.image.startsWith('http') ? meta.image : ASSET + meta.image;
      const href = ASSET + meta.href;
      const metric = meta.metric ? `<p class="td-case-metric">${escapeHtml(meta.metric)}</p>` : '';
      return (
        `<a class="td-case-card" href="${escapeHtml(href)}">` +
        `<img src="${escapeHtml(img)}" alt="${escapeHtml(meta.name)}" loading="lazy" width="800" height="450">` +
        `<div class="td-case-body">` +
        `<h3>${escapeHtml(cs.headline || meta.name)}</h3>` +
        metric +
        `<p class="td-case-why">${escapeHtml(cs.whyMatch)}</p>` +
        `</div></a>`
      );
    })
    .filter(Boolean)
    .join('');
  if (!cards) return '';
  return `<div class="td-case-grid">${cards}</div>`;
}

function renderList(items, warnClass) {
  if (!items?.length) return '';
  return (
    `<ul class="td-list${warnClass ? ' td-list--warn' : ''}" role="list">` +
    items.map((i) => `<li>${escapeHtml(i)}</li>`).join('') +
    '</ul>'
  );
}

function renderSteps(process) {
  if (!process?.steps?.length) return '';
  return (
    `<div class="td-steps">` +
    process.steps
      .map(
        (step, i) =>
          `<article class="td-step">` +
          `<div class="td-step-num">${String(i + 1).padStart(2, '0')}</div>` +
          `<h3>${escapeHtml(step.name)}</h3>` +
          `<p>${escapeHtml(step.description)}</p>` +
          `</article>`
      )
      .join('') +
    `</div>`
  );
}

function renderIncludesBlock(title, items) {
  if (!items?.length) return '';
  return (
    `<article class="td-includes-card">` +
    `<h3>${escapeHtml(title)}</h3>` +
    renderList(items) +
    `</article>`
  );
}

function renderWhoSection(tier) {
  const w = tier.whoItsFor;
  if (!w) return '';
  return (
    `<section class="td-section td-wrap" aria-labelledby="td-who-heading">` +
    `<div class="td-container">` +
    `<p class="td-eyebrow">Who it's for</p>` +
    `<h2 id="td-who-heading" class="td-h2">Is ${escapeHtml(tier.name)} right for you?</h2>` +
    `<p class="td-lead">${escapeHtml(w.intro)}</p>` +
    `<div class="td-includes-grid" style="margin-top:1.5rem;">` +
    `<div><h3 class="td-h2" style="font-size:1.05rem;">Ideal for</h3>${renderList(w.idealFor)}</div>` +
    `<div><h3 class="td-h2" style="font-size:1.05rem;">Not the best fit if</h3>${renderList(w.notIdealFor, true)}</div>` +
    `</div></div></section>`
  );
}

function renderProcessSection(tier) {
  if (!tier.process) return '';
  return (
    `<section class="td-section td-wrap" aria-labelledby="td-process-heading">` +
    `<div class="td-container">` +
    `<p class="td-eyebrow">What's involved</p>` +
    `<h2 id="td-process-heading" class="td-h2">${escapeHtml(tier.process.title)}</h2>` +
    renderSteps(tier.process) +
    `</div></section>`
  );
}

function renderProofSection(tier, csMap, warnings) {
  const grid = renderCaseStudies(tier.caseStudies, csMap, warnings);
  if (!grid) return '';
  return (
    `<section class="td-section td-wrap" aria-labelledby="td-proof-heading">` +
    `<div class="td-container">` +
    `<p class="td-eyebrow">Proof</p>` +
    `<h2 id="td-proof-heading" class="td-h2">See it in action</h2>` +
    `<p class="td-lead">Real SWFT projects that match this tier's scope and outcomes.</p>` +
    grid +
    `</div></section>`
  );
}

function renderNotIncluded(tier) {
  if (!tier.notIncluded?.length) return '';
  return (
    `<p class="td-not-included"><strong>Not included:</strong> ${escapeHtml(tier.notIncluded.join(' · '))}</p>`
  );
}

function renderCompare(tier) {
  if (!tier.compareUpgrade) return '';
  return (
    `<p class="td-compare">Need more? Compare with <a href="${escapeHtml(tier.compareUpgrade.path)}">${escapeHtml(tier.compareUpgrade.label)}</a>.</p>`
  );
}

function renderStandardIncludes(tier) {
  const hasOneTime = tier.oneTimeIncludes?.length;
  const hasMonthly = tier.monthlyIncludes?.length;
  const singleMonthly = hasMonthly && !hasOneTime;

  let gridClass = 'td-includes-grid';
  if (singleMonthly) gridClass += ' td-includes-grid--single';

  let inner = '';
  if (hasOneTime) inner += renderIncludesBlock('One-time build', tier.oneTimeIncludes);
  if (hasMonthly) inner += renderIncludesBlock(singleMonthly ? "What's included each month" : 'Monthly management', tier.monthlyIncludes);
  if (tier.includes?.length) inner += renderIncludesBlock("What's included", tier.includes);

  return (
    `<section class="td-section td-wrap" aria-labelledby="td-includes-heading">` +
    `<div class="td-container">` +
    `<p class="td-eyebrow">Scope</p>` +
    `<h2 id="td-includes-heading" class="td-h2">What's included</h2>` +
    `<div class="${gridClass}">${inner}</div>` +
    renderNotIncluded(tier) +
    renderCompare(tier) +
    `</div></section>`
  );
}

function renderHeroPrices(tier) {
  const blocks = [];
  if (tier.oneTime != null) {
    blocks.push(
      `<div class="td-price-block"><strong>${formatMoney(tier.oneTime)}</strong><span>one-time build</span></div>`
    );
  }
  if (tier.oneTimeLabel) {
    blocks.push(
      `<div class="td-price-block"><strong>${escapeHtml(tier.oneTimeLabel)}</strong><span>one-time</span></div>`
    );
  }
  if (tier.monthly != null) {
    blocks.push(
      `<div class="td-price-block"><strong>${formatMoney(tier.monthly)}/mo</strong><span>monthly management</span></div>`
    );
  }
  if (tier.setup != null && tier.monthly != null) {
    blocks.push(
      `<div class="td-price-block"><strong>${formatMoney(tier.setup)} setup</strong><span>+ ${formatMoney(tier.monthly)}/mo retainer</span></div>`
    );
  }
  if (!blocks.length) return '';
  return `<div class="td-price-row">${blocks.join('')}</div>`;
}

function renderSwftMethodPlans(tier) {
  if (!tier.plans?.length) return '';
  return tier.plans
    .map((plan) => {
      const featClass = plan.badge ? ' td-plan-block--featured' : '';
      const badge = plan.badge ? `<span class="td-badge">${escapeHtml(plan.badge)}</span> ` : '';
      const addon = plan.addon
        ? `<p class="td-not-included" style="margin-top:1rem;"><strong>Optional:</strong> ${escapeHtml(plan.addon.name)} — ${formatMoney(plan.addon.price)}/mo. ${escapeHtml(plan.addon.description)}</p>`
        : '';
      return (
        `<article class="td-plan-block${featClass}" id="${escapeHtml(plan.anchor)}">` +
        badge +
        `<h3 class="td-h2" style="font-size:1.25rem;margin-top:0.5rem;">${escapeHtml(plan.name)}</h3>` +
        `<p class="td-lead">${escapeHtml(plan.sub)}</p>` +
        `<div class="td-price-block" style="display:inline-block;margin:1rem 0;"><strong>${escapeHtml(plan.priceLabel)}</strong></div>` +
        renderList(plan.includes) +
        addon +
        `</article>`
      );
    })
    .join('');
}

function renderFeatureAddons(tier) {
  if (!tier.featureAddons?.length) return '';
  const rows = tier.featureAddons
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.name)}</td><td>+${formatMoney(f.price)}</td></tr>`
    )
    .join('');
  return (
    `<section class="td-section td-wrap">` +
    `<div class="td-container td-container--narrow">` +
    `<h2 class="td-h2">Feature add-ons (One-Time Build)</h2>` +
    `<p class="td-lead">Selected during your build plan. Total capped at ${formatMoney(tier.plans?.[0]?.priceCap || 2500)}.</p>` +
    `<table class="td-addon-table"><thead><tr><th>Feature</th><th>Add-on</th></tr></thead><tbody>${rows}</tbody></table>` +
    `</div></section>`
  );
}

function renderWeekendAddons(tier) {
  if (!tier.optionalAddons?.length) return '';
  return (
    `<section class="td-section td-wrap">` +
    `<div class="td-container td-container--narrow">` +
    `<h2 class="td-h2">Optional add-ons</h2>` +
    renderList(tier.optionalAddons) +
    `</div></section>`
  );
}

function renderHero(tier, calUrl) {
  const platform = tier.platform
    ? `<span class="td-badge td-badge--ghost">${escapeHtml(tier.platform)}</span>`
    : '';
  const badge = tier.badge ? `<span class="td-badge">${escapeHtml(tier.badge)}</span>` : '';
  const ghl = tier.ghl
    ? `<span class="td-badge td-badge--ghost">${escapeHtml(tier.ghlLabel || 'Includes GoHighLevel')}</span>`
    : '';
  const desc = tier.cardDescription || tier.description || '';
  const cta = tier.cta || 'Book a Discovery Call';
  const orderLink =
    tier.orderUrl
      ? `<a href="${ASSET}${tier.orderUrl.replace(/^\//, '')}" class="td-btn-ghost">${escapeHtml(tier.id === 'swft-method' ? 'Start build plan' : 'Get started')}</a>`
      : '';
  const landingLink =
    tier.landingPath
      ? `<a href="${ASSET}${tier.landingPath.replace(/^\//, '')}" class="td-btn-ghost">Trainer landing page</a>`
      : '';

  return (
    `<header class="td-hero td-wrap">` +
    `<div class="td-container">` +
    `<nav class="td-breadcrumb" aria-label="Breadcrumb">` +
    `<a href="${ASSET}website-pricing.html">Pricing</a> / <span>${escapeHtml(tier.name)}</span>` +
    `</nav>` +
    `<div class="td-hero-meta">${badge}${platform}${ghl}</div>` +
    `<h1 class="td-h1">${escapeHtml(tier.name)}</h1>` +
    `<p class="td-lead">${escapeHtml(desc)}</p>` +
    renderHeroPrices(tier) +
    `<div class="td-cta-row">` +
    `<a href="${escapeHtml(calUrl)}" target="_blank" rel="noopener noreferrer" class="td-btn-primary">${escapeHtml(cta)}</a>` +
    orderLink +
    landingLink +
    `<a href="${ASSET}website-pricing.html" class="td-btn-ghost">All pricing</a>` +
    `</div></div></header>`
  );
}

function renderBookCta(calUrl, bookCta) {
  const headline = bookCta?.headline || "Ready to get started?";
  const sub = bookCta?.sub || "Book a free discovery call and we'll match you to the right scope.";
  const btn = bookCta?.button || "Book a Discovery Call";
  return (
    `<section class="td-book td-wrap" aria-labelledby="td-book-heading">` +
    `<div class="td-container td-container--narrow">` +
    `<h2 id="td-book-heading" class="td-h2">${escapeHtml(headline)}</h2>` +
    `<p class="td-lead td-lead--center" style="margin:0 auto 1.25rem;text-align:center;">${escapeHtml(sub)}</p>` +
    `<a href="${escapeHtml(calUrl)}" target="_blank" rel="noopener noreferrer" class="td-btn-primary">${escapeHtml(btn)}</a>` +
    `</div></section>`
  );
}

function buildJsonLd(tier, canonical) {
  const price = tier.monthly ?? tier.oneTime ?? tier.setup;
  if (price == null && !tier.oneTimeLabel) return '';
  const priceVal = tier.monthly ?? tier.oneTime ?? tier.setup;
  return (
    `<script type="application/ld+json">` +
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: tier.name,
      description: tier.cardDescription || tier.description,
      provider: { '@type': 'Organization', name: 'SWFT Studios', url: 'https://www.swftstudios.com/' },
      offers: priceVal
        ? {
            '@type': 'Offer',
            price: String(priceVal),
            priceCurrency: 'USD',
            url: canonical,
          }
        : undefined,
    }) +
    `</script>`
  );
}

function buildPageHtml(tier, options) {
  const { csMap, warnings, calUrl, bookCta } = options;
  const canonical = `https://www.swftstudios.com${tier.detailPath}`;
  const metaDesc = (tier.cardDescription || tier.description || '').slice(0, 160);

  let body = renderHero(tier, calUrl || tier.calUrl || CAL_DEFAULT);
  body += renderWhoSection(tier);
  body += renderProcessSection(tier);

  if (tier.pageType === 'multi-plan') {
    body +=
      `<section class="td-section td-wrap" aria-labelledby="td-plans-heading">` +
      `<div class="td-container">` +
      `<p class="td-eyebrow">Plans</p>` +
      `<h2 id="td-plans-heading" class="td-h2">Choose how you want to work with us</h2>` +
      renderSwftMethodPlans(tier) +
      renderNotIncluded(tier) +
      renderCompare(tier) +
      `</div></section>`;
    body += renderFeatureAddons(tier);
  } else {
    body += renderStandardIncludes(tier);
    body += renderWeekendAddons(tier);
  }

  body += renderProofSection(tier, csMap, warnings);
  body += renderBookCta(calUrl || tier.calUrl || CAL_DEFAULT, bookCta);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(tier.name)} — What's Included | SWFT Studios</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(tier.name)} | SWFT Studios">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary_large_image">
  <link href="${ASSET}images/favicon.webp" rel="shortcut icon" type="image/x-icon">
  <link href="${ASSET}css/normalize.css" rel="stylesheet">
  <link href="${ASSET}css/swft-nav.css" rel="stylesheet">
  <link href="${ASSET}css/tier-detail.css" rel="stylesheet">
  ${buildJsonLd(tier, canonical)}
</head>
<body class="td-page">
  <div id="swft-nav" data-active="pricing"></div>
  <main>${body}</main>
  <footer class="td-footer td-wrap">
    <div class="td-container td-footer-inner">
      <span>&copy; SWFT Studios</span>
      <nav aria-label="Footer">
        <a href="${ASSET}website-pricing.html">Pricing</a>
        <a href="${ASSET}services.html">Services</a>
        <a href="${ASSET}case-studies.html">Case studies</a>
      </nav>
    </div>
  </footer>
  <script src="${ASSET}js/swft-nav.js" defer></script>
</body>
</html>`;
}

function writeTierPage(tier, options) {
  if (!tier.detailPath) {
    options.warnings.push(`Tier "${tier.id}" missing detailPath — skipped`);
    return;
  }
  const slug = tier.detailPath.replace(/^\/pricing\//, '').replace(/\/$/, '');
  const dir = join(ROOT, 'pricing', slug);
  mkdirSync(dir, { recursive: true });
  const html = buildPageHtml(tier, options);
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  console.log(`  wrote pricing/${slug}/index.html`);
}

function collectTiers(pricing, swftMethod, weekend) {
  const tiers = [];
  pricing.websiteDevelopment.tiers.forEach((t) => tiers.push(t));
  pricing.contentCreation.tiers.forEach((t) => tiers.push(t));
  tiers.push({ ...pricing.bundle, id: pricing.bundle.id });
  tiers.push(swftMethod);
  tiers.push(weekend);
  return tiers;
}

const warnings = [];
const pricing = readJson('data/pricing.json');
const swftMethod = readJson('data/swft-method-pricing.json');
const weekend = readJson('data/website-in-a-weekend-pricing.json');
const caseIndex = readJson('data/case-studies-index.json');
const csMap = buildCaseStudyMap(caseIndex);

const options = {
  csMap,
  warnings,
  calUrl: pricing.calUrl || CAL_DEFAULT,
  bookCta: pricing.bookCta,
};

console.log('Building tier detail pages…');
collectTiers(pricing, swftMethod, weekend).forEach((tier) => writeTierPage(tier, options));

if (warnings.length) {
  console.warn('\nWarnings:');
  warnings.forEach((w) => console.warn('  -', w));
}

console.log(`\nDone. ${collectTiers(pricing, swftMethod, weekend).length} tiers processed.`);
