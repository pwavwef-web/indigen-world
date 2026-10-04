/**
 * ErrorBoundary
 *
 * Catches render and lazy-chunk-load failures below it so a single throw over
 * unchecked Firestore data — or a stale hashed chunk after a redeploy — never
 * unmounts the whole workspace to a blank page. Pairs with the route-level
 * <Suspense> boundaries: Suspense handles the pending import, this handles a
 * rejected one (and any render error).
 *
 * It sits outside the router, so it draws the sign-in frame with plain
 * anchors rather than the shared AuthScreen.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrandMark } from './ui/BrandMark';
import { Icon } from './ui/icons';

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
      <div className="ts-auth" role="alert">
        <div className="ts-auth__vignette" aria-hidden="true" />
        <main className="ts-auth__inner">
          <BrandMark size="3.5rem" />
          <section className="ts-auth__card">
            <div className="ts-auth__head">
              <span className="ts-auth__workspace"><Icon name={chunkError ? 'refresh' : 'alert'} />TribeStudio</span>
              <h1 className="ts-auth__title">{chunkError ? 'A new version is available' : 'Something went wrong'}</h1>
              <p className="ts-auth__lede">
                {chunkError
                  ? 'TribeStudio was updated while this page was open. Reload to continue with the latest version.'
                  : 'This screen hit an unexpected problem. Reloading usually fixes it; drafts saved to your account are safe.'}
              </p>
            </div>
            <div className="ts-auth__form">
              <button type="button" className="ts-btn ts-btn--primary ts-btn--lg ts-btn--block" onClick={() => window.location.reload()}>
                <Icon name="refresh" /><span>Reload</span>
              </button>
              <a className="ts-btn ts-btn--ghost ts-btn--block" href="/studio"><span>Back to the studio</span></a>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
