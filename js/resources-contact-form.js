/**
 * Resources page contact form → POST /api/contact (Airtable + team email).
 */
(function () {
  const form = document.getElementById("wf-form-Contact-Form");
  if (!form) return;

  const formBlock = form.closest(".form-block");
  const successEl = formBlock ? formBlock.querySelector(".w-form-done") : null;
  const errorEl = formBlock ? formBlock.querySelector(".w-form-fail") : null;

  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function showSuccess() {
    form.style.display = "none";
    if (errorEl) errorEl.style.display = "none";
    if (successEl) successEl.style.display = "block";
  }

  function showError() {
    if (errorEl) errorEl.style.display = "block";
    if (successEl) successEl.style.display = "none";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const name = val("name");
    const email = val("name-2");
    const budget = val("name-3");
    const details = val("Project-description");

    if (!name || !email || !details) {
      showError();
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      name: name,
      email: email,
      budget: budget,
      details: details,
      businessType: "Resources page inquiry",
      primaryGoal: details,
      sourcePage: "resources",
    };

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data.ok) {
          form.reset();
          showSuccess();
          if (window.SWFTAnalytics) {
            window.SWFTAnalytics.track("contact_form_submit", {
              page_path: location.pathname,
              form_name: "resources",
              budget_range: budget || "",
            });
          }
        } else {
          showError();
        }
      })
      .catch(function () {
        showError();
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();
