/**
 * src/components/ErrorBoundary.tsx
 *
 * Catches render/lazy-load failures below it so a single throw never
 * unmounts the whole app to a blank page. The most common trigger in a
 * code-split SPA is a *chunk-load* failure: after a redeploy, a visitor
 * still holding the old index.html requests a page chunk whose hashed
 * filename no longer exists. <Suspense> handles the pending promise but
 * not a rejected import — so without this boundary that reject bubbles to
 * the root and blanks the site. Here it surfaces a recoverable message
 * with a reload, which fetches the current build.
 *
 * `resetKey` (the current route) clears a caught error on navigation, so
 * moving to another page recovers without a manual reload.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
  lastResetKey: unknown;
}

function isChunkLoadError(error: Error): boolean {
  const signal = `${error.name} ${error.message}`;
  return /ChunkLoadError|dynamically imported module|Loading chunk|Importing a module script failed/i.test(
    signal
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, lastResetKey: undefined };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.lastResetKey) {
      return { error: null, lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Diagnostic only — nothing about the error is shown to the visitor.
    console.error("Route render error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);
    return (
      <div className="route-error" role="alert">
        <h1>{chunkError ? "This page needs a refresh" : "Something went wrong"}</h1>
        <p>
          {chunkError
            ? "A newer version of the site is available. Reload to load the latest version of this page."
            : "We hit an unexpected problem loading this page. Reloading usually fixes it."}
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => window.location.reload()}
        >
          <span>Reload the page</span>
        </button>
      </div>
    );
  }
}
