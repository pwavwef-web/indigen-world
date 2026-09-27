import '@indigen-world/design-tokens/tokens.css';
import '../../../../../../apps/tribestudio/src/styles.css';
import '../../../../../../apps/tribestudio/src/creator/creator.css';
import '../../../../../../apps/tribestudio/src/creator/studio-shell.css';
import '@indigen-world/console-ui/kit.css';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '../../../../../../apps/tribestudio/src/router';
import { StudioLayout } from '../../../../../../apps/tribestudio/src/creator/StudioLayout';
import { ExpressionsPage } from '../../../../../../apps/tribestudio/src/creator/pages/ExpressionsPage';

window.history.replaceState({}, '', '/studio/expressions');
createRoot(document.getElementById('root')!).render(
  <RouterProvider>
    <StudioLayout>
      <ExpressionsPage />
    </StudioLayout>
  </RouterProvider>,
);
