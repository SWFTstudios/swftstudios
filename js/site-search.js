/* Predictive, keyboard-accessible SWFT site search (public local index only). */
(function () {
  "use strict";
  if (window.__swftSearchReady) return;
  window.__swftSearchReady = true;
  var style=document.createElement("link");
  style.rel="stylesheet";style.href="/css/site-search.css?v=20261115";
  document.head.appendChild(style);
  var indexP=null, index=[], overlay=null, lastFocus=null, input=null, resultList=null, activeIndex=-1, hits=[];
  var esc=function (s) {return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});};
  function load() {
    if(!indexP) indexP=fetch("/data/site-search.json",{credentials:"same-origin"}).then(function (r) {
      if(!r.ok) throw Error("Search unavailable");return r.json();
    }).then(function (d) {index=Array.isArray(d.entries)?d.entries:[];return index;}).catch(function () { indexP=null;return []; });
    return indexP;
  }
  function normalized(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
  function score(entry,q) {
    if(!q) return 0;
    var title=normalized(entry.title), keys=normalized(entry.keywords), desc=normalized(entry.description);
    var full=title+" "+keys+" "+desc, parts=q.split(/\s+/).filter(Boolean);
    if(!parts.every(function (p) {return full.includes(p);} )) return -1;
    var val=0;
    if(title===q) val+=180;
    if(title.startsWith(q)) val+=105;
    if(title.includes(q)) val+=65;
    if(keys.includes(q)) val+=45;
    parts.forEach(function (p) {if(title.split(" ").some(function (w) {return w.startsWith(p);})) val+=16;else if(keys.includes(p)) val+=9;else val+=2;});
    if(entry.kind==="Build a package") val+=11;
    if(entry.kind==="Service") val+=8;
    if(entry.kind==="Package") val+=5;
    return val;
  }
  function queryMatches(q) {
    var n=normalized(q);
    if(!n) return index.filter(function(x){return ["page-builder","page-call","service-websites","offer-website-only","page-work"].includes(x.id);});
    return index.map(function(x){return {item:x,points:score(x,n)};}).filter(function(o){return o.points>=0;})
      .sort(function(a,b){return b.points-a.points||a.item.title.localeCompare(b.item.title);}).slice(0,9).map(function(o){return o.item;});
  }
  function safeUrl(s) {return typeof s==="string" && (s.charAt(0)==="/" && s.charAt(1)!=="/" || s.indexOf("https://cal.com/swftstudios/")===0) ? s : "/services.html";}
  function resultMarkup(item,i) {
    return '<a id="swft-search-option-'+i+'" role="option" aria-selected="false" class="swfts-result" href="'+esc(safeUrl(item.url))+'">' +
      '<span class="swfts-result__type">'+esc(item.kind)+'</span>' +
      '<span class="swfts-result__body"><strong>'+esc(item.title)+'</strong><small>'+esc(item.description).slice(0,160)+'</small></span>' +
      '<span aria-hidden="true">↗</span></a>';
  }
  function highlight() {
    if(!input)return;
    input.setAttribute("aria-expanded",hits.length>0?"true":"false");
    if(activeIndex>=0 && hits.length) input.setAttribute("aria-activedescendant","swft-search-option-"+activeIndex);
    else input.removeAttribute("aria-activedescendant");
    resultList.querySelectorAll(".swfts-result").forEach(function (r,i) {
      r.classList.toggle("is-current",i===activeIndex);
      r.setAttribute("aria-selected",i===activeIndex?"true":"false");
    });
  }
  function paint() {
    if(!overlay)return;
    hits=queryMatches(input.value);
    activeIndex=-1;
    if(!index.length){resultList.innerHTML='<p class="swfts-status">Search results are unavailable right now. <a href="/services.html">Browse all services</a> or <a href="https://cal.com/swftstudios/swft-meeting">book a call</a>.</p>';highlight();return;}
    if(!hits.length){resultList.innerHTML='<p class="swfts-status">No exact match. Try “website”, “photos” or “automation”. Or <a href="/contact.html">tell us what you need</a>.</p>';highlight();return;}
    resultList.innerHTML=hits.map(resultMarkup).join("");
    highlight();
  }
  function close() {
    if(!overlay)return;
    overlay.remove();overlay=null;input=null;resultList=null;
    if(lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  function open() {
    if(overlay){input.focus();return;}
    lastFocus=document.activeElement;
    overlay=document.createElement("div");overlay.className="swfts-overlay";
    overlay.innerHTML='<div class="swfts-backdrop" data-swfts-close></div><div class="swfts-dialog" role="dialog" aria-modal="true" aria-label="Search SWFT Studios">' +
      '<div class="swfts-top"><span class="mf-label">(Find what you need)</span><button type="button" data-swfts-close class="swfts-close" aria-label="Close search">×</button></div>' +
      '<label class="swfts-searchbox"><span class="swfts-search-icon" aria-hidden="true">⌕</span><input id="swft-search-input" type="search" role="combobox" aria-label="Search services, packages and examples" aria-controls="swft-search-results" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="Search websites, photography, booking…" /><span class="swfts-keyhint">ESC</span></label>' +
      '<div class="swfts-hints"><span>Try:</span><button type="button" data-swfts-hint="landing page">Landing page</button><button type="button" data-swfts-hint="product photos">Product photos</button><button type="button" data-swfts-hint="lead follow-up">Lead follow-up</button></div>' +
      '<div class="swfts-list" id="swft-search-results" role="listbox" aria-label="Suggested results"><p class="swfts-status">Loading search…</p></div>' +
      '<div class="swfts-bottom"><a href="/build.html">Build your package ↗</a><a href="https://cal.com/swftstudios/swft-meeting" target="_blank" rel="noopener">Not sure? Book a free call ↗</a></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input=overlay.querySelector("#swft-search-input");resultList=overlay.querySelector("#swft-search-results");
    overlay.addEventListener("click",function(e){
      if(e.target.closest("[data-swfts-close]")){close();return;}
      var hint=e.target.closest("[data-swfts-hint]");
      if(hint){input.value=hint.getAttribute("data-swfts-hint");paint();input.focus();}
    });
    input.addEventListener("input",paint);
    overlay.addEventListener("keydown",function(e){
      if(e.key==="Escape"){e.preventDefault();close();return;}
      if(e.key==="ArrowDown" || e.key==="ArrowUp"){
        e.preventDefault();if(!hits.length)return;
        activeIndex=(activeIndex+(e.key==="ArrowDown"?1:-1)+hits.length)%hits.length;highlight();return;
      }
      if(e.key==="Enter" && document.activeElement===input && activeIndex>=0 && hits[activeIndex]){
        e.preventDefault();location.href=safeUrl(hits[activeIndex].url);return;
      }
      if(e.key==="Tab"){
        var stops=Array.from(overlay.querySelectorAll('a,button,input')).filter(function(x){return x.getClientRects().length;});
        if(stops.length){if(e.shiftKey&&document.activeElement===stops[0]){e.preventDefault();stops[stops.length-1].focus();}
        else if(!e.shiftKey&&document.activeElement===stops[stops.length-1]){e.preventDefault();stops[0].focus();}}
      }
    });
    input.focus();
    load().then(function(){if(overlay)paint();});
    if(window.SWFTAnalytics)window.SWFTAnalytics.track("site_search_open",{page_path:location.pathname});
  }
  document.addEventListener("click",function(e){if(e.target.closest("[data-swft-search-open]")){e.preventDefault();open();}});
  document.addEventListener("keydown",function(e){
    var tag=document.activeElement&&document.activeElement.tagName;
    var typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||document.activeElement&&document.activeElement.isContentEditable;
    if((e.key==="/"&&!typing||e.key.toLowerCase()==="k"&&(e.metaKey||e.ctrlKey))&&!e.altKey){e.preventDefault();open();}
  });
})();
