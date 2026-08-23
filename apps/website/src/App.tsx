import { Suspense, useEffect, useRef, useState } from "react";
import { ToastProvider, Modal } from "@indigen-world/web-ui";
import { useRoute, scrollToTop } from "./app/router";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PAGE_COMPONENTS, NotFoundPage } from "./pages";

export function App() {
  const { path } = useRoute();
  const hasMounted = useRef(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    scrollToTop();
    if (hasMounted.current) {
      window.requestAnimationFrame(() => document.getElementById("main-content")?.focus());
    } else {
      hasMounted.current = true;
    }
  }, [path]);

  // Global accessibility keyboard shortcut listener ('?' for shortcuts modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const PageComponent = PAGE_COMPONENTS[path] ?? NotFoundPage;

  return (
    <ToastProvider>
      <div className="site-shell">
        <Header />
        <main id="main-content" tabIndex={-1}>
          <ErrorBoundary resetKey={path}>
            <Suspense fallback={<div className="route-loading" role="status">Loading page…</div>}>
              <PageComponent />
            </Suspense>
          </ErrorBoundary>
        </main>
        <Footer />

        {/* Keyboard Shortcuts Cheatsheet Modal */}
        <Modal
          isOpen={showShortcuts}
          onClose={() => setShowShortcuts(false)}
          title="Accessibility & Keyboard Shortcuts"
          size="small"
        >
          <div className="shortcuts-modal-content">
            <p className="tiny muted">Press any of the following keys anywhere on the platform:</p>
            <ul className="shortcuts-list">
              <li><kbd>?</kbd><span>Toggle keyboard shortcuts cheatsheet</span></li>
              <li><kbd>Tab</kbd><span>Navigate interactive elements in order</span></li>
              <li><kbd>Esc</kbd><span>Dismiss modals, drawers, or mobile menus</span></li>
              <li><kbd>Space / Enter</kbd><span>Trigger audio playback &amp; buttons</span></li>
            </ul>
          </div>
        </Modal>
      </div>
    </ToastProvider>
  );
}
