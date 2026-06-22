#!/usr/bin/env node
/**
 * Build portfolio marquee, work gallery, and case study pages from data/portfolio-projects.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const projects = JSON.parse(readFileSync(join(ROOT, 'data/portfolio-projects.json'), 'utf8'));
const template = readFileSync(join(ROOT, 'case-study/hawthorne-global-ministries.html'), 'utf8');

function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildRichText(p) {
  const outcomeWord = p.outcomeType === 'storefront' ? 'storefront' : 'website';
  const challengeList = p.challenge.map((c) => `<li>${escapeHtml(c)}</li>`).join('\n');
  const builtList = p.built.map((b) => `<li>${escapeHtml(b)}</li>`).join('\n');
  const impactList = p.impact.map((i) => `<li>${escapeHtml(i)}</li>`).join('\n');
  const scorecards = p.scorecard
    .map(
      (s) => `
                                    <div style="margin: 0 0 1.5rem 0;">
                                      <p><strong>${escapeHtml(s.label)}</strong>: ${s.before} to ${s.after} / 100</p>
                                      <div style="max-width: 26rem;">
                                        <div style="height: 0.5rem; width: ${s.before}%; background: rgba(255,255,255,0.25); margin-bottom: 0.35rem;"></div>
                                        <div style="height: 0.5rem; width: ${s.after}%; background: #9fe870;"></div>
                                      </div>
                                    </div>`
    )
    .join('');

  return `
<h2>The Bottom Line</h2>
<p>${escapeHtml(p.bottomLine)}</p>
<h2>Who They Are</h2>
<p>${escapeHtml(p.whoTheyAre)}</p>
<h2>The Challenge</h2>
<ul>
${challengeList}
</ul>
<h2>What We Built</h2>
<ul>
${builtList}
</ul>
<h2>The Impact</h2>
<p>The ${outcomeWord} at <a href="${p.liveUrl}" target="_blank" rel="noopener">${domain(p.liveUrl)}</a> now delivers measurable improvements for the business and its customers.</p>
<ul>
${impactList}
</ul>
<h2>Growth Scorecard</h2>
<p><em>SWFT strategic scoring based on the pre-launch audit and the final launch experience. These numbers represent readiness improvement on a 100-point scale, not claimed analytics from a private client dashboard.</em></p>
${scorecards}
<h2>Why This Matters For Your Business</h2>
<p>${escapeHtml(p.whyMatters)}</p>
<div class="cs-cta-block">
  <h3>Ready for results like this?</h3>
  <p>See the live project or start building your own with SWFT Studios.</p>
  <div class="cs-cta-actions">
    <a href="${p.liveUrl}" target="_blank" rel="noopener" class="swft-btn is-primary">View Website</a>
    <a href="../website-pricing.html" class="swft-btn is-outline">Start a Project</a>
  </div>
</div>`;
}

function servicesLabel(p) {
  const services = [];
  if (p.branding) services.push('Branding');
  if (p.website) services.push('Website');
  if (p.film) services.push('Film');
  return services.join(', ') || 'Digital';
}

function marqueeSpans(name, count = 8) {
  return Array(count)
    .fill(`<span>${escapeHtml(name)}</span>`)
    .join('');
}

function buildCaseStudySection(p, prev, next) {
  return `
      <section class="section_gallery cs-detail">
        <div class="cs-hero-marquee" aria-hidden="true">
          <div class="cs-hero-marquee-track">
            ${marqueeSpans(p.name)}
            ${marqueeSpans(p.name)}
          </div>
        </div>
        <figure class="cs-cover">
          <img src="../${p.image}" loading="eager" alt="${escapeHtml(p.name)}" width="1600" height="900">
        </figure>
        <div class="cs-scroll-cue" aria-hidden="true">
          Scroll Down
          <span class="cs-scroll-arrow">↓</span>
        </div>
        <div class="padding-global">
          <div class="container-large">
            <div class="padding-section-large">
              <div class="cs-back-link">
                <a href="../case-studies.html" class="swft-btn is-text">← Back to Resources</a>
              </div>
              <div class="cs-layout">
                <aside class="cs-sidebar">
                  <dl>
                    <div>
                      <dt>Client</dt>
                      <dd>${escapeHtml(p.name)}</dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>${escapeHtml(p.categoryLabel)}</dd>
                    </div>
                    <div>
                      <dt>Services</dt>
                      <dd>${escapeHtml(servicesLabel(p))}</dd>
                    </div>
                    <div>
                      <dt>Website</dt>
                      <dd><a href="${p.liveUrl}" target="_blank" rel="noopener">${domain(p.liveUrl)}</a></dd>
                    </div>
                  </dl>
                </aside>
                <div class="cs-body">
                  <div class="uui-text-rich-text w-richtext">
${buildRichText(p)}
                  </div>
                </div>
              </div>
              <nav class="cs-prev-next" aria-label="Case study navigation">
                ${
                  prev
                    ? `<a href="${prev.slug}.html" class="cs-prev">
                  <span class="cs-nav-label">Previous</span>
                  <span class="cs-nav-title">${escapeHtml(prev.name)}</span>
                </a>`
                    : '<div></div>'
                }
                ${
                  next
                    ? `<a href="${next.slug}.html" class="cs-next">
                  <span class="cs-nav-label">Next</span>
                  <span class="cs-nav-title">${escapeHtml(next.name)}</span>
                </a>`
                    : '<div></div>'
                }
              </nav>
            </div>
          </div>
        </div>
      </section>`;
}

function buildCaseStudyPage(p, prev, next) {
  let html = template;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(p.name)} Case Study | SWFT Studios</title>`);
  html = html.replace(
    /<meta content="[^"]*Case Study \| SWFT Studios" property="og:title">/,
    `<meta content="${escapeHtml(p.name)} Case Study | SWFT Studios" property="og:title">`
  );
  html = html.replace(
    /<meta content="[^"]*Case Study \| SWFT Studios" property="twitter:title">/,
    `<meta content="${escapeHtml(p.name)} Case Study | SWFT Studios" property="twitter:title">`
  );

  html = html.replace(/Hawthorne Global Ministries/g, p.name);
  html = html.replace(/hawthorne-global-ministries/g, p.slug);
  html = html.replace(/Videos &amp; Insights/g, 'Resources');
  html = html.replace(/Videos & Insights/g, 'Resources');

  html = html.replace(
    /<div class="background_image-wrappe"><img src="\.\.\/images\/[^"]+" loading="eager" alt="[^"]*" class="background_image">/,
    `<div class="background_image-wrappe"><img src="../${p.image}" loading="eager" alt="${escapeHtml(p.name)}" class="background_image">`
  );

  const sectionStart = html.indexOf('<section class="section_gallery');
  const sectionEnd = html.indexOf('</section>', sectionStart) + '</section>'.length;
  if (sectionStart !== -1 && sectionEnd > sectionStart) {
    html = html.slice(0, sectionStart) + buildCaseStudySection(p, prev, next) + html.slice(sectionEnd);
  }

  if (!html.includes('swft-buttons.css')) {
    html = html.replace(
      '<link href="../css/swftstudios000.css" rel="stylesheet" type="text/css">',
      '<link href="../css/swftstudios000.css" rel="stylesheet" type="text/css">\n  <link href="../css/swft-buttons.css" rel="stylesheet" type="text/css">'
    );
  }

  if (!html.includes('case-study.css')) {
    html = html.replace(
      '<link href="../css/swftstudios000.css" rel="stylesheet" type="text/css">',
      '<link href="../css/swftstudios000.css" rel="stylesheet" type="text/css">\n  <link href="../css/case-study.css" rel="stylesheet" type="text/css">'
    );
  }

  const gsapTag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/gsap.min.js"></script>';
  if (!html.includes('case-study-scroll.js')) {
    html = html.replace(
      gsapTag,
      `${gsapTag}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/ScrollTrigger.min.js"></script>
  <script src="../js/case-study-scroll.js" defer></script>`
    );
  } else if (!html.includes('ScrollTrigger')) {
    html = html.replace(
      gsapTag,
      `${gsapTag}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.4/ScrollTrigger.min.js"></script>`
    );
  }

  const floatingCta = `
  <a href="${p.liveUrl}" target="_blank" rel="noopener" class="cs-floating-cta swft-btn is-primary" aria-label="View ${escapeHtml(p.name)} website">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    View Website
  </a>`;

  if (!html.includes('cs-floating-cta')) {
    html = html.replace('</body>', `${floatingCta}\n</body>`);
  } else {
    html = html.replace(/<a href="[^"]*" target="_blank" rel="noopener" class="cs-floating-cta[\s\S]*?<\/a>/, floatingCta.trim());
  }

  html = html.replace(/class="button-2 bigger-padding slide-into-view w-button"/g, 'class="swft-btn is-primary is-lg slide-into-view"');

  return html;
}

function marqueeImageAttrs(p) {
  const src = p.image;
  const isJpg = /\.jpe?g$/i.test(src);
  const isPng = src.endsWith('.png');
  const hasVariants =
    !isJpg && !isPng && src.endsWith('.webp') && existsSync(join(ROOT, src.replace('.webp', '-p-500.webp')));

  if (hasVariants) {
    const base = src.replace('.webp', '');
    return {
      sizes: 'sizes="(max-width: 3600px) 100vw, 3600px"',
      srcset: `srcset="${base}-p-500.webp 500w, ${base}-p-800.webp 800w, ${base}-p-1080.webp 1080w, ${base}-p-1600.webp 1600w, ${base}-p-2000.webp 2000w, ${base}-p-2600.webp 2600w, ${base}-p-3200.webp 3200w, ${src} 3600w"`,
    };
  }
  if (isJpg) {
    return {
      sizes: 'sizes="(max-width: 3024px) 100vw, 3024px"',
      srcset: `srcset="${src} 500w, ${src} 800w, ${src} 1080w, ${src} 1600w, ${src} 2000w, ${src} 2600w, ${src} 3024w"`,
    };
  }
  return {
    sizes: 'sizes="(max-width: 1440px) 100vw, 1440px"',
    srcset: `srcset="${src} 500w, ${src} 800w, ${src} 1080w, ${src} 1440w"`,
  };
}

function marqueeItemSimple(p) {
  const src = p.image;
  const { sizes, srcset } = marqueeImageAttrs(p);
  return `<a href="case-study/${p.slug}.html" aria-label="${escapeHtml(p.name)} case study" class="projects_marquee-item w-inline-block"><img ${sizes} ${srcset} alt="${escapeHtml(p.name)}" loading="lazy" src="${src}" class="project_marquee-img"></a>`;
}

function marqueeItemTrack(p) {
  const src = p.image;
  const { sizes, srcset } = marqueeImageAttrs(p);
  return `<a href="case-study/${p.slug}.html" aria-label="${escapeHtml(p.name)} case study" class="marquee-list w-inline-block">
                        <div class="marquee-item">
                          <div class="marquee-image"><img ${sizes} ${srcset} alt="${escapeHtml(p.name)}" src="${src}" loading="lazy" class="photo"></div>
                        </div>
                      </a>`;
}

function galleryItem(p) {
  return `                    <div class="gallery_item" data-category="${p.category}" data-name="${escapeHtml(p.name)}" data-order="${p.order}">
                      <a href="case-study/${p.slug}.html" class="gallery_image-wrapper w-inline-block"><img src="${p.image}" loading="lazy" alt="${escapeHtml(p.name)}" class="gallery_image"></a>
                      <div class="gallery_content-wrapper">
                        <div class="margin-bottom">
                          <div class="gallery_category">${escapeHtml(p.categoryLabel)}</div>
                          <h3 class="text-size-small">${escapeHtml(p.name)}</h3>
                        </div>
                      </div>
                    </div>`;
}

function filterBarHtml() {
  return `                <!-- SWFT custom: do not overwrite on Webflow import -->
                <div class="work-filter-bar" role="toolbar" aria-label="Filter and sort projects">
                  <div class="work-filter-buttons">
                    <button type="button" class="work-filter-btn swft-btn is-outline is-sm is-active" data-filter="all" aria-pressed="true">All</button>
                    <button type="button" class="work-filter-btn swft-btn is-outline is-sm" data-filter="ecommerce" aria-pressed="false">Ecommerce Brands</button>
                    <button type="button" class="work-filter-btn swft-btn is-outline is-sm" data-filter="service" aria-pressed="false">Service Pro Websites</button>
                    <button type="button" class="work-filter-btn swft-btn is-outline is-sm" data-filter="app" aria-pressed="false">App Landing Pages</button>
                  </div>
                  <div class="work-sort">
                    <label for="work-sort-select">Sort by</label>
                    <select id="work-sort-select" aria-label="Sort projects">
                      <option value="featured">Featured</option>
                      <option value="name-asc">Name A-Z</option>
                      <option value="name-desc">Name Z-A</option>
                    </select>
                  </div>
                </div>`;
}

// --- Case study pages ---
const sortedProjects = [...projects].sort((a, b) => a.order - b.order);
for (let i = 0; i < sortedProjects.length; i++) {
  const p = sortedProjects[i];
  const prev = i > 0 ? sortedProjects[i - 1] : null;
  const next = i < sortedProjects.length - 1 ? sortedProjects[i + 1] : null;
  const out = join(ROOT, 'case-study', `${p.slug}.html`);
  writeFileSync(out, buildCaseStudyPage(p, prev, next));
  console.log('Case study:', out);
}

// --- Update index.html marquee ---
let indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const marqueeListItems = projects.map(marqueeItemSimple).join('\n                        ');
const trackItems = projects.concat(projects).map(marqueeItemTrack).join('\n                      ');

indexHtml = indexHtml.replace(
  /<div class="projects_marquee-list">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="marquee-wrapper">/,
  `<div class="projects_marquee-list">\n                        ${marqueeListItems}\n                      </div>\n                    </div>\n                  </div>\n                  <div class="marquee-wrapper">`
);

indexHtml = indexHtml.replace(
  /<div class="marquee-track">[\s\S]*?<\/div>\s*<\/div>\s*<div class="explore-button-wrapper">/,
  `<div class="marquee-track">\n                      ${trackItems}\n                    </div>\n                  </div>\n                  <div class="explore-button-wrapper">`
);

// Update View All to websites.html
indexHtml = indexHtml.replace(
  /<a href="contact\.html" target="_blank" class="button is-course w-inline-block">\s*<div class="button_bg"><\/div>\s*<div class="button_text">View All<\/div>\s*<\/a>/,
  `<a href="websites.html" class="button is-course w-inline-block">\n                          <div class="button_bg"></div>\n                          <div class="button_text">View All</div>\n                        </a>`
);

writeFileSync(join(ROOT, 'index.html'), indexHtml);
console.log('Updated index.html marquee');

// --- Update websites.html gallery ---
let websitesHtml = readFileSync(join(ROOT, 'websites.html'), 'utf8');
const galleryBlock = filterBarHtml() + '\n                <div class="collection-list-wrapper">\n                  <div class="gallery_list">\n' + projects.map(galleryItem).join('\n') + '\n                    <!-- end SWFT custom -->\n                  </div>\n                </div>';

websitesHtml = websitesHtml.replace(
  /<div class="margin-bottom margin-small">\s*<h2 class="text-size-small text-weight-normal">Work Gallery<\/h2>\s*<\/div>\s*<div class="collection-list-wrapper">[\s\S]*?<!-- end SWFT custom -->\s*<\/div>\s*<\/div>/,
  `<div class="margin-bottom margin-small">\n                  <h2 class="text-size-small text-weight-normal">Work Gallery</h2>\n                </div>\n${galleryBlock}`
);

// Add CSS/JS links if missing
if (!websitesHtml.includes('work-filter.css')) {
  websitesHtml = websitesHtml.replace(
    '<link href="css/swft-nav.css" rel="stylesheet" type="text/css">',
    '<link href="css/swft-nav.css" rel="stylesheet" type="text/css">\n  <!-- SWFT custom: do not overwrite on Webflow import -->\n  <link href="css/work-filter.css" rel="stylesheet" type="text/css">'
  );
}
if (!websitesHtml.includes('work-filter.js')) {
  websitesHtml = websitesHtml.replace(
    '<script src="js/swft-nav.js"></script>',
    '<script src="js/work-filter.js"></script>\n  <!-- end SWFT custom -->\n  <script src="js/swft-nav.js"></script>'
  );
}

writeFileSync(join(ROOT, 'websites.html'), websitesHtml);
console.log('Updated websites.html gallery');

// --- Update case-studies-index.json ---
const indexPath = join(ROOT, 'data/case-studies-index.json');
let hubIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
const existingSlugs = new Set(hubIndex.map((e) => e.slug));

for (const p of projects) {
  const entry = {
    type: 'case-study',
    name: p.name,
    slug: p.slug,
    href: `case-study/${p.slug}.html`,
    image: p.image,
    details: p.hubDetails,
    branding: p.branding,
    website: p.website,
    film: p.film,
  };
  const idx = hubIndex.findIndex((e) => e.slug === p.slug);
  if (idx >= 0) {
    hubIndex[idx] = entry;
  } else if (!existingSlugs.has(p.slug)) {
    hubIndex.push(entry);
    existingSlugs.add(p.slug);
  }
}

writeFileSync(indexPath, JSON.stringify(hubIndex, null, 2) + '\n');
console.log('Updated case-studies-index.json');

console.log('Done.');
