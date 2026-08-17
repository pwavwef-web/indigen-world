/**
 * src/App.tsx
 *
 * Root component: the fixed page shell (header, footer) plus whichever
 * page matches the current route. This replaces the uploaded
 * template's App.tsx, which was the entire site (nav, hero, every
 * section, footer) in one 818-line component — everything below is
 * now composed from src/components and src/pages instead.
 */
import { Suspense, useEffect, useRef } from "react";
import { useRoute, scrollToTop } from "./app/router";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { PAGE_COMPONENTS, NotFoundPage } from "./pages";

export function App() {
  const { path } = useRoute();
  const hasMounted = useRef(false);

  useEffect(() => {
    scrollToTop();
    if (hasMounted.current) {
      window.requestAnimationFrame(() => document.getElementById("main-content")?.focus());
    } else {
      hasMounted.current = true;
    }
  }, [path]);

  const PageComponent = PAGE_COMPONENTS[path] ?? NotFoundPage;

  return (
    <div className="site-shell">
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Suspense fallback={<div className="route-loading" role="status">Loading page…</div>}>
          <PageComponent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
