/* ============================================================
   Customer Journey Check (guide-worksheet.html, #jc-root).
   Content: data/growth-guide.json (same file the PDF is built from).

   Steps: 0 "Start with the change you want" → four stages (Found,
   Trust, Take action, Come back; five questions each) → results.
   Answers save on this device as they go. No email needed to see results.

   Scoring: Yes 2 · Partly 1 · No 0 · "I don't know" = unanswered and
   flagged, never counted as a failure. A stage with unknowns is shown as
   provisional (known points / known maximum, with the answered count).

   Priority (a suggestion the owner can change):
     1. a broken core action or handoff (Take action critical questions = No)
     2. a delivery or customer-care failure (Come back critical = No)
     3. otherwise the weakest known stage, ties broken by the chosen outcome
     4. if that stage has 2+ unknowns, the priority is to verify it first
   ============================================================ */
(function () {
  "use strict";
  var root = document.getElementById("jc-root");
  if (!root) return;
  var KEY = "swft-journey-check";
  var CAL = "https://cal.com/swftstudios/swft-meeting";
  var G = null, S = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: this visit only */ } }
  function track(n, d) { try { if (window.SWFTAnalytics) window.SWFTAnalytics.track(n, d || {}); } catch (e) { /* optional */ } }
  function fresh() {
    var a = {};
    G.stages.forEach(function (st) { a[st.id] = [null, null, null, null, null]; });
    return { step: 0, industry: "", offer: "", who: "", next: "", outcome: "", current: "", target: "", baselineUnknown: false, answers: a, override: "", card: {} };
  }
  function ind() { return G.industries.filter(function (i) { return i.id === S.industry; })[0] || G.industries[0]; }
  function fill(t) {
    var i = ind();
    return String(t).replace(/\{(action|actionNoun|proof|relationship)\}/g, function (_, k) { return i[k]; });
  }
  function stageById(id) { return G.stages.filter(function (s) { return s.id === id; })[0]; }
  function pts(id) { var a = G.answers.filter(function (x) { return x.id === id; })[0]; return a ? a.points : null; }

  /* ---------- Scoring + priority ---------- */
  function summary(st) {
    var arr = S.answers[st.id], known = 0, got = 0, unknown = 0, answered = 0;
    arr.forEach(function (v) {
      if (!v) return;
      answered++;
      if (v === "unknown") { unknown++; return; }
      known++; got += pts(v);
    });
    return { id: st.id, got: got, max: known * 2, known: known, unknown: unknown, answered: answered, complete: known === 5, ratio: known ? got / (known * 2) : null };
  }
  function priority() {
    var sums = G.stages.map(summary);
    var by = {}; sums.forEach(function (s) { by[s.id] = s; });
    function anyNo(id) { var st = stageById(id); return (st.critical || []).some(function (i) { return S.answers[id][i] === "no"; }); }
    var p = null;
    if (anyNo("action")) p = { stage: "action", why: "You reported a problem with the core action or the handoff after it. That usually costs more than any lack of traffic." };
    else if (anyNo("back")) p = { stage: "back", why: "You reported a gap in delivery or customer care. Fix that before bringing in more customers." };
    else {
      var pref = (G.outcomes.filter(function (o) { return o.id === S.outcome; })[0] || {}).stage;
      var cands = sums.filter(function (s) { return s.known >= 2; });
      cands.sort(function (a, b) { return (a.ratio - b.ratio) || ((b.id === pref) - (a.id === pref)); });
      if (cands.length) p = { stage: cands[0].id, why: "It's your weakest stage based on what you know so far." };
      else p = { stage: (sums.slice().sort(function (a, b) { return b.unknown - a.unknown; })[0] || {}).id || "found", why: "Most of your answers are “I don't know”, so the first job is to find out." };
    }
    p.verify = by[p.stage].unknown >= 2 || by[p.stage].known < 2;
    if (S.override && stageById(S.override)) { p = { stage: S.override, why: "You chose this priority.", verify: by[S.override].unknown >= 2 || by[S.override].known < 2, chosen: true }; }
    var rest = sums.filter(function (s) { return s.id !== p.stage; })
      .sort(function (a, b) { return ((a.ratio == null ? 1 : a.ratio) - (b.ratio == null ? 1 : b.ratio)); })
      .map(function (s) { return s.id; });
    return { p: p, order: [p.stage].concat(rest), sums: sums };
  }

  /* ---------- Rendering ---------- */
  var STEPS = 6; // start + 4 stages + results
  function progress() {
    var pct = Math.round((Math.min(S.step, 5) / 5) * 100);
    var names = ["Start"].concat(G.stages.map(function (s) { return s.title; })).concat(["Results"]);
    return '<div class="jc-prog" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
      '<ol class="jc-steps">' + names.map(function (n, i) {
        return '<li class="' + (i === S.step ? "is-on" : i < S.step ? "is-done" : "") + '">' + esc(n) + "</li>";
      }).join("") + "</ol>";
  }
  function nav(nextLabel) {
    return '<div class="jc-nav">' +
      (S.step > 0 ? '<button type="button" class="mf-btn mf-btn--ghost" data-jc="back">Back</button>' : "<span></span>") +
      '<button type="button" class="mf-btn" data-jc="next">' + esc(nextLabel || "Next") + ' <span class="mf-arrow" aria-hidden="true">→</span></button></div>';
  }
  function chips(name, list, cur) {
    return '<div class="jc-chips" role="radiogroup">' + list.map(function (o) {
      return '<label class="jc-chip"><input type="radio" name="' + name + '" value="' + esc(o.id) + '"' + (cur === o.id ? " checked" : "") + "><span>" + esc(o.label) + "</span></label>";
    }).join("") + "</div>";
  }

  function viewStart() {
    var i = S.industry ? ind() : null;
    return '<section class="jc-card" aria-labelledby="jc-h">' +
      '<p class="mf-label">(Start with the change you want)</p>' +
      '<h2 class="jc-h" id="jc-h">What are we checking?</h2>' +
      '<fieldset class="jc-q"><legend>1. What kind of business do you run?</legend>' + chips("industry", G.industries, S.industry) + "</fieldset>" +
      '<div class="jc-q"><label for="jc-offer">2. What is the main offer you want this guide to focus on?</label><input id="jc-offer" data-field="offer" maxlength="160" value="' + esc(S.offer) + '" placeholder="e.g. Kitchen remodel consultations"></div>' +
      '<div class="jc-q"><label for="jc-who">3. Who is it for, and what does it help them achieve?</label><input id="jc-who" data-field="who" maxlength="200" value="' + esc(S.who) + '" placeholder="e.g. Homeowners in Hudson County planning a remodel"></div>' +
      '<div class="jc-q"><label for="jc-next">4. What should an interested person do next?</label><input id="jc-next" data-field="next" maxlength="160" value="' + esc(S.next || (i ? i.action.charAt(0).toUpperCase() + i.action.slice(1) : "")) + '" placeholder="e.g. Book a consultation"></div>' +
      '<fieldset class="jc-q"><legend>5. What would meaningful progress look like over the next 30 days?</legend>' + chips("outcome", G.outcomes, S.outcome) +
        '<div class="jc-row"><div><label for="jc-cur">Where it is now</label><input id="jc-cur" data-field="current" maxlength="80" value="' + esc(S.current) + '" placeholder="e.g. 6 a month"' + (S.baselineUnknown ? " disabled" : "") + "></div>" +
        '<div><label for="jc-tar">Where you want it</label><input id="jc-tar" data-field="target" maxlength="80" value="' + esc(S.target) + '" placeholder="e.g. 10 a month"></div></div>' +
        '<label class="jc-check"><input type="checkbox" data-field="baselineUnknown"' + (S.baselineUnknown ? " checked" : "") + "> I don't know the current number yet</label>" +
        '<p class="jc-note">A target is your goal, not a forecast or a SWFT guarantee.' + (i ? " " + esc(i.outcomeHint) : "") + "</p>" +
      "</fieldset>" +
      '<p class="jc-err" role="alert" hidden></p>' + nav("Start the check") + "</section>";
  }

  function viewStage(st) {
    var a = S.answers[st.id];
    return '<section class="jc-card" aria-labelledby="jc-h">' +
      '<p class="mf-label">(' + st.num + " &middot; " + esc(st.title) + ")</p>" +
      '<h2 class="jc-h" id="jc-h">' + esc(st.question) + "</h2>" +
      '<p class="jc-intro">' + esc(st.intro) + " Use a recent example, a customer test or a record where you can.</p>" +
      st.questions.map(function (q, k) {
        return '<fieldset class="jc-q jc-q--ans"><legend>' + (k + 1) + ". " + esc(fill(q)) + "</legend>" +
          chips(st.id + "-" + k, G.answers, a[k]) + "</fieldset>";
      }).join("") +
      '<p class="jc-err" role="alert" hidden></p>' + nav(st.id === "back" ? "See my results" : "Next stage") + "</section>";
  }

  function stageScore(s) {
    if (!s.answered) return "Not answered";
    if (s.complete) return s.got + " / 10";
    return "Provisional: " + s.got + " / " + s.max + " &middot; " + s.known + " of 5 answered" + (s.unknown ? " &middot; " + s.unknown + " to verify" : "");
  }

  function viewResults() {
    var R = priority(), p = R.p, st = stageById(p.stage);
    var outcome = (G.outcomes.filter(function (o) { return o.id === S.outcome; })[0] || {}).label || "your chosen outcome";
    var nextIds = R.order.slice(1, 3);
    var baseline = S.baselineUnknown || !S.current ? "Not known yet. Start recording it this week (" + st.evidence.charAt(0).toLowerCase() + st.evidence.slice(1).replace(/\.$/, "") + ")." : S.current + (S.target ? " now, aiming for " + S.target : "");
    var title = p.verify ? "Verify " + st.title.toLowerCase() : st.title;
    var cardDefaults = [
      S.who || "", outcome + (S.target ? " (target: " + S.target + ")" : ""), st.obstacle ? fill(st.obstacle) : "",
      S.baselineUnknown || !S.current ? "Not known yet" : S.current, fill(st.firstAction), "", "Run it end to end as a customer", fill(st.evidence).split(".")[0] + " · review in 30 days", "", ""
    ];
    return '<section class="jc-results" aria-labelledby="jc-h">' +
      '<div class="jc-card jc-card--hero">' +
        '<p class="mf-label">(' + esc(G.checkName) + (S.offer ? " &middot; " + esc(S.offer) : "") + ")</p>" +
        '<h2 class="jc-h" id="jc-h">Your first priority: <span class="jc-accent">' + esc(title) + "</span></h2>" +
        '<p class="jc-lead">Based on your answers, ' + esc(fill(st.obstacle)) + ", which may be getting in the way of <b>" + esc(outcome.toLowerCase()) + "</b>. " +
          (p.verify ? "Several answers here were “I don't know”, so start by checking: " : "Start by checking: ") + esc(fill(st.firstAction).split(".")[0]) + ".</p>" +
        '<p class="jc-why">' + esc(p.why) + "</p>" +
        '<dl class="jc-dl">' +
          "<dt>Do this week</dt><dd>" + esc(fill(st.firstAction)) + "</dd>" +
          "<dt>Record before changing it</dt><dd>" + esc(baseline) + "</dd>" +
          "<dt>Watch for</dt><dd>" + esc(fill(st.evidence)) + "</dd>" +
          "<dt>Review on</dt><dd>" + esc(reviewDate()) + "</dd>" +
          "<dt>If it doesn't improve</dt><dd>Check whether traffic, season, promotions or capacity changed, and whether the change was actually live, before adding more tools or traffic.</dd>" +
        "</dl>" +
        '<label class="jc-override">Not the right priority? <select data-field="override"><option value="">Use the suggestion</option>' +
          G.stages.map(function (s) { return '<option value="' + s.id + '"' + (S.override === s.id ? " selected" : "") + ">" + esc(s.title) + "</option>"; }).join("") +
        "</select></label>" +
        '<p class="jc-disclaimer">' + esc(G.disclaimer) + "</p>" +
      "</div>" +

      '<div class="jc-card"><p class="mf-label">(Your four stages)</p><ul class="jc-stages">' +
        R.sums.map(function (s) {
          var stg = stageById(s.id), w = s.max ? Math.round((s.got / s.max) * 100) : 0;
          return '<li class="' + (s.id === p.stage ? "is-priority" : "") + '"><div class="jc-stages__top"><b>' + stg.num + " " + esc(stg.title) + "</b><span>" + stageScore(s) + "</span></div>" +
            '<div class="jc-bar' + (s.complete ? "" : " is-provisional") + '"><span style="width:' + w + '%"></span></div></li>';
        }).join("") + "</ul></div>" +

      '<div class="jc-card"><p class="mf-label">(In order)</p><ol class="jc-order">' +
        '<li><b>Do now</b> &middot; ' + esc(st.title) + ": " + esc(fill(st.firstAction)) + "</li>" +
        nextIds.map(function (id, k) { var s2 = stageById(id); return "<li><b>" + (k ? "Improve later" : "Do next") + "</b> &middot; " + esc(s2.title) + ": " + esc(fill(s2.firstAction)) + "</li>"; }).join("") +
      '</ol><p class="jc-note">One change at a time, so you can tell what worked.</p></div>' +

      '<div class="jc-card"><p class="mf-label">(Your 30-day plan)</p><ol class="jc-weeks">' +
        G.plan.map(function (w) { return "<li><span>" + esc(w.week) + "</span><b>" + esc(w.title) + "</b><p>" + esc(w.text) + "</p></li>"; }).join("") + "</ol></div>" +

      '<div class="jc-card"><p class="mf-label">(Your action card)</p><p class="jc-note">Edit any line. It saves on this device and prints with the page.</p><table class="jc-table"><tbody>' +
        G.card.map(function (label, k) {
          var v = S.card[k] != null ? S.card[k] : cardDefaults[k];
          return "<tr><th scope=\"row\">" + esc(label) + '</th><td><input data-card="' + k + '" value="' + esc(v) + '" aria-label="' + esc(label) + '"></td></tr>';
        }).join("") + "</tbody></table></div>" +

      '<div class="jc-card jc-card--cta">' +
        '<p class="mf-label">(Keep it, or get help)</p>' +
        '<div class="mf-actions">' +
          '<button type="button" class="mf-btn" data-jc="print">Print or save as PDF</button>' +
          '<a class="mf-btn mf-btn--ghost" href="/downloads/swft-growth-guide.pdf" download>Download the printable guide</a>' +
          '<button type="button" class="mf-btn mf-btn--ghost" data-jc="email">Email me my plan</button>' +
        "</div>" +
        '<form class="jc-email" hidden novalidate><label for="jc-em">Email</label><div class="jc-row"><input type="email" id="jc-em" required autocomplete="email" maxlength="320" placeholder="you@business.com"><button type="submit" class="mf-btn">Send</button></div>' +
          '<p class="jc-note">We\'ll email you a copy of your answers and next steps. SWFT Studios also receives a copy so we can help if you ask. No newsletter unless you sign up for it separately.</p><p class="mf-status" role="status" hidden></p></form>' +
        '<h3 class="jc-h3">Want a second set of eyes?</h3><p>Send us a few details and we\'ll review your customer journey and email you three priorities to consider. No call required.</p>' +
        '<h3 class="jc-h3">Want help putting the plan into practice?</h3><p>Bring us your priority. We\'ll help define the outcome, build the workflow and agree on how we\'ll judge progress.</p>' +
        '<div class="mf-actions"><a class="mf-btn" href="/growth-guide#help">Get help with my next step <span class="mf-arrow" aria-hidden="true">↗</span></a><button type="button" class="mf-btn mf-btn--ghost" data-jc="restart">Start over</button></div>' +
      "</div></section>";
  }
  function reviewDate() {
    var d = new Date(Date.now() + 30 * 864e5);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + " (30 days from today)";
  }

  function render(focus) {
    var body = S.step === 0 ? viewStart() : S.step <= 4 ? viewStage(G.stages[S.step - 1]) : viewResults();
    root.innerHTML = progress() + body;
    if (focus) { var h = root.querySelector("#jc-h"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } root.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  function validate() {
    var err = root.querySelector(".jc-err");
    var msg = "";
    if (S.step === 0 && !S.industry) msg = "Pick the kind of business you run.";
    if (S.step >= 1 && S.step <= 4) {
      var st = G.stages[S.step - 1];
      var missing = S.answers[st.id].indexOf(null);
      if (missing !== -1) msg = "Answer question " + (missing + 1) + ". “I don't know” is a fine answer.";
    }
    if (err) { err.hidden = !msg; err.textContent = msg; }
    return !msg;
  }

  /* ---------- Events ---------- */
  root.addEventListener("change", function (e) {
    var t = e.target;
    if (t.type === "radio") {
      if (t.name === "industry") { S.industry = t.value; S.next = ""; render(false); }
      else if (t.name === "outcome") S.outcome = t.value;
      else { var m = t.name.split("-"); S.answers[m[0]][+m[1]] = t.value; }
    } else if (t.dataset.field === "baselineUnknown") { S.baselineUnknown = t.checked; render(false); }
    else if (t.dataset.field === "override") { S.override = t.value; S.card = {}; render(false); track("journey_check_override", { stage: t.value }); }
    save();
  });
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.field && t.type !== "checkbox" && t.tagName !== "SELECT") S[t.dataset.field] = t.value;
    if (t.dataset.card != null) S.card[t.dataset.card] = t.value;
    save();
  });
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-jc]");
    if (!b) return;
    var a = b.getAttribute("data-jc");
    if (a === "next") { if (!validate()) return; S.step = Math.min(STEPS - 1, S.step + 1); save(); render(true); if (S.step === 5) track("journey_check_complete", { industry: S.industry, priority: priority().p.stage }); }
    else if (a === "back") { S.step = Math.max(0, S.step - 1); save(); render(true); }
    else if (a === "print") { track("journey_check_print"); window.print(); }
    else if (a === "restart") { if (confirm("Clear your answers and start over?")) { S = fresh(); save(); render(true); } }
    else if (a === "email") { var f = root.querySelector(".jc-email"); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("input").focus(); }
  });
  root.addEventListener("submit", function (e) {
    var f = e.target.closest(".jc-email");
    if (!f) return;
    e.preventDefault();
    var email = f.querySelector("input").value.trim(), status = f.querySelector(".mf-status"), btn = f.querySelector("button");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.hidden = false; status.className = "mf-status is-error"; status.textContent = "Enter a valid email address."; return; }
    var R = priority(), st = stageById(R.p.stage);
    var lines = [
      ["Business", ind().label + (S.offer ? " · " + S.offer : "")],
      ["Who it's for", S.who], ["Next action", S.next],
      ["Outcome", ((G.outcomes.filter(function (o) { return o.id === S.outcome; })[0] || {}).label || "") + (S.current ? " · now " + S.current : "") + (S.target ? " · target " + S.target : "")],
      ["First priority", (R.p.verify ? "Verify " : "") + st.title + " · " + R.p.why],
      ["Do this week", fill(st.firstAction)],
      ["Watch for", fill(st.evidence)]
    ].concat(R.sums.map(function (s) { var t = stageById(s.id); return [t.num + " " + t.title, stageScore(s).replace(/&middot;/g, "·")]; }))
     .concat(G.card.map(function (l, k) { var v = root.querySelector('[data-card="' + k + '"]'); return [l, v ? v.value : ""]; }))
     .filter(function (r) { return r[1]; });
    btn.disabled = true; status.hidden = false; status.className = "mf-status is-info"; status.textContent = "Sending…";
    fetch("/api/growth-guide", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ kind: "answers", email: email, firstName: "", check: { industry: S.industry, priority: R.p.stage, lines: lines }, sourcePage: location.pathname })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
      btn.disabled = false;
      if (d.ok) { status.className = "mf-status is-success"; status.textContent = "Sent to " + email + "."; track("journey_check_email"); }
      else { status.className = "mf-status is-error"; status.textContent = d.error || "That didn't go through. Try again."; }
    }, function () { btn.disabled = false; status.className = "mf-status is-error"; status.textContent = "You look offline. Try again in a moment."; });
  });

  fetch("/data/growth-guide.json", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (g) {
    G = g;
    S = load() || fresh();
    G.stages.forEach(function (st) { if (!S.answers[st.id]) S.answers[st.id] = [null, null, null, null, null]; });
    var q = new URLSearchParams(location.search).get("industry");
    if (q && !S.industry && G.industries.some(function (i) { return i.id === q; })) S.industry = q;
    render(false);
  }).catch(function () {
    root.innerHTML = '<p class="mf-status is-error">The check couldn\'t load. Refresh the page, or <a class="mf-link" href="/downloads/swft-growth-guide.pdf">download the printable guide</a>.</p>';
  });
})();
