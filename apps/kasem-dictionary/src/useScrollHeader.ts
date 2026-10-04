import { useCallback, useEffect, useRef, useState } from "react";

const PANEL_SELECTOR = ".browse-panel, .definition-panel, .explore-panel";

interface ScrollState {
  position: number;
  direction: -1 | 0 | 1;
  travel: number;
}

/** Track each dictionary pane separately, without changing its scroll geometry. */
export function useScrollHeader({ disabled = false }: { disabled?: boolean } = {}) {
  const [headerHidden, setHeaderHidden] = useState(false);
  const resetTracking = useRef<(() => void) | null>(null);
  const showHeader = useCallback(() => {
    resetTracking.current?.();
    setHeaderHidden(false);
  }, []);

  useEffect(() => {
    if (disabled) {
      setHeaderHidden(false);
      return;
    }

    const states = new Map<Document | HTMLElement, ScrollState>();
    let activeTarget: Document | HTMLElement | null = null;
    const positionOf = (target: Document | HTMLElement) =>
      Math.max(0, target === document ? window.scrollY : (target as HTMLElement).scrollTop);
    const baseline = (target: Document | HTMLElement) => {
      states.set(target, { position: positionOf(target), direction: 0, travel: 0 });
    };
    const reset = () => {
      activeTarget = null;
      baseline(document);
      document.querySelectorAll<HTMLElement>(`.dictionary-app :is(${PANEL_SELECTOR})`).forEach(baseline);
    };
    reset();
    resetTracking.current = reset;

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target !== document && !(target instanceof HTMLElement &&
        target.matches(PANEL_SELECTOR) && target.closest(".dictionary-app"))) return;
      const pane = target as Document | HTMLElement;
      const position = positionOf(pane);
      let state = states.get(pane);
      if (!state) {
        // A newly mounted pane may already have a restored scroll position.
        baseline(pane);
        state = states.get(pane)!;
      }
      const delta = position - state.position;
      state.position = position;

      if (activeTarget !== pane) {
        // Travel in one pane must never satisfy another pane's threshold.
        state.direction = 0;
        state.travel = 0;
        activeTarget = pane;
      }
      if (position <= 4) {
        state.direction = 0;
        state.travel = 0;
        setHeaderHidden(false);
        return;
      }
      if (delta === 0) return;
      const direction = delta > 0 ? 1 : -1;
      if (direction !== state.direction) state.travel = 0;
      state.direction = direction;
      state.travel += Math.abs(delta);
      if (direction === -1 && state.travel > 18) setHeaderHidden(false);
      else if (direction === 1 && state.travel > 24) setHeaderHidden(true);
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      if (resetTracking.current === reset) resetTracking.current = null;
    };
  }, [disabled]);

  return { headerHidden, showHeader };
}
