#!/usr/bin/env node
/**
 * Rebuild the campaign landing pages from the published services/pricing data.
 * Run: npm run build:campaigns
 * Generated files are checked in for static Cloudflare Pages hosting.
 * Campaign pages intentionally use noindex; canonical service pages stay indexable.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BOOK_URL="https://cal.com/swftstudios/swft-meeting";
const CONFIG={
  "websites": {
    "service": "websites",
    "eyebrow": "Websites & e-commerce",
    "headline": "A website that wins the",
    "accent": "booking.",
    "lead": "People shouldn't have to hunt for your menu, services, products or contact details. Give them a fast, well-designed path to take the next step.",
    "painTitle": "Your website should do more than look good.",
    "offers": [
      "website-only",
      "website-content-half",
      "website-content-full"
    ],
    "proof": [
      "built-by-me-ez",
      "brooklyn-steel",
      "manna-hydration"
    ],
    "proofNote": "Websites, shops and booking-oriented experiences we've built."
  },
  "apps": {
    "service": "apps",
    "eyebrow": "Mobile & web apps",
    "headline": "Make your idea useful to",
    "accent": "real people.",
    "lead": "From the first prototype to a customer portal or mobile app, build around the actions people actually need to take.",
    "painTitle": "Move from an idea to something people can test.",
    "offers": [
      "app-design-sprint",
      "app-mvp",
      "app-care"
    ],
    "proof": [
      "hamper",
      "snooze-lane"
    ],
    "proofNote": "Related app-launch pages and product design work. Ask us about implementation scope."
  },
  "software": {
    "service": "software",
    "eyebrow": "Custom software & CRMs",
    "headline": "One system built around",
    "accent": "your workflow.",
    "lead": "If your team is juggling spreadsheets, messages and subscriptions, let's map the process and build only what actually helps.",
    "painTitle": "Put your operations in one place.",
    "offers": [],
    "proof": [
      "built-by-me-ez",
      "western-hp"
    ],
    "proofNote": "Related custom workflow and website projects, not a claim that these clients commissioned a CRM."
  },
  "marketing": {
    "service": "marketing",
    "eyebrow": "Paid ads & local marketing",
    "headline": "Get seen by people ready to",
    "accent": "choose you.",
    "lead": "Make Google, Meta and your local presence work together—with a clear next step and a way to see which activity creates inquiries.",
    "painTitle": "Traffic is useful only when it goes somewhere.",
    "offers": [
      "gbp-refresh",
      "ads-management",
      "full-growth-partner"
    ],
    "proof": [
      "blurred-lines-entertainment",
      "built-by-me-ez"
    ],
    "proofNote": "Related advertising and customer-path projects."
  },
  "content": {
    "service": "content",
    "eyebrow": "Content & creative",
    "headline": "Show them why you're",
    "accent": "worth choosing.",
    "lead": "Real photos, films and social assets for your website, paid campaigns and feeds. One shoot can support multiple customer touchpoints.",
    "painTitle": "Give customers something real to respond to.",
    "offers": [
      "photo-session",
      "short-form-pack",
      "managed-social"
    ],
    "proof": [
      "blurred-lines-entertainment",
      "roller-reels"
    ],
    "proofNote": "See examples of SWFT creative production and brand presentation."
  },
  "automations": {
    "service": "automations",
    "eyebrow": "Lead follow-up & automations",
    "headline": "Don't lose the lead after",
    "accent": "hello.",
    "lead": "Connect your forms, calendars and inbox so inquiries get acknowledged and the next step doesn't depend on someone remembering.",
    "painTitle": "Make follow-up part of the system.",
    "offers": [
      "lead-follow-up",
      "automation-care"
    ],
    "proof": [
      "built-by-me-ez"
    ],
    "proofNote": "Related booking-flow work; specific integrations are scoped during discovery."
  },
  "analytics": {
    "service": "analytics",
    "eyebrow": "Analytics & reporting",
    "headline": "Know what actually brings",
    "accent": "customers in.",
    "lead": "Measure calls, forms, bookings and site behavior so your next marketing decision can be based on evidence, not guesses.",
    "painTitle": "Stop flying blind when you spend on marketing.",
    "offers": [
      "analytics-setup",
      "analytics-reporting"
    ],
    "proof": [
      "blurred-lines-entertainment"
    ],
    "proofNote": "The Blurred Lines project includes Google Analytics setup; no invented performance figures."
  },
  "photography": {
    "service": "content",
    "eyebrow": "Brand & product photography",
    "headline": "Show the quality behind",
    "accent": "your business.",
    "lead": "Replace generic photos with your own products, team, space and craft. Get images you can reuse on your site, Google profile and campaigns.",
    "painTitle": "Let customers see what they can expect.",
    "offers": [
      "photo-session",
      "product-photos",
      "photo-plan"
    ],
    "proof": [
      "blurred-lines-entertainment",
      "roller-reels"
    ],
    "proofNote": "Related visual and brand work in the SWFT portfolio."
  },
  "videography": {
    "service": "content",
    "eyebrow": "Video production",
    "headline": "Make someone stop, watch",
    "accent": "and act.",
    "lead": "Show the experience of your business in motion, from short-form clips and product demonstrations to a considered brand story.",
    "painTitle": "Turn your story into footage people want to see.",
    "offers": [
      "short-form-pack",
      "brand-film",
      "video-plan"
    ],
    "proof": [
      "blurred-lines-entertainment",
      "roller-reels"
    ],
    "proofNote": "Examples of visual storytelling and video-oriented projects."
  },
  "social-media": {
    "service": "content",
    "eyebrow": "Social media management",
    "headline": "Show up with purpose,",
    "accent": "not just posts.",
    "lead": "Plan, create and publish content that fits your business and moves people toward your profile, site or booking page.",
    "painTitle": "Consistency is easier with a real content plan.",
    "offers": [
      "social-setup",
      "managed-social",
      "content-growth-retainer"
    ],
    "proof": [
      "blurred-lines-entertainment",
      "roller-reels"
    ],
    "proofNote": "Related creative projects; social management scopes are confirmed separately."
  },
  "live-streaming": {
    "service": "content",
    "eyebrow": "Live streaming",
    "headline": "Bring your event to the",
    "accent": "people who can't be there.",
    "lead": "Plan live coverage for a workshop, performance or event with the camera, audio and delivery needs agreed before the day.",
    "painTitle": "Live events need a dependable run of show.",
    "offers": [
      "livestream-single",
      "livestream-multi",
      "livestream-recurring"
    ],
    "proof": [],
    "proofNote": "We scope crew, cameras, audio, venue connectivity and stream destinations before confirming coverage."
  }
};
const PROOF={
  "built-by-me-ez": {
    "name": "Built By Me EZ",
    "summary": "Website, training booking path and online courses",
    "image": "/images/built_by_me_ez_thumbnail.webp",
    "href": "/case-study/built-by-me-ez.html"
  },
  "brooklyn-steel": {
    "name": "Brooklyn Steel Co.",
    "summary": "Shopify store, product education and bundle builder",
    "image": "/images/brooklyn-steel-thumbnail.webp",
    "href": "/case-study/brooklyn-steel.html"
  },
  "manna-hydration": {
    "name": "Manna Hydration",
    "summary": "Shopify store and product merchandising",
    "image": "/images/manna-hydration-thumbnail.webp",
    "href": "/case-study/manna-hydration.html"
  },
  "hamper": {
    "name": "Hamper",
    "summary": "App-launch website and signup-focused presentation",
    "image": "/images/hamper_app_website_thumbnail.webp",
    "href": "/case-study/hamper.html"
  },
  "snooze-lane": {
    "name": "Snooze Lane",
    "summary": "App branding and launch website",
    "image": "/images/Snooze-Lane-Desktop-thumbnail.webp",
    "href": "/case-study/snooze-lane.html"
  },
  "western-hp": {
    "name": "Western HP",
    "summary": "Service website designed for inquiries",
    "image": "/images/whp_desktop_screenshot.webp",
    "href": "/case-study/western-hp.html"
  },
  "blurred-lines-entertainment": {
    "name": "Blurred Lines Entertainment",
    "summary": "Wedding film, Instagram ads and Google Analytics",
    "image": "/images/BLE_SWFT_thumbnail.webp",
    "href": "/case-study/blurred-lines-entertainment.html"
  },
  "roller-reels": {
    "name": "Roller Reels",
    "summary": "Visual portfolio designed for inquiries",
    "image": "/images/Roller_Reels_thumbnail.webp",
    "href": "/case-study/roller-reels.html"
  }
};
function escapeHTML(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function renderCampaign(slug,cfg,serviceSource,pricingSource){
 const service=serviceSource.services.find(s=>s.slug===cfg.service); if(!service)throw Error("Missing service for "+slug);
 const offers=pricingSource.categories.flatMap(c=>c.services.flatMap(s=>s.offers)).filter(x=>cfg.offers.includes(x.id)).sort((a,b)=>cfg.offers.indexOf(a.id)-cfg.offers.indexOf(b.id));
 const serviceQuery=encodeURIComponent(cfg.service);const contact=`/contact.html?service=${serviceQuery}&source=campaign-${encodeURIComponent(slug)}`;
 const benefits=(service.outcomes||[]).slice(0,3);
 const faq=service.faq.slice(0,2);
 const campaignImage=slug==="photography"||slug==="videography"||slug==="live-streaming"?"/images/BLE_SWFT_thumbnail-p-800.webp":slug==="social-media"?"/images/IG-FB-Messenger-Lifestlye-p-800.webp":service.image;
 const ownerTitle=cfg.eyebrow+" | SWFT Studios NYC + NJ";
 const desc=cfg.lead.slice(0,155);
 const offersHTML=offers.map(o=>`<article class="fnl-price-card">
   <p class="mf-label mf-label--muted">(${escapeHTML(o.kind || "Project")})</p>
   <h3>${escapeHTML(o.name)}</h3><p class="fnl-price-card__amount">${escapeHTML(o.priceLabel)}</p>
   <p>${escapeHTML(o.description||"Scope confirmed before work begins.")}</p>
   <ul>${(o.includes||[]).slice(0,4).map(s=>`<li>${escapeHTML(s)}</li>`).join("")}</ul>
   <a class="mf-btn mf-btn--sm" data-funnel-cta="${o.bookUrl?"package":"inquiry"}" href="${escapeHTML(o.bookUrl||contact)}">${o.bookUrl?"See package details":"Request a scope"} <span aria-hidden="true">↗</span></a>
 </article>`).join("\n");
 const softwareOffer=`<article class="fnl-price-card"><p class="mf-label mf-label--muted">(Discovery first)</p><h3>Custom software &amp; CRM planning</h3><p class="fnl-price-card__amount">Design sprints from $1,500</p><p>A full CRM build is quoted separately after we understand your process.</p><ul><li>Map the workflows and bottlenecks</li><li>Agree on users, screens and integrations</li><li>Define the right first version</li><li>Get a project-specific scope before committing</li></ul><a class="mf-btn mf-btn--sm" data-funnel-cta="inquiry" href="${escapeHTML(contact)}">Discuss your workflow <span aria-hidden="true">↗</span></a></article>`;
 const proofHTML=(cfg.proof||[]).map(id=>{const p=PROOF[id];if(!p)throw Error("Missing proof "+id);return `<a class="fnl-proof-link" href="${escapeHTML(p.href)}"><img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)} project preview" loading="lazy" width="100" height="88"><div><strong>${escapeHTML(p.name)} ↗</strong><span>${escapeHTML(p.summary)}</span></div></a>`;}).join("\n");
 const process=["Tell us what you're trying to accomplish","Review scope, fit and a realistic starting point","Get a recommended next step—without an obligation"];
 const sectionIntro=(label,title,sub)=>`<div class="fnl-campaign-intro"><div><p class="mf-label">(${label})</p><h2 class="mf-h2">${title}</h2></div><p>${escapeHTML(sub)}</p></div>`;
 return `<!DOCTYPE html>
<html lang="en">
<head>
  <script id="swft-mode">(function(){var m;try{m=localStorage.getItem("swft-mode")}catch(e){}document.documentElement.setAttribute("data-mode",m==="light"||m==="system"?m:"dark")})();</script>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHTML(ownerTitle)}</title><meta name="description" content="${escapeHTML(desc)}">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="https://www.swftstudios.com/${escapeHTML(cfg.service)}.html">
  <meta property="og:type" content="website"><meta property="og:title" content="${escapeHTML(ownerTitle)}">
  <meta property="og:description" content="${escapeHTML(desc)}">
  <meta property="og:image" content="https://www.swftstudios.com/images/swft-thumbnail.webp">
  <link rel="stylesheet" href="/css/swft-nav.css?v=20261105-r4">
  <link rel="stylesheet" href="/css/conversion-funnel.css?v=20261115">
  <link rel="icon" href="/images/favicon.webp" type="image/webp">
</head>
<body class="mf-page fnl-campaign" data-funnel-service="${escapeHTML(slug)}">
  <div id="swft-nav" data-active="services"></div>
  <main id="main">
    <section class="mf-hero mf-hero--page fnl-campaign-hero" aria-labelledby="campaign-title">
      <div class="mf-wrap fnl-campaign-hero__grid">
        <div>
          <a class="fnl-back-link" href="/services.html">← Explore SWFT Studios services</a>
          <p class="mf-label">(${escapeHTML(cfg.eyebrow)} &middot; NYC + North Jersey)</p>
          <h1 class="mf-h1" id="campaign-title">${escapeHTML(cfg.headline)} <span class="mf-script">${escapeHTML(cfg.accent)}</span></h1>
          <p class="mf-lead">${escapeHTML(cfg.lead)}</p>
          <div class="mf-actions">
            <a class="mf-btn" href="${BOOK_URL}" target="_blank" rel="noopener" data-funnel-cta="calendar">Book a free discovery call <span class="mf-arrow" aria-hidden="true">↗</span></a>
            <a class="mf-btn mf-btn--ghost" href="${escapeHTML(contact)}" data-funnel-cta="inquiry">Get a quote</a>
          </div>
          <div class="fnl-campaign-hero__promise"><span>30-minute conversation</span><span>Clear next steps</span><span>No obligation</span></div>
        </div>
        <div class="fnl-campaign-hero__media"><img src="${escapeHTML(campaignImage)}" alt="SWFT Studios ${escapeHTML(cfg.eyebrow)} work preview" loading="eager" decoding="async"><span>Real SWFT project imagery</span></div>
      </div>
    </section>
    <section class="mf-section fnl-campaign-section" aria-labelledby="campaign-outcomes">
      <div class="mf-wrap">
        ${sectionIntro("01 / Why it matters",`<span id="campaign-outcomes">${escapeHTML(cfg.painTitle)}</span>`,"Let's focus on the business outcome first, then choose the work that gets us there.")}
        <div class="fnl-benefits">${benefits.map((item,i)=>`<article class="fnl-benefit"><p class="mf-label">(${String(i+1).padStart(2,"0")})</p><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text)}</p></article>`).join("\n")}</div>
      </div>
    </section>
    <section class="mf-section fnl-campaign-section" id="packages" aria-labelledby="campaign-packages">
      <div class="mf-wrap">
        ${sectionIntro("02 / Transparent starting points",`<span id="campaign-packages">Choose a starting <span class="mf-script">scope.</span></span>`,"The details below come from our published packages. We confirm deliverables and timing before anything starts.")}
        <div class="fnl-offer-grid">${offersHTML||softwareOffer}</div>
        <p class="fnl-price-note">Starting prices apply to the listed scope; additional deliverables, platform fees, ad spend and travel are quoted separately where relevant. <a href="/pricing.html">See the full pricing page ↗</a></p>
      </div>
    </section>
    ${proofHTML?`<section class="mf-section fnl-campaign-section" id="work" aria-labelledby="campaign-work"><div class="mf-wrap">
        ${sectionIntro("03 / Relevant work",`<span id="campaign-work">See work from <span class="mf-script">SWFT.</span></span>`,cfg.proofNote)}
        <div class="fnl-proof-links">${proofHTML}</div>
        <p class="fnl-price-note"><a href="/work.html">Explore more SWFT projects ↗</a></p>
      </div></section>`:""}
    <section class="mf-section fnl-campaign-section" id="process" aria-labelledby="campaign-process"><div class="mf-wrap">
      <p class="mf-label">(0${proofHTML?4:3} / Easy next steps)</p><h2 class="mf-h2" id="campaign-process">Here's how we <span class="mf-script">start.</span></h2>
      <ol class="fnl-steps">${process.map((p,i)=>`<li><span class="mf-label">(${String(i+1).padStart(2,"0")})</span><strong>${escapeHTML(p)}</strong></li>`).join("")}</ol>
    </div></section>
    <section class="mf-section fnl-campaign-section" id="book" aria-labelledby="campaign-book"><div class="mf-wrap"><div class="mf-band fnl-booking">
      <p class="mf-label">(Let's talk about your business)</p>
      <h2 class="mf-h2" id="campaign-book">Let's make your next move <span class="mf-script">count.</span></h2>
      <p class="mf-body">Pick a free 30-minute call. We'll hear where you are, recommend a practical starting point, and explain the next step. Prefer email? A short inquiry works too.</p>
      <div class="mf-actions"><a class="mf-btn" href="${BOOK_URL}" target="_blank" rel="noopener" data-funnel-cta="calendar">Book your free call <span class="mf-arrow" aria-hidden="true">↗</span></a><a class="mf-btn mf-btn--ghost" href="${escapeHTML(contact)}" data-funnel-cta="inquiry">Send a quick inquiry</a></div>
      <p class="fnl-fine">SWFT Studios &middot; Jersey City / NYC / North Jersey &middot; Remote work available</p>
    </div></div></section>
    <section class="mf-section fnl-campaign-section" aria-labelledby="campaign-faq"><div class="mf-wrap fnl-campaign-faq">
      <p class="mf-label">(Questions before booking?)</p><h2 class="mf-h2" id="campaign-faq">Good things to <span class="mf-script">ask.</span></h2>
      <div class="mf-faq">${faq.map(x=>`<details><summary>${escapeHTML(x.q)}</summary><div><p>${escapeHTML(x.a)}</p></div></details>`).join("\n")}
        <details><summary>Is the discovery call free?</summary><div><p>Yes. It's a 30-minute conversation to see what you need and whether SWFT is the right fit. No obligation to hire.</p></div></details>
      </div>
      <p class="fnl-price-note">Want the full picture? <a href="/services.html">All SWFT services</a> &middot; <a href="/work.html">Portfolio</a> &middot; <a href="/about.html">About SWFT</a></p>
    </div></section>
  </main>
  <script src="/js/swft-analytics.js?v=20261104-ga4" defer></script>
  <script src="/js/swft-nav.js?v=20261105-r4" defer></script>
  <script src="/js/funnel-attribution.js?v=20261115" defer></script>
</body>
</html>`;
}
const services=JSON.parse(readFileSync(join(ROOT,"data/services.json"),"utf8"));
const pricing=JSON.parse(readFileSync(join(ROOT,"data/pricing.json"),"utf8"));
mkdirSync(join(ROOT,"campaigns"),{recursive:true});
for(const [slug,cfg] of Object.entries(CONFIG)){
 const html=renderCampaign(slug,cfg,services,pricing);
 writeFileSync(join(ROOT,"campaigns",slug+".html"),html,"utf8");
 console.log("generated campaigns/"+slug+".html");
}
