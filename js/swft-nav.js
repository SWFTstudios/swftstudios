/* ============================================================
   SWFT Studios shared chrome (ARAISE-style nav + footer).
   Mount: <div id="swft-nav" data-active="home"></div>
   Requires: css/swft-nav.css, css/araise-theme.css
   Scripts: js/swft-nav.js then js/swft-theme-clock.js
   ============================================================ */
(function () {
  var LINKS = [
    { label: "Home",         href: "/index.html",           key: "home" },
    { label: "Services",     href: "/services.html",        key: "services" },
    { label: "Our Work",     href: "/websites.html",        key: "our-work" },
    { label: "Pricing",      href: "/website-pricing.html", key: "pricing" },
    { label: "Locations",    href: "/locations/",           key: "locations" },
    { label: "Case Studies", href: "/case-studies.html",    key: "case-studies" },
    { label: "Team",         href: "/team.html",            key: "team" },
    { label: "Contact",      href: "/contact.html",         key: "contact" }
  ];
  var CTA = { label: "Get Your Free Growth Audit", href: "/growth-audit" };
  var BRAND = "SWFT";

  function navHTML(active) {
    var desktop = LINKS.map(function (l) {
      return '<a href="' + l.href + '" class="sn-link' + (l.key === active ? " is-active" : "") + '">' + l.label + "</a>";
    }).join("");
    var mobile = LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (l.key === active ? ' class="is-active"' : "") + ">" + l.label + "</a>";
    }).join("");
    return (
      '<nav class="sn-nav" aria-label="Primary">' +
        '<a href="/index.html" class="sn-brand">' + BRAND + "</a>" +
        '<div class="sn-center">' + desktop + "</div>" +
        '<div class="sn-right">' +
          '<time id="swft-clock" class="sn-clock" datetime="">--:--</time>' +
          '<button type="button" id="swft-theme-toggle" class="sn-theme" data-mode="auto" aria-pressed="false" aria-label="Theme: Auto">' +
            '<span class="sn-theme-icon" aria-hidden="true">' +
              '<svg class="sn-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>' +
              '<svg class="sn-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z"/></svg>' +
            "</span>" +
            '<span class="sn-theme-label">Auto</span>' +
          "</button>" +
          '<a href="' + CTA.href + '" class="sn-cta">' + CTA.label + "</a>" +
          '<button class="sn-burger" id="sn-burger" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        "</div>" +
      "</nav>" +
      '<div class="sn-scrim" id="sn-scrim"></div>' +
      '<aside class="sn-panel" id="sn-panel" aria-hidden="true">' +
        '<button class="sn-close" id="sn-close" aria-label="Close menu">×</button>' +
        mobile +
        '<a href="' + CTA.href + '" class="sn-panel-cta">' + CTA.label + "</a>" +
      "</aside>"
    );
  }

  function footerHTML() {
    var year = new Date().getFullYear();
    return (
      '<footer class="sf-footer" role="contentinfo">' +
        '<div class="sf-footer-inner">' +
          '<span class="sf-copy">© ' + year + ' SWFT Studios</span>' +
          '<nav class="sf-links" aria-label="Footer">' +
            '<a href="mailto:hello@swftstudios.com">hello@swftstudios.com</a>' +
            '<a href="https://www.instagram.com/swftstudios/" target="_blank" rel="noopener noreferrer">Instagram</a>' +
            '<a href="/websites.html">Our Work</a>' +
            '<a href="/locations/">Locations</a>' +
            '<a href="/sitemap.html">Site map</a>' +
            '<a href="/growth-audit">Growth Audit</a>' +
          "</nav>" +
          '<span class="sf-meta">Jersey City · NYC · North Jersey</span>' +
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
    function open() {
      panel.classList.add("open");
      if (scrim) scrim.classList.add("open");
      burger.setAttribute("aria-expanded", "true");
      panel.setAttribute("aria-hidden", "false");
    }
    function shut() {
      panel.classList.remove("open");
      if (scrim) scrim.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
    }
    burger.addEventListener("click", open);
    if (close) close.addEventListener("click", shut);
    if (scrim) scrim.addEventListener("click", shut);
    panel.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", shut); });
  }

  function initNav() {
    var mount = document.getElementById("swft-nav");
    if (!mount) return;
    mount.innerHTML = navHTML(mount.getAttribute("data-active") || "");
    wire();
    document.dispatchEvent(new CustomEvent("swft:nav-ready"));
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

  function ensureThemeAssets() {
    if (!document.querySelector('link[href*="araise-theme.css"]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/css/araise-theme.css";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[src*="swft-theme-clock.js"]')) {
      var s = document.createElement("script");
      s.src = "/js/swft-theme-clock.js";
      s.defer = true;
      document.body.appendChild(s);
    }
  }

  function init() {
    ensureThemeAssets();
    initNav();
    initFooter();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
