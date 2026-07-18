/* ============================================================
   SWFT Studios — shared navigation COMPONENT (single source).
   Every page renders this nav by including:
       <div id="swft-nav" data-active="home"></div>
   plus <link href="css/swft-nav.css"> and <script src="js/swft-nav.js">.
   Change a link here once and it updates on every page.
   Links are root-absolute so the same component works from any folder.
   ============================================================ */
(function () {
  var LINKS = [
    { label: "Home",         href: "/index.html",           key: "home" },
    { label: "Services",     href: "/services.html",        key: "services" },
    { label: "Our Work",     href: "/websites.html",        key: "our-work" },
    { label: "Pricing",      href: "/website-pricing.html", key: "pricing" },
    { label: "Case Studies", href: "/case-studies.html",    key: "case-studies" },
    { label: "Team",         href: "/team.html",            key: "team" },
    { label: "Contact",      href: "/contact.html",         key: "contact" }
  ];
  var CTA = { label: "Get Your Free Growth Audit", href: "/growth-audit" };
  var BRAND = 'SWFT <span class="sk">STUD</span><span class="hl">IO</span><span class="sk">S</span>';

  function navHTML(active) {
    var desktop = LINKS.map(function (l) {
      return '<a href="' + l.href + '" class="sn-link' + (l.key === active ? " is-active" : "") + '">' + l.label + "</a>";
    }).join("");
    var mobile = LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (l.key === active ? ' class="is-active"' : "") + ">" + l.label + "</a>";
    }).join("");
    return (
      '<nav class="sn-nav">' +
        '<a href="/index.html" class="sn-brand">' + BRAND + "</a>" +
        '<div class="sn-links">' + desktop +
          '<a href="' + CTA.href + '" class="sn-cta">' + CTA.label + "</a>" +
        "</div>" +
        '<button class="sn-burger" id="sn-burger" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
      "</nav>" +
      '<div class="sn-scrim" id="sn-scrim"></div>' +
      '<aside class="sn-panel" id="sn-panel" aria-hidden="true">' +
        '<button class="sn-close" id="sn-close" aria-label="Close menu">×</button>' +
        mobile +
        '<a href="' + CTA.href + '" class="sn-panel-cta">' + CTA.label + "</a>" +
      "</aside>"
    );
  }

  function wire() {
    var burger = document.getElementById("sn-burger");
    var panel = document.getElementById("sn-panel");
    var scrim = document.getElementById("sn-scrim");
    var close = document.getElementById("sn-close");
    if (!burger || !panel) return;
    function open() { panel.classList.add("open"); if (scrim) scrim.classList.add("open"); burger.setAttribute("aria-expanded", "true"); panel.setAttribute("aria-hidden", "false"); }
    function shut() { panel.classList.remove("open"); if (scrim) scrim.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); panel.setAttribute("aria-hidden", "true"); }
    burger.addEventListener("click", open);
    if (close) close.addEventListener("click", shut);
    if (scrim) scrim.addEventListener("click", shut);
    panel.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", shut); });
  }

  function init() {
    var mount = document.getElementById("swft-nav");
    if (!mount) return;
    mount.innerHTML = navHTML(mount.getAttribute("data-active") || "");
    wire();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
