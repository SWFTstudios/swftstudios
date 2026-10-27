/* ============================================================
   SWFT Studios shared chrome (nav + footer).
   Every page includes:
       <div id="swft-nav" data-active="home"></div>
       <link href="/css/swft-nav.css"> and <script src="/js/swft-nav.js">
   Change a link here once and it updates on every page.
   Links are root-absolute so the same component works from any folder.
   Footer is injected once at the end of <body> (or into #swft-footer).
   Also loads js/mono.js (booking pill, reveals, cursor) and
   js/text-reveal.js once per page.
   ============================================================ */
(function () {
  var BOOK_URL = "https://cal.com/swftstudios/swft-meeting";

  // Top bar (desktop). Keys match each page's data-active.
  var LINKS = [
    { label: "Home",     href: "/",              key: "home" },
    { label: "Work",     href: "/work.html",     key: "work" },
    { label: "Services", href: "/services.html", key: "services" },
    { label: "About",    href: "/about.html",    key: "about" },
    { label: "Blog",     href: "/blog.html",     key: "blog" },
    { label: "Contact",  href: "/contact.html",  key: "contact" }
  ];
  // Menu panel (phones) also lists the secondary pages.
  var MORE = [
    { label: "Pricing",            href: "/pricing.html",  key: "pricing" },
    { label: "Films",              href: "/visuals.html",  key: "visuals" },
    { label: "Free Growth Audit",  href: "/growth-audit",  key: "growth-audit" },
    { label: "Locations",          href: "/locations/",    key: "locations" }
  ];
  // Older pages still say data-active="team" etc.
  var ALIAS = { "case-studies": "work", team: "about", visuals: "work" };
  var CTA = { label: "Start a project", href: "/contact.html" };
  var ARROW = '<span class="sn-arrow" aria-hidden="true">↗</span>';
  var BRAND = 'SWFT<span class="sn-brand__script">studios</span>';

  function link(l, active, cls) {
    var isActive = l.key === active;
    return '<a href="' + l.href + '"' + (cls || isActive ? ' class="' + [cls, isActive ? "is-active" : ""].join(" ").trim() + '"' : "") +
      (isActive ? ' aria-current="page"' : "") + ">" + l.label + "</a>";
  }

  function navHTML(active) {
    var top = LINKS.map(function (l) { return link(l, active); }).join("");
    var panel = LINKS.concat(MORE).map(function (l) { return link(l, active); }).join("");
    return (
      '<a class="sn-skip" href="#main">Skip to content</a>' +
      '<nav class="sn-nav" aria-label="Main">' +
        '<a href="/" class="sn-brand" aria-label="SWFT Studios home">' + BRAND + "</a>" +
        '<div class="sn-links">' + top + "</div>" +
        '<div class="sn-actions">' +
          '<a href="' + CTA.href + '" class="sn-cta">' + CTA.label + ARROW + "</a>" +
          '<button class="sn-burger" id="sn-burger" aria-label="Open menu" aria-expanded="false" aria-controls="sn-panel"><span></span><span></span></button>' +
        "</div>" +
      "</nav>" +
      '<div class="sn-scrim" id="sn-scrim"></div>' +
      '<aside class="sn-panel" id="sn-panel" aria-hidden="true" aria-label="Site menu">' +
        '<button class="sn-close" id="sn-close" aria-label="Close menu">×</button>' +
        '<p class="sn-panel-label">(Menu)</p>' +
        panel +
        '<a href="' + CTA.href + '" class="sn-panel-cta">' + CTA.label + ARROW + "</a>" +
        '<a href="' + BOOK_URL + '" class="mf-pill sn-panel-pill" target="_blank" rel="noopener" data-mf-booking><span class="mf-dot" aria-hidden="true"></span>Booking now<span data-mf-next></span></a>' +
      "</aside>"
    );
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
          "</div>" +
          '<div class="sf-cols">' +
            '<div><p class="mf-label mf-label--muted">(Pages)</p>' +
              '<a href="/">Home</a><a href="/work.html">Work</a><a href="/services.html">Services</a><a href="/pricing.html">Pricing</a><a href="/about.html">About</a><a href="/blog.html">Blog</a><a href="/contact.html">Contact</a>' +
            "</div>" +
            '<div><p class="mf-label mf-label--muted">(More)</p>' +
              '<a href="/visuals.html">Films</a><a href="/growth-audit">Free Growth Audit</a><a href="/locations/">Locations</a><a href="/portal/login.html">Client portal</a><a href="/sitemap.html">Site map</a>' +
            "</div>" +
            '<div><p class="mf-label mf-label--muted">(Say hi)</p>' +
              '<a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>' +
              '<a href="https://www.instagram.com/swftstudios/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
              '<a href="https://www.linkedin.com/company/swftstudios/" target="_blank" rel="noopener noreferrer">LinkedIn</a>' +
              '<a href="' + BOOK_URL + '" class="mf-pill sf-pill" target="_blank" rel="noopener" data-mf-booking><span class="mf-dot" aria-hidden="true"></span>Booking now<span data-mf-next></span></a>' +
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
      var hide = y > 320 && y > lastY + 4 && !document.documentElement.classList.contains("sn-locked");
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
    loadOnce("/js/text-reveal.js?v=20261027-mono", "data-swft-text-reveal");
    loadOnce("/js/mono.js?v=20261027-mono", "data-swft-mono");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
