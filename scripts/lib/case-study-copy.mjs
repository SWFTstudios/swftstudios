/**
 * Article body for a case study page, rendered from data/portfolio-projects.json.
 * Shared by build-portfolio.mjs (full rebuild) and update-case-study-copy.mjs (copy only).
 *
 * Sections: At a glance, The goal, The challenge, What we did and why, What we delivered,
 * Results (only when p.results has measured numbers), How we measure success,
 * Lessons you can use, CTA.
 *
 * Notebook annotations (css/annotate.css) can be written into the copy fields
 * (snapshot, goal, challenge, approach[].detail, built, takeaways, whyMatters):
 *   ==phrase==   ice highlighter       ((word))   signal pen circle
 *   __phrase__   signal pen underline
 * and p.notes = { glance, challenge, approach, built, takeaways } adds one short
 * handwritten note (Listomania) under that section's heading. Mark the insight a
 * skimmer would want, two or three per section at most.
 *
 * p.results: [{ "value": "+38%", "label": "Organic sessions", "period": "Jan to Mar 2026 vs prior 90 days", "source": "GA4" }]
 * Only add numbers that come from the client's own analytics (GA4, Search Console, Shopify, GBP).
 */

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Escape, then turn ==hl==, ((circle)) and __underline__ into annotation marks. */
export function annotate(s) {
  return escapeHtml(s)
    .replace(/==(.+?)==/g, '<mark class="an an-hl">$1</mark>')
    .replace(/\(\((.+?)\)\)/g, '<span class="an an-circle">$1</span>')
    .replace(/__(.+?)__/g, '<span class="an an-ul">$1</span>');
}

/** Text without annotation markers (for meta tags, cards, anything not styled). */
export function plain(s) {
  return String(s).replace(/==(.+?)==/g, '$1').replace(/\(\((.+?)\)\)/g, '$1').replace(/__(.+?)__/g, '$1');
}

const note = (p, key) =>
  p.notes && p.notes[key] ? `<p class="an-note" role="note">${escapeHtml(p.notes[key])}</p>\n` : '';

const list = (items) => `<ul>\n${items.map((x) => `<li>${annotate(x)}</li>`).join('\n')}\n</ul>`;

function resultsBlock(results) {
  if (!Array.isArray(results) || !results.length) return '';
  const stats = results
    .map(
      (r) =>
        `<div class="cs-result"><p class="cs-result__value">${escapeHtml(r.value)}</p><p class="cs-result__label">${escapeHtml(r.label)}</p>` +
        `<p class="cs-result__source">${escapeHtml([r.source, r.period].filter(Boolean).join(', '))}</p></div>`
    )
    .join('');
  return `<h2>Results</h2>\n<div class="cs-results">${stats}</div>\n`;
}

export function buildRichText(p) {
  const approach = p.approach
    .map((a) => `<li><strong>${escapeHtml(a.title)}.</strong> ${annotate(a.detail)}</li>`)
    .join('\n');
  return `
<h2>At a glance</h2>
${note(p, 'glance')}<p>${annotate(p.snapshot)}</p>
<p><strong>The goal:</strong> ${annotate(p.goal)}</p>
<h2>The challenge</h2>
${note(p, 'challenge')}${list(p.challenge)}
<h2>What we did and why</h2>
${note(p, 'approach')}<ul class="cs-approach">
${approach}
</ul>
<h2>What we delivered</h2>
${note(p, 'built')}${list(p.built)}
<p>See it live at <a href="${p.liveUrl}" target="_blank" rel="noopener">${domain(p.liveUrl)}</a>.</p>
${resultsBlock(p.results)}<h2>How we measure success</h2>
<p>A launch is the starting line. These are the numbers we watch in Google Analytics 4${p.category === 'ecommerce' ? ' and Shopify' : ''} for a project like this, and the ones worth tracking on your own site:</p>
${list(p.measure)}
<h2>Lessons you can use</h2>
${note(p, 'takeaways')}${list(p.takeaways)}
<p>${annotate(p.whyMatters)}</p>
<div class="cs-cta-block">
  <h3>Want to see what we would improve for your business?</h3>
  <p>Request a free Growth Audit and get three prioritized recommendations for your website and customer journey.</p>
  <div class="cs-cta-actions">
    <a href="${p.liveUrl}" target="_blank" rel="noopener" class="swft-btn is-primary">View Website</a>
    <a href="/growth-audit" class="swft-btn is-outline">Get Your Free Growth Audit</a>
  </div>
</div>`;
}
