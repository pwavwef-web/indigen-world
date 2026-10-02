import { useEffect } from 'react';
import { useSiteMotion } from '../features/motion/SiteMotion';

/** Observe lazy route content and new cards without hiding unobserved content. */
export function useRevealOnScroll(dependency: unknown): void {
  const { paused, reduced } = useSiteMotion();
  useEffect(() => {
    const root = document.getElementById('main-content');
    if (!root) return;
    const selector = '[data-reveal], .section-heading, .journey-card, .product-card, .involvement-route-card, .audience-card, .today-path, .update-card, .labs-card, .labs-panel, .legal-copy > h2, .kicker-list > li, .process-list > li, .contribute-task > li, .contribute-review > li';
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const scan = () => root.querySelectorAll<HTMLElement>(selector).forEach(item => {
      if (seen.has(item)) return;
      seen.add(item);
      if (item.parentElement?.closest(selector)) return;
      if (paused || reduced) { item.classList.add('is-visible'); return; }
      if (item.getBoundingClientRect().top < window.innerHeight) {
        item.classList.add('is-visible');
      } else {
        const siblings = Array.from(item.parentElement?.children ?? []);
        item.style.setProperty('--reveal-delay', `${Math.min(siblings.indexOf(item), 4) * 65}ms`);
        item.classList.add('motion-ready');
        observer.observe(item);
      }
    });
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, [dependency, paused, reduced]);
}
