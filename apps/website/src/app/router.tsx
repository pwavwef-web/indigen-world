/** Lightweight History API router for the site's fixed public routes. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { ROUTES_BY_PATH } from "../content/navigation";

const DEFAULT_PATH = "home";

export function routeKeyFromPathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/" ? DEFAULT_PATH : normalized.replace(/^\//, "");
}

export function hrefForRoute(to: string): string {
  if (to.startsWith("#") || to.startsWith("/")) return to;
  return to === DEFAULT_PATH ? "/" : `/${to}`;
}

function currentPath(): string {
  return routeKeyFromPathname(window.location.pathname);
}

interface RouteContextValue {
  path: string;
  navigate: (to: string) => void;
}

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath);

  useEffect(() => {
    const handlePopState = () => setPath(currentPath());
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
    setPath(routeKeyFromPathname(nextUrl.pathname));
  }, []);

  const value = useMemo(() => ({ path, navigate }), [navigate, path]);

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) {
    throw new Error("useRoute() must be used inside a <RouterProvider>");
  }
  return ctx;
}

export function isKnownRoute(path: string): boolean {
  return path in ROUTES_BY_PATH;
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
