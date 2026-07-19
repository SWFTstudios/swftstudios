/**
 * SWFT blog share buttons — copy link, X/Twitter, Facebook, LinkedIn.
 * Enhances .uui-blogpost01_share icon rows (order: copy, twitter, facebook, linkedin).
 */
(function () {
  "use strict";

  var NETWORKS = ["copy", "twitter", "facebook", "linkedin"];

  function pageUrl() {
    return window.location.href.split("#")[0];
  }

  function pageTitle() {
    var og = document.querySelector('meta[property="og:title"]');
    if (og && og.getAttribute("content")) return og.getAttribute("content").trim();
    return (document.title || "").trim();
  }

  function encode(value) {
    return encodeURIComponent(value);
  }

  function shareUrl(network, url, title) {
    switch (network) {
      case "twitter":
        return "https://twitter.com/intent/tweet?url=" + encode(url) + "&text=" + encode(title);
      case "facebook":
        return "https://www.facebook.com/sharer/sharer.php?u=" + encode(url);
      case "linkedin":
        return "https://www.linkedin.com/sharing/share-offsite/?url=" + encode(url);
      default:
        return url;
    }
  }

  function setCopiedState(btn, on) {
    btn.setAttribute("aria-label", on ? "Link copied" : "Copy link");
    btn.classList.toggle("is-copied", on);
    if (on) {
      btn.setAttribute("data-copied", "true");
      btn.setAttribute("title", "Copied!");
    } else {
      btn.removeAttribute("data-copied");
      btn.setAttribute("title", "Copy link");
    }
  }

  function copyLink(btn) {
    var url = pageUrl();
    var done = function () {
      setCopiedState(btn, true);
      window.setTimeout(function () {
        setCopiedState(btn, false);
      }, 2000);
    };
    var fail = function () {
      window.prompt("Copy this link:", url);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(url).then(done).catch(fail);
      return;
    }

    try {
      var input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(input);
      if (ok) done();
      else fail();
    } catch (err) {
      fail();
    }
  }

  function openShare(network) {
    var url = shareUrl(network, pageUrl(), pageTitle());
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=540");
  }

  function enhanceButton(btn, network) {
    btn.setAttribute("data-share", network);
    btn.setAttribute("role", "button");

    if (network === "copy") {
      btn.setAttribute("href", "#");
      btn.setAttribute("aria-label", "Copy link");
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        copyLink(btn);
      });
      return;
    }

    var labels = {
      twitter: "Share on X",
      facebook: "Share on Facebook",
      linkedin: "Share on LinkedIn",
    };
    btn.setAttribute("aria-label", labels[network] || "Share");
    btn.setAttribute("href", shareUrl(network, pageUrl(), pageTitle()));
    btn.setAttribute("target", "_blank");
    btn.setAttribute("rel", "noopener noreferrer");
    btn.addEventListener("click", function (event) {
      // Keep real href for no-JS / middle-click; use popup for left-click.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      openShare(network);
    });
  }

  function enhanceShareRow(row) {
    var buttons = row.querySelectorAll("a.uui-button-secondary-gray, a.icon-only, a");
    var list = Array.prototype.slice.call(buttons).filter(function (el) {
      return el.closest(".uui-blogpost01_share") === row;
    });
    list.forEach(function (btn, index) {
      if (index >= NETWORKS.length) return;
      enhanceButton(btn, NETWORKS[index]);
    });
  }

  function injectStyles() {
    if (document.getElementById("swft-blog-share-styles")) return;
    var style = document.createElement("style");
    style.id = "swft-blog-share-styles";
    style.textContent =
      ".uui-blogpost01_share a[data-share].is-copied{" +
      "outline:2px solid #7fffe5;outline-offset:2px;}" +
      ".uui-blogpost01_share a[data-share]:focus-visible{" +
      "outline:2px solid #7fffe5;outline-offset:2px;}";
    document.head.appendChild(style);
  }

  function init() {
    var rows = document.querySelectorAll(".uui-blogpost01_share");
    if (!rows.length) return;
    injectStyles();
    rows.forEach(enhanceShareRow);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
