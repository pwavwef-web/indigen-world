// Render-only preview of the TribeStudio expressions page for this post's
// screenshots. Sample data and mocked Firebase: nothing is read from or sent to
// any project, and no sign-in is involved.
//
//   npx vite --config apps/updates-blog/posts/2026-09-27-share-an-expression/mockups/studio-preview/vite.config.mjs
//
// Serves on http://localhost:5198. The real page, layout and styles are used;
// only auth, Firestore and Functions are replaced by the files in ./mocks.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^(\.\.\/)+auth$/, replacement: here('./mocks/auth.ts') },
      { find: /^(\.\.?\/)+firebase$/, replacement: here('./mocks/firebase.ts') },
      { find: /^firebase\/firestore$/, replacement: here('./mocks/firestore.ts') },
      { find: /^firebase\/functions$/, replacement: here('./mocks/functions.ts') },
    ],
  },
  server: { port: 5198, strictPort: true, fs: { allow: [here('../../../../../..')] } },
});
