// A signed-in sample account. No real sign-in happens in the preview.
export type Role = string | null;

const user = { uid: 'preview', displayName: 'Akua Mensah', email: 'akua@example.com', photoURL: null };

export function useAuth() {
  return { user, ready: true, role: null, creatorStatus: null, refreshToken: async () => {} };
}

export const signIn = () => {};
export const signOutUser = () => {};
export const canValidate = () => false;
export const canMakeVideo = () => false;
export const canContribute = () => false;
