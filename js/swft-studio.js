/* SWFT Studios — shared interactions (scroll reveal, form, counters) */
(function () {
  'use strict';

  function initReveal() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach(function (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    document.querySelectorAll('.reveal').forEach(function (el) {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      });
    });
    document.querySelectorAll('.reveal-stagger').forEach(function (parent) {
      var children = parent.querySelectorAll('.reveal');
      if (!children.length) return;
      gsap.to(children, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: parent,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });
  }

  function initForm() {
    var form = document.getElementById('project-inquiry-form');
    if (!form) return;
    var success = document.getElementById('form-success');
    var error = document.getElementById('form-error');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (error) error.hidden = true;
      var btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending…';
      }

      var fd = new FormData(form);
      var build = fd.get('build') || '';
      var goal = fd.get('goal') || '';
      var payload = {
        name: fd.get('name'),
        email: fd.get('email'),
        businessType: (fd.get('business') || '') + (fd.get('link') ? ' | ' + fd.get('link') : ''),
        primaryGoal: 'Build: ' + build + ' | Goal: ' + goal,
        timeline: fd.get('timeline'),
        budget: fd.get('budget'),
        details: fd.get('notes') || ''
      };

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.ok && result.data.ok) {
            form.hidden = true;
            if (success) success.hidden = false;
          } else {
            throw new Error(result.data.error || 'Submission failed');
          }
        })
        .catch(function (err) {
          if (error) {
            error.hidden = false;
            error.textContent = err.message || 'Something went wrong. Email hello@swftstudios.com instead.';
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Start a Project';
          }
        });
    });
  }

  function init() {
    initReveal();
    initForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
