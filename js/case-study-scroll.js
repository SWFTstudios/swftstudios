(function () {
  'use strict';

  function splitAndReveal(selector) {
    if (!window.gsap || !window.ScrollTrigger) return;

    gsap.registerPlugin(ScrollTrigger);

    document.querySelectorAll(selector).forEach(function (el) {
      if (el.closest('.cs-cta-block')) return;
      if (el.querySelector('.cs-word')) return;

      var text = el.textContent.trim();
      if (!text) return;

      var words = text.split(/\s+/).map(function (word) {
        var span = document.createElement('span');
        span.className = 'cs-word';
        span.textContent = word;
        return span;
      });

      el.textContent = '';
      words.forEach(function (word, i) {
        el.appendChild(word);
        if (i < words.length - 1) {
          el.appendChild(document.createTextNode(' '));
        }
      });

      gsap.from(words, {
        opacity: 0,
        y: 18,
        duration: 0.6,
        stagger: 0.025,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      });
    });
  }

  function init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    splitAndReveal('.cs-body h2, .cs-body p, .cs-body li');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
