#!/usr/bin/env node
/**
 * Build local SEO location pages + HTML sitemap from data/locations.json
 * Output: locations/index.html, locations/<slug>.html, sitemap.html
 * Also refreshes location URLs inside sitemap.xml (preserves other entries).
 *
 * Run: node scripts/build-location-pages.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "locations");
const SITE = "https://www.swftstudios.com";

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function allLocations(data) {
  return data.regions.flatMap((region) =>
    region.locations.map((loc) => ({ ...loc, regionId: region.id, regionName: region.name }))
  );
}

function pageShell({ title, description, canonical, active, jsonLd, body, cssExtra = "" }) {
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
  <meta property="og:image" content="${SITE}/images/swft-thumbnail.webp">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/css/swft-nav.css">
  <link rel="stylesheet" href="/css/page-shell.css">
  <link rel="stylesheet" href="/css/locations-page.css">
  ${cssExtra}
  <link href="/images/favicon.webp" rel="shortcut icon" type="image/x-icon">
  ${jsonLd ? `<script type="application/ld+json">\n${jsonLd}\n  </script>` : ""}
</head>
<body class="ps-page locations-page">
  <div id="swft-nav" data-active="${escapeHtml(active)}"></div>
  <main>
    <div class="ps-shell">
${body}
    </div>
  </main>
  <script src="/js/swft-analytics.js" defer></script>
  <script src="/js/swft-nav.js" defer></script>
</body>
</html>
`;
}

function servicesBlock(services) {
  return `
        <section class="loc-services" aria-labelledby="loc-services-heading">
          <h2 id="loc-services-heading">What we offer locally</h2>
          <ul class="loc-service-list" role="list">
            ${services
              .map(
                (s) => `<li>
              <a href="${escapeHtml(s.href)}"><strong>${escapeHtml(s.name)}</strong></a>
              <p>${escapeHtml(s.blurb)}</p>
            </li>`
              )
              .join("")}
          </ul>
        </section>`;
}

function ctaBand(placeName) {
  return `
        <section class="ps-cta-band" aria-labelledby="loc-cta-heading">
          <h2 id="loc-cta-heading">Serving ${escapeHtml(placeName)} and nearby towns</h2>
          <p>Request a free Growth Audit and we will review your website, content, and Google Business Profile with three prioritized recommendations.</p>
          <div class="ps-cta-row">
            <a href="/growth-audit" class="button is-course w-inline-block">
              <div class="button_bg"></div>
              <div class="button_text">Get Your Free Growth Audit</div>
            </a>
            <a href="/contact.html" class="button is-course outlined w-inline-block">
              <div class="button_bg"></div>
              <div class="button_text">Start a Project</div>
            </a>
          </div>
        </section>`;
}

function relatedLinks(current, locations) {
  const sameRegion = locations.filter((l) => l.regionId === current.regionId && l.slug !== current.slug).slice(0, 6);
  if (!sameRegion.length) return "";
  return `
        <section class="loc-related" aria-labelledby="loc-related-heading">
          <h2 id="loc-related-heading">Nearby areas we serve</h2>
          <ul class="loc-chip-list" role="list">
            ${sameRegion
              .map((l) => `<li><a href="/locations/${escapeHtml(l.slug)}.html">${escapeHtml(l.name)}</a></li>`)
              .join("")}
            <li><a href="/locations/">All locations</a></li>
          </ul>
        </section>`;
}

function renderLocationPage(loc, data, locations) {
  const title = `${loc.name} Website Design & Content | SWFT Studios`;
  const description = `Websites, photo and video, and lead systems for ${loc.name}, ${loc.state} businesses. On-site capture and conversion-focused builds serving ${loc.region}.`;
  const canonical = `${SITE}/locations/${loc.slug}.html`;
  const neighborhoods = (loc.neighborhoods || [])
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join("");

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      name: "SWFT Studios",
      url: SITE + "/",
      email: "hello@swftstudios.com",
      areaServed: {
        "@type": "City",
        name: loc.name,
        containedInPlace: {
          "@type": "AdministrativeArea",
          name: `${loc.region}, ${loc.state}`,
        },
      },
      description: description,
      serviceType: ["Website design", "Photo and video content", "Local SEO", "Google Business Profile optimization"],
    },
    null,
    2
  );

  const body = `
      <nav class="loc-breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span aria-hidden="true">/</span>
        <a href="/locations/">Locations</a>
        <span aria-hidden="true">/</span>
        <span>${escapeHtml(loc.name)}</span>
      </nav>

      <header class="ps-hero ps-hero--left loc-hero">
        <p class="ps-eyebrow">${escapeHtml(loc.region)} · ${escapeHtml(loc.state)}</p>
        <h1 class="ps-title">${escapeHtml(loc.headline)}</h1>
        <p class="ps-lead">${escapeHtml(loc.lead)}</p>
      </header>

      <section class="loc-angle" aria-labelledby="loc-angle-heading">
        <h2 id="loc-angle-heading">Why local businesses in ${escapeHtml(loc.name)} work with us</h2>
        <p>${escapeHtml(loc.localAngle)}</p>
      </section>

      ${
        neighborhoods
          ? `<section class="loc-neighborhoods" aria-labelledby="loc-hoods-heading">
        <h2 id="loc-hoods-heading">Neighborhoods and corridors we know</h2>
        <ul class="loc-hood-list" role="list">${neighborhoods}</ul>
      </section>`
          : ""
      }

      ${servicesBlock(data.servicesOffered)}
      ${relatedLinks(loc, locations)}
      ${ctaBand(loc.name)}

      <footer class="ps-footer">
        <span>hello@swftstudios.com</span>
        <span>
          <a href="/locations/">All service areas</a>
          <a href="/sitemap.html">Site map</a>
          <a href="/contact.html">Contact</a>
        </span>
      </footer>`;

  return pageShell({
    title,
    description,
    canonical,
    active: "locations",
    jsonLd,
    body,
  });
}

function renderHub(data, locations) {
  const { hub } = data;
  const regionBlocks = data.regions
    .map((region) => {
      const links = region.locations
        .map(
          (loc) => `<li>
            <a href="/locations/${escapeHtml(loc.slug)}.html">
              <strong>${escapeHtml(loc.name)}</strong>
              <span>${escapeHtml(loc.state)} · ${escapeHtml(loc.region)}</span>
            </a>
            <p>${escapeHtml(loc.lead)}</p>
          </li>`
        )
        .join("");
      return `
        <section class="loc-region" id="${escapeHtml(region.id)}" aria-labelledby="region-${escapeHtml(region.id)}">
          <h2 id="region-${escapeHtml(region.id)}">${escapeHtml(region.name)}</h2>
          <p class="loc-region-summary">${escapeHtml(region.summary)}</p>
          <ul class="loc-card-list" role="list">${links}</ul>
        </section>`;
    })
    .join("");

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      name: "SWFT Studios",
      url: SITE + "/",
      email: "hello@swftstudios.com",
      areaServed: locations.map((l) => ({
        "@type": "City",
        name: l.name,
      })),
      description: hub.description,
    },
    null,
    2
  );

  const body = `
      <nav class="loc-breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span aria-hidden="true">/</span>
        <span>Locations</span>
      </nav>

      <header class="ps-hero ps-hero--left loc-hero">
        <p class="ps-eyebrow">Service areas</p>
        <h1 class="ps-title">${escapeHtml(hub.h1)}</h1>
        <p class="ps-lead">${escapeHtml(hub.lead)}</p>
      </header>

      <nav class="loc-region-jump" aria-label="Jump to region">
        ${data.regions
          .map((r) => `<a href="#${escapeHtml(r.id)}">${escapeHtml(r.name)}</a>`)
          .join("")}
      </nav>

      ${regionBlocks}
      ${servicesBlock(data.servicesOffered)}
      ${ctaBand("Jersey City, North Jersey, and NYC")}

      <footer class="ps-footer">
        <span>hello@swftstudios.com</span>
        <span>
          <a href="/sitemap.html">Site map</a>
          <a href="/contact.html">Contact</a>
        </span>
      </footer>`;

  return pageShell({
    title: hub.title,
    description: hub.description,
    canonical: `${SITE}/locations/`,
    active: "locations",
    jsonLd,
    body,
  });
}

function renderHtmlSitemap(data, locations) {
  const caseStudies = (() => {
    try {
      return readJson("data/case-studies-index.json");
    } catch {
      return [];
    }
  })();

  const primary = [
    { href: "/", label: "Home", note: "Main marketing homepage" },
    { href: "/growth-audit", label: "Free Growth Audit", note: "Primary lead capture" },
    { href: "/services.html", label: "Services", note: "Offer ladder overview" },
    { href: "/website-pricing.html", label: "Pricing", note: "Transparent project and retainer pricing" },
    { href: "/websites.html", label: "Our Work", note: "Website and content portfolio" },
    { href: "/case-studies.html", label: "Case Studies", note: "Project stories and insights" },
    { href: "/team.html", label: "Team", note: "Who builds the work" },
    { href: "/contact.html", label: "Contact", note: "Project inquiry form" },
    { href: "/locations/", label: "Locations", note: "Jersey City, North Jersey, and NYC service areas" },
  ];

  const book = [
    { href: "/book/", label: "Book a tier", note: "Stripe checkout hub" },
    { href: "/book/gbp-refresh.html", label: "Book GBP Content Refresh" },
    { href: "/book/website-only.html", label: "Book Website Only" },
    { href: "/book/website-content-half.html", label: "Book Website + Content" },
    { href: "/book/website-content-full.html", label: "Book Website + Extended Content" },
    { href: "/book/content-growth-retainer.html", label: "Book Content + Growth Retainer" },
    { href: "/book/full-growth-partner.html", label: "Book Full Growth Partner" },
  ];

  const more = [
    { href: "/apps.html", label: "Apps" },
    { href: "/media.html", label: "Media" },
    { href: "/videos.html", label: "Videos" },
    { href: "/resources.html", label: "Resources" },
    { href: "/tools.html", label: "Tools" },
    { href: "/swft-method.html", label: "SWFT Method" },
    { href: "/swft-tv.html", label: "SWFT TV" },
  ];

  function listBlock(items) {
    return `<ul class="sitemap-list" role="list">${items
      .map(
        (i) => `<li><a href="${escapeHtml(i.href)}">${escapeHtml(i.label)}</a>${
          i.note ? ` <span class="sitemap-note">${escapeHtml(i.note)}</span>` : ""
        }</li>`
      )
      .join("")}</ul>`;
  }

  const locationSections = data.regions
    .map((region) => {
      const items = region.locations.map((l) => ({
        href: `/locations/${l.slug}.html`,
        label: `${l.name}, ${l.state}`,
        note: l.region,
      }));
      return `<h3>${escapeHtml(region.name)}</h3>${listBlock(items)}`;
    })
    .join("");

  const caseItems = (Array.isArray(caseStudies) ? caseStudies : caseStudies.items || [])
    .map((c) => {
      const slug = c.slug || c.id;
      const name = c.title || c.name || slug;
      if (!slug) return null;
      return { href: `/case-study/${slug}.html`, label: name };
    })
    .filter(Boolean);

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "SWFT Studios site map",
      itemListElement: primary.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.label,
        url: SITE + (p.href === "/" ? "/" : p.href),
      })),
    },
    null,
    2
  );

  const body = `
      <header class="ps-hero ps-hero--left">
        <p class="ps-eyebrow">Site map</p>
        <h1 class="ps-title">Structured map of SWFT Studios</h1>
        <p class="ps-lead">A human and crawler friendly index of our public pages, local service areas, booking flows, and case studies. Machine readable URLs also live in <a href="/sitemap.xml">sitemap.xml</a>.</p>
      </header>

      <div class="sitemap-grid">
        <section aria-labelledby="sm-primary">
          <h2 id="sm-primary">Primary pages</h2>
          ${listBlock(primary)}
        </section>

        <section aria-labelledby="sm-locations">
          <h2 id="sm-locations">Local service areas</h2>
          <p class="sitemap-intro"><a href="/locations/">Locations hub</a> covering Jersey City, North Jersey, and New York City.</p>
          ${locationSections}
        </section>

        <section aria-labelledby="sm-book">
          <h2 id="sm-book">Booking and checkout</h2>
          ${listBlock(book)}
        </section>

        <section aria-labelledby="sm-more">
          <h2 id="sm-more">Additional pages</h2>
          ${listBlock(more)}
        </section>

        ${
          caseItems.length
            ? `<section aria-labelledby="sm-cases">
          <h2 id="sm-cases">Case studies</h2>
          ${listBlock(caseItems)}
        </section>`
            : ""
        }
      </div>

      <footer class="ps-footer">
        <span>hello@swftstudios.com</span>
        <span>
          <a href="/locations/">Locations</a>
          <a href="/contact.html">Contact</a>
        </span>
      </footer>`;

  return pageShell({
    title: "Site Map | SWFT Studios",
    description:
      "Structured site map of SWFT Studios: primary pages, Jersey City, North Jersey, and NYC location pages, booking flows, and case studies.",
    canonical: `${SITE}/sitemap.html`,
    active: "",
    jsonLd,
    body,
  });
}

function mergeSitemapXml(locations) {
  const xmlPath = join(ROOT, "sitemap.xml");
  let existing = "";
  try {
    existing = readFileSync(xmlPath, "utf8");
  } catch {
    existing = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;
  }

  const urlRegex = /<url>[\s\S]*?<\/url>/g;
  const urls = existing.match(urlRegex) || [];
  const kept = urls.filter((block) => !block.includes("/locations/") && !block.includes("/sitemap.html"));

  const extras = [
    `  <url><loc>${SITE}/sitemap.html</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
    `  <url><loc>${SITE}/locations/</loc><changefreq>monthly</changefreq><priority>0.85</priority></url>`,
    ...locations.map(
      (l) =>
        `  <url><loc>${SITE}/locations/${l.slug}.html</loc><changefreq>monthly</changefreq><priority>0.75</priority></url>`
    ),
  ];

  // Prefer inserting locations after contact if present
  const contactIdx = kept.findIndex((b) => b.includes("/contact.html"));
  const merged = [...kept];
  if (contactIdx >= 0) {
    merged.splice(contactIdx + 1, 0, ...extras);
  } else {
    merged.push(...extras);
  }

  // Deduplicate by loc
  const seen = new Set();
  const unique = [];
  for (const block of merged) {
    const m = block.match(/<loc>(.*?)<\/loc>/);
    const loc = m ? m[1] : block;
    if (seen.has(loc)) continue;
    seen.add(loc);
    unique.push(block.startsWith("  ") ? block : `  ${block}`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.join("\n")}\n</urlset>\n`;
}

function cleanOldLocationPages(validSlugs) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) {
    if (!file.endsWith(".html")) continue;
    if (file === "index.html") continue;
    const slug = file.replace(/\.html$/, "");
    if (!validSlugs.has(slug)) {
      unlinkSync(join(OUT_DIR, file));
    }
  }
}

function main() {
  const data = readJson("data/locations.json");
  const locations = allLocations(data);
  const slugs = new Set(locations.map((l) => l.slug));

  mkdirSync(OUT_DIR, { recursive: true });
  cleanOldLocationPages(slugs);

  writeFileSync(join(OUT_DIR, "index.html"), renderHub(data, locations));
  for (const loc of locations) {
    writeFileSync(join(OUT_DIR, `${loc.slug}.html`), renderLocationPage(loc, data, locations));
  }
  writeFileSync(join(ROOT, "sitemap.html"), renderHtmlSitemap(data, locations));
  writeFileSync(join(ROOT, "sitemap.xml"), mergeSitemapXml(locations));

  console.log(`Built locations hub + ${locations.length} area pages + sitemap.html`);
  console.log(`Updated sitemap.xml with location URLs`);
}

main();
