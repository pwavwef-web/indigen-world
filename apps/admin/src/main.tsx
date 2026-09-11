import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@indigen-world/design-tokens/tokens.css';
import '@indigen-world/web-ui/styles.css';
import App from './App';
import './styles.css';
import './creators/creators-admin.css';
import './team-sites/team-sites.css';
import './messaging/messaging.css';
// The shared console kit is loaded last so its standardised table, control and
// status treatments settle over anything a screen stylesheet declared first.
import '@indigen-world/console-ui/kit.css';
import './firebase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
