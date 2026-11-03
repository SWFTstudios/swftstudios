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
  // Grouped by the SWFT motto: Build = get seen, Grow = get chosen,
  // Automate = get booked. `from` is the lowest published price.
  var SERVICES = [
    { group: "Build", motto: "Get seen.", items: [
      { label: "Websites",               line: "Up to 5 pages, base features",  from: "$400",   href: "/websites.html",    icon: "browser" },
      { label: "Mobile & web apps",      line: "iPhone, Android and portals",   from: "$1,500", href: "/apps.html",        icon: "phone" },
      { label: "Custom software & CRMs", line: "Replace the apps you rent",     from: "$1,500", href: "/software.html",    icon: "code" }
    ] },
    { group: "Grow", motto: "Get chosen.", items: [
      { label: "Paid ads & marketing",   line: "Meta, Google and local SEO",    from: "$400",   href: "/marketing.html",   icon: "megaphone" },
      { label: "Content & creative",     line: "Photo, video, social and live", from: "$350",   href: "/content.html",     icon: "video" }
    ] },
    { group: "Automate", motto: "Get booked.", items: [
      { label: "Automations",            line: "Follow-up, reminders, reviews", from: "$750",   href: "/automations.html", icon: "bolt" },
      { label: "Tracking & reporting",   line: "Know what brings in customers", from: "$500",   href: "/analytics.html",   icon: "chart" }
    ] }
  ];
  // Shared with js/swft-app.js (desktop sidebar).
  window.__swftServices = SERVICES;
  // Same stroke icons as scripts/build-service-pages.mjs.
  var ICONS = {
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    browser: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M6.5 7h.01M9 7h.01"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="m8 15 3.5-4 3 2.5L19 8"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
    doc: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4M9 12.5h6M9 16h6"/>',
    film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5"/>',
    chevron: '<path d="m9.5 6 6 6-6 6"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    megaphone: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>',
    video: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="m15 11 6-3.5v9L15 13"/>'
  };
  function svg(name, cls) {
    return '<span class="' + (cls || "sn-mega__icon") + '" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg></span>";
  }

  // Top bar (desktop), after the Services menu. Keys match each page's data-active.
  var LINKS = [
    { label: "Work",     href: "/work.html",     key: "work" },
    { label: "Pricing",  href: "/pricing.html",  key: "pricing" },
    { label: "About",    href: "/about.html",    key: "about" },
    { label: "Blog",     href: "/blog.html",     key: "blog" }
  ];
  // Phone menu "Company" grid (two columns of icon tiles), then two small
  // buttons under the strategy-call CTA.
  var COMPANY = [
    { label: "Work",      href: "/work.html",     key: "work",      icon: "grid" },
    { label: "Pricing",   href: "/pricing.html",  key: "pricing",   icon: "tag" },
    { label: "About",     href: "/about.html",    key: "about",     icon: "info" },
    { label: "Blog",      href: "/blog.html",     key: "blog",      icon: "doc" },
    { label: "Films",     href: "/visuals.html",  key: "visuals",   icon: "film" },
    { label: "Contact",   href: "/contact.html",  key: "contact",   icon: "mail" }
  ];
  var PANEL_FOOT = [
    { label: "Free Growth Audit", href: "/growth-audit", key: "growth-audit", icon: "search" },
    { label: "Log in",            href: "/account.html", key: "account",      icon: "user" }
  ];
  // Older pages still say data-active="team" etc.
  var ALIAS = { "case-studies": "work", team: "about", visuals: "work" };
  var CTA = { label: "Book a call", href: BOOK_URL };
  var ARROW = '<span class="sn-arrow" aria-hidden="true">↗</span>';
  var BRAND = 'SWFT<span class="sn-brand__script">studios</span>';

  function megaHTML() {
    var cols = SERVICES.map(function (g) {
      return '<div class="sn-mega__col"><p class="sn-mega__label">' + g.group + (g.motto ? ' <span class="sn-mega__motto">' + g.motto + "</span>" : "") + "</p>" +
        g.items.map(function (i) {
          return '<a class="sn-mega__item" href="' + i.href + '">' + svg(i.icon) +
            '<span><span class="sn-mega__name">' + i.label + '</span><span class="sn-mega__line">' + i.line + (i.from ? " \u00b7 from " + i.from : "") + "</span></span></a>";
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

  // Phone menu services: Build / Grow / Automate tabs (the sub-menus). Each
  // tab shows its services as icon rows with the starting price. The tab
  // holding the current page opens first; otherwise Build.
  function panelServicesHTML(active) {
    var current = 0;
    SERVICES.forEach(function (g, gi) {
      g.items.forEach(function (i) { if (location.pathname === i.href) current = gi; });
    });
    var tabs = SERVICES.map(function (g, gi) {
      var on = gi === current;
      return '<button type="button" role="tab" class="sn-ptab" id="sn-ptab-' + gi + '" aria-controls="sn-ppanel-' + gi + '" aria-selected="' + on + '"' + (on ? "" : ' tabindex="-1"') + ">" + g.group + "</button>";
    }).join("");
    var panels = SERVICES.map(function (g, gi) {
      return '<div class="sn-ppanel" role="tabpanel" id="sn-ppanel-' + gi + '" aria-labelledby="sn-ptab-' + gi + '"' + (gi === current ? "" : " hidden") + ">" +
        (g.motto ? '<p class="sn-ppanel__motto">' + g.motto + "</p>" : "") +
        g.items.map(function (i) {
          return '<a class="sn-prow' + (location.pathname === i.href ? " is-active" : "") + '" href="' + i.href + '">' + svg(i.icon, "sn-prow__icon") +
            '<span class="sn-prow__text"><span class="sn-prow__name">' + i.label + '</span><span class="sn-prow__line">' + i.line + "</span></span>" +
            (i.from ? '<span class="sn-prow__from"><span>From</span><b>' + i.from + "</b></span>" : "") +
            svg("chevron", "sn-prow__chev") + "</a>";
        }).join("") +
      "</div>";
    }).join("");
    return '<section class="sn-psec" aria-labelledby="sn-psec-services">' +
      '<div class="sn-psec__head"><p class="sn-psec__label" id="sn-psec-services">Services</p>' +
        '<a class="sn-psec__all" href="/services.html">All services <span aria-hidden="true">→</span></a></div>' +
      '<div class="sn-ptabs" role="tablist" aria-label="Service groups">' + tabs + "</div>" +
      panels +
    "</section>";
  }

  function panelCompanyHTML(active) {
    return '<section class="sn-psec" aria-labelledby="sn-psec-company">' +
      '<p class="sn-psec__label" id="sn-psec-company">Company</p>' +
      '<div class="sn-ptiles">' +
        COMPANY.map(function (l) {
          var on = l.key === active;
          return '<a class="sn-ptile' + (on ? " is-active" : "") + '" href="' + l.href + '"' + (on ? ' aria-current="page"' : "") + ">" + svg(l.icon, "sn-ptile__icon") + "<span>" + l.label + "</span></a>";
        }).join("") +
      "</div>" +
    "</section>";
  }

  // Tabs: click or arrow keys switch the group.
  function wirePanelTabs(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll(".sn-ptab"));
    function select(t, focus) {
      tabs.forEach(function (o) {
        var on = o === t;
        o.setAttribute("aria-selected", on ? "true" : "false");
        if (on) o.removeAttribute("tabindex"); else o.setAttribute("tabindex", "-1");
        var panel = document.getElementById(o.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t, false); });
      t.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!n) return;
        e.preventDefault();
        select(tabs[(i + n + tabs.length) % tabs.length], true);
      });
    });
  }

  function link(l, active, cls) {
    var isActive = l.key === active;
    return '<a href="' + l.href + '"' + (cls || isActive ? ' class="' + [cls, isActive ? "is-active" : ""].join(" ").trim() + '"' : "") +
      (isActive ? ' aria-current="page"' : "") + ">" + l.label + "</a>";
  }

  function navHTML(active) {
    var top = LINKS.map(function (l) { return link(l, active); }).join("");
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
        '<div class="sn-panel-top">' +
          '<a href="/" class="sn-brand sn-panel-brand" aria-label="SWFT Studios home">' + BRAND + "</a>" +
          '<a href="' + CTA.href + '" class="sn-panel-book" target="_blank" rel="noopener">' + CTA.label + "</a>" +
          '<button class="sn-close" id="sn-close" aria-label="Close menu">×</button>' +
        "</div>" +
        '<div class="sn-panel-body">' +
          panelServicesHTML(active) +
          panelCompanyHTML(active) +
          '<div class="sn-panel-actions">' +
            '<a href="' + BOOK_URL + '" class="sn-panel-cta" target="_blank" rel="noopener">Book a free strategy call' + ARROW + "</a>" +
            '<div class="sn-panel-duo">' +
              PANEL_FOOT.map(function (l) { return '<a class="sn-panel-ghost" href="' + l.href + '">' + svg(l.icon, "sn-panel-ghost__icon") + "<span>" + l.label + "</span></a>"; }).join("") +
            "</div>" +
          "</div>" +
        "</div>" +
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
        var items = panel.querySelectorAll("button:not([tabindex='-1']), a");
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
    wirePanelTabs(document);
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
    loadOnce("/js/swft-app.js?v=20261103-app2", "data-swft-app");
    if (document.querySelector("[data-mf-notify]")) loadOnce("/js/notify-badge.js?v=20261103-notify", "data-swft-notify");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
