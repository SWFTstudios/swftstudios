/* SWFT guided service builder. Published prices + eligibility, no client-supplied checkout prices. */
(function () {
  "use strict";
  var panel = document.getElementById("swb-panel");
  if (!panel) return;
  var summary = document.getElementById("swb-summary");
  var proof = document.getElementById("swb-proof");
  var back = document.getElementById("swb-back");
  var next = document.getElementById("swb-next");
  var error = document.getElementById("swb-error");
  var config, catalog = {}, addons = [];
  var state = { step:0, service:null, scenario:null, tierId:null, extras:new Set(), cross:new Set() };
  var CALL = "https://cal.com/swftstudios/swft-meeting";
  var query = new URLSearchParams(location.search);
  var money = function (c) { return "$" + (c/100).toLocaleString("en-US",{maximumFractionDigits:0}); };
  var escape = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g,function (x) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]; }); };
  var service = function () { return config && config.services.find(function (s) { return s.id === state.service; }); };
  var scenario = function () { var s = service(); return s && s.scenarios.find(function (g) { return g.id === state.scenario; }); };
  var entry = function (id) { return catalog[id]; };
  function track(eventName, linkType) {
    if (window.SWFTAnalytics) window.SWFTAnalytics.track(eventName,{page_path:location.pathname,service_interest:state.service || "",link_type:linkType || ""});
  }
  function showError(msg) { error.hidden = !msg; error.textContent = msg || ""; }
  function selectedProducts() { return [state.tierId].concat(Array.from(state.extras),Array.from(state.cross)).filter(Boolean); }
  function priceTotals() {
    var items = selectedProducts().map(entry).filter(Boolean);
    var once = 0, monthly = 0;
    items.forEach(function (item) { if (item.monthly) monthly += item.priceCents; else once += item.priceCents; });
    return { once:once, monthly:monthly, today:Math.round(once*.5)+monthly, later:once-Math.round(once*.5) };
  }
  function eligibleAddons() { return addons.filter(function (a) { return a.requires.indexOf(state.tierId) !== -1; }); }
  function recommendedOffers() {
    var list = (config.upsells[state.tierId] || []).slice();
    if (state.service === "websites" && state.scenario === "store") list.unshift(["product-photos","Photograph your products for the shop"]);
    if (state.service === "websites" && state.scenario === "landing") list.unshift(["analytics-setup","Measure campaign inquiries"]);
    return list.filter(function (item) { return item[0] !== state.tierId && entry(item[0]); }).slice(0,4);
  }
  function renderSummary() {
    if (!state.service) {
      summary.innerHTML = '<p class="mf-label">(Your package)</p><h2>Made for your business.</h2><p>Your running total and what you selected will appear here.</p>';
      return;
    }
    var s=service(), g=scenario(), base=entry(state.tierId), prices=priceTotals();
    if (!base) {
      summary.innerHTML = '<p class="mf-label">(Your direction)</p><h2>'+escape(s.name)+'</h2><p>'+(g?escape(g.name):"Choose what you need.")+'</p>' +
        '<p>Complex or custom work needs a scoped quote. No payment is taken here.</p><a class="mf-link" href="'+CALL+'" target="_blank" rel="noopener">Book a free call ↗</a>';
      return;
    }
    var choices=selectedProducts().map(entry).filter(Boolean);
    summary.innerHTML='<p class="mf-label">(Your package)</p><h2>'+escape(base.name)+'</h2>' +
      '<p>'+escape(g ? g.name : s.name)+'</p><dl>' +
      choices.map(function (o) { return '<div><dt>'+escape(o.name)+(o.monthly?' · monthly':'')+'</dt><dd>'+money(o.priceCents)+(o.monthly?'/mo':'')+'</dd></div>'; }).join("")+'</dl>' +
      (prices.once?'<div class="swb-due"><span>One-time total</span><strong>'+money(prices.once)+'</strong></div>':'') +
      (prices.monthly?'<p>Plus recurring plans: '+money(prices.monthly)+'/month</p>':'') +
      '<div class="swb-due"><span>Estimated due at checkout</span><strong>'+money(prices.today)+'</strong></div>' +
      (prices.later?'<p>Remaining one-time balance: '+money(prices.later)+' invoiced before delivery.</p>':'') +
      '<p>One-time items: 50% deposit. Monthly plans: first month today. Actual checkout totals are confirmed server-side.</p>';
  }
  function renderProof() {
    if (!config) return;
    var g = scenario(), s = service();
    var ids = g && g.proof.length ? g.proof : s && s.scenarios.length ? s.scenarios[0].proof : [];
    proof.innerHTML = ids.length ? ids.slice(0,3).map(function (id) {
      var p=config.proof[id]; if (!p) return "";
      return '<a href="'+escape(p.url)+'"><img src="'+escape(p.image)+'" loading="lazy" alt="'+escape(p.name)+' project preview"><strong>'+escape(p.name)+' ↗</strong><span>'+escape(p.desc)+'</span></a>';
    }).join("") : '<p class="mf-body">Ask us for a relevant example during your discovery call. We will not show unrelated work as if it were the same service.</p>';
  }
  function card(attrs, kicker, title, desc, note, checked) {
    return '<button type="button" class="swb-option" '+attrs+' aria-pressed="'+(checked?'true':'false')+'">' +
      (kicker?'<span class="swb-option__tag">'+escape(kicker)+'</span>':'') +
      '<strong>'+escape(title)+'</strong><small>'+escape(desc)+'</small>' +
      (note?'<em>'+escape(note)+'</em>':'')+'</button>';
  }
  function renderService() {
    panel.innerHTML='<p class="mf-label">(01 / Choose your service)</p><h2>What can we help you with?</h2><p class="swb-hint">Start anywhere. You can change direction before adding anything to your cart.</p>' +
      '<div class="swb-options">'+config.services.map(function (s) {
        return card('data-service="'+escape(s.id)+'"',"SWFT service",s.name,s.line,"",s.id===state.service);
      }).join("")+'</div>';
  }
  function renderScenario() {
    var s=service();
    panel.innerHTML='<p class="mf-label">(02 / The goal)</p><h2>What are you looking to create?</h2><p class="swb-hint">Pick the closest option. If your idea is bigger than a standard package, we\'ll recommend a scoped call instead.</p>' +
      '<div class="swb-options">'+s.scenarios.map(function (g) {
        return card('data-scenario="'+escape(g.id)+'"',"",g.name,g.description,g.tierIds.length?"Package options available":"Custom quote / free call",g.id===state.scenario);
      }).join("")+'</div>';
  }
  function renderPackage() {
    var g=scenario(), s=service();
    if (!g) { state.step=1; render(); return; }
    if (!g.tierIds.length) {
      panel.innerHTML='<p class="mf-label">(03 / Custom scope)</p><h2>Let\'s design the right fit.</h2><p class="swb-hint">'+escape(g.description)+' This requires a project-specific scope, so we won\'t invent a price or charge you before reviewing it.</p>' +
        '<div class="swb-review-actions"><a href="'+CALL+'" class="mf-btn" target="_blank" rel="noopener">Book a free discovery call ↗</a><a class="mf-btn mf-btn--ghost" href="/contact.html?service='+encodeURIComponent(s.id)+'">Send project details</a></div>';
      return;
    }
    panel.innerHTML='<p class="mf-label">(03 / Choose the base)</p><h2>Pick your starting package.</h2><p class="swb-hint">These are existing published offers, not custom prices. Read the included scope before choosing. You can add extras next.</p>' +
      '<div class="swb-options">'+g.tierIds.map(function (id) {
        var o=entry(id); if (!o) return "";
        return card('data-tier="'+escape(id)+'"',"",o.name,o.desc,o.monthly?money(o.priceCents)+"/mo":money(o.priceCents)+" one-time",state.tierId===id);
      }).join("")+'</div>' +
      '<p class="swb-hint" style="margin-top:1.25rem">Not seeing a package that fits? <a class="swb-inline-link" href="'+CALL+'" target="_blank" rel="noopener">Book a free call</a> instead.</p>';
  }
  function checkbox(type,id,title,desc,price,checked,recommended) {
    return '<button class="swb-checkbox" type="button" data-'+type+'="'+escape(id)+'" aria-pressed="'+(checked?'true':'false')+'"><span class="swb-checkbox__mark" aria-hidden="true">'+(checked?'✓':'')+'</span>' +
      '<span><strong>'+escape(title)+(recommended?' <span class="swb-tag">Pairs well</span>':'')+'</strong><small>'+escape(desc)+'</small><em>+'+escape(price)+'</em></span></button>';
  }
  function renderExtras() {
    var base=entry(state.tierId);
    if (!base) { state.step=2; render(); return; }
    var options=eligibleAddons(), rec=recommendedOffers();
    panel.innerHTML='<p class="mf-label">(04 / Personalize)</p><h2>Would you like anything with that?</h2><p class="swb-hint">Your base package already covers the listed deliverables. These are optional extras, never preselected, and only added when the scope supports them.</p>' +
      (options.length?'<h3 class="swb-subhead">Fixed-price extras</h3><div class="swb-addons">'+options.map(function (a) {
         return checkbox("extra",a.id,a.name,a.description,money(a.priceCents)+" one-time",state.extras.has(a.id),false);
      }).join("")+'</div>':'') +
      (rec.length?'<h3 class="swb-subhead">Often paired with your choice</h3><p class="swb-hint">Independent services that can help the original package work harder. These are separate packages, with their own inclusions.</p><div class="swb-addons">'+rec.map(function (pair) {
        var o=entry(pair[0]);return checkbox("cross",o.id,o.name,pair[1],money(o.priceCents)+(o.monthly?"/month":" one-time"),state.cross.has(o.id),true);
      }).join("")+'</div>':'') +
      '<hr class="swb-section-divider"><h3 class="swb-subhead">Ready to review your bowl?</h3><p class="swb-hint">Your selected package and extras will go to the existing secure cart. Stripe recalculates every amount from our server catalog.</p>' +
      '<div class="swb-review-actions"><button type="button" id="swb-add-cart" class="mf-btn swb-buy-button">Add package to cart &amp; review ↗</button></div>' +
      '<p class="swb-hint" style="margin-top:1.1rem">Need a feature not listed? <a class="swb-inline-link" href="'+CALL+'" target="_blank" rel="noopener">Book a free scope call</a>.</p>';
  }
  function render() {
    showError("");
    document.querySelectorAll("[data-swb-progress]").forEach(function (el) {
      var i=Number(el.getAttribute("data-swb-progress")); el.removeAttribute("aria-current");
      if (i===state.step) el.setAttribute("aria-current","step");
    });
    back.hidden=state.step===0; next.hidden=state.step!==2 || !state.tierId;
    if (state.step===0) renderService();
    if (state.step===1) renderScenario();
    if (state.step===2) renderPackage();
    if (state.step===3) renderExtras();
    renderSummary(); renderProof();
  }
  panel.addEventListener("click",function (e) {
    var b=e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-service")) {
      state.service=b.getAttribute("data-service");state.scenario=null;state.tierId=null;
      state.extras.clear();state.cross.clear();state.step=1;track("builder_service_select","service");render();
    } else if (b.hasAttribute("data-scenario")) {
      state.scenario=b.getAttribute("data-scenario");
      var g=scenario();state.tierId=g.tierIds[0]||null;
      state.extras.clear();state.cross.clear();state.step=2;track("builder_goal_select","goal");render();
    } else if (b.hasAttribute("data-tier")) {
      state.tierId=b.getAttribute("data-tier");state.extras.clear();state.cross.clear();render();
    } else if (b.hasAttribute("data-extra") || b.hasAttribute("data-cross")) {
      var type=b.hasAttribute("data-extra")?"extra":"cross", id=b.getAttribute("data-"+type);
      var target=state[type==="extra"?"extras":"cross"];
      if (target.has(id)) target.delete(id); else target.add(id);
      track("builder_addon_toggle",type);render();
    } else if (b.id==="swb-add-cart") {
      if (!window.SWFTCart || !window.SWFTCart.addMany) {
        showError("Cart is still loading. Please try again."); return;
      }
      b.disabled=true; b.textContent="Adding your package…";
      window.SWFTCart.addMany(selectedProducts(), {service:state.service,goal:state.scenario,goalName:scenario().name,serviceName:service().name,tierId:state.tierId}).then(function () {
        track("builder_add_to_cart","cart");
        location.href="/cart.html";
      }).catch(function (err) {
        showError(err.message || "Unable to add your selections."); b.disabled=false; b.textContent="Add package to cart & review ↗";
      });
    }
  });
  back.addEventListener("click",function () { state.step=Math.max(0,state.step-1);render(); });
  next.addEventListener("click",function () { if (state.step===2 && state.tierId) { state.step=3;render(); } });
  Promise.all(["/data/builder-paths.json","/data/pricing.json","/data/addons.json"].map(function (url) {
    return fetch(url,{credentials:"same-origin"}).then(function (r) { if(!r.ok) throw Error("Catalog couldn't load"); return r.json(); });
  })).then(function (result) {
    config=result[0]; addons=result[2].addons||[];
    (result[1].categories||[]).forEach(function (group) {
      (group.services||[]).forEach(function (s) {
        (s.offers||[]).forEach(function (o) {
          if(!o.priceCents || !o.pay || !o.stripe) return;
          catalog[o.id]={id:o.id,name:o.name,priceCents:o.priceCents,desc:o.description||"",monthly:o.kind==="Monthly"};
        });
      });
    });
    var requested=query.get("service"),goal=query.get("goal");
    if (requested && config.services.some(function (s) { return s.id===requested; })) {
      state.service=requested;state.step=1;
      if (goal && service().scenarios.some(function (g) { return g.id===goal; })) {
        state.scenario=goal;state.tierId=scenario().tierIds[0]||null;state.step=2;
      }
    }
    render();
  }).catch(function () {
    panel.innerHTML='<h2>Need help choosing?</h2><p class="swb-hint">The package catalog is temporarily unavailable. We can still get you started.</p><a class="mf-btn" href="'+CALL+'" target="_blank" rel="noopener">Book a free discovery call ↗</a>';
    showError("Package options couldn't load.");
  });
})();
