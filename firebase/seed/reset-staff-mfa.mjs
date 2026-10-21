/**
 * firebase/seed/reset-staff-mfa.mjs
 *
 * Owner recovery for admin-console two-step verification: clears one
 * account's authenticator, recovery codes and verified sessions, so the person
 * sets up a new authenticator at their next sign-in.
 *
 * Everyone else is reset from the console (Governance → Staff security) by the
 * super administrator. This script exists for the one case the console cannot
 * cover: the owner has lost both their authenticator and their recovery codes.
 * It runs on Application Default Credentials, so only people with owner access
 * to the Google Cloud project can use it. Automated agents must never run it
 * (AGENTS.md, "Super administrator").
 *
 *   GOOGLE_CLOUD_QUOTA_PROJECT=project-kassena-7e026 RESET_STAFF_MFA=confirm \
 *     node firebase/seed/reset-staff-mfa.mjs you@example.com
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'project-kassena-7e026';
const target = process.argv[2];

if (!target) {
  console.error('Usage: RESET_STAFF_MFA=confirm node firebase/seed/reset-staff-mfa.mjs <email-or-uid>');
  process.exit(1);
}
if (process.env.RESET_STAFF_MFA !== 'confirm') {
  console.error('Refusing: set RESET_STAFF_MFA=confirm to reset two-step verification.');
  process.exit(1);
}

initializeApp(process.env.FIREBASE_AUTH_EMULATOR_HOST ? { projectId: PROJECT_ID } : { projectId: PROJECT_ID, credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const user = target.includes('@') ? await auth.getUserByEmail(target) : await auth.getUser(target);
const claims = { ...(user.customClaims ?? {}) };
delete claims.staffMfa;
await db.doc(`staffMfa/${user.uid}`).delete();
await auth.setCustomUserClaims(user.uid, claims);
const audit = db.collection('auditLogs').doc();
await audit.set({
  id: audit.id, domain: 'staff-security', action: 'staff_mfa.reset',
  actor: { collection: 'system', id: 'reset-staff-mfa.mjs' }, target: { collection: 'users', id: user.uid },
  outcome: 'success', source: 'script', before: null, after: null,
  metadata: { email: user.email ?? null }, occurredAt: new Date().toISOString(),
});
console.log(`Two-step verification reset for ${user.email ?? user.uid}. They set up a new authenticator at their next console sign-in.`);
