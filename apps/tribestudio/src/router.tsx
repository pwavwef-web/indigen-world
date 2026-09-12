/**
 * Minimal History-API router with path parameters for TribeStudio.
 *
 * Public creator routes render without authentication; /studio routes are gated
 * by the workspace shell. Kept dependency-free to honour the repo's small-bundle,
 * no-extra-stack convention (the website uses a similar lightweight router).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

interface RouteContextValue {
  path: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

function currentPath(): string {
  const p = window.location.pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(() => ({ path: currentPath(), search: window.location.search }));
  const previousUrl = useRef(`${window.location.pathname}${window.location.search}`);

  useEffect(() => {
    const onPop = () => {
      if (!window.dispatchEvent(new Event('studio:before-navigate', { cancelable: true }))) {
        window.history.pushState({}, '', previousUrl.current);
        return;
      }
      previousUrl.current = `${window.location.pathname}${window.location.search}`;
      setLocation({ path: currentPath(), search: window.location.search });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (!window.dispatchEvent(new Event('studio:before-navigate', { cancelable: true }))) return;
    const url = new URL(to, window.location.origin);
    if (options?.replace) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    } else {
      window.history.pushState({}, '', `${url.pathname}${url.search}`);
    }
    previousUrl.current = `${url.pathname}${url.search}`;
    setLocation({ path: currentPath(), search: window.location.search });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const value = useMemo(() => ({ ...location, navigate }), [location, navigate]);
  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used within RouterProvider');
  return ctx;
}

/** Read a query-string parameter from the current location. */
export function useQueryParam(key: string): string | null {
  const { search } = useRoute();
  return new URLSearchParams(search).get(key);
}

/**
 * Match `pattern` (e.g. "/studio/opportunities/:id") against the current path.
 * Returns the extracted params, or null when it does not match.
 */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const pSeg = pattern.split('/').filter(Boolean);
  const aSeg = path.split('/').filter(Boolean);
  if (pSeg.length !== aSeg.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i += 1) {
    if (pSeg[i].startsWith(':')) {
      try {
        params[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i]);
      } catch {
        return null;
      }
    } else if (pSeg[i] !== aSeg[i]) {
      return null;
    }
  }
  return params;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  children: ReactNode;
};

/** Internal navigation link that renders a real anchor for accessibility. */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRoute();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === '_blank'
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
