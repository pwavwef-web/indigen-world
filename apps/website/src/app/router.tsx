/** Lightweight History API router for the site's public routes. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { DYNAMIC_ROUTES } from "../content/navigation";

const DEFAULT_PATH = "home";

export function routeKeyFromPathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/" ? DEFAULT_PATH : normalized.replace(/^\//, "");
}

/** A resolved location: which page renders, and what it was given. */
export interface RouteMatch {
  /** The key `PAGE_COMPONENTS` is looked up by. */
  key: string;
  params: Record<string, string>;
}

/**
 * Resolve a pathname to a page.
 *
 * Exact routes win outright, so a static route is never shadowed by a dynamic
 * one that happens to share its first segment. Only then are the dynamic
 * prefixes tried, and only for a path of exactly `<prefix>/<id>`: a deeper
 * path under a dynamic prefix is a URL this site does not have, and quietly
 * rendering the post page for it would turn every typo into a soft 404.
 */
export function matchRoute(pathname: string): RouteMatch {
  const key = routeKeyFromPathname(pathname);
  const segments = key.split("/");
  if (segments.length === 2) {
    const dynamic = DYNAMIC_ROUTES.find((route) => route.path === segments[0]);
    if (dynamic && segments[1] !== "") {
      return { key: dynamic.path, params: { [dynamic.param]: decodeURIComponent(segments[1]) } };
    }
  }
  return { key, params: {} };
}

export function hrefForRoute(to: string): string {
  if (to.startsWith("#") || to.startsWith("/")) return to;
  return to === DEFAULT_PATH ? "/" : `/${to}`;
}

function currentMatch(): RouteMatch {
  return matchRoute(window.location.pathname);
}

interface RouteContextValue {
  /** The matched page key — `post`, not `post/abc123`. */
  path: string;
  /** Path parameters for a dynamic route; empty for every static one. */
  params: Record<string, string>;
  navigate: (to: string) => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [match, setMatch] = useState<RouteMatch>(currentMatch);

  useEffect(() => {
    const handlePopState = () => setMatch(currentMatch());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((to: string) => {
    const href = hrefForRoute(to);

    if (href.startsWith("#")) {
      window.location.hash = href;
      return;
    }

    const nextUrl = new URL(href, window.location.origin);
    if (nextUrl.pathname === window.location.pathname && nextUrl.hash === window.location.hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setMatch(matchRoute(nextUrl.pathname));
  }, []);

  const value = useMemo(
    () => ({ path: match.key, params: match.params, navigate }),
    [match, navigate]
  );

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) {
    throw new Error("useRoute() must be used inside a <RouterProvider>");
  }
  return ctx;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

/** Internal navigation link. Renders a real <a href="#..."> so
 *  right-click/middle-click/keyboard behaviour all stay standard. */
export function Link({ to, children, ...anchorProps }: LinkProps) {
  const { navigate } = useRoute();
  const href = hrefForRoute(to);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    anchorProps.onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      anchorProps.target === "_blank" ||
      anchorProps.download !== undefined
    ) {
      return;
    }

    event.preventDefault();
    navigate(to);
  };

  return (
    <a href={href} {...anchorProps} onClick={handleClick}>
      {children}
    </a>
  );
}

export function scrollToTop(): void {
  if (window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) {
      target.scrollIntoView();
      return;
    }
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}
