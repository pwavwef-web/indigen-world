import { useEffect } from 'react';
import { useSiteMotion } from '../features/motion/SiteMotion';
import { mountScrollCards } from '../../public/scroll-cards.js';

/** Observe route changes and asynchronously loaded public cards. */
export function useRevealOnScroll(dependency: unknown): void {
  const { paused, reduced } = useSiteMotion();
  useEffect(() => {
    const root = document.getElementById('main-content');
    if (root) return mountScrollCards(root, { paused, reduced });
  }, [dependency, paused, reduced]);
}
