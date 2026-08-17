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

export function useDocumentMeta(title: string, description: string): void {
  useEffect(() => {
    const fullTitle = title === "Home" ? "Indigen World · Culture belongs in the future" : `${title} · Indigen World`;
    const siteOrigin = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
    const canonicalUrl = `${siteOrigin}${window.location.pathname}`;

    document.title = fullTitle;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    trackEvent(ANALYTICS_EVENTS.pageView, {
      page_path: window.location.pathname,
      page_title: title,
    });

    if (window.location.pathname === "/project-kasena") {
      trackEvent(ANALYTICS_EVENTS.languageProjectPageView, { project: "project_kasena" });
    }
  }, [title, description]);
}
