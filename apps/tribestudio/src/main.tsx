import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@indigen-world/design-tokens/tokens.css';
import App from './App';
import './styles.css';
import './creator/creator.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
