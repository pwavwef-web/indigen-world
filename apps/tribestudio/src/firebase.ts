import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

// Firebase configuration for the TribeStudio admin web app (Firebase Hosting
// site: indigen-admin), inside the shared project-kassena-7e026 project.
// These values are public web-app identifiers, not secrets. Privileged access is
// enforced by Firebase Security Rules and server-side checks, never the client.
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

// Analytics is only initialised in environments that support it (browser, not SSR).
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  void isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}
