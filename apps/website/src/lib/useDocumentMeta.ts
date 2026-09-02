/**
 * src/lib/useDocumentMeta.ts
 *
 * The brief requires unique SEO metadata per page. Since this is a
 * client-rendered single-page app (one index.html, many in-app
 * routes), each page component calls this hook to overwrite
 * document.title and <meta name="description"> on mount — the
 * uploaded template's index.html only ever set one static title/
 * description for the whole site, which this fixes.
 */
import { useEffect } from "react";
import { ANALYTICS_EVENTS, trackEvent } from "./analytics";

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string): void {
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

interface DocumentMetaOptions {
  /**
   * Mark the current view as non-indexable (e.g. the 404 route). Sets
   * `robots: noindex` and drops the self-referencing canonical so crawlers
   * do not index arbitrary unknown URLs as soft-404s.
   */
  noindex?: boolean;
}

export function useDocumentMeta(
  title: string,
  description: string,
  options: DocumentMetaOptions = {}
): void {
  const { noindex = false } = options;
  useEffect(() => {
    const fullTitle =
      title === "Home" ? "Indigen World — Culture belongs in the future" : `${title} · Indigen World`;
    const siteOrigin = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
    const canonicalUrl = `${siteOrigin}${window.location.pathname}`;

    document.title = fullTitle;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[name="robots"]', "name", "robots", noindex ? "noindex" : "index, follow");
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);

    // A non-indexable route must not declare itself canonical. Remove any
    // canonical left over from a previously-rendered indexable route.
    const existingCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (noindex) {
      existingCanonical?.remove();
    } else {
      let canonical = existingCanonical;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    }

    trackEvent(ANALYTICS_EVENTS.pageView, {
      page_path: window.location.pathname,
      page_title: title,
    });

    if (window.location.pathname === "/project-kassena") {
      trackEvent(ANALYTICS_EVENTS.languageProjectPageView, { project: "project_kassena" });
    }
  }, [title, description]);
}
