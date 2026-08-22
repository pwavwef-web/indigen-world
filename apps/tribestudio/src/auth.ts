import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export type Role =
  | 'contributor'
  | 'validator'
  | 'creator'
  | 'reviewer'
  | 'admin'
  | 'super_admin'
  | null;

const provider = new GoogleAuthProvider();

export function signIn() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export interface AuthState {
  user: User | null;
  role: Role;
  creatorStatus: string | null;
  ready: boolean;
  refreshToken: () => Promise<void>;
}

/** Tracks the signed-in user and their role claim. */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applyToken = async (next: User, force = false) => {
    // A claims fetch is a network round-trip that can fail (offline, token
    // refresh 5xx). Degrade to no-role rather than letting the rejection
    // propagate and strand the whole app on its loading state.
    try {
      const token = await getIdTokenResult(next, force);
      const claimed = token.claims.role;
      setRole(
        claimed === 'contributor'
          || claimed === 'validator'
          || claimed === 'creator'
          || claimed === 'reviewer'
          || claimed === 'admin'
          || claimed === 'super_admin'
          ? claimed
          : null,
      );
      setCreatorStatus(typeof token.claims.creatorStatus === 'string' ? token.claims.creatorStatus : null);
    } catch {
      setRole(null);
      setCreatorStatus(null);
    }
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      try {
        if (next) {
          await applyToken(next);
        } else {
          setRole(null);
          setCreatorStatus(null);
        }
      } finally {
        // Always resolve readiness so a transient failure never leaves the
        // app stuck on "Loading…".
        setReady(true);
      }
    });
  }, []);

  const refreshToken = useCallback(async () => {
    if (!user) return;
    await applyToken(user, true);
  }, [user]);

  return { user, role, creatorStatus, ready, refreshToken };
}

export function canValidate(role: Role): boolean {
  return role === 'validator' || role === 'reviewer' || role === 'admin' || role === 'super_admin';
}

export function canContribute(role: Role): boolean {
  return role === 'contributor' || role === 'validator' || role === 'admin' || role === 'super_admin';
}
