import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@indigen-world/design-tokens/tokens.css';
import '@indigen-world/web-ui/styles.css';
import App from './App';
import './styles.css';
import './firebase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
