/// <reference types="vite/client" />

/**
 * Typed environment variables. Extending ImportMetaEnv here means
 * `import.meta.env.VITE_FIREBASE_API_KEY` is autocompleted and
 * type-checked everywhere it's used (see src/lib/firebase.ts), instead
 * of being an untyped `any` string lookup.
 */
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_PUBLIC_FORMS_ENDPOINT?: string;
  readonly VITE_ANALYTICS_ENABLED?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
