import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// Firebase configuration for the TribeStudio workspace (Firebase Hosting site:
// tribestudio), inside the shared project-kassena-7e026 project. These values are
// public web-app identifiers, not secrets — privileged actions are enforced by
// Security Rules and Functions, never the client.
export const firebaseConfig = {
  apiKey: 'AIzaSyDe9TAz3pl0tiNqpIZZ0EQxmPEgMtf6kRA',
  authDomain: 'project-kassena-7e026.firebaseapp.com',
  projectId: 'project-kassena-7e026',
  storageBucket: 'project-kassena-7e026.firebasestorage.app',
  messagingSenderId: '111428711822',
  appId: '1:111428711822:web:eddc5b73a667f17329a0df',
  measurementId: 'G-EMK17K5HS7',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

// Callable Functions enforce App Check outside the emulator. Configure a
// reCAPTCHA Enterprise web key in the deployment environment; the key is a
// public site identifier, while its assessment policy remains server-side.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
if (!usingEmulators && typeof appCheckSiteKey === 'string' && appCheckSiteKey.length > 0) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

// Opt-in local emulator wiring: set VITE_USE_EMULATORS=true when running against
// `firebase emulators:start`. Ports match firebase.json.
if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && !usingEmulators) {
  void isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}
