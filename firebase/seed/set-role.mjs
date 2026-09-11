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
 *
 * If gcloud ADC is unavailable, a maintainer may use their existing Firebase
 * CLI login for their own account only:
 *
 *   FIREBASE_CLI_AUTH=confirm node firebase/seed/set-role.mjs you@example.com admin
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { initializeApp, applicationDefault, refreshToken } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/** Mirrors ASSIGNABLE_ROLES in services/functions/src/identity.ts. */
const ROLES = ['contributor', 'creator', 'validator', 'reviewer', 'admin', 'super_admin'];

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  'project-kassena-7e026';

let firebaseCliConfig = null;

function credentialForRun(targetEmail) {
  if (process.env.FIREBASE_CLI_AUTH !== 'confirm') return applicationDefault();

  const configRoot = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const cliConfig = JSON.parse(
    readFileSync(join(configRoot, 'configstore', 'firebase-tools.json'), 'utf8'),
  );
  const cliEmail = String(cliConfig.user?.email ?? '').toLowerCase();
  if (
    targetEmail !== '--list' &&
    (!targetEmail?.includes('@') || cliEmail !== targetEmail.toLowerCase())
  ) {
    throw new Error(
      'Firebase CLI bootstrap may only change the signed-in CLI account itself.',
    );
  }
  if (!cliConfig.tokens?.refresh_token) {
    throw new Error('Firebase CLI has no refresh token. Run firebase login first.');
  }
  firebaseCliConfig = cliConfig;

  const require = createRequire(import.meta.url);
  const { clientId, clientSecret } = require('firebase-tools/lib/api');
  return refreshToken({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: cliConfig.tokens.refresh_token,
    type: 'authorized_user',
  });
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(firestoreValue) } };
  }
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)]),
      ),
    },
  };
}

async function writeAudit(document) {
  if (!firebaseCliConfig) {
    const db = getFirestore();
    const auditRef = db.collection('auditLogs').doc();
    await auditRef.set({ id: auditRef.id, ...document });
    return;
  }

  // Firestore's Admin SDK only accepts service-account/ADC credentials, while
  // Firebase Auth accepts the maintainer's CLI OAuth credential. Use the same
  // CLI identity against Firestore's REST API so this fallback remains audited.
  const require = createRequire(import.meta.url);
  const api = require('firebase-tools/lib/apiv2');
  api.setRefreshToken(firebaseCliConfig.tokens.refresh_token);
  const accessToken = await api.getAccessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/auditLogs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': PROJECT_ID,
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(document).map(([key, value]) => [key, firestoreValue(value)]),
        ),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Firestore audit write failed (${response.status}): ${await response.text()}`);
  }
}

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

  initializeApp({ credential: credentialForRun(emailArg), projectId: PROJECT_ID });
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
  const repairAudit = previous === roleArg && process.env.REPAIR_ROLE_AUDIT === 'confirm';
  if (previous === roleArg && !repairAudit) {
    console.log(`${emailArg} is already ${roleArg}. Nothing to do.`);
    return;
  }

  if (!repairAudit) {
    // Merged rather than replaced: other claims — finance access, superAdmin —
    // are orthogonal to role and must survive a role change.
    await auth.setCustomUserClaims(user.uid, {
      ...(user.customClaims ?? {}),
      role: roleArg,
    });
  }

  await writeAudit({
    actor: { collection: 'contributors', id: 'seed-script' },
    action: 'identity.set_role',
    target: { collection: 'contributors', id: user.uid },
    outcome: 'success',
    source: repairAudit ? 'seed-audit-repair' : 'seed',
    before: { role: repairAudit ? 'unknown' : previous },
    after: { role: roleArg },
    metadata: {
      email: emailArg,
      ...(repairAudit
        ? { note: 'Role claim completed before the original audit transport failed.' }
        : {}),
    },
    occurredAt: new Date().toISOString(),
  });

  console.log(
    repairAudit
      ? `${emailArg} is ${roleArg}; the missing audit record has been repaired.`
      : `${emailArg} (${user.uid}) is now ${roleArg}${previous ? ` (was ${previous})` : ''}.`,
  );
  console.log(
    'The claim reaches the device on its next token refresh — signing out and ' +
      'back in makes it immediate.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
