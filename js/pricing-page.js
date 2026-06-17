(function () {
  "use strict";

  const state = {
    data: null,
    billing: "monthly",
    selectedTiers: {
      servicePros: "essential",
      ecommerceBrands: "essential"
    }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function getSiteType(key) {
    return state.data.siteTypes[key];
  }

  function updateSummary() {
    const el = $("#pricing-summary");
    if (!el || !state.data) return;

    if (state.billing === "oneTime") {
      const sp = getSiteType("servicePros");
      const ec = getSiteType("ecommerceBrands");
      el.textContent =
        "One-time builds: " +
        sp.oneTime.buildLabel +
        " (Service Pros) or " +
        ec.oneTime.buildLabel +
        " (Ecommerce). " +
        state.data.revisionPolicy.cardNote +
        ".";
      return;
    }

    const spTier = getSiteType("servicePros").monthly.tiers.find(
      (t) => t.id === state.selectedTiers.servicePros
    );
    const ecTier = getSiteType("ecommerceBrands").monthly.tiers.find(
      (t) => t.id === state.selectedTiers.ecommerceBrands
    );
    el.textContent =
      "Monthly: Service Pros " +
      spTier.priceLabel +
      " (" +
      spTier.name +
      ") · Ecommerce " +
      ecTier.priceLabel +
      " (" +
      ecTier.name +
      "). Pause or cancel anytime.";
  }

  function renderOneTimeCard(site) {
    const ot = site.oneTime;
    const rev = state.data.revisionPolicy;
    return `
      <article class="offer-card" id="${site.id}">
        <span class="offer-card__tag">${site.tag}</span>
        <h3>${site.name}</h3>
        <p class="offer-card__platform">Revenue system · ${site.platform}</p>
        <p class="offer-card__outcome">${site.outcome}</p>
        <div class="offer-card__prices">
          <div class="offer-card__price-block">
            <span class="offer-card__price">${ot.buildLabel}</span>
            <span class="offer-card__price-label">Starting at build</span>
          </div>
        </div>
        <p class="offer-card__revision">${rev.cardNote}</p>
        <ul>${ot.buildIncludes.map((i) => `<li>${i}</li>`).join("")}</ul>
        <p class="offer-card__note">${ot.scopeNote}</p>
        <a href="contact.html" class="button is-course w-inline-block">
          <div class="button_bg"></div>
          <div class="button_text">Start build</div>
        </a>
      </article>`;
  }

  function renderMonthlyCard(siteKey, site) {
    const selectedId = state.selectedTiers[siteKey];
    const tiersHtml = site.monthly.tiers
      .map((tier) => {
        const isSelected = tier.id === selectedId;
        const featureList = tier.ghlFeatures || tier.features || [];
        return `
        <button type="button" class="tier-option${isSelected ? " is-selected" : ""}" data-site="${siteKey}" data-tier="${tier.id}" aria-pressed="${isSelected}">
          <div class="tier-option__head">
            <span class="tier-option__name">${tier.name}</span>
            <span class="tier-option__price">${tier.priceLabel}</span>
          </div>
          <ul class="tier-option__features">${featureList.map((f) => `<li>${f}</li>`).join("")}</ul>
        </button>`;
      })
      .join("");

    const selectedTier = site.monthly.tiers.find((t) => t.id === selectedId);

    return `
      <article class="offer-card offer-card--monthly" id="${site.id}">
        <span class="offer-card__tag">${site.tag}</span>
        <h3>${site.name}</h3>
        <p class="offer-card__platform">Revenue system · ${site.platform}</p>
        <p class="offer-card__outcome">${site.outcome}</p>
        <div class="tier-stack" role="group" aria-label="${site.name} tiers">${tiersHtml}</div>
        <ul class="tier-includes">${selectedTier.includes.map((i) => `<li>${i}</li>`).join("")}</ul>
        <a href="contact.html" class="button is-course w-inline-block">
          <div class="button_bg"></div>
          <div class="button_text">Start ${selectedTier.name}</div>
        </a>
      </article>`;
  }

  function renderOffers() {
    const grid = $("#offer-grid");
    if (!grid || !state.data) return;

    const sp = getSiteType("servicePros");
    const ec = getSiteType("ecommerceBrands");

    if (state.billing === "oneTime") {
      grid.innerHTML = renderOneTimeCard(sp) + renderOneTimeCard(ec);
    } else {
      grid.innerHTML =
        renderMonthlyCard("servicePros", sp) + renderMonthlyCard("ecommerceBrands", ec);
    }

    $$(".tier-option", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        const siteKey = btn.getAttribute("data-site");
        const tierId = btn.getAttribute("data-tier");
        state.selectedTiers[siteKey] = tierId;
        renderOffers();
        updateSummary();
      });
    });
  }

  function renderLeakage() {
    const grid = $("#leakage-grid");
    if (!grid || !state.data) return;
    grid.innerHTML = state.data.leakage
      .map(
        (item) => `
      <article class="leakage-card">
        <p class="leakage-card__pain">${item.pain}</p>
        <p class="leakage-card__fix">${item.fix}</p>
      </article>`
      )
      .join("");
  }

  function renderValueStack(site) {
    const rows = site.valueStack
      .map(
        (row) =>
          `<tr><th scope="row">${row.item}</th><td>${formatMoney(row.anchor)}</td></tr>`
      )
      .join("");

    const essential = site.monthly.tiers[0];
    const youPay90 = site.oneTime.buildPrice + essential.price * 3;

    return `
      <article class="value-stack">
        <h3>${site.name}</h3>
        <p class="value-stack__disclaimer">Typical market rates — not an invoice.</p>
        <table>
          <tbody>${rows}</tbody>
        </table>
        <div class="value-stack__totals">
          <div>Retail (first 90 days): <strong>${formatMoney(site.retailFirst90)}+</strong></div>
          <div>Monthly Essential: <strong>${essential.priceLabel}</strong> (${formatMoney(youPay90)} first 90 days with build)</div>
          <p class="value-stack__payoff">One saved job or order often covers the build.</p>
        </div>
      </article>`;
  }

  function renderFaqSchema(faq) {
    const script = $("#faq-schema");
    if (!script) return;
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a }
      }))
    });
  }

  function setBilling(mode) {
    state.billing = mode;
    $$(".billing-toggle__btn").forEach((btn) => {
      const active = btn.getAttribute("data-billing") === mode;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const pathSection = $("#path-section");
    if (pathSection) {
      pathSection.hidden = mode === "oneTime";
    }

    renderOffers();
    updateSummary();
  }

  function hydrateStatic(data) {
    const heroTitle = $("#hero-title");
    const heroLead = $("#hero-lead");
    if (heroTitle) heroTitle.textContent = data.hero.headline;
    if (heroLead) heroLead.textContent = data.hero.sub;

    const sections = data.sections;
    if (sections) {
      const map = {
        "section-pricing": sections.pricing,
        "section-path": sections.path,
        "section-leakage": sections.leakage,
        "section-value": sections.value,
        "section-benefits": sections.benefits
      };
      Object.entries(map).forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      });
      const footer = $("#footer-cta-text");
      if (footer) footer.textContent = sections.footerCta;
    }

    const toggle = $(".billing-toggle");
    if (toggle && data.billingToggle) {
      const monthlyBtn = toggle.querySelector('[data-billing="monthly"]');
      const oneTimeBtn = toggle.querySelector('[data-billing="oneTime"]');
      if (monthlyBtn) monthlyBtn.textContent = data.billingToggle.monthly;
      if (oneTimeBtn) oneTimeBtn.textContent = data.billingToggle.oneTime;
    }

    const diyList = $("#diy-list");
    const managedList = $("#managed-list");
    if (diyList) {
      diyList.innerHTML = data.diyManaged.diy.map((i) => `<li>${i}</li>`).join("");
    }
    if (managedList) {
      managedList.innerHTML = data.diyManaged.managed
        .map((i) => `<li>${i}</li>`)
        .join("");
    }

    const hormoziLine = $("#path-hormozi");
    if (hormoziLine) hormoziLine.textContent = data.diyManaged.hormoziLine;

    const valueStacks = $("#value-stacks");
    if (valueStacks) {
      valueStacks.innerHTML =
        renderValueStack(data.siteTypes.servicePros) +
        renderValueStack(data.siteTypes.ecommerceBrands);
    }

    const benefitsGrid = $("#benefits-grid");
    if (benefitsGrid) {
      benefitsGrid.innerHTML = data.benefits
        .map(
          (b) => `
        <article class="benefit-pill">
          <h3>${b.title}</h3>
          <p>${b.text}</p>
        </article>`
        )
        .join("");
    }

    const faqList = $("#faq-list");
    if (faqList) {
      faqList.innerHTML = data.faq
        .map(
          (item) => `
        <article class="faq-item">
          <h3>${item.q}</h3>
          <p>${item.a}</p>
        </article>`
        )
        .join("");
    }

    renderFaqSchema(data.faq);
    renderLeakage();
  }

  function initToggle() {
    const toggle = $(".billing-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".billing-toggle__btn");
      if (!btn) return;
      setBilling(btn.getAttribute("data-billing"));
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

    hydrateStatic(state.data);
    initToggle();
    setBilling(state.data.billingToggle.default || "monthly");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
