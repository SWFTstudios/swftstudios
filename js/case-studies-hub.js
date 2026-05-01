/**
 * Videos & Insights hub — Case Study Match-style scroll, prompt, modal.
 * POST /api/case-study-match (SWFT Worker); client scorer fallback on failure.
 *
 * API endpoint: reads data-worker-url attribute from [data-swft-hub] element,
 * falls back to same-origin /api/case-study-match.
 *
 * Cards are injected by the inline render script in case-studies.html which
 * fetches /data/case-studies-index.json and dispatches "swft:hub-cards-ready"
 * when done. This script listens for that event instead of DOMContentLoaded.
 */
(function () {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tokenize(s) {
    return new Set(
      String(s)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(function (w) {
          return w.length > 2;
        })
    );
  }

  function scoreMatch(prompt, cs) {
    const p = tokenize(prompt);
    const hay = tokenize(cs.title + " " + cs.content);
    var n = 0;
    p.forEach(function (w) {
      if (hay.has(w)) n++;
    });
    return n;
  }

  function clientPick(prompt, list) {
    if (!list.length) return null;
    var best = list[0];
    var bestScore = scoreMatch(prompt, best);
    for (var i = 1; i < list.length; i++) {
      var s = scoreMatch(prompt, list[i]);
      if (s > bestScore) {
        best = list[i];
        bestScore = s;
      }
    }
    return bestScore > 0 ? best : list[0];
  }

  function getCaseStudyData(items) {
    return items.map(function (el) {
      var titleEl = el.querySelector(".case-study_title");
      var contentEl = el.querySelector(".case-study_content");
      var linkEl = el.querySelector(".case-study_link");
      return {
        title: (titleEl && titleEl.textContent.trim()) || "",
        content: (contentEl && contentEl.textContent.trim()) || "",
        link: (linkEl && linkEl.getAttribute("href")) || "",
      };
    });
  }

  function init() {
    var hub = document.querySelector("[data-swft-hub]");
    if (!hub) return;

    /* Gap 2: read API endpoint from data attribute, fall back to same-origin path */
    var API = (hub.dataset && hub.dataset.workerUrl) || "/api/case-study-match";

    var gs = window.gsap;
    if (gs && window.Flip && window.ScrollTrigger) {
      gs.registerPlugin(window.Flip, window.ScrollTrigger);
    }

    var items = [].slice.call(hub.querySelectorAll(".case-study_item"));
    if (!items.length) return;

    var parent = items[0].parentNode;
    var oddWrap = document.createElement("div");
    oddWrap.className = "case-study_group is-odd";
    var evenWrap = document.createElement("div");
    evenWrap.className = "case-study_group is-even";
    parent.insertBefore(oddWrap, items[0]);
    parent.insertBefore(evenWrap, items[0]);
    items.forEach(function (item, i) {
      (i % 2 === 0 ? oddWrap : evenWrap).appendChild(item);
    });

    var promptInput = hub.querySelector(".prompt_input");
    var promptResult = hub.querySelector(".prompt_result");
    var promptLink = hub.querySelector(".prompt_link");
    var modalTarget = hub.querySelector(".modal_project");
    var live = document.getElementById("swft-hub-live");
    var lenis = null;

    function setLive(msg) {
      if (live) live.textContent = msg || "";
    }

    function scrollMarquee() {
      if (!gs || !window.ScrollTrigger || reducedMotion) return;
      gs.timeline({
        scrollTrigger: {
          trigger: "body",
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      }).fromTo(".swft-hub-match .case-study_group", { "--progress": 0 }, { "--progress": 1, ease: "none" });
    }

    var cardEl = null;
    function flipInto(element) {
      if (!gs || !window.Flip || !cardEl) {
        if (cardEl && element) element.appendChild(cardEl);
        return;
      }
      var state = Flip.getState(cardEl);
      element.appendChild(cardEl);
      Flip.from(state, { duration: 0.55, ease: "power2.inOut", zIndex: 100 });
    }

    function showModal() {
      if (!gs) {
        hub.querySelector(".modal_wrap").style.display = "block";
        return;
      }
      gs.set(".swft-hub-match .modal_wrap", { display: "block" });
      var scrollEl = hub.querySelector(".prompt_scroll");
      if (scrollEl) scrollEl.scrollTop = 0;
      setTimeout(function () {
        cardEl = hub.querySelector(".case-study_item.is-active .case-study_card");
        if (cardEl && modalTarget) flipInto(modalTarget);
      }, reducedMotion ? 0 : 400);
      var tl = gs.timeline();
      tl.fromTo(
        ".swft-hub-match .modal_content_wrap",
        { delay: reducedMotion ? 0 : 0.2, "--progress": 1 },
        { "--progress": 0, ease: "power1.inOut", duration: 0.55 }
      );
      tl.fromTo(
        ".swft-hub-match .panel",
        { width: "0rem" },
        { width: "40rem", ease: "power1.inOut", duration: 0.55 },
        "<"
      );
      tl.fromTo(
        ".swft-hub-match .modal_backdrop",
        { opacity: 0 },
        { opacity: 1, duration: 0.2 },
        reducedMotion ? 0 : "-=0.2"
      );
      if (promptResult && promptResult.children.length) {
        tl.from(promptResult.children, { opacity: 0, stagger: 0.02, duration: 0.2 }, "-=0.1");
      }
    }

    function hideModal() {
      var activeItem = hub.querySelector(".case-study_item.is-active");
      if (activeItem && cardEl) flipInto(activeItem);
      if (gs) {
        var tl = gs.timeline({
          onComplete: function () {
            gs.set(".swft-hub-match .prompt_wrap", { yPercent: 0, scale: 1 });
          },
        });
        tl.fromTo(".swft-hub-match .modal_backdrop", { opacity: 1 }, { opacity: 0, duration: 0.2 });
        tl.fromTo(
          ".swft-hub-match .modal_content_wrap",
          { "--progress": 0 },
          { delay: 0.35, "--progress": 1, ease: "power1.inOut", duration: 0.55 },
          ">"
        );
        tl.to(".swft-hub-match .panel", { width: "0rem", ease: "power1.inOut", duration: 0.55 }, "<");
        tl.set(".swft-hub-match .modal_wrap", { display: "none" });
      } else {
        hub.querySelector(".modal_wrap").style.display = "none";
      }
      if (promptInput) promptInput.value = "";
      items.forEach(function (el) {
        el.classList.remove("is-active");
      });
      cardEl = null;
    }

    function titleMatches(cardTitle, matchedRaw) {
      var m = (matchedRaw || "").toLowerCase().trim();
      var t = (cardTitle || "").toLowerCase().trim();
      if (!m) return false;
      if (t === m) return true;
      if (t.length > 8 && m.length > 8 && (t.includes(m) || m.includes(t))) return true;
      return false;
    }

    function applyMatch(data) {
      var matched = data.matchedCaseStudy || "";
      items.forEach(function (item) {
        var t = item.querySelector(".case-study_title");
        var title = (t && t.textContent.trim()) || "";
        if (titleMatches(title, matched)) item.classList.add("is-active");
        else item.classList.remove("is-active");
      });
      if (promptResult) promptResult.innerHTML = data.explanation || "";
      if (promptLink) {
        if (data.matchedLink) {
          promptLink.href = data.matchedLink;
          promptLink.style.display = "block";
        } else {
          promptLink.style.display = "none";
        }
      }
    }

    async function handlePrompt(userPrompt) {
      var caseStudies = getCaseStudyData(items);
      document.body.classList.add("loading");
      if (gs) {
        gs.to(".swft-hub-match .prompt_wrap", {
          yPercent: 100,
          scale: 0.6,
          duration: reducedMotion ? 0 : 0.3,
          ease: "power3.out",
        });
      }
      try {
        var res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userPrompt, caseStudies: caseStudies }),
        });
        if (!res.ok) throw new Error("worker " + res.status);
        var data = await res.json();
        applyMatch(data);
        setLive("Match ready.");
      } catch (e) {
        var pick = clientPick(userPrompt, caseStudies);
        applyMatch({
          explanation:
            "<p>Showing the closest match using on-device scoring (API unavailable).</p><p><strong>" +
            (pick && pick.title ? pick.title : "") +
            "</strong></p>",
          matchedCaseStudy: pick && pick.title ? pick.title.toLowerCase() : "",
          matchedLink: pick && pick.link ? pick.link : "",
        });
        setLive("Used offline match.");
      }
      document.body.classList.remove("loading");
      showModal();
    }

    if (!reducedMotion && window.Lenis) {
      lenis = new Lenis({
        lerp: 0.1,
        wheelMultiplier: 0.7,
        gestureOrientation: "vertical",
        normalizeWheel: false,
        smoothTouch: false,
      });
      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
      setTimeout(function () {
        lenis.stop();
      }, 80);
    }

    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.addEventListener("load", function () {
      if (lenis) lenis.scrollTo(0, { immediate: true });
    });

    if (gs) {
      var tl3 = gs.timeline({
        onComplete: function () {
          if (lenis) lenis.start();
          document.body.classList.remove("intro");
          scrollMarquee();
        },
      });
      tl3.fromTo(
        ".swft-hub-match .loader_image",
        { scale: 0, rotation: 180 },
        { scale: 1, rotation: 0, duration: reducedMotion ? 0 : 0.65, ease: "power2.out" },
        0
      );
      tl3.fromTo(".swft-hub-match .cms-wrapper", { opacity: 0 }, { opacity: 1, delay: reducedMotion ? 0 : 0.25 });
      tl3.fromTo(
        ".swft-hub-match .case-study_group",
        { "--progress": reducedMotion ? 0 : 0.2 },
        { "--progress": 0, ease: "power3.inOut", duration: reducedMotion ? 0 : 1.1 },
        "<"
      );
    } else {
      document.body.classList.remove("intro");
      var wrap = hub.querySelector(".cms-wrapper");
      if (wrap) wrap.style.opacity = "1";
      var loaderImg = hub.querySelector(".loader_image");
      if (loaderImg) loaderImg.style.transform = "";
    }

    if (promptInput) {
      promptInput.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          var v = promptInput.value.trim();
          if (v) handlePrompt(v);
        }
      });
    }
    var btn = hub.querySelector(".prompt_circle");
    if (btn) {
      btn.addEventListener("click", function () {
        var v = (promptInput && promptInput.value.trim()) || "";
        if (v) handlePrompt(v);
      });
    }
    hub.querySelectorAll(".modal_close_wrap, .modal_backdrop").forEach(function (el) {
      el.addEventListener("click", hideModal);
    });
  }

  /*
   * Listen for the custom event dispatched by the inline render script once
   * /data/case-studies-index.json has been fetched and cards are in the DOM.
   * If the event fires before this listener is attached (shouldn't happen with
   * defer, but just in case), fall back to DOMContentLoaded so the hub still
   * initialises even when cards are empty.
   */
  var ready = false;
  document.addEventListener("swft:hub-cards-ready", function () {
    ready = true;
    init();
  });
  document.addEventListener("DOMContentLoaded", function () {
    /* Fallback: fire init if the JSON event never came (e.g. no fetch support) */
    if (!ready) init();
  });
})();
