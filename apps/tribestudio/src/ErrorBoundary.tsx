/**
 * ErrorBoundary
 *
 * Catches render and lazy-chunk-load failures below it so a single throw over
 * unchecked Firestore data — or a stale hashed chunk after a redeploy — never
 * unmounts the whole workspace to a blank page. Pairs with the route-level
 * <Suspense> boundaries: Suspense handles the pending import, this handles a
 * rejected one (and any render error).
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  const signal = `${error.name} ${error.message}`;
  return /ChunkLoadError|dynamically imported module|Loading chunk|Importing a module script failed/i.test(
    signal,
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('TribeStudio render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);
    return (
      <div className="app-error" role="alert">
        <div className="app-error__card">
          <h1>{chunkError ? 'A new version is available' : 'Something went wrong'}</h1>
          <p className="muted">
            {chunkError
              ? 'Reload to get the latest version of TribeStudio.'
              : 'We hit an unexpected problem. Reloading usually fixes it.'}
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
