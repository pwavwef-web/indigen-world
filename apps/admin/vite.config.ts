import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, import.meta.dirname), ...process.env };
  const config = JSON.parse(readFileSync(new URL('./app-check.config.json', import.meta.url), 'utf8'));
  const siteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || config.siteKey;
  if (command === 'build' && env.VITE_USE_EMULATORS !== 'true' && !/^6L[A-Za-z0-9_-]{38}$/.test(siteKey)) {
    throw new Error('A registered reCAPTCHA Enterprise site key is required to build the admin console.');
  }
  return {
    plugins: [react()],
    build: {
      target: 'es2022',
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // Keep the Firebase SDK in its own long-lived, cacheable chunk.
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'firebase';
            }
            return undefined;
          },
        },
      },
    },
  };
});
