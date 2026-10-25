import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

/**
 * The admin console's client-side router. It tracks the path and the query
 * string, so a section, a tool and a selected record all have real,
 * deep-linkable URLs; refresh restores them (hosting rewrites every path to
 * index.html) and Back/Forward walk them through `popstate`.
 *
 * Screens with unsaved edits can veto a navigation, Back and Forward
 * included, by cancelling the `admin:before-navigate` event (see
 * `useLeaveGuard`).
 */

export interface Location {
  pathname: string;
  search: string;
}

interface RouterValue extends Location {
  params: URLSearchParams;
  navigate: (to: string, options?: { replace?: boolean; keepScroll?: boolean }) => void;
  /** Merge query parameters into the current URL without adding history. */
  setParams: (patch: Record<string, string | null | undefined>, options?: { push?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function current(): Location {
  return { pathname: normalizePath(window.location.pathname), search: window.location.search };
}

/** The address bar's path and query, exactly as the browser holds them. */
function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** `/finance/` and `/finance` are the same place. */
export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** True when a screen with unsaved work allows the navigation. */
export function mayLeave(): boolean {
  return window.dispatchEvent(new Event('admin:before-navigate', { cancelable: true }));
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(current);
  // The URL and scroll position of the screen on show, so a vetoed
  // Back/Forward can put both back.
  const shownUrl = useRef(currentUrl());
  const shownScroll = useRef({ left: window.scrollX, top: window.scrollY });

  useEffect(() => {
    const onScroll = () => { shownScroll.current = { left: window.scrollX, top: window.scrollY }; };
    // Back/Forward have already moved the address bar when popstate fires. A
    // screen with unsaved edits gets the same say as with navigate(); if it
    // refuses, the URL it is showing goes back on top and nothing re-renders.
    const onPopState = () => {
      const next = currentUrl();
      if (next !== shownUrl.current && !mayLeave()) {
        window.history.pushState(null, '', shownUrl.current);
        // Browsers restore the other entry's scroll position just before or
        // just after popstate; put the screen back where it was either way.
        const scroll = { ...shownScroll.current, behavior: 'instant' as const };
        window.scrollTo(scroll);
        window.requestAnimationFrame(() => window.scrollTo(scroll));
        return;
      }
      shownUrl.current = next;
      setLocation(current());
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const navigate = useCallback<RouterValue['navigate']>((to, options = {}) => {
    const url = new URL(to, window.location.origin);
    const next = `${normalizePath(url.pathname)}${url.search}`;
    if (next === currentUrl()) return;
    if (!mayLeave()) return;
    if (options.replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    shownUrl.current = currentUrl();
    setLocation({ pathname: normalizePath(url.pathname), search: url.search });
    // A new screen starts at the top; a filter change on the same screen does not.
    if (!options.keepScroll && normalizePath(url.pathname) !== normalizePath(location.pathname)) window.scrollTo(0, 0);
  }, [location.pathname]);

  const setParams = useCallback<RouterValue['setParams']>((patch, options = {}) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (options.push) window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
    shownUrl.current = currentUrl();
    setLocation({ pathname: normalizePath(window.location.pathname), search: query ? `?${query}` : '' });
  }, []);

  const value = useMemo<RouterValue>(() => ({
    ...location,
    params: new URLSearchParams(location.search),
    navigate,
    setParams,
  }), [location, navigate, setParams]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRouter must be used inside <RouterProvider>.');
  return value;
}

/** An in-app link: a real `<a href>` that opens in a new tab normally, and
 * navigates without a reload on a plain click. */
export function Link({ to, onClick, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  const { navigate } = useRouter();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (rest.target && rest.target !== '_self') return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest}>{children}</a>;
}

/**
 * Asks before leaving a screen with unsaved edits — for in-app navigation,
 * the browser's Back and Forward, and closing or reloading the tab.
 */
export function useLeaveGuard(dirty: boolean, message = 'You have unsaved changes. Leave without saving?') {
  useEffect(() => {
    if (!dirty) return;
    const onNavigate = (event: Event) => {
      if (!window.confirm(message)) event.preventDefault();
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('admin:before-navigate', onNavigate);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('admin:before-navigate', onNavigate);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty, message]);
}
