#!/usr/bin/env node
/**
 * Writes the data-driven blocks of the Mono pages from JSON, so crawlers and
 * no-JS visitors get real HTML and the 3D carousel (js/project-carousel.js)
 * reads its cards straight from the markup.
 *
 *   data/portfolio-projects.json → project tiles + filter chips
 *                                  (index.html, work.html)
 *   data/pricing.json            → numbered services list with offers
 *                                  (index.html, services.html)
 *   data/case-studies-index.json → blog cards (blog.html)
 *
 * Each block lives between <!-- mono:<name>:start --> and
 * <!-- mono:<name>:end --> markers. Run after editing any of those files:
 *
 *   npm run build:mono
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const json = (p) => JSON.parse(read(p));

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Short filter names for portfolio categories
export const CATEGORY_LABELS = {
  ecommerce: "E-commerce",
  service: "Websites",
  app: "Apps",
  content: "Content & film",
};

export function publicProjects(projects) {
  return projects
    .filter((p) => p.public !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

function projectTiles(projects) {
  return publicProjects(projects)
    .map((p, i) => {
      const label = CATEGORY_LABELS[p.category] || p.categoryLabel || "";
      const summary = p.highlight || p.description || "";
      return [
        `<a class="mf-tile" href="/case-study/${esc(p.slug)}.html" data-category="${esc(p.category)}" data-label="${esc(label)}" data-summary="${esc(summary)}" data-mf-cursor="View">`,
        `  <div class="mf-tile__media"><img src="/${esc(p.image)}" alt="${esc(p.name)} project preview" loading="${i < 4 ? "eager" : "lazy"}" decoding="async"></div>`,
        `  <div class="mf-tile__row"><h3 class="mf-tile__title">${esc(p.name)}</h3><span class="mf-label mf-label--muted">${esc(label)}</span></div>`,
        `  <p>${esc(summary)}</p>`,
        `</a>`,
      ].join("\n");
    })
    .join("\n");
}

function projectFilters(projects) {
  const list = publicProjects(projects);
  const counts = {};
  list.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
  const chip = (key, label, n, on) =>
    `<button type="button" class="mf-chip" data-filter="${key}" aria-pressed="${on}">${esc(label)} <span class="mf-chip-count">${n}</span></button>`;
  return [chip("all", "All", list.length, true)]
    .concat(
      Object.keys(CATEGORY_LABELS)
        .filter((k) => counts[k])
        .map((k) => chip(k, CATEGORY_LABELS[k], counts[k], false))
    )
    .join("\n");
}

function offerHref(offer) {
  const monthly = /\/mo\b/.test(offer.priceLabel || "");
  return `/pricing.html${monthly ? "?billing=monthly" : ""}#${offer.id}`;
}

function fromPrice(service) {
  const once = service.offers.find((o) => !/\/mo\b/.test(o.priceLabel || "")) || service.offers[0];
  return (once.priceLabel || "").replace(/^Starting at /i, "From ");
}

function servicesList(pricing, detailed = false) {
  let n = 0;
  return pricing.categories
    .map((cat) => {
      const rows = cat.services
        .map((s) => {
          n += 1;
          const num = String(n).padStart(2, "0");
          const panelId = `svc-${s.id}`;
          const offers = s.offers
            .map(
              (o) =>
                `<li><a class="mf-offer" href="${offerHref(o)}"><b>${esc(o.name)}</b><span>${esc(o.priceLabel)}</span>` +
                (detailed && o.description ? `<p>${esc(o.description)}</p>` : "") +
                `</a></li>`
            )
            .join("");
          return [
            `<li id="${esc(s.id)}">`,
            `  <button type="button" class="mf-row" aria-expanded="false" aria-controls="${panelId}">`,
            `    <span class="mf-row__num">(${num})</span>`,
            `    <span class="mf-row__title">${esc(s.name)}</span>`,
            `    <span class="mf-row__desc">${esc(s.summary)}</span>`,
            `    <span class="mf-row__meta"><span class="mf-row__price">${esc(fromPrice(s))}</span><span class="mf-row__icon" aria-hidden="true">+</span></span>`,
            `  </button>`,
            `  <div class="mf-row__panel" id="${panelId}" hidden>`,
            `    <ul class="mf-offers">${offers}</ul>`,
            `  </div>`,
            `</li>`,
          ].join("\n");
        })
        .join("\n");
      return `<li class="mf-list__group"><p class="mf-label mf-label--muted">(${esc(cat.label)}) ${esc(cat.tagline)}</p></li>\n${rows}`;
    })
    .join("\n");
}

function blogCards(index) {
  return index
    .filter((e) => e.type === "tips")
    .map((e) => {
      const slug = e.slug;
      return [
        `<a class="mf-card" href="/blog/${esc(slug)}.html" data-mf-reveal>`,
        `  <p class="mf-label">(Guide · 2026)</p>`,
        `  <h3>${esc(e.name)}</h3>`,
        `  <p>${esc(e.details)}</p>`,
        `  <span class="mf-card__foot"><span class="mf-label mf-label--muted">Read the guide</span><span class="mf-row__icon" aria-hidden="true">↗</span></span>`,
        `</a>`,
      ].join("\n");
    })
    .join("\n");
}

function splice(html, name, content) {
  const start = `<!-- mono:${name}:start -->`;
  const end = `<!-- mono:${name}:end -->`;
  let from = 0;
  for (;;) {
    const a = html.indexOf(start, from);
    const b = html.indexOf(end, a);
    if (a === -1 || b === -1) return html;
    html = html.slice(0, a + start.length) + "\n" + content + "\n" + html.slice(b);
    from = html.indexOf(end, a) + end.length;
  }
}

function projectIndex(projects) {
  return publicProjects(projects)
    .map((p, i) => {
      const label = CATEGORY_LABELS[p.category] || p.categoryLabel || "";
      return [
        `<li>`,
        `  <a class="mf-row mf-index-row" href="/case-study/${esc(p.slug)}.html">`,
        `    <span class="mf-row__num">(${String(i + 1).padStart(2, "0")})</span>`,
        `    <span class="mf-row__title">${esc(p.name)}</span>`,
        `    <span class="mf-row__desc">${esc(p.highlight || p.description || "")}</span>`,
        `    <span class="mf-row__meta"><span class="mf-row__price">${esc(label)}</span><span class="mf-row__icon" aria-hidden="true">↗</span></span>`,
        `    <span class="mf-index-row__thumb" aria-hidden="true"><img src="/${esc(p.image)}" alt="" loading="lazy" decoding="async"></span>`,
        `  </a>`,
        `</li>`,
      ].join("\n");
    })
    .join("\n");
}

const BLOCKS = {
  "project-tiles": () => projectTiles(json("data/portfolio-projects.json")),
  "project-filters": () => projectFilters(json("data/portfolio-projects.json")),
  "project-index": () => projectIndex(json("data/portfolio-projects.json")),
  services: () => servicesList(json("data/pricing.json")),
  "services-detailed": () => servicesList(json("data/pricing.json"), true),
  "blog-cards": () => blogCards(json("data/case-studies-index.json")),
};

const FILES = ["index.html", "work.html", "services.html", "blog.html"];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of FILES) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    let html = readFileSync(path, "utf8");
    const before = html;
    for (const [name, build] of Object.entries(BLOCKS)) html = splice(html, name, build());
    if (html !== before) {
      writeFileSync(path, html);
      console.log("updated", file);
    }
  }
}
