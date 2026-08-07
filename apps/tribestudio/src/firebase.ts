import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

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

// Opt-in local emulator wiring: set VITE_USE_EMULATORS=true when running against
// `firebase emulators:start`. Ports match firebase.json.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && import.meta.env.VITE_USE_EMULATORS !== 'true') {
  void isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}
