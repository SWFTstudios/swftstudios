/* ============================================================
   SWFT Studios app shell (phones).
   Loaded once per page by js/swft-nav.js. Makes the site feel like an
   installed app on mobile:

   - Installable: manifest, theme colour, home-screen icons, service worker
     (sw.js) for offline pages. "Install app" lives in the Account sheet.
   - Bottom tab bar that changes with who is visiting:
       guest   Home · Services · Book · Log in · Menu
       member  Home · Services · Book · Account · Menu  (signed in, no project)
       client  Home · Project · Book · Account · Menu   (has a project)
       admin   Home · Admin · Book · Account · Menu
     Menu is bottom-right for the thumb and replaces the top-right burger.
     Role comes from GET /api/portal/me; the last answer is kept in
     sessionStorage so the right tabs paint instantly on the next page.
   - Account sheet (slides up): who you are, your shortcuts, install, sign out.
   - Desktop (1100px+): a left sidebar replaces the top bar, app style:
     logo + collapse, icon nav (Services expands to Build / Grow / Automate),
     a Workspace section for clients and admins, then Book a call and an
     account card that opens the same sheet as a popover. Collapsed state
     is remembered per browser.
   Tablets (761–1099px) keep the top bar and slide-over menu.
   ============================================================ */
(function () {
  "use strict";
  if (window.__swftApp) return;
  window.__swftApp = true;

  var BOOK_URL = "https://cal.com/swftstudios/swft-meeting";
  var ME_KEY = "swft-me";
  var path = location.pathname.replace(/index\.html$/, "");
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var installEvent = null;

  /* ---------- Head: install metadata ---------- */
  function meta(name, content, attr) {
    attr = attr || "name";
    if (document.head.querySelector("meta[" + attr + '="' + name + '"]')) return;
    var m = document.createElement("meta");
    m.setAttribute(attr, name); m.content = content;
    document.head.appendChild(m);
  }
  function linkTag(rel, href, sizes) {
    if (document.head.querySelector('link[rel="' + rel + '"]' + (sizes ? '[sizes="' + sizes + '"]' : ""))) return;
    var l = document.createElement("link");
    l.rel = rel; l.href = href; if (sizes) l.setAttribute("sizes", sizes);
    document.head.appendChild(l);
  }
  function head() {
    linkTag("manifest", "/manifest.webmanifest");
    linkTag("apple-touch-icon", "/images/app/apple-touch-icon.png", "180x180");
    meta("theme-color", "#010101");
    meta("apple-mobile-web-app-capable", "yes");
    meta("mobile-web-app-capable", "yes");
    meta("apple-mobile-web-app-status-bar-style", "black");
    meta("apple-mobile-web-app-title", "SWFT");
    // Let the tab bar sit above the home indicator.
    var vp = document.head.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.content)) vp.content += ", viewport-fit=cover";
    if (standalone) document.documentElement.classList.add("sa-standalone");
  }

  function registerWorker() {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:" && location.hostname !== "localhost") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () { /* not fatal */ });
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvent = e;
    renderSheet();
  });
  window.addEventListener("appinstalled", function () { installEvent = null; standalone = true; renderSheet(); });

  /* ---------- Who is visiting ---------- */
  function readCache() {
    try {
      var v = JSON.parse(sessionStorage.getItem(ME_KEY) || "null");
      if (v && Date.now() - v.at < 30 * 60 * 1000) return v;
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function writeCache(v) {
    try { if (v) sessionStorage.setItem(ME_KEY, JSON.stringify(v)); else sessionStorage.removeItem(ME_KEY); } catch (e) { /* ignore */ }
  }
  function toState(d) {
    if (!d || !d.ok || !d.user) return { role: "guest", at: Date.now() };
    var role = d.user.isAdmin ? "admin" : d.project ? "client" : "member";
    return {
      role: role, at: Date.now(), email: d.user.email || "",
      project: d.project ? { name: d.project.tierName || "Your project", status: d.project.status || "" } : null
    };
  }
  var state = readCache() || { role: "guest", at: 0 };

  function loadMe() {
    fetch("/api/portal/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) {
        if (r.status === 401) return { ok: false };
        if (!r.ok) throw new Error("me " + r.status);
        return r.json();
      })
      .then(function (d) {
        var next = toState(d);
        writeCache(next);
        var changed = next.role !== state.role || next.email !== state.email;
        state = next;
        if (changed) { renderTabs(); renderSide(); renderSheet(); updateMenu(); }
      })
      .catch(function () { /* offline or no API (static preview): keep what we have */ });
  }

  /* ---------- Icons ---------- */
  var I = {
    home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    services: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    work: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m3.5 15 5-4.5 4 3.5 3-2.5 5 4"/><circle cx="15.5" cy="9" r="1.3"/>',
    book: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M12 12.5v5M9.5 15h5"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5"/>',
    project: '<path d="M4 20V4M4 20h16"/><path d="m8 15 3.5-4 3 2.5L19 8"/>',
    admin: '<path d="M12 3.5 19 6v5.5c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    out: '<path d="M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14M10 8l-4 4 4 4M6 12h10"/>',
    login: '<path d="M10 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H10M14 8l4 4-4 4M18 12H8"/>',
    star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    chev: '<path d="m9.5 6 6 6-6 6"/>',
    tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
    doc: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4M9 12.5h6M9 16h6"/>',
    film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/>',
    side: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
    down: '<path d="m6 9.5 6 6 6-6"/>',
    share: '<path d="M12 15V4M8 7.5 12 4l4 3.5M6.5 11H5.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/>'
  };
  function icon(n, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[n] || "") + "</svg>";
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- Bottom tab bar ---------- */
  var SERVICE_PATHS = /^\/(services|websites|apps|software|marketing|content|automations|analytics|pricing)\.html$/;
  function tabsFor(role) {
    var home = { key: "home", label: "Home", href: "/", icon: "home", match: /^\/$/ };
    var services = { key: "services", label: "Services", href: "/services.html", icon: "services", match: SERVICE_PATHS };
    var work = { key: "work", label: "Work", href: "/work.html", icon: "work", match: /^\/(work|visuals)\.html$|^\/case-study\// };
    var book = { key: "book", label: "Book", href: BOOK_URL, icon: "book", fab: true };
    var project = { key: "project", label: "Project", href: "/portal/dashboard.html", icon: "project", match: /^\/portal\// };
    var admin = { key: "admin", label: "Admin", href: "/admin/", icon: "admin", match: /^\/admin\// };
    var account = { key: "account", label: role === "guest" ? "Log in" : "Account", icon: "user", sheet: true, match: /^\/account\.html$/ };
    // Menu sits bottom-right, under the thumb; it opens the full menu
    // (Work, Pricing, About, Blog, Films, Contact live there).
    var menu = { key: "menu", label: "Menu", icon: "menu", menu: true };
    if (role === "admin") return [home, admin, book, account, menu];
    if (role === "client") return [home, project, book, account, menu];
    return [home, services, book, account, menu];
  }

  var bar, sheet, scrim;
  function avatar() {
    var ch = (state.email || "?").charAt(0).toUpperCase();
    return '<span class="sa-avatar" aria-hidden="true">' + esc(ch) + "</span>";
  }
  function renderTabs() {
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "sa-tabs";
      bar.setAttribute("aria-label", "App");
      document.body.appendChild(bar);
      document.documentElement.classList.add("sa-has-tabs");
    }
    bar.setAttribute("data-role", state.role);
    bar.innerHTML = tabsFor(state.role).map(function (t) {
      var on = t.match && t.match.test(path);
      var inner = (t.fab ? '<span class="sa-tab__fab">' + icon(t.icon, 22) + "</span>"
        : t.key === "account" && state.role !== "guest" ? avatar() : icon(t.icon, 23)) +
        '<span class="sa-tab__label">' + t.label + "</span>";
      var cls = "sa-tab" + (t.fab ? " sa-tab--fab" : "") + (on ? " is-active" : "");
      if (t.menu) return '<button type="button" class="' + cls + ' sa-tab--menu" data-sa-menu aria-controls="sn-panel" aria-expanded="false">' +
        '<span class="sa-menu-ico" aria-hidden="true"><i></i><i></i><i></i></span><span class="sa-tab__label">Menu</span></button>';
      if (t.sheet) return '<button type="button" class="' + cls + '" data-sa-account aria-haspopup="dialog" aria-controls="sa-sheet">' + inner + "</button>";
      return '<a class="' + cls + '" href="' + t.href + '"' + (on ? ' aria-current="page"' : "") +
        (/^https?:/.test(t.href) ? ' target="_blank" rel="noopener"' : "") + ">" + inner + "</a>";
    }).join("");
    bar.querySelector("[data-sa-account]").addEventListener("click", openSheet);
    wireMenuTab();
  }

  // The Menu tab drives the existing slide-over menu (js/swft-nav.js): it
  // opens it through the burger, closes it through its close button, and
  // turns into "Close" while the menu is open. The bar stays above the menu.
  var menuObserver;
  function wireMenuTab() {
    var btn = bar.querySelector("[data-sa-menu]");
    var panel = document.getElementById("sn-panel");
    if (!btn || !panel) return;
    function sync() {
      var open = panel.classList.contains("open");
      btn.setAttribute("aria-expanded", String(open));
      btn.classList.toggle("is-open", open);
      btn.querySelector(".sa-tab__label").textContent = open ? "Close" : "Menu";
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.documentElement.classList.toggle("sa-menu-open", open);
    }
    btn.addEventListener("click", function () {
      var open = panel.classList.contains("open");
      var target = document.getElementById(open ? "sn-close" : "sn-burger");
      if (target) target.click();
    });
    if (menuObserver) menuObserver.disconnect();
    menuObserver = new MutationObserver(sync);
    menuObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
    sync();
  }

  /* ---------- Account sheet ---------- */
  var ROLE_LABEL = { guest: "Guest", member: "Member", client: "Client", admin: "Admin" };
  function row(href, ico, title, sub, extra) {
    return '<a class="sa-row" href="' + href + '"' + (extra || "") + '><span class="sa-row__icon">' + icon(ico, 20) + '</span><span class="sa-row__text"><b>' + title + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + '</span><span class="sa-row__chev">' + icon("chev", 16) + "</span></a>";
  }
  function installRow() {
    if (standalone) return "";
    if (installEvent) return '<button type="button" class="sa-row" data-sa-install><span class="sa-row__icon">' + icon("download", 20) + '</span><span class="sa-row__text"><b>Install the SWFT app</b><span>Add it to your home screen</span></span><span class="sa-row__chev">' + icon("chev", 16) + "</span></button>";
    if (isIOS) return '<div class="sa-row sa-row--note"><span class="sa-row__icon">' + icon("share", 20) + '</span><span class="sa-row__text"><b>Install the SWFT app</b><span>Tap Share, then &ldquo;Add to Home Screen&rdquo;</span></span></div>';
    return "";
  }
  function sheetBody() {
    var r = state.role, out = "";
    if (r === "guest") {
      out += '<div class="sa-who"><span class="sa-avatar sa-avatar--lg" aria-hidden="true">' + icon("user", 24) + '</span><div><p class="sa-who__name" id="sa-sheet-title">Welcome to SWFT</p><p class="sa-who__sub">Log in to see your project, or sign up for updates.</p></div></div>';
      out += '<div class="sa-actions"><a class="sa-btn" href="/account.html#login">' + icon("login", 18) + "Log in</a>" +
        '<a class="sa-btn sa-btn--ghost" href="/account.html#updates">Sign up</a></div>';
      out += '<div class="sa-list">' +
        row("/growth-audit", "search", "Free Growth Audit", "Three fixes for your business, by email") +
        row("/pricing.html", "star", "Pricing", "Every service&rsquo;s starting price") +
        installRow() + "</div>";
    } else {
      out += '<div class="sa-who">' + avatar().replace("sa-avatar", "sa-avatar sa-avatar--lg") + '<div><p class="sa-who__name" id="sa-sheet-title">' + esc(state.email) + '</p><p class="sa-who__sub"><span class="sa-badge sa-badge--' + r + '">' + ROLE_LABEL[r] + "</span>" +
        (state.project ? " " + esc(state.project.name) + (state.project.status ? " &middot; " + esc(state.project.status) : "") : "") + "</p></div></div>";
      out += '<div class="sa-list">' +
        (r === "admin" ? row("/admin/", "admin", "Admin dashboard", "Leads, projects and emails") : "") +
        (r === "client" || r === "admin" ? row("/portal/dashboard.html", "project", "My project", "Status, site stats and billing") : "") +
        (r === "member" ? row("/growth-audit", "search", "Start with a free Growth Audit", "We&rsquo;ll email three fixes") : "") +
        row("/account.html", "mail", "Account &amp; email updates", "Your sign-in and preferences") +
        row(BOOK_URL, "book", "Book a strategy call", "Free, 30 minutes", ' target="_blank" rel="noopener"') +
        installRow() +
        '<button type="button" class="sa-row sa-row--danger" data-sa-logout><span class="sa-row__icon">' + icon("out", 20) + '</span><span class="sa-row__text"><b>Sign out</b></span></button>' +
        "</div>";
    }
    return out;
  }
  function renderSheet() {
    if (!sheet) return;
    sheet.querySelector(".sa-sheet__body").innerHTML = sheetBody();
    var inst = sheet.querySelector("[data-sa-install]");
    if (inst) inst.addEventListener("click", function () {
      if (!installEvent) return;
      installEvent.prompt();
      installEvent.userChoice.finally(function () { installEvent = null; renderSheet(); });
    });
    var out = sheet.querySelector("[data-sa-logout]");
    if (out) out.addEventListener("click", function () {
      out.disabled = true;
      writeCache(null);
      fetch("/api/portal/logout", { method: "POST", credentials: "same-origin" })
        .finally(function () { location.href = "/"; });
    });
  }
  function buildSheet() {
    scrim = document.createElement("div");
    scrim.className = "sa-scrim";
    sheet = document.createElement("div");
    sheet.className = "sa-sheet";
    sheet.id = "sa-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "sa-sheet-title");
    sheet.hidden = true;
    sheet.innerHTML = '<div class="sa-sheet__grab" aria-hidden="true"></div><button type="button" class="sa-sheet__close" aria-label="Close">×</button><div class="sa-sheet__body"></div>';
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    scrim.addEventListener("click", closeSheet);
    sheet.querySelector(".sa-sheet__close").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
    // Swipe down to close
    var y0 = null;
    sheet.addEventListener("touchstart", function (e) { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchmove", function (e) {
      if (y0 === null) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", function (e) {
      if (y0 === null) return;
      var dy = (e.changedTouches[0] || {}).clientY - y0;
      sheet.style.transform = "";
      y0 = null;
      if (dy > 90) closeSheet();
    });
    renderSheet();
  }
  var lastFocus = null;
  function openSheet() {
    if (!sheet) buildSheet();
    renderSheet();
    lastFocus = document.activeElement;
    sheet.hidden = false;
    requestAnimationFrame(function () { sheet.classList.add("open"); scrim.classList.add("open"); });
    document.documentElement.classList.add("sn-locked");
    var first = sheet.querySelector(".sa-sheet__body a, .sa-sheet__body button");
    if (first) first.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("open"); scrim.classList.remove("open");
    document.documentElement.classList.remove("sn-locked");
    setTimeout(function () { sheet.hidden = true; }, 320);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- Desktop sidebar ---------- */
  var SIDE_KEY = "swft-side";
  var side;
  function sideCollapsed() { try { return localStorage.getItem(SIDE_KEY) === "collapsed"; } catch (e) { return false; } }
  function sideLink(href, ico, label, match, extra) {
    var on = match && match.test(path);
    return '<a class="sd-link' + (on ? " is-active" : "") + '" href="' + href + '" title="' + label + '"' + (on ? ' aria-current="page"' : "") + (extra || "") + ">" +
      '<span class="sd-ico">' + icon(ico, 20) + '</span><span class="sd-txt">' + label + "</span></a>";
  }
  function sideHTML() {
    var groups = window.__swftServices || [];
    var svcOpen = SERVICE_PATHS.test(path);
    var services = '<details class="sd-group"' + (svcOpen ? " open" : "") + ">" +
      '<summary class="sd-link' + (svcOpen ? " is-active" : "") + '" title="Services"><span class="sd-ico">' + icon("services", 20) + '</span><span class="sd-txt">Services</span><span class="sd-caret">' + icon("down", 16) + "</span></summary>" +
      '<div class="sd-subs">' +
        groups.map(function (g) {
          return '<p class="sd-sub"><b>' + g.group + "</b> " + (g.motto || "") + "</p>" +
            g.items.map(function (i) {
              var on = path === i.href;
              return '<a class="sd-sublink' + (on ? " is-active" : "") + '" href="' + i.href + '"' + (on ? ' aria-current="page"' : "") + "><span>" + i.label + "</span></a>";
            }).join("");
        }).join("") +
        '<a class="sd-sublink sd-sublink--all" href="/services.html"><span>All services</span><em>→</em></a>' +
      "</div></details>";
    var r = state.role;
    var workspace = (r === "client" || r === "admin")
      ? '<p class="sd-label">Workspace</p>' +
        sideLink("/portal/dashboard.html", "project", "My project", /^\/portal\//) +
        (r === "admin" ? sideLink("/admin/", "admin", "Admin", /^\/admin\//) : "")
      : "";
    var who = r === "guest"
      ? '<span class="sa-avatar sd-avatar" aria-hidden="true">' + icon("user", 16) + '</span><span class="sd-txt sd-who"><b>Log in</b><span>or sign up</span></span>'
      : '<span class="sa-avatar sd-avatar" aria-hidden="true">' + esc((state.email || "?").charAt(0).toUpperCase()) + '</span><span class="sd-txt sd-who"><b>' + esc(state.email) + "</b><span>" + ROLE_LABEL[r] + (state.project ? " · " + esc(state.project.name) : "") + "</span></span>";
    return '<div class="sd-top">' +
        '<a href="/" class="sn-brand sd-brand" aria-label="SWFT Studios home">SWFT<span class="sn-brand__script">studios</span></a>' +
        '<button type="button" class="sd-collapse" aria-label="Collapse sidebar" aria-pressed="' + sideCollapsed() + '" title="Collapse sidebar">' + icon("side", 18) + "</button>" +
      "</div>" +
      '<nav class="sd-nav" aria-label="Main">' +
        '<p class="sd-label">Menu</p>' +
        sideLink("/", "home", "Home", /^\/$/) +
        services +
        sideLink("/work.html", "work", "Work", /^\/work\.html$|^\/case-study\//) +
        sideLink("/pricing.html", "tag", "Pricing", /^\/pricing\.html$/) +
        sideLink("/about.html", "info", "About", /^\/about\.html$/) +
        sideLink("/blog.html", "doc", "Blog", /^\/blog(\.html|\/)/) +
        sideLink("/visuals.html", "film", "Films", /^\/visuals\.html$/) +
        sideLink("/contact.html", "mail", "Contact", /^\/contact\.html$/) +
        workspace +
      "</nav>" +
      '<div class="sd-bottom">' +
        '<a class="sd-book" href="' + BOOK_URL + '" target="_blank" rel="noopener" title="Book a free strategy call"><span class="sd-ico">' + icon("book", 20) + '</span><span class="sd-txt">Book a call</span></a>' +
        '<button type="button" class="sd-account" data-sa-account aria-haspopup="dialog" aria-controls="sa-sheet" title="Account">' + who + "</button>" +
      "</div>";
  }
  function renderSide() {
    if (!side) {
      side = document.createElement("aside");
      side.className = "sd";
      side.setAttribute("aria-label", "Sidebar");
      document.body.insertBefore(side, document.body.firstChild);
      document.documentElement.classList.add("sa-has-side");
      if (sideCollapsed()) document.documentElement.classList.add("sa-side-collapsed");
    }
    side.innerHTML = sideHTML();
    side.querySelector("[data-sa-account]").addEventListener("click", openSheet);
    side.querySelector(".sd-collapse").addEventListener("click", function () {
      var c = !document.documentElement.classList.contains("sa-side-collapsed");
      document.documentElement.classList.toggle("sa-side-collapsed", c);
      this.setAttribute("aria-pressed", String(c));
      this.setAttribute("aria-label", c ? "Expand sidebar" : "Collapse sidebar");
      try { localStorage.setItem(SIDE_KEY, c ? "collapsed" : "open"); } catch (e) { /* ignore */ }
    });
    // Collapsed: Services opens the services page instead of the sub-list.
    side.querySelector(".sd-group > summary").addEventListener("click", function (e) {
      if (document.documentElement.classList.contains("sa-side-collapsed")) { e.preventDefault(); location.href = "/services.html"; }
    });
  }

  /* ---------- Phone menu: show the right account button ---------- */
  function updateMenu() {
    var a = document.querySelector('.sn-panel-ghost[href="/account.html"]');
    if (!a) return;
    var label = a.querySelector("span:last-child");
    if (state.role === "client" || state.role === "admin") { a.href = "/portal/dashboard.html"; if (label) label.textContent = "My project"; }
    else if (state.role === "member") { if (label) label.textContent = "Account"; }
  }

  /* ---------- Go ---------- */
  head();
  registerWorker();
  function start() {
    renderSide();
    renderTabs();
    updateMenu();
    loadMe();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  // The nav renders its menu after this file may run; fix the menu button once it exists.
  setTimeout(updateMenu, 0);
})();
