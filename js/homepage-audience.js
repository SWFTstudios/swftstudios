(function () {
  "use strict";

  function setExpanded(card, expanded) {
    var blurb = card.querySelector(".hp-audience-card__blurb");
    var btn = card.querySelector(".hp-audience-card__toggle");
    card.classList.toggle("is-expanded", expanded);
    card.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (blurb) {
      blurb.setAttribute("aria-hidden", expanded ? "false" : "true");
    }
    if (btn) {
      btn.textContent = expanded ? "Show less" : "Learn more";
      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
  }

  function toggleCard(card) {
    if (!card) return;
    setExpanded(card, !card.classList.contains("is-expanded"));
  }

  function init() {
    var section = document.getElementById("homepage-audience");
    if (!section) return;

    section.querySelectorAll(".hp-audience-card__blurb").forEach(function (blurb) {
      blurb.setAttribute("aria-hidden", "true");
    });

    section.addEventListener("click", function (e) {
      var btn = e.target.closest(".hp-audience-card__toggle");
      var card = e.target.closest(".hp-audience-card");
      if (!card || !section.contains(card)) return;

      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        toggleCard(card);
        return;
      }

      if (e.target.closest("a")) return;
      toggleCard(card);
    });

    section.addEventListener("keydown", function (e) {
      var card = e.target.closest(".hp-audience-card");
      if (!card || !section.contains(card)) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.classList.contains("hp-audience-card__toggle")) return;
      if (e.target !== card) return;
      e.preventDefault();
      toggleCard(card);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
