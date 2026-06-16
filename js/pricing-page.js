(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function formatMoney(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function renderOfferCard(offer) {
    return `
      <article class="offer-card" id="${offer.id}">
        <span class="offer-card__tag">${offer.tag}</span>
        <h2>${offer.name}</h2>
        <p class="offer-card__platform">${offer.platform}</p>
        <p class="offer-card__outcome">${offer.outcome}</p>
        <div class="offer-card__prices">
          <div class="offer-card__price-block">
            <span class="offer-card__price">${offer.buildLabel}</span>
            <span class="offer-card__price-label">Starting at build</span>
          </div>
          <div class="offer-card__price-block">
            <span class="offer-card__price">${offer.managedLabel}</span>
            <span class="offer-card__price-label">Managed from</span>
          </div>
        </div>
        <ul>${offer.buildIncludes.map((i) => `<li>${i}</li>`).join("")}</ul>
        <p class="offer-card__note">${offer.scopeNote}</p>
        <a href="contact.html" class="button is-course w-inline-block">
          <div class="button_bg"></div>
          <div class="button_text">Start build</div>
        </a>
      </article>`;
  }

  function renderValueStack(offer) {
    const rows = offer.valueStack
      .map(
        (row) =>
          `<tr><th scope="row">${row.item}</th><td>${formatMoney(row.anchor)}</td></tr>`
      )
      .join("");

    const youPay =
      offer.buildPrice + offer.managedMonthly * 3;

    return `
      <article class="value-stack">
        <h3>${offer.name}</h3>
        <p class="value-stack__disclaimer">Typical market rates — not an invoice.</p>
        <table>
          <tbody>${rows}</tbody>
        </table>
        <div class="value-stack__totals">
          <div>Retail (first 90 days): <strong>${formatMoney(offer.retailFirst90)}+</strong></div>
          <div>You pay: <strong>${offer.buildLabel} + ${offer.managedLabel}</strong> (${formatMoney(youPay)} first 90 days)</div>
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

  async function init() {
    let data;
    try {
      const res = await fetch("data/pricing.json");
      if (!res.ok) throw new Error("pricing.json unavailable");
      data = await res.json();
    } catch (err) {
      console.error(err);
      return;
    }

    const heroTitle = $("#hero-title");
    const heroLead = $("#hero-lead");
    if (heroTitle) heroTitle.textContent = data.hero.headline;
    if (heroLead) heroLead.textContent = data.hero.sub;

    const offerGrid = $("#offer-grid");
    if (offerGrid) {
      offerGrid.innerHTML =
        renderOfferCard(data.offers.servicePros) +
        renderOfferCard(data.offers.ecommerceBrands);
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
        renderValueStack(data.offers.servicePros) +
        renderValueStack(data.offers.ecommerceBrands);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
