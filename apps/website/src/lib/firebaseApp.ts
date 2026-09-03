/**
 * src/lib/firebaseApp.ts
 *
 * One Firebase app for the whole site.
 *
 * Two features now read Firestore directly — the public dictionary and the
 * shared-post page — and `initializeApp` throws if it is called twice with the
 * same name. Rather than have each caller remember the `getApps().length`
 * dance and carry its own copy of the config, both ask here.
 *
 * Firebase web identifiers are public application coordinates, not secrets.
 * Access to the records stays governed by Firestore rules, which expose only
 * rows explicitly marked as readable.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const productionFirebaseConfig = {
  apiKey: "AIzaSyDe9TAz3pl0tiNqpIZZ0EQxmPEgMtf6kRA",
  authDomain: "project-kassena-7e026.firebaseapp.com",
  projectId: "project-kassena-7e026",
  storageBucket: "project-kassena-7e026.firebasestorage.app",
  messagingSenderId: "111428711822",
  appId: "1:111428711822:web:1b032129debe268429a0df",
};

function firebaseConfig() {
  if (
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  ) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
  }
  return productionFirebaseConfig;
}

export function websiteFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig());
}

export function websiteFirestore(): Firestore {
  return getFirestore(websiteFirebaseApp());
}
