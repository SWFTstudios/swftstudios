(function () {
  'use strict';

  var TIPS_SLUGS = new Set([
    'google-business-profile-local-seo-2026',
    'social-media-content-2026',
    'ai-answer-engine-optimization-2026',
    'reputation-management-2026',
    'digital-marketing-blind-spots-2026',
  ]);

  var CASE_STUDY_SLUGS = new Set([
    'snooze-lane',
    'roller-reels',
    'built-by-me-ez',
    'hamper',
    'hawthorne-global-ministries',
    'blurred-lines-entertainment',
    'alpha-ministries-international',
    'manna-hydration',
    'tal-hydration',
    'thyme-and-table',
    'brooklyn-steel',
    'scribble-and-scribe',
    'core-home',
    'western-hp',
  ]);

  function normalizeType(item) {
    if (item.type && item.type !== 'article') return item.type;
    if (TIPS_SLUGS.has(item.slug)) return 'tips';
    if (CASE_STUDY_SLUGS.has(item.slug)) return 'case-study';
    return 'case-study';
  }

  function applyFilter(filter) {
    var items = document.querySelectorAll('.swft-hub-match .case-study_item');
    items.forEach(function (item) {
      var type = item.getAttribute('data-type') || 'case-study';
      var show = filter === 'all' || type === filter;
      item.classList.toggle('is-hidden', !show);
      item.style.display = show ? '' : 'none';
    });
  }

  function initFilterBar() {
    var bar = document.querySelector('.resources-filter-bar');
    if (!bar) return;

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.rfb');
      if (!btn) return;

      var filter = btn.getAttribute('data-filter') || 'all';
      bar.querySelectorAll('.rfb').forEach(function (b) {
        var active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      applyFilter(filter);
    });
  }

  function tagItemsFromJson() {
    fetch('/data/case-studies-index.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        var bySlug = {};
        items.forEach(function (item) {
          bySlug[item.slug] = normalizeType(item);
        });
        document.querySelectorAll('.swft-hub-match .case-study_item').forEach(function (el, i) {
          var link = el.querySelector('.case-study_link');
          if (!link) return;
          var href = link.getAttribute('href') || '';
          var slug = href.replace(/^case-study\//, '').replace(/\.html$/, '');
          if (!el.getAttribute('data-type') && bySlug[slug]) {
            el.setAttribute('data-type', bySlug[slug]);
          }
        });
      })
      .catch(function () { /* optional fallback */ });
  }

  document.addEventListener('swft:hub-cards-ready', function () {
    tagItemsFromJson();
    initFilterBar();
  });
})();
