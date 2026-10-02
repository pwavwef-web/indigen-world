import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const MotionContext = createContext({ paused: false, reduced: false, toggle: () => {} });

export function SiteMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem('indigen-world-motion-paused') === 'true'; } catch { return false; }
  });
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const toggle = () => setPaused(value => {
    try { localStorage.setItem('indigen-world-motion-paused', String(!value)); } catch { /* Preference remains valid for this session. */ }
    return !value;
  });
  return <MotionContext.Provider value={{ paused, reduced, toggle }}>
    <div className="site-motion" data-motion-paused={paused || reduced}>{children}</div>
  </MotionContext.Provider>;
}

export function useSiteMotion() { return useContext(MotionContext); }
