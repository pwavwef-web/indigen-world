import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export type Role = 'contributor' | 'validator' | 'admin' | null;

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
  ready: boolean;
}

/** Tracks the signed-in user and their role claim. */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      if (next) {
        const token = await getIdTokenResult(next);
        const claimed = token.claims.role;
        setRole(
          claimed === 'contributor' || claimed === 'validator' || claimed === 'admin'
            ? claimed
            : null,
        );
      } else {
        setRole(null);
      }
      setReady(true);
    });
  }, []);

  return { user, role, ready };
}

export function canValidate(role: Role): boolean {
  return role === 'validator' || role === 'admin';
}

export function canContribute(role: Role): boolean {
  return role === 'contributor' || role === 'validator' || role === 'admin';
}
