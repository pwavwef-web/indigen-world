import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@indigen-world/design-tokens/tokens.css';
import App from './App';
import './styles.css';
import './creator/creator.css';
import './creator/studio-shell.css';
// The shared console kit is loaded last so its standardised table, control and
// status treatments settle over anything a page stylesheet declared first.
import '@indigen-world/console-ui/kit.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Retires the boot screen inlined in index.html.
 *
 * Waits for React to have actually committed something rather than for the
 * next frame. `render()` schedules the work, it does not finish it, so a
 * single `requestAnimationFrame` can easily land before the first paint — and
 * fading the loading screen out onto a blank page is worse than the wait it
 * was covering. Having a child in `#root` is the cheap, honest signal that
 * there is a page underneath to reveal.
 *
 * Capped, because a first render that never arrives must not leave a visitor
 * staring at a loading screen forever: at that point whatever the app managed
 * to render, including an error boundary, is more useful than the splash.
 */
const boot = document.getElementById('boot');
if (boot) {
  const root = document.getElementById('root');
  const startedAt = performance.now();

  const dismiss = () => {
    boot.dataset.leaving = 'true';
    // Matches the transition in index.html; the node goes so it can never
    // trap a click or be read out by a screen reader after it is invisible.
    boot.addEventListener('transitionend', () => boot.remove(), { once: true });
    // A browser that skipped the transition (reduced motion, a background tab)
    // fires no transitionend, so the removal is guaranteed either way.
    window.setTimeout(() => boot.remove(), 600);
  };

  const whenPainted = () => {
    if (root?.firstElementChild || performance.now() - startedAt > 8_000) {
      dismiss();
      return;
    }
    requestAnimationFrame(whenPainted);
  };
  requestAnimationFrame(whenPainted);
}
