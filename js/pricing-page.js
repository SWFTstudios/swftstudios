(function () {
  "use strict";

  const state = {
    data: null,
    activeTab: "build",
    billing: "monthly",
    selectedBuild: "growth-launch",
    selectedRetainer: "core"
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function updateSummary() {
    const el = $("#pricing-summary");
    if (!el || !state.data) return;

    const build = state.data.buildTiers.find((t) => t.id === state.selectedBuild);
    const retainer = state.data.retainerTiers.find((t) => t.id === state.selectedRetainer);
    const monthly =
      state.billing === "annual" ? retainer.annualMonthly : retainer.monthly;

    el.innerHTML =
      "<strong>Your stack:</strong> " +
      build.priceLabel +
      " " +
      build.suffix +
      " (" +
      build.name +
      ") + " +
      formatMoney(monthly) +
      "/mo " +
      retainer.name +
      (state.billing === "annual" ? " (annual billing)" : "") +
      ".";
  }

  function renderBuildCards() {
    const mount = $("#build-cards");
    if (!mount || !state.data) return;

    mount.innerHTML = state.data.buildTiers
      .map(
        (tier) => `
      <article class="pricing-card${tier.featured ? " is-featured" : ""}" data-build-id="${tier.id}">
        <h3>${tier.name}</h3>
        <p class="price">${tier.priceLabel} <span class="price-suffix">${tier.suffix}</span></p>
        <p>${tier.audience}</p>
        <p><strong>Timeline:</strong> ${tier.timeline}</p>
        <ul>${tier.includes.map((i) => `<li>${i}</li>`).join("")}</ul>
        <div class="excludes"><strong>Not included:</strong> ${tier.excludes.join("; ")}.</div>
        <a href="contact.html" class="button is-course w-inline-block">
          <div class="button_bg"></div>
          <div class="button_text">Start build</div>
        </a>
      </article>`
      )
      .join("");

    $$("[data-build-id]", mount).forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        state.selectedBuild = card.getAttribute("data-build-id");
        updateSummary();
      });
    });
  }

  function renderRetainerCards() {
    const mount = $("#retainer-cards");
    if (!mount || !state.data) return;

    mount.innerHTML = state.data.retainerTiers
      .map((tier) => {
        const price =
          state.billing === "annual" ? tier.annualMonthly : tier.monthly;
        return `
      <article class="pricing-card${tier.featured ? " is-featured" : ""}" data-retainer-id="${tier.id}">
        <h3>${tier.name}</h3>
        <p class="price">${formatMoney(price)} <span class="price-suffix">/mo</span></p>
        <p>${tier.tagline}</p>
        <ul>${tier.includes.map((i) => `<li>${i}</li>`).join("")}</ul>
        <a href="contact.html" class="button is-course w-inline-block">
          <div class="button_bg"></div>
          <div class="button_text">Start retainer</div>
        </a>
      </article>`;
      })
      .join("");

    $$("[data-retainer-id]", mount).forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        state.selectedRetainer = card.getAttribute("data-retainer-id");
        updateSummary();
      });
    });
  }

  function renderBaselineChips() {
    const mount = $("#baseline-chips");
    if (!mount || !state.data) return;
    mount.innerHTML = state.data.baselineIncluded
      .map((item) => `<span class="baseline-chip">${item}</span>`)
      .join("");
  }

  function cell(value) {
    return value
      ? '<span class="compare-yes" aria-label="Included">✓</span>'
      : '<span class="compare-no" aria-label="Not included">—</span>';
  }

  function renderComparison() {
    const table = $("#compare-table-body");
    const mobile = $("#compare-mobile");
    if (!table || !mobile || !state.data) return;

    const rows = [];
    state.data.featureMatrix.forEach((group) => {
      rows.push(
        `<tr class="group-row"><td colspan="5">${group.group}</td></tr>`
      );
      group.features.forEach((f) => {
        rows.push(`<tr>
          <td>${f.name}</td>
          <td>${cell(f.build)}</td>
          <td>${cell(f.core)}</td>
          <td>${cell(f.growth)}</td>
          <td>${cell(f.partner)}</td>
        </tr>`);
      });
    });
    table.innerHTML = rows.join("");

    const tiers = [
      { key: "build", label: "Build only" },
      { key: "core", label: "Core $399" },
      { key: "growth", label: "Growth $799" },
      { key: "partner", label: "Partner $1,499" }
    ];

    mobile.innerHTML = tiers
      .map((tier) => {
        const items = [];
        state.data.featureMatrix.forEach((group) => {
          group.features.forEach((f) => {
            if (f[tier.key]) items.push(f.name);
          });
        });
        return `<article class="compare-mobile-card">
          <h4>${tier.label}</h4>
          <ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>
        </article>`;
      })
      .join("");
  }

  function renderFaq() {
    const mount = $("#faq-list");
    if (!mount || !state.data) return;
    mount.innerHTML = state.data.faq
      .map(
        (item) => `
      <article class="faq-item">
        <h3>${item.q}</h3>
        <p>${item.a}</p>
      </article>`
      )
      .join("");
  }

  function renderFaqSchema() {
    if (!state.data) return;
    const script = $("#faq-schema");
    if (!script) return;
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: state.data.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    });
  }

  function setActiveTab(tabId) {
    state.activeTab = tabId;
    $$(".pricing-tab").forEach((tab) => {
      const isActive = tab.getAttribute("data-tab") === tabId;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    $$(".pricing-panel").forEach((panel) => {
      const isActive = panel.id === "panel-" + tabId;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
    if (history.replaceState) {
      const hashMap = { build: "#build", retainer: "#retainer", stack: "#stack", workflow: "#workflow" };
      const hash = hashMap[tabId] || "";
      if (hash) history.replaceState(null, "", hash);
    }
  }

  function initTabs() {
    const tablist = $(".pricing-tablist");
    if (!tablist) return;

    tablist.addEventListener("click", (e) => {
      const tab = e.target.closest(".pricing-tab");
      if (!tab) return;
      setActiveTab(tab.getAttribute("data-tab"));
    });

    tablist.addEventListener("keydown", (e) => {
      const tabs = $$(".pricing-tab");
      const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
      let next = current;
      if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
      if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = tabs.length - 1;
      if (next !== current) {
        e.preventDefault();
        tabs[next].focus();
        setActiveTab(tabs[next].getAttribute("data-tab"));
      }
    });

    const hash = location.hash.replace("#", "");
    if (hash === "retainer" || hash === "build" || hash === "stack" || hash === "workflow") {
      setActiveTab(hash === "stack" ? "stack" : hash === "workflow" ? "workflow" : hash);
    } else {
      setActiveTab("build");
    }
  }

  function initBillingToggle() {
    const toggle = $(".billing-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-billing]");
      if (!btn) return;
      state.billing = btn.getAttribute("data-billing");
      $$(".billing-toggle button").forEach((b) => {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      renderRetainerCards();
      updateSummary();
    });
  }

  async function init() {
    try {
      const res = await fetch("data/pricing.json");
      if (!res.ok) throw new Error("pricing.json unavailable");
      state.data = await res.json();
    } catch (err) {
      console.error(err);
      return;
    }

    renderBuildCards();
    renderRetainerCards();
    renderBaselineChips();
    renderComparison();
    renderFaq();
    renderFaqSchema();
    updateSummary();
    initTabs();
    initBillingToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
