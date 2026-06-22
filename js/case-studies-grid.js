/**
 * Case Studies hub — fetch index JSON, render grid, search + category filters.
 */
(function () {
  const gridEl = document.getElementById("cs-grid");
  const searchEl = document.getElementById("cs-search");
  const emptyEl = document.getElementById("cs-empty");
  const filterBtns = document.querySelectorAll("[data-cs-filter]");

  if (!gridEl) return;

  let items = [];
  let activeFilter = "all";
  let searchQuery = "";

  const FILTER_MAP = {
    all: () => true,
    website: (item) => item.website === true,
    branding: (item) => item.branding === true,
    film: (item) => item.film === true,
    automation: (item) => item.type === "tips",
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getTags(item) {
    const tags = [];
    if (item.website) tags.push("Web Development");
    if (item.branding) tags.push("Brand Identity");
    if (item.film) tags.push("Content Creation");
    if (item.type === "tips") tags.push("Automation");
    return tags;
  }

  function cardTitle(item) {
    return item.title || item.name || "";
  }

  function cardThumb(item) {
    return item.thumbnail || item.image || "";
  }

  function matchesSearch(item, q) {
    if (!q) return true;
    const hay = [cardTitle(item), item.details, item.client, item.metric]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function filteredItems() {
    const predicate = FILTER_MAP[activeFilter] || FILTER_MAP.all;
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => predicate(item) && matchesSearch(item, q));
  }

  function buildCard(item) {
    const tags = getTags(item);
    const tagHtml = tags
      .map((t) => `<span class="cs-card-tag">#${escapeHtml(t.replace(/\s+/g, ""))}</span>`)
      .join("");
    const metricHtml = item.metric
      ? `<p class="cs-card-metric">${escapeHtml(item.metric)}</p>`
      : "";
    const thumbSrc = cardThumb(item);
    const thumb = thumbSrc
      ? `<img src="${escapeHtml(thumbSrc)}" alt="" loading="lazy" width="400" height="240">`
      : `<div class="cs-card-thumb-placeholder" aria-hidden="true"></div>`;

    return `
      <a href="${escapeHtml(item.href)}" class="cs-card">
        <div class="cs-card-thumb">${thumb}</div>
        <div class="cs-card-body">
          <div class="cs-card-tags">${tagHtml}</div>
          <h3 class="cs-card-title">${escapeHtml(cardTitle(item))}</h3>
          <p class="cs-card-details">${escapeHtml(item.details || "")}</p>
          ${metricHtml}
          <span class="cs-card-arrow" aria-hidden="true">→</span>
        </div>
      </a>`;
  }

  function render() {
    const list = filteredItems();
    gridEl.innerHTML = list.map(buildCard).join("");
    if (emptyEl) {
      emptyEl.hidden = list.length > 0;
    }
  }

  function setFilter(filter) {
    activeFilter = filter;
    filterBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.csFilter === filter);
    });
    render();
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.csFilter || "all"));
  });

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      searchQuery = searchEl.value;
      render();
    });
  }

  fetch("data/case-studies-index.json")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to load case studies");
      return res.json();
    })
    .then((data) => {
      items = Array.isArray(data) ? data : data.items || [];
      render();
    })
    .catch(() => {
      gridEl.innerHTML =
        '<p class="cs-error">Unable to load case studies. Please refresh the page.</p>';
    });
})();
