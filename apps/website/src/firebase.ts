import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDe9TAz3pl0tiNqpIZZ0EQxmPEgMtf6kRA",
  authDomain: "project-kassena-7e026.firebaseapp.com",
  projectId: "project-kassena-7e026",
  storageBucket: "project-kassena-7e026.firebasestorage.app",
  messagingSenderId: "111428711822",
  appId: "1:111428711822:web:58e73baa5a5e2ab129a0df",
  measurementId: "G-1LSDV9J65T"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Analytics conditionally
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported: boolean) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
