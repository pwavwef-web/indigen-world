import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LoadFailure } from './primitives';

/**
 * Keeps one broken screen from blanking the console: the shell, the sidebar
 * and the way home stay usable, and the failure says what to do next.
 */
export class ScreenBoundary extends Component<{ name: string; children: ReactNode }, { failed: Error | null }> {
  state = { failed: null as Error | null };

  static getDerivedStateFromError(failed: Error) {
    return { failed };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[admin] ${this.props.name} failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <LoadFailure
        compact={false}
        title={`${this.props.name} could not be shown`}
        body="Something in this screen’s data was not in the shape it expected. Nothing was changed. Reload to try again; if it keeps happening, the error is in the browser console."
        onRetry={() => window.location.reload()}
      />
    );
  }
}
