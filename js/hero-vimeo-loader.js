/* ============================================================
   SWFT Studios - Vimeo hero intro loader
   Gates page reveal until muted autoplay hero is ready,
   or falls back to a local still on slow/offline/reduced-motion.
   ============================================================ */
(function () {
  var VIDEO_ID = "1216244886";
  var TIMEOUT_MS = 8000;
  var VIMEO_SRC =
    "https://player.vimeo.com/video/" +
    VIDEO_ID +
    "?background=1&autoplay=1&muted=1&loop=1&autopause=0&badge=0&player_id=0&app_id=58479";

  var overlay = document.getElementById("swft-hero-loader");
  var bar = document.getElementById("swft-hero-loader-bar");
  var pctEl = document.getElementById("swft-hero-loader-pct");
  var hero = document.querySelector(".hero-vimeo");
  var iframe = document.getElementById("hero-vimeo");
  var still = hero ? hero.querySelector(".hero-vimeo-still") : null;

  if (!overlay || !hero) return;

  document.body.classList.add("hero-loading");

  var progress = 0;
  var done = false;
  var tickTimer = null;
  var timeoutId = null;

  function setProgress(value) {
    progress = Math.max(progress, Math.min(100, Math.round(value)));
    if (bar) bar.style.width = progress + "%";
    if (pctEl) pctEl.textContent = progress + "%";
  }

  function showStill() {
    if (still) {
      still.removeAttribute("hidden");
    }
    hero.classList.add("is-still");
    if (iframe) {
      iframe.removeAttribute("src");
      iframe.setAttribute("data-src-skipped", "1");
    }
  }

  function finish() {
    if (done) return;
    done = true;
    if (tickTimer) clearInterval(tickTimer);
    if (timeoutId) clearTimeout(timeoutId);
    setProgress(100);
    window.setTimeout(function () {
      overlay.classList.add("is-done");
      document.body.classList.remove("hero-loading");
      document.body.classList.add("hero-ready");
      try {
        window.dispatchEvent(new CustomEvent("swft:hero-ready"));
      } catch (err) {
        /* IE ignore */
      }
      window.setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 500);
    }, 180);
  }

  function shouldUseStillOnly() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return true;
    }
    if (navigator.onLine === false) return true;
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (conn.saveData) return true;
    var type = conn.effectiveType || "";
    return type === "2g" || type === "slow-2g";
  }

  function startSoftProgress(cap) {
    tickTimer = window.setInterval(function () {
      if (done || progress >= cap) return;
      var step = progress < 40 ? 3 : progress < 70 ? 2 : 1;
      setProgress(Math.min(cap, progress + step));
    }, 120);
  }

  function bindVimeo() {
    if (!iframe) {
      showStill();
      finish();
      return;
    }

    // Ensure src is set (may be deferred for still-only paths)
    if (!iframe.getAttribute("src")) {
      iframe.setAttribute("src", VIMEO_SRC);
    }

    function onReady() {
      finish();
    }

    function attachPlayer() {
      if (typeof window.Vimeo === "undefined" || !window.Vimeo.Player) {
        // player.js missing - wait for timeout / iframe load
        iframe.addEventListener("load", function () {
          // Give the player a beat after iframe load
          window.setTimeout(onReady, 400);
        });
        return;
      }

      try {
        var player = new window.Vimeo.Player(iframe);
        var settled = false;
        function settle() {
          if (settled) return;
          settled = true;
          onReady();
        }
        player.on("loaded", settle);
        player.on("play", settle);
        player.ready().then(function () {
          return player.play();
        }).then(settle).catch(function () {
          // Autoplay blocked or error - still treat as ready if loaded
          settle();
        });
      } catch (err) {
        iframe.addEventListener("load", onReady);
      }
    }

    if (typeof window.Vimeo !== "undefined" && window.Vimeo.Player) {
      attachPlayer();
    } else {
      // Wait briefly for player.js if script is still loading
      var attempts = 0;
      var wait = window.setInterval(function () {
        attempts += 1;
        if ((typeof window.Vimeo !== "undefined" && window.Vimeo.Player) || attempts > 40) {
          clearInterval(wait);
          attachPlayer();
        }
      }, 100);
    }
  }

  // Soft timeout → still + reveal
  timeoutId = window.setTimeout(function () {
    if (done) return;
    showStill();
    finish();
  }, TIMEOUT_MS);

  setProgress(4);

  if (shouldUseStillOnly()) {
    showStill();
    startSoftProgress(100);
    window.setTimeout(finish, 450);
    return;
  }

  startSoftProgress(90);
  bindVimeo();
})();
