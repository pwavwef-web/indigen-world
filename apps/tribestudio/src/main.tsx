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
