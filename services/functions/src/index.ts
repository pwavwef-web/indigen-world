import { initializeApp } from 'firebase-admin/app';

// Initialise the Admin SDK once for all functions in this codebase.
initializeApp();

export { decideReview } from './validation.js';
export { setUserRole } from './identity.js';
