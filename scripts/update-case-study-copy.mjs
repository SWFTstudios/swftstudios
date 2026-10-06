#!/usr/bin/env node
/**
 * Refresh only the copy on existing case study pages from data/portfolio-projects.json:
 * the article body, the meta/og/twitter descriptions, and the hub cards in
 * data/case-studies-index.json. Layout and head tags on each page stay as they are.
 *   node scripts/update-case-study-copy.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildRichText, escapeHtml } from './lib/case-study-copy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const projects = JSON.parse(readFileSync(join(ROOT, 'data/portfolio-projects.json'), 'utf8'));

const OPEN = '<div class="uui-text-rich-text w-richtext">';
const CLOSE = '\n                  </div>\n                </div>\n              </div>';

for (const p of projects) {
  const file = join(ROOT, 'case-study', `${p.slug}.html`);
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  const start = html.indexOf(OPEN);
  const end = html.indexOf(CLOSE, start);
  if (start < 0 || end < 0) throw new Error(`Article body not found in ${file}`);
  html = html.slice(0, start + OPEN.length) + '\n' + buildRichText(p) + html.slice(end);

  const desc = escapeHtml(p.description);
  html = html
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc}">`)
    .replace(/<meta content="[^"]*" property="og:description">/, `<meta content="${desc}" property="og:description">`)
    .replace(/<meta content="[^"]*" property="twitter:description">/, `<meta content="${desc}" property="twitter:description">`);
  writeFileSync(file, html);
  console.log('Updated', file);
}

const indexPath = join(ROOT, 'data/case-studies-index.json');
const hub = JSON.parse(readFileSync(indexPath, 'utf8'));
for (const entry of hub) {
  const p = projects.find((x) => x.slug === entry.slug);
  if (!p) continue;
  entry.details = p.hubDetails;
  if (p.highlight) entry.metric = p.highlight;
  else delete entry.metric;
}
writeFileSync(indexPath, JSON.stringify(hub, null, 2) + '\n');
console.log('Updated', indexPath);
