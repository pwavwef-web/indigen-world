/** Shared public-page motion, also used by the standalone book guides. */
const CARD_SELECTOR = [
  '[data-scroll-card]', '.scroll-card-stack > :is(article, section, li, div, a)',
  '.vision-card', '.product-card', '.journey-card', '.involvement-route-card',
  '.audience-card', '.today-path', '.update-card', '.learning-steps > li',
  '.learning-resource', '.learning-services > div', '.learning-source-note',
  '.principle', '.impact-grid > article', '.team-list > article', '.process-list > li',
  '.kicker-list > li', '.contribute-task > li', '.contribute-review > li',
  '.expression-card', '.contribute-scope', '.roadmap__item', '.module-preview',
  '.dictionary-entry-card', '.dictionary-fact', '.post-card:not([aria-busy=true])',
  '.privacy-principles > a', '.privacy-copy__section > div', '.privacy-request',
  '.contact-guidance', '.form-card', '.tester-claim-summary', '.tester-claim-form-wrap',
  '.honor-card', '.methodology-card', '.progress-calculator-card', '.floating-vessel',
  '.labs-card', '.labs-panel', '.labs-update', '.labs-empty', '.labs-principles > div',
  '.not-found__card', '.not-found__route',
].join(', ');

export function mountScrollCards(root, { paused = false, reduced = false, standalone = false } = {}) {
  const cards = CARD_SELECTOR + (standalone ? ', main > section > details, main > section:not(:has(> details))' : '');
  const selector = `${cards}, [data-reveal], .section-heading, .legal-copy > h2`;
  const seen = new WeakSet();
  const stacked = new Set();
  const fit = item => {
    const index = Array.from(item.parentElement?.children ?? []).indexOf(item);
    const top = 112 + Math.min(index, 6) * 18;
    item.style.setProperty('--scroll-card-top', `${top}px`);
    item.classList.toggle('scroll-card--stackable', item.offsetHeight <= innerHeight - top - 32);
  };
  const sizes = new ResizeObserver(entries => entries.forEach(entry => fit(entry.target)));
  const resize = () => stacked.forEach(fit);
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
  const scan = () => {
    for (const item of root.querySelectorAll(selector)) {
      if (seen.has(item)) continue;
      seen.add(item);
      const card = item.matches(cards);
      // Reveal wrappers must not hide cards which have their own entrance.
      if (!card && item.querySelector(cards)) { item.classList.add('is-visible'); continue; }
      if (item.parentElement?.closest(cards)) continue;
      if (!card && item.parentElement?.closest(selector)) continue;
      if (card) {
        item.classList.add('scroll-card');
        if (item.parentElement?.classList.contains('scroll-card-stack')) {
          stacked.add(item);
          fit(item);
          sizes.observe(item);
        }
      }
      if (paused || reduced || item.getBoundingClientRect().top < innerHeight) {
        item.classList.add('is-visible');
      } else {
        const index = Array.from(item.parentElement?.children ?? []).indexOf(item);
        item.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 65}ms`);
        item.classList.add('motion-ready');
        observer.observe(item);
      }
    }
  };
  scan();
  let frame = 0;
  const mutations = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; scan(); });
  });
  mutations.observe(root, { childList: true, subtree: true });
  const focus = event => {
    if (event.target instanceof Element) event.target.closest('.motion-ready')?.classList.add('is-visible');
  };
  root.addEventListener('focusin', focus);
  window.addEventListener('resize', resize);
  return () => {
    observer.disconnect(); mutations.disconnect(); sizes.disconnect();
    cancelAnimationFrame(frame);
    root.removeEventListener('focusin', focus);
    window.removeEventListener('resize', resize);
  };
}

if (typeof document !== 'undefined' && document.body?.hasAttribute('data-standalone-cards')) {
  const root = document.querySelector('main');
  const key = 'indigen-world-motion-paused';
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  try { paused = localStorage.getItem(key) === 'true'; } catch { /* Session preference still works. */ }
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'standalone-motion-control';
  document.querySelector('nav')?.appendChild(control);
  document.body.classList.add('site-motion');
  let stop = () => {};
  const update = () => {
    stop();
    document.body.dataset.motionPaused = String(paused || query.matches);
    control.hidden = query.matches;
    control.textContent = paused ? 'Resume scroll effects' : 'Pause scroll effects';
    control.setAttribute('aria-pressed', String(paused));
    if (root) stop = mountScrollCards(root, { paused, reduced: query.matches, standalone: true });
  };
  control.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem(key, String(paused)); } catch { /* Session preference still works. */ }
    update();
  });
  query.addEventListener('change', update);
  window.addEventListener('storage', event => { if (event.key === key) { paused = event.newValue === 'true'; update(); } });
  update();
}
