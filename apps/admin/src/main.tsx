import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Sora for display, Inter for reading — TribeStudio's pairing, self-hosted.
import '@fontsource-variable/sora/wght.css';
import '@fontsource-variable/inter/wght.css';
// TribeStudio's foundation layer, read from the studio itself so the two
// products share one set of tokens, controls, motion and palette styling and
// cannot drift. Every rule in these files is namespaced (`ts-*`, the command
// palette's `iwx-pal*`, console-ui's table classes); none of them restyle
// anything the console does not ask for.
import '../../tribestudio/src/ui/tokens.css';
import '../../tribestudio/src/ui/base.css';
import '../../tribestudio/src/ui/motion.css';
import '../../tribestudio/src/ui/components.css';
import '../../tribestudio/src/ui/shell.css';
import '../../tribestudio/src/ui/auth.css';
// The console's own layouts, then the bridge that draws older screens in the
// same language.
import './ui/admin.css';
import './ui/sections.css';
import './ui/legacy.css';
import './creators/creators-admin.css';
import './team-sites/team-sites.css';
import { applyDisplay, readDisplay } from './ui/display';
import App from './App';
import './firebase';

applyDisplay(readDisplay());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
