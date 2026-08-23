import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal client-side router for the admin console. Tracks `location.pathname`
 * and exposes an in-app `navigate` that uses the History API, so each screen has
 * a real, deep-linkable URL and a refresh restores the current screen (the
 * hosting config rewrites every path to index.html). Back/forward buttons work
 * via the `popstate` listener. No routing dependency needed for a handful of
 * top-level screens.
 */
export function useRouter(): { pathname: string; navigate: (to: string) => void } {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState(null, '', to);
    setPathname(to);
    // Keep long screens from opening scrolled to where the previous one was.
    window.scrollTo(0, 0);
  }, []);

  return { pathname, navigate };
}
