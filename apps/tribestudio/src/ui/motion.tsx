import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';

/**
 * Motion helpers. CSS does the animating; these decide whether it should, and
 * feed it what CSS cannot know on its own: when something scrolls into view,
 * where the pointer is, and where the current tab or page sits.
 */

const reduceQuery = '(prefers-reduced-motion: reduce)';

/** True unless the visitor (Display → Animations) or their device asks for less. */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const choice = document.documentElement.dataset.motion;
  if (choice === 'off') return false;
  if (choice === 'on') return true;
  return !window.matchMedia?.(reduceQuery).matches;
}

/** Re-renders when the motion preference changes. */
export function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(motionAllowed);
  useEffect(() => {
    const update = () => setAllowed(motionAllowed());
    const media = window.matchMedia?.(reduceQuery);
    media?.addEventListener('change', update);
    window.addEventListener('ts:display-change', update);
    return () => {
      media?.removeEventListener('change', update);
      window.removeEventListener('ts:display-change', update);
    };
  }, []);
  return allowed;
}

let revealObserver: IntersectionObserver | null = null;

function observer(): IntersectionObserver | null {
  if (revealObserver || typeof IntersectionObserver === 'undefined') return revealObserver;
  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      revealObserver?.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  // Only now may CSS hide unrevealed blocks: a browser without the observer
  // never hides anything.
  document.documentElement.dataset.reveal = 'ready';
  return revealObserver;
}

/** Fades a block in the first time it scrolls into view. */
export function useReveal<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = observer();
    if (!io || !motionAllowed()) {
      node.classList.add('is-revealed');
      return;
    }
    io.observe(node);
    return () => io.unobserve(node);
  }, [ref]);
}

export function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }: {
  as?: ElementType;
  className?: string;
  delay?: number;
  children: ReactNode;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  const style = { ...(rest.style as CSSProperties | undefined), ['--reveal-delay' as string]: `${delay}ms` };
  return <Tag ref={ref} className={`ts-reveal ${className}`.trim()} {...rest} style={style}>{children}</Tag>;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/**
 * Counts a number up from where it was to where it is. Only numbers are
 * animated; a value that is not a finite number is shown as it is.
 */
export function useCountUp(target: number, duration = 900): number {
  const allowed = useMotionAllowed();
  const [shown, setShown] = useState(() => (allowed ? 0 : target));
  const from = useRef(allowed ? 0 : target);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (!allowed) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const value = origin + (target - origin) * easeOutCubic(progress);
      setShown(progress === 1 ? target : value);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, allowed]);
  return shown;
}

export function CountUp({ value, format }: { value: number; format?: (value: number) => string }) {
  const shown = useCountUp(value);
  const rounded = Number.isInteger(value) ? Math.round(shown) : Math.round(shown * 10) / 10;
  return <span className="ts-num" aria-label={format ? format(value) : String(value)}><span aria-hidden="true">{format ? format(rounded) : rounded.toLocaleString()}</span></span>;
}

/** Pointer-follow light for a card (pairs with .ts-spotlight). */
export function spotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return;
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}

/**
 * Positions one indicator element under the active item of a group (the
 * sidebar's current page, a segmented control's selection). Measured, so it
 * glides between items of any size; it simply sits still without motion.
 */
export function useIndicator(container: RefObject<HTMLElement | null>, selector: string, deps: unknown[], axis: 'y' | 'x' = 'y') {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const measure = useCallback(() => {
    const root = container.current;
    const active = root?.querySelector<HTMLElement>(selector);
    if (!root || !active) {
      setStyle(null);
      return;
    }
    const rootBox = root.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (axis === 'y') {
      setStyle({
        ['--indicator-y' as string]: `${box.top - rootBox.top + root.scrollTop}px`,
        ['--indicator-h' as string]: `${box.height}px`,
      });
    } else {
      setStyle({
        width: `${box.width}px`,
        transform: `translateX(${box.left - rootBox.left + root.scrollLeft}px)`,
      });
    }
  }, [container, selector, axis]);
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);
  useEffect(() => {
    const root = container.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(() => measure());
    resize.observe(root);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [container, measure]);
  return style;
}

/** Runs a DOM update inside a view transition when the browser and the visitor allow it. */
export function withViewTransition(update: () => void) {
  const start = (document as Document & { startViewTransition?: (callback: () => void) => unknown }).startViewTransition;
  if (!start || !motionAllowed()) {
    update();
    return;
  }
  try {
    start.call(document, update);
  } catch {
    update();
  }
}
