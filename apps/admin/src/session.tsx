import { createContext, useContext, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { allows, type AccessLevel, type StaffAccess } from './routes';

/** The signed-in staff member, as every screen sees them. */
export interface Session {
  user: User;
  access: StaffAccess;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}

/** Whether the signed-in person holds an access level (display only; the server decides). */
export function useAllows(level: AccessLevel): boolean {
  return allows(level, useSession().access);
}
