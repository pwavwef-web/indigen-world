import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// Firebase configuration for the Indigen World Admin console (Firebase Hosting
// site: indigen-admin), inside the shared project-kassena-7e026 project.
// These values are public web-app identifiers, not secrets. Administrative
// privilege is enforced by role claims, Firebase Security Rules and server-side
// checks in Functions — never by the client.
export const firebaseConfig = {
  apiKey: 'AIzaSyDe9TAz3pl0tiNqpIZZ0EQxmPEgMtf6kRA',
  authDomain: 'project-kassena-7e026.firebaseapp.com',
  projectId: 'project-kassena-7e026',
  storageBucket: 'project-kassena-7e026.firebasestorage.app',
  messagingSenderId: '111428711822',
  appId: '1:111428711822:web:1b032129debe268429a0df',
  measurementId: 'G-7ZG5CSSXYF',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

// Callable Functions (role assignment, application and submission decisions)
// enforce App Check outside the emulator. Configure the same reCAPTCHA Enterprise
// web key used by TribeStudio; the key is a public site identifier.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
if (!usingEmulators && typeof appCheckSiteKey === 'string' && appCheckSiteKey.length > 0) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
} else if (!usingEmulators) {
  // Fail loudly at boot: without App Check, every privileged callable
  // (decideCreatorApplication, decideSubmission, …) is rejected server-side,
  // which would otherwise surface only as opaque "action failed" errors.
  console.warn(
    '[admin] VITE_RECAPTCHA_ENTERPRISE_SITE_KEY is missing — App Check is disabled. ' +
      'Callable Functions enforce App Check in deployed environments and will reject requests.',
  );
}

// Opt-in local emulator wiring for development and integration tests.
if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Analytics is only initialised in environments that support it (browser, not SSR).
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && !usingEmulators) {
  void isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}
