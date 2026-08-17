/**
 * src/lib/useRevealOnScroll.ts
 *
 * Powers the subtle fade/rise-in effect on `[data-reveal]` elements as
 * they scroll into view — carried over from the uploaded template's
 * inline IntersectionObserver effect in App.tsx, extracted into a
 * reusable hook so it can re-run whenever the route changes (each page
 * mounts a fresh set of `[data-reveal]` elements that need observing).
 *
 * Respects `prefers-reduced-motion`: reduced-motion users get every
 * element visible immediately rather than animated, matching the
 * brief's requirement to honour that OS-level preference.
 */
import { useEffect } from "react";

export function useRevealOnScroll(dependency: unknown): void {
  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional:
    // re-scan whenever `dependency` (the current route) changes.
  }, [dependency]);
}
