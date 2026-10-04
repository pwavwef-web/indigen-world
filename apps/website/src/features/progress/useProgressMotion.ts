/**
 * src/features/progress/useProgressMotion.ts
 *
 * Coordinates animation lifecycle for the Help Fill the Jars experience:
 *  - Respects prefers-reduced-motion media query.
 *  - Auto-pauses continuous physics and bubbles when the tab/page is hidden.
 *  - Supports explicit user pause/play toggle.
 *  - Caches user pause preference.
 */

import { useEffect, useState } from 'react';

const MOTION_PAUSE_STORAGE_KEY = 'iw_progress_motion_paused';

export interface ProgressMotionControl {
  isMotionPaused: boolean;
  prefersReducedMotion: boolean;
  toggleMotionPause: () => void;
  canAnimate: boolean; // true only if not paused and not reduced motion
}

export function useProgressMotion(): ProgressMotionControl {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  const [isManuallyPaused, setIsManuallyPaused] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MOTION_PAUSE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.visibilityState === 'hidden';
  });

  // Track system reduced-motion preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Auto-pause when page visibility changes (browser tab switched or minimized)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      setIsDocumentHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggleMotionPause = () => {
    setIsManuallyPaused((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MOTION_PAUSE_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const isMotionPaused = isManuallyPaused || isDocumentHidden;
  const canAnimate = !prefersReducedMotion && !isMotionPaused;

  return {
    isMotionPaused: isManuallyPaused,
    prefersReducedMotion,
    toggleMotionPause,
    canAnimate,
  };
}
