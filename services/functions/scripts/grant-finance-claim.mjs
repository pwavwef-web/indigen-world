/**
 * Grant or revoke the `finance` custom claim on an existing admin account.
 *
 * Finance decisions on point redemptions, reward policies, rollout switches
 * and ledger adjustments require it (super administrators already pass).
 * The claim is added beside the account's existing claims; its role is not
 * changed, and a non-admin is refused because the server only honours
 * finance on an admin role.
 *
 *   node services/functions/scripts/grant-finance-claim.mjs --project PROJECT --email person@example.com            # dry run
 *   node services/functions/scripts/grant-finance-claim.mjs --project PROJECT --email person@example.com --commit   # apply
 *   ... --revoke --commit                                                                                            # remove
 *
 * Uses application default credentials. The person must sign out and in (or
 * refresh their token) for the change to reach their session.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const project = value('--project');
const email = value('--email');
const commit = args.includes('--commit');
const revoke = args.includes('--revoke');
if (!project || !email) throw new Error('Pass --project PROJECT --email EMAIL.');
initializeApp(process.env.FIREBASE_AUTH_EMULATOR_HOST ? { projectId: project } : { projectId: project, credential: applicationDefault() });

const user = await getAuth().getUserByEmail(email);
const claims = user.customClaims ?? {};
if (!['admin', 'super_admin'].includes(claims.role) && claims.superAdmin !== true) {
  throw new Error(`${email} has role ${JSON.stringify(claims.role ?? null)}. Grant an admin role first; finance is only honoured on admins.`);
}
const next = { ...claims, finance: !revoke };
console.log(JSON.stringify({ email, uid: user.uid, role: claims.role ?? null, financeBefore: claims.finance === true, financeAfter: !revoke, commit }, null, 1));
if (!commit) { console.log('Dry run: nothing changed. Add --commit to apply.'); process.exit(0); }
await getAuth().setCustomUserClaims(user.uid, next);
const now = new Date().toISOString();
const audit = getFirestore().collection('auditLogs').doc();
await audit.set({ id: audit.id, domain: 'contributor-rewards', action: revoke ? 'staff.finance.revoke' : 'staff.finance.grant',
  actor: { collection: 'system', id: 'grant-finance-claim' }, target: { collection: 'users', id: user.uid }, outcome: 'success', source: 'script',
  before: { finance: claims.finance === true }, after: { finance: !revoke }, reason: '', metadata: {}, occurredAt: now });
console.log(`${revoke ? 'Revoked' : 'Granted'} finance for ${email}. They need to refresh their sign-in.`);
