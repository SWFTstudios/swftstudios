(function () {
  "use strict";

  var FORM_ID = "ptw-lead-form";
  var BOOK_SECTION_ID = "book-call";
  var STICKY_CTA_ID = "ptw-sticky-cta";
  var CAL_EMBED_ID = "ptw-cal-embed";
  var SOURCE = "PT Weekend Landing";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function smoothScrollTo(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function initScrollLinks() {
    document.querySelectorAll('a[href="#' + BOOK_SECTION_ID + '"]').forEach(function (link) {
      link.addEventListener("click", function (e) {
        var target = document.getElementById(BOOK_SECTION_ID);
        if (!target) return;
        e.preventDefault();
        smoothScrollTo(target);
      });
    });
  }

  function initReveals() {
    if (prefersReducedMotion()) {
      document.querySelectorAll(".ptw-reveal").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var els = document.querySelectorAll(".ptw-reveal");
    if (!els.length || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach(function (el) { observer.observe(el); });
  }

  function initStickyCta() {
    var sticky = document.getElementById(STICKY_CTA_ID);
    var bookSection = document.getElementById(BOOK_SECTION_ID);
    if (!sticky || !bookSection) return;

    var btn = sticky.querySelector("a, button");
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        smoothScrollTo(bookSection);
      });
    }

    if (!("IntersectionObserver" in window)) {
      sticky.classList.add("is-visible");
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            sticky.classList.remove("is-visible");
          } else {
            sticky.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.15 }
    );
    observer.observe(bookSection);
    sticky.classList.add("is-visible");
  }

  function loadCalEmbed() {
    var container = document.getElementById(CAL_EMBED_ID);
    if (!container || container.dataset.loaded === "true") return;

    container.dataset.loaded = "true";
    container.hidden = false;

    (function (C, A, L) {
      var p = function (a, ar) { a.q.push(ar); };
      var d = document;
      C.Cal = C.Cal || function () {
        var cal = C.Cal;
        var ar = arguments;
        if (!cal.loaded) {
          cal.ns = {};
          cal.q = cal.q || [];
          d.head.appendChild(d.createElement("script")).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          var api = function () { p(api, arguments); };
          var namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === "string") {
            cal.ns[namespace] = api;
          } else {
            p(cal, ar);
          }
          return;
        }
        p(cal, ar);
      };
    })(window, "https://app.cal.com/embed/embed.js", "init");

    window.Cal("init", "swft-meeting", { origin: "https://cal.com" });
    window.Cal.ns["swft-meeting"]("inline", {
      elementOrSelector: "#" + CAL_EMBED_ID,
      config: { layout: "month_view" },
      calLink: "swftstudios/swft-meeting"
    });
  }

  function showFormStatus(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    el.className = "ptw-status is-" + type;
  }

  function initForm() {
    var form = document.getElementById(FORM_ID);
    if (!form) return;

    var statusEl = document.getElementById("ptw-form-status");
    var submitBtn = document.getElementById("ptw-form-submit");
    var formShell = document.getElementById("ptw-form-shell");
    var successPanel = document.getElementById("ptw-success-panel");
    var endpoint = form.getAttribute("data-endpoint") || "/api/contact";

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = (form.elements.name && form.elements.name.value || "").trim();
      var email = (form.elements.email && form.elements.email.value || "").trim();
      var phone = (form.elements.phone && form.elements.phone.value || "").trim();
      var instagram = (form.elements.instagram && form.elements.instagram.value || "").trim();
      var businessType = (form.elements.businessType && form.elements.businessType.value || "").trim();
      var primaryGoal = (form.elements.primaryGoal && form.elements.primaryGoal.value || "").trim();

      if (!name || !email || !businessType || !primaryGoal) {
        showFormStatus(statusEl, "Please fill in all required fields.", "error");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (statusEl) statusEl.hidden = true;

      var payload = {
        name: name,
        email: email,
        phone: phone,
        instagram: instagram,
        businessType: businessType,
        primaryGoal: primaryGoal,
        source: SOURCE,
        details: ""
      };

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          if (result.status === 429) {
            showFormStatus(statusEl, "Too many requests — please wait a minute and try again.", "error");
            return;
          }
          if (result.ok && result.data && result.data.ok) {
            if (formShell) formShell.hidden = true;
            if (successPanel) {
              successPanel.hidden = false;
              if (!result.data.stored) {
                var successNote = successPanel.querySelector(".ptw-success-note");
                if (successNote) {
                  successNote.textContent =
                    "Thanks for reaching out. Pick a time below. (Note: lead backup may be delayed — you can also book on Cal.com.)";
                }
              }
            }
            loadCalEmbed();
            smoothScrollTo(document.getElementById(BOOK_SECTION_ID));
          } else {
            showFormStatus(
              statusEl,
              "Something went wrong. Email hello@swftstudios.com or book on Cal.com.",
              "error"
            );
          }
        })
        .catch(function () {
          showFormStatus(
            statusEl,
            "Unable to send right now. Email hello@swftstudios.com or book on Cal.com.",
            "error"
          );
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function init() {
    initScrollLinks();
    initReveals();
    initStickyCta();
    initForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
