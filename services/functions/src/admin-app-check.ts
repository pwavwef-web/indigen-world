/** Admin-console transport protection is mandatory in deployed Functions. */
export const ADMIN_APP_CHECK_OPTIONS = {
  // The Firebase emulator cannot attest real production origins. This is the
  // standard emulator runtime marker, never a deploy-time opt-out flag.
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
};
