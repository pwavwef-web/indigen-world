import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  onIdTokenChanged,
  type User,
} from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { useEffect, useState } from "react";
import { websiteFirebaseApp } from "../../lib/firebaseApp";
const app = websiteFirebaseApp();
export const labsAuth = getAuth(app);
const functions = getFunctions(app, "us-central1");
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(labsAuth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
} else if (import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(
      import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
    ),
    isTokenAutoRefreshEnabled: true,
  });
}
export async function labsCall<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  return (
    await httpsCallable<Record<string, unknown>, T>(
      functions,
      "labsApi",
    )({ ...data, action })
  ).data;
}
export function useLabsAccount() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false);
  useEffect(
    () =>
      onIdTokenChanged(labsAuth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );
  return { user, ready };
}
export const loginGoogle = () =>
  signInWithPopup(labsAuth, new GoogleAuthProvider());
export const loginEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(labsAuth, email, password);
export const logout = () => signOut(labsAuth);
export function errorMessage(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (
    ["functions/deadline-exceeded", "functions/unavailable"].includes(
      e.code ?? "",
    )
  )
    return "Labs could not finish that request. Your editor content has been kept. Please try again.";
  if (["functions/not-found", "functions/internal"].includes(e.code ?? ""))
    return "Labs could not reach its service. The backend may not be released yet. Try again later.";
  return (
    e.message?.replace(/^Firebase: /, "") ??
    "Something went wrong. Please try again."
  );
}
