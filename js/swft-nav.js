/* ============================================================
   SWFT Studios shared chrome (nav + footer).
   Every page includes:
       <div id="swft-nav" data-active="home"></div>
       <link href="/css/swft-nav.css"> and <script src="/js/swft-nav.js">
   Change a link here once and it updates on every page.
   Links are root-absolute so the same component works from any folder.
   Footer is injected once at the end of <body> (or into #swft-footer).
   ============================================================ */
(function () {
  var LINKS = [
    { label: "Home",         href: "/index.html",           key: "home" },
    { label: "Services",     href: "/services.html",        key: "services" },
    { label: "Work",         href: "/case-studies.html",    key: "case-studies" },
    { label: "Pricing",      href: "/website-pricing.html", key: "pricing" },
    { label: "Locations",    href: "/locations/",           key: "locations" },
    { label: "Team",         href: "/team.html",            key: "team" },
    { label: "Contact",      href: "/contact.html",         key: "contact" }
  ];
  var CTA = { label: "Get Your Free Growth Audit", href: "/growth-audit" };
  var BRAND = 'SWFT <span class="sk">STUD</span><span class="hl">IO</span><span class="sk">S</span>';

  function navHTML(active) {
    var links = LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (l.key === active ? ' class="is-active"': "") + ">" + l.label + "</a>";
    }).join("");
    return (
      '<nav class="sn-nav">' +
        '<a href="/index.html" class="sn-brand">' + BRAND + "</a>" +
        '<div class="sn-actions">' +
          '<a href="' + CTA.href + '" class="sn-cta">' + CTA.label + "</a>" +
          '<button class="sn-burger" id="sn-burger" aria-label="Open menu" aria-expanded="false" aria-controls="sn-panel"><span></span><span></span><span></span></button>' +
        "</div>" +
      "</nav>" +
      '<div class="sn-scrim" id="sn-scrim"></div>' +
      '<aside class="sn-panel" id="sn-panel" aria-hidden="true" aria-label="Site menu">' +
        '<button class="sn-close" id="sn-close" aria-label="Close menu">×</button>' +
        links +
        '<a href="' + CTA.href + '" class="sn-panel-cta">' + CTA.label + "</a>" +
      "</aside>"
    );
  }

  function footerHTML() {
    return (
      '<footer class="sf-footer" role="contentinfo">' +
        '<div class="sf-footer-inner">' +
          '<a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>' +
          '<a href="https://www.instagram.com/swftstudios/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
          '<a href="/services.html">The SWFT Method</a>' +
          '<a href="/case-studies.html">Our Work</a>' +
          '<a href="/locations/">Locations</a>' +
          '<a href="/sitemap.html">Site map</a>' +
          '<a href="/growth-audit">Get Your Free Growth Audit</a>' +
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

  function initNav() {
    var mount = document.getElementById("swft-nav");
    if (!mount) return;
    mount.innerHTML = navHTML(mount.getAttribute("data-active") || "");
    wire();
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

  // Site-wide scroll-in text animation (js/text-reveal.js), loaded once from here
  // because every page already includes this script.
  function initTextReveal() {
    if (document.querySelector('script[data-swft-text-reveal]')) return;
    var s = document.createElement("script");
    s.src = "/js/text-reveal.js?v=20261001k";
    s.async = true;
    s.setAttribute("data-swft-text-reveal", "");
    document.head.appendChild(s);
  }

  function init() {
    initNav();
    initFooter();
    initTextReveal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
