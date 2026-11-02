/* ============================================================
   SWFT Studios shared chrome (nav + footer).
   Every page includes:
       <div id="swft-nav" data-active="home"></div>
       <link href="/css/swft-nav.css"> and <script src="/js/swft-nav.js">
   Change a link here once and it updates on every page.
   Links are root-absolute so the same component works from any folder.
   Footer is injected once at the end of <body> (or into #swft-footer).
   Also loads js/mono.js (booking pill, reveals, cursor),
   js/text-reveal.js and js/strategy-call.js (the free strategy call
   pop-up) once per page.
   ============================================================ */
(function () {
  var BOOK_URL = "https://cal.com/swftstudios/swft-meeting";

  // Services mega-menu. Keep in sync with data/services.json
  // (name, menuLine, slug, icon); the pages themselves are generated from it.
  var SERVICES = [
    { group: "Build", items: [
      { label: "Custom software & CRMs", line: "Replace the apps you rent",    href: "/software.html",     icon: "code" },
      { label: "Mobile & web apps",      line: "iPhone, Android and portals",  href: "/apps.html",         icon: "phone" },
      { label: "Websites",               line: "Fast sites built to convert",  href: "/websites.html",     icon: "browser" }
    ] },
    { group: "Automate", items: [
      { label: "AI employees",           line: "Answers and books leads 24/7", href: "/ai-employees.html", icon: "sparkle" },
      { label: "Automations",            line: "Connect tools, end busywork",  href: "/automations.html",  icon: "bolt" }
    ] },
    { group: "Grow", items: [
      { label: "Paid ads & marketing",   line: "Meta, Google and SEO",         href: "/marketing.html",    icon: "megaphone" },
      { label: "Content & creative",     line: "Photo, video, social and live", href: "/content.html",     icon: "video" }
    ] }
  ];
  // Same stroke icons as scripts/build-service-pages.mjs.
  var ICONS = {
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    browser: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M6.5 7h.01M9 7h.01"/>',
    sparkle: '<path d="M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5 8.4 8z"/><path d="M17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    megaphone: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>',
    video: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 11 6-3.5v9L15 13"/>'
  };
  function svg(name) {
    return '<span class="sn-mega__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg></span>";
  }

  // Top bar (desktop), after the Services menu. Keys match each page's data-active.
  var LINKS = [
    { label: "Work",     href: "/work.html",     key: "work" },
    { label: "Pricing",  href: "/pricing.html",  key: "pricing" },
    { label: "About",    href: "/about.html",    key: "about" },
    { label: "Blog",     href: "/blog.html",     key: "blog" }
  ];
  // Menu panel (phones) also lists the secondary pages.
  var MORE = [
    { label: "Contact",            href: "/contact.html",  key: "contact" },
    { label: "Log in / Sign up",   href: "/account.html",  key: "account" },
    { label: "Films",              href: "/visuals.html",  key: "visuals" },
    { label: "Free Growth Audit",  href: "/growth-audit",  key: "growth-audit" },
    { label: "Locations",          href: "/locations/",    key: "locations" }
  ];
  // Older pages still say data-active="team" etc.
  var ALIAS = { "case-studies": "work", team: "about", visuals: "work" };
  var CTA = { label: "Book a call", href: BOOK_URL };
  var ARROW = '<span class="sn-arrow" aria-hidden="true">↗</span>';
  var BRAND = 'SWFT<span class="sn-brand__script">studios</span>';

  function megaHTML() {
    var cols = SERVICES.map(function (g) {
      return '<div class="sn-mega__col"><p class="sn-mega__label">' + g.group + "</p>" +
        g.items.map(function (i) {
          return '<a class="sn-mega__item" href="' + i.href + '">' + svg(i.icon) +
            '<span><span class="sn-mega__name">' + i.label + '</span><span class="sn-mega__line">' + i.line + "</span></span></a>";
        }).join("") + "</div>";
    }).join("");
    return '<div class="sn-mega" id="sn-mega" hidden>' +
      '<div class="sn-mega__cols">' + cols + "</div>" +
      '<div class="sn-mega__foot">' +
        '<p><b>Not sure where to start?</b> Get a free plan for your business.</p>' +
        '<span class="sn-mega__links"><a href="/services.html">All services <span aria-hidden="true">→</span></a>' +
        '<a href="' + BOOK_URL + '" target="_blank" rel="noopener">Book a free strategy call <span aria-hidden="true">→</span></a></span>' +
      "</div>" +
    "</div>";
  }

  function panelServicesHTML() {
    return '<details class="sn-panel-services"><summary>Services</summary>' +
      SERVICES.map(function (g) {
        return '<p class="sn-panel-label">(' + g.group + ")</p>" +
          g.items.map(function (i) { return '<a class="sn-panel-sub" href="' + i.href + '">' + i.label + "</a>"; }).join("");
      }).join("") +
      '<a class="sn-panel-sub" href="/services.html">All services →</a>' +
    "</details>";
  }

  function link(l, active, cls) {
    var isActive = l.key === active;
    return '<a href="' + l.href + '"' + (cls || isActive ? ' class="' + [cls, isActive ? "is-active" : ""].join(" ").trim() + '"' : "") +
      (isActive ? ' aria-current="page"' : "") + ">" + l.label + "</a>";
  }

  function navHTML(active) {
    var top = LINKS.map(function (l) { return link(l, active); }).join("");
    var panel = LINKS.concat(MORE).map(function (l) { return link(l, active); }).join("");
    var svcActive = active === "services";
    return (
      '<a class="sn-skip" href="#main">Skip to content</a>' +
      '<nav class="sn-nav" aria-label="Main">' +
        '<a href="/" class="sn-brand" aria-label="SWFT Studios home">' + BRAND + "</a>" +
        '<div class="sn-links">' +
          '<button type="button" class="sn-menu-btn' + (svcActive ? " is-active" : "") + '" id="sn-menu-btn" aria-expanded="false" aria-controls="sn-mega">Services<span class="sn-caret" aria-hidden="true"></span></button>' +
          top +
          megaHTML() +
        "</div>" +
        '<div class="sn-actions">' +
          '<a href="/account.html" class="sn-contact sn-login' + (active === "account" ? " is-active" : "") + '"' + (active === "account" ? ' aria-current="page"' : "") + ">Log in</a>" +
          '<a href="/contact.html" class="sn-contact' + (active === "contact" ? " is-active" : "") + '"' + (active === "contact" ? ' aria-current="page"' : "") + ">Contact</a>" +
          '<a href="' + CTA.href + '" class="sn-cta" target="_blank" rel="noopener">' + CTA.label + ARROW + "</a>" +
          '<button class="sn-burger" id="sn-burger" aria-label="Open menu" aria-expanded="false" aria-controls="sn-panel"><span></span><span></span></button>' +
        "</div>" +
      "</nav>" +
      '<div class="sn-scrim" id="sn-scrim"></div>' +
      '<aside class="sn-panel" id="sn-panel" aria-hidden="true" aria-label="Site menu">' +
        '<button class="sn-close" id="sn-close" aria-label="Close menu">×</button>' +
        '<p class="sn-panel-label">(Menu)</p>' +
        link({ label: "Home", href: "/", key: "home" }, active) +
        panelServicesHTML() +
        panel +
        '<a href="' + CTA.href + '" class="sn-panel-cta" target="_blank" rel="noopener">Book a free strategy call' + ARROW + "</a>" +
        '<a href="' + BOOK_URL + '" class="mf-pill sn-panel-pill" target="_blank" rel="noopener" data-mf-booking><span class="mf-dot" aria-hidden="true"></span>Booking now<span data-mf-next></span></a>' +
      "</aside>"
    );
  }

  // Desktop Services mega-menu: click or hover opens it; Escape, a click
  // outside or tabbing away closes it.
  function wireMega() {
    var btn = document.getElementById("sn-menu-btn");
    var mega = document.getElementById("sn-mega");
    if (!btn || !mega) return;
    var hoverable = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var timer, openedAt = 0;
    function isOpen() { return btn.getAttribute("aria-expanded") === "true"; }
    function open() {
      clearTimeout(timer);
      if (isOpen()) return;
      mega.hidden = false; btn.setAttribute("aria-expanded", "true"); openedAt = Date.now();
    }
    function shut(focusBtn) {
      clearTimeout(timer);
      if (!isOpen()) return;
      mega.hidden = true; btn.setAttribute("aria-expanded", "false");
      if (focusBtn) btn.focus({ preventScroll: true });
    }
    // A hover opens it a moment before the click lands; don't let that click close it.
    btn.addEventListener("click", function () {
      if (!isOpen()) open();
      else if (Date.now() - openedAt > 400) shut(false);
    });
    if (hoverable) {
      [btn, mega].forEach(function (el) {
        el.addEventListener("mouseenter", open);
        el.addEventListener("mouseleave", function () { timer = setTimeout(function () { shut(false); }, 180); });
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) shut(mega.contains(document.activeElement) || document.activeElement === btn);
    });
    document.addEventListener("click", function (e) {
      if (isOpen() && !mega.contains(e.target) && !btn.contains(e.target)) shut(false);
    });
    mega.addEventListener("focusout", function (e) {
      if (e.relatedTarget && !mega.contains(e.relatedTarget) && e.relatedTarget !== btn) shut(false);
    });
  }

  function footerHTML() {
    var year = new Date().getFullYear();
    return (
      '<footer class="sf-footer" role="contentinfo">' +
        '<div class="sf-top">' +
          '<div class="sf-cta">' +
            '<p class="mf-label">(Got a project?)</p>' +
            '<p class="sf-cta__title">Let&rsquo;s get you <span class="mf-script">booked.</span></p>' +
            '<div class="mf-actions">' +
              '<a class="mf-btn" href="/contact.html">Start a project <span class="mf-arrow" aria-hidden="true">↗</span></a>' +
              '<a class="mf-btn mf-btn--ghost" href="' + BOOK_URL + '" target="_blank" rel="noopener">Book a 30-min call</a>' +
            "</div>" +
            '<a href="' + BOOK_URL + '" class="mf-pill sf-pill" target="_blank" rel="noopener" data-mf-booking><span class="mf-dot" aria-hidden="true"></span>Booking now<span data-mf-next></span></a>' +
          "</div>" +
          '<div class="sf-cols">' +
            '<div><p class="mf-label mf-label--muted">(Pages)</p>' +
              '<a href="/">Home</a><a href="/work.html">Work</a><a href="/services.html">Services</a><a href="/pricing.html">Pricing</a><a href="/about.html">About</a><a href="/blog.html">Blog</a><a href="/contact.html">Contact</a>' +
            "</div>" +
            '<div><p class="mf-label mf-label--muted">(Services)</p>' +
              SERVICES.map(function (g) { return g.items.map(function (i) { return '<a href="' + i.href + '">' + i.label + "</a>"; }).join(""); }).join("") +
            "</div>" +
            '<div><p class="mf-label mf-label--muted">(More)</p>' +
              '<a href="/visuals.html">Films</a><a href="/growth-audit">Free Growth Audit</a><a href="/locations/">Locations</a><a href="/account.html">Log in / Get updates</a><a href="/sitemap.html">Site map</a>' +
            "</div>" +
            '<div><p class="mf-label mf-label--muted">(Say hi)</p>' +
              '<a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>' +
              '<a href="https://www.instagram.com/swftstudios/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
              '<a href="https://www.linkedin.com/company/swftstudios/" target="_blank" rel="noopener noreferrer">LinkedIn</a>' +
            "</div>" +
          "</div>" +
        "</div>" +
        '<p class="sf-wordmark" aria-hidden="true">SWFT<span class="mf-script">studios</span></p>' +
        '<div class="sf-bottom">' +
          '<span>&copy; ' + year + " SWFT Studios</span>" +
          '<span>Jersey City &middot; New York City &middot; North Jersey</span>' +
          '<a href="#main" class="sf-top-link">Back to top ↑</a>' +
        "</div>" +
      "</footer>"
    );
  }

  function wire() {
    var burger = document.getElementById("sn-burger");
    var panel = document.getElementById("sn-panel");
    var scrim = document.getElementById("sn-scrim");
    var close = document.getElementById("sn-close");
    if (!burger || !panel) return;
    function isOpen() { return panel.classList.contains("open"); }
    function open() {
      panel.classList.add("open"); if (scrim) scrim.classList.add("open");
      burger.setAttribute("aria-expanded", "true"); panel.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("sn-locked");
      if (close) close.focus({ preventScroll: true });
    }
    function shut(returnFocus) {
      if (!isOpen()) return;
      panel.classList.remove("open"); if (scrim) scrim.classList.remove("open");
      burger.setAttribute("aria-expanded", "false"); panel.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("sn-locked");
      if (returnFocus) burger.focus({ preventScroll: true });
    }
    burger.addEventListener("click", open);
    if (close) close.addEventListener("click", function () { shut(true); });
    if (scrim) scrim.addEventListener("click", function () { shut(true); });
    panel.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { shut(false); }); });
    document.addEventListener("keydown", function (e) {
      if (!isOpen()) return;
      if (e.key === "Escape") { shut(true); return; }
      // Keep Tab inside the open menu
      if (e.key === "Tab") {
        var items = panel.querySelectorAll("button, a");
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  // Bar is see-through at the top of the page, solid once you scroll, and
  // tucks away while scrolling down so the work gets the whole screen.
  function wireScroll() {
    var nav = document.querySelector(".sn-nav");
    if (!nav) return;
    var lastY = window.scrollY, ticking = false;
    function update() {
      var y = window.scrollY;
      nav.classList.toggle("is-scrolled", y > 24);
      var megaOpen = document.getElementById("sn-menu-btn");
      megaOpen = megaOpen && megaOpen.getAttribute("aria-expanded") === "true";
      var hide = y > 320 && y > lastY + 4 && !megaOpen && !document.documentElement.classList.contains("sn-locked");
      if (hide) nav.classList.add("is-hidden");
      else if (y < lastY - 4 || y <= 320) nav.classList.remove("is-hidden");
      lastY = y; ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    nav.addEventListener("focusin", function () { nav.classList.remove("is-hidden"); });
    update();
  }

  // The skip link and footer "back to top" target #main.
  function ensureMainId() {
    if (document.getElementById("main")) return;
    var main = document.querySelector("main") || document.querySelector(".page-wrapper") || document.body.firstElementChild;
    if (main && !main.id) main.id = "main";
  }

  function initNav() {
    var mount = document.getElementById("swft-nav");
    if (!mount) return;
    var active = mount.getAttribute("data-active") || "";
    mount.innerHTML = navHTML(ALIAS[active] || active);
    wire();
    wireMega();
    wireScroll();
  }

  function initFooter() {
    if (document.querySelector(".sf-footer")) return;
    var html = footerHTML();
    var mount = document.getElementById("swft-footer");
    if (mount) {
      mount.innerHTML = html;
      return;
    }
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function loadOnce(src, flag) {
    if (document.querySelector("script[" + flag + "]")) return;
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.setAttribute(flag, "");
    document.head.appendChild(s);
  }

  function init() {
    ensureMainId();
    initNav();
    initFooter();
    // Site-wide scroll-in text animation (js/text-reveal.js) and the Mono
    // helpers (js/mono.js), loaded once from here because every page
    // already includes this script.
    // Analytics on every page, including older templates that never linked it
    if (!document.querySelector('script[src*="swft-analytics.js"]')) loadOnce("/js/swft-analytics.js?v=20261104-ga4", "data-swft-analytics");
    loadOnce("/js/text-reveal.js?v=20261027-mono", "data-swft-text-reveal");
    loadOnce("/js/mono.js?v=20261103-notify", "data-swft-mono");
    loadOnce("/js/strategy-call.js?v=20261103-notify", "data-swft-strategy");
    if (document.querySelector("[data-mf-notify]")) loadOnce("/js/notify-badge.js?v=20261103-notify", "data-swft-notify");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
