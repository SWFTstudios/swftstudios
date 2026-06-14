/* SWFT Studios — GSAP motion + project cards */
(function () {
  'use strict';

  function initMotion() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);
    var mm = gsap.matchMedia();

    mm.add(
      {
        isDesktop: '(min-width: 992px)',
        isMobile: '(max-width: 991px)',
        reduceMotion: '(prefers-reduced-motion: reduce)'
      },
      function (ctx) {
        var reduce = ctx.conditions.reduceMotion;
        if (reduce) {
          gsap.set('.reveal, .parallax-panel', { autoAlpha: 1, y: 0, clearProps: 'transform' });
          return;
        }

        var heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        if (document.querySelector('.hero--immersive')) {
          heroTl
            .from('.hero__eyebrow', { autoAlpha: 0, y: 20, duration: 0.5 })
            .from('.hero__title', { autoAlpha: 0, y: 48, duration: 0.9 }, '-=0.2')
            .from('.hero__sub', { autoAlpha: 0, y: 24, duration: 0.6 }, '-=0.5')
            .from('.hero__actions', { autoAlpha: 0, y: 20, duration: 0.5 }, '-=0.35')
            .from('.hero__scroll', { autoAlpha: 0, y: 12, duration: 0.4 }, '-=0.2');
        } else {
          heroTl
            .from('.hero__eyebrow', { autoAlpha: 0, y: 20, duration: 0.5 })
            .from('.hero__title', { autoAlpha: 0, y: 36, duration: 0.8 }, '-=0.2')
            .from('.hero__sub', { autoAlpha: 0, y: 24, duration: 0.6 }, '-=0.45')
            .from('.hero__actions', { autoAlpha: 0, y: 20, duration: 0.5 }, '-=0.35')
            .from('.hero__visual', { autoAlpha: 0, scale: 0.96, duration: 0.9 }, '-=0.6');
        }

        ScrollTrigger.batch('.reveal', {
          start: 'top 88%',
          onEnter: function (els) {
            gsap.to(els, {
              autoAlpha: 1,
              y: 0,
              duration: 0.75,
              stagger: 0.08,
              ease: 'power2.out',
              overwrite: true
            });
          },
          onLeaveBack: function (els) {
            gsap.set(els, { autoAlpha: 0, y: 24 });
          }
        });

        gsap.utils.toArray('.parallax-panel').forEach(function (panel) {
          gsap.to(panel, {
            yPercent: ctx.conditions.isDesktop ? -8 : -4,
            ease: 'none',
            scrollTrigger: {
              trigger: panel,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true
            }
          });
        });

        if (ctx.conditions.isDesktop) {
          gsap.utils.toArray('[data-pin-copy]').forEach(function (section) {
            var copy = section.querySelector('.sticky-copy-grid__copy');
            if (!copy) return;
            ScrollTrigger.create({
              trigger: section,
              start: 'top top+=80',
              end: 'bottom bottom',
              pin: copy,
              pinSpacing: false
            });
          });
        }

        var track = document.querySelector('.studio-marquee__track');
        if (track && !track.dataset.duplicated) {
          track.innerHTML += track.innerHTML;
          track.dataset.duplicated = 'true';
        }
      }
    );
  }

  function projectCardHTML(p, index) {
    var num = String(index + 1).padStart(2, '0');
    return (
      '<article class="case-card reveal" id="' + p.id + '">' +
        '<div class="project-shot parallax-panel">' +
          '<img src="' + p.thumb + '" alt="' + p.name + ' project preview" loading="lazy" width="1280" height="800">' +
          '<span class="project-shot__caption">' + p.category + '</span>' +
        '</div>' +
        '<div class="case-card__body">' +
          '<p class="project-feature__num">' + num + '</p>' +
          '<h3 class="card__title">' + p.name + '</h3>' +
          '<p class="card__desc"><strong>Problem:</strong> ' + p.problem + '<br>' +
          '<strong>System:</strong> ' + p.system + '<br>' +
          '<strong>Impact:</strong> ' + p.impact + '</p>' +
          '<a href="' + p.href + '" class="card__link">View Case Study →</a>' +
        '</div>' +
      '</article>'
    );
  }

  function initProjects() {
    var mount = document.getElementById('projects-grid');
    var featured = document.getElementById('projects-featured');
    var carousel = document.getElementById('projects-carousel');
    if (!mount && !featured && !carousel) return;

    fetch('data/projects.json')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (featured) {
          featured.innerHTML = list.filter(function (p) { return p.featured; }).map(function (p, i) {
            return (
              '<article class="project-feature reveal' + (i % 2 ? ' project-feature--reverse' : '') + '" id="' + p.id + '">' +
                '<div class="project-shot parallax-panel image-panel">' +
                  '<img src="' + p.thumb + '" alt="' + p.name + '" loading="lazy" width="1280" height="800">' +
                '</div>' +
                '<div>' +
                  '<p class="project-feature__num">Featured</p>' +
                  '<h3 class="text-subheading">' + p.name + '</h3>' +
                  '<p class="text-body">' + p.problem + ' ' + p.system + ' ' + p.impact + '</p>' +
                  '<a href="' + p.href + '" class="btn btn-ghost">View Case Study →</a>' +
                '</div>' +
              '</article>'
            );
          }).join('');
        }
        if (mount) {
          mount.innerHTML = list.map(projectCardHTML).join('');
        }
        if (carousel) {
          carousel.innerHTML = list.slice(0, 6).map(projectCardHTML).join('');
        }
        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      })
      .catch(function () {
        if (mount) mount.innerHTML = '<p class="text-body">Projects loading soon.</p>';
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
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      var fd = new FormData(form);
      var payload = {
        name: fd.get('name'),
        email: fd.get('email'),
        businessType: (fd.get('business') || '') + (fd.get('link') ? ' | ' + fd.get('link') : ''),
        primaryGoal: 'Build: ' + (fd.get('build') || '') + ' | Goal: ' + (fd.get('goal') || ''),
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
          } else throw new Error(result.data.error || 'Submission failed');
        })
        .catch(function (err) {
          if (error) {
            error.hidden = false;
            error.textContent = err.message || 'Something went wrong. Email hello@swftstudios.com instead.';
          }
          if (btn) { btn.disabled = false; btn.textContent = 'Start a Project'; }
        });
    });
  }

  function initHeroNav() {
    var nav = document.getElementById('swft-nav');
    if (!nav || !nav.hasAttribute('data-hero-nav')) return;
    function onScroll() {
      nav.classList.toggle('is-scrolled', window.scrollY > 48);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function init() {
    initMotion();
    initHeroNav();
    initProjects();
    initForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
