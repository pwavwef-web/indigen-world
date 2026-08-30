/**
 * firebase/seed/set-role.mjs
 *
 * Grants a role claim to an account by email, from a trusted machine.
 *
 * The `setUserRole` callable is the normal way to do this, but it requires an
 * admin to already exist — which is exactly what you do not have when standing
 * a project up, or when the first reviewer needs appointing. This script is the
 * bootstrap: it runs on Application Default Credentials (`gcloud auth
 * application-default login`), so the only people who can use it are the people
 * who already have owner access to the project.
 *
 * It writes the same audit row the callable does, because "who made this
 * account a reviewer" is a question the log should be able to answer whichever
 * path was taken.
 *
 *   node firebase/seed/set-role.mjs francis@pwavwe.com reviewer
 *   node firebase/seed/set-role.mjs --list
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/** Mirrors ASSIGNABLE_ROLES in services/functions/src/identity.ts. */
const ROLES = ['contributor', 'creator', 'validator', 'reviewer', 'admin', 'super_admin'];

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  'project-kassena-7e026';

function usage(message) {
  if (message) console.error(`\n${message}`);
  console.error(`
Usage:
  node firebase/seed/set-role.mjs <email> <role>
  node firebase/seed/set-role.mjs --list

Roles: ${ROLES.join(', ')}
`);
  process.exit(message ? 1 : 0);
}

async function main() {
  const [emailArg, roleArg] = process.argv.slice(2);
  if (!emailArg || emailArg === '--help' || emailArg === '-h') usage();

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth();

  if (emailArg === '--list') {
    const { users } = await auth.listUsers(1000);
    const staff = users.filter((user) => user.customClaims?.role);
    if (staff.length === 0) {
      console.log('No account carries a role claim.');
      return;
    }
    for (const user of staff) {
      console.log(`${user.customClaims.role.padEnd(12)} ${user.email ?? user.uid}`);
    }
    return;
  }

  if (!ROLES.includes(roleArg)) usage(`Unknown role: ${roleArg ?? '(none)'}`);

  let user;
  try {
    user = await auth.getUserByEmail(emailArg);
  } catch {
    usage(
      `No account for ${emailArg}. The person has to sign in to the app once ` +
        `before a role can be attached to them.`,
    );
  }

  const previous = user.customClaims?.role ?? null;
  if (previous === roleArg) {
    console.log(`${emailArg} is already ${roleArg}. Nothing to do.`);
    return;
  }

  // Merged rather than replaced: other claims — finance access, superAdmin —
  // are orthogonal to role and must survive a role change.
  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    role: roleArg,
  });

  const db = getFirestore();
  const auditRef = db.collection('auditLogs').doc();
  await auditRef.set({
    id: auditRef.id,
    actor: { collection: 'contributors', id: 'seed-script' },
    action: 'identity.set_role',
    target: { collection: 'contributors', id: user.uid },
    outcome: 'success',
    source: 'seed',
    before: { role: previous },
    after: { role: roleArg },
    metadata: { email: emailArg },
    occurredAt: new Date().toISOString(),
  });

  console.log(`${emailArg} (${user.uid}) is now ${roleArg}${previous ? ` (was ${previous})` : ''}.`);
  console.log(
    'The claim reaches the device on its next token refresh — signing out and ' +
      'back in makes it immediate.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
