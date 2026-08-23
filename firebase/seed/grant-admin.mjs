// First-admin bootstrap: grants the `super_admin` role claim to one existing
// account, breaking the chicken-and-egg where every privileged Function
// (setUserRole, decideCreatorApplication, decideSubmission) already requires an
// admin. A super_admin can approve creators, review + publish submissions, open
// campaigns and assign further roles (see services/functions/src/auth.ts).
//
// Safe by construction: refuses the emulator, requires GRANT_ADMIN=confirm, and
// only ever elevates an account that already exists in Firebase Authentication.
// Idempotent — re-running simply re-asserts the same claim.
//
//   GOOGLE_CLOUD_QUOTA_PROJECT=project-kassena-7e026 GRANT_ADMIN=confirm \
//     node firebase/seed/grant-admin.mjs project-kassena-7e026 you@example.com
//
// The target may be an email address or a raw Auth UID. The person must sign out
// and back in (or refresh their token) afterwards for the new claim to take
// effect on the client.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.argv[2] || process.env.GCLOUD_PROJECT;
const target = process.argv[3];

if (!projectId || !target) {
  console.error('Usage: node grant-admin.mjs <projectId> <email-or-uid>');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusing: an emulator host is set (this targets production auth).');
  process.exit(1);
}
if (process.env.GRANT_ADMIN !== 'confirm') {
  console.error('Refusing: set GRANT_ADMIN=confirm to grant a production role claim.');
  process.exit(1);
}

const ROLE = 'super_admin';

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();

async function run() {
  const user = target.includes('@')
    ? await auth.getUserByEmail(target)
    : await auth.getUser(target);

  const existing = user.customClaims ?? {};
  await auth.setCustomUserClaims(user.uid, { ...existing, role: ROLE });

  const now = new Date().toISOString();
  const auditRef = db.collection('auditLogs').doc();
  await auditRef.set({
    id: auditRef.id,
    actor: { collection: 'system', id: 'grant-admin.mjs' },
    action: 'identity.set_role',
    target: { collection: 'contributors', id: user.uid },
    outcome: 'success',
    source: 'bootstrap',
    before: { role: existing.role ?? null },
    after: { role: ROLE },
    metadata: { email: user.email ?? null },
    occurredAt: now,
  });

  console.log(`✓ Granted role="${ROLE}" to ${user.email ?? user.uid} (uid: ${user.uid}).`);
  console.log('  Ask them to sign out and back in so the new claim reaches the client.');
}

run().catch((err) => {
  if (err?.code === 'auth/user-not-found') {
    console.error(`No Firebase Auth account found for "${target}". Have them sign up first, then re-run.`);
  } else {
    console.error('Grant failed:', err);
  }
  process.exit(1);
});
