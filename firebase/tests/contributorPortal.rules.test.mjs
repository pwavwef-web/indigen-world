import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-contributor-portal', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  } });
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/alice'), { status: 'active' });
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/alice/works/work/items/item'), { expression: 'Hello' });
    await setDoc(doc(ctx.firestore(), 'contributorTrainingPairs/entry'), { kasem: 'private' });
  });
});
after(async () => env?.cleanup());
test('drafts are owner-readable and never client writable', async () => {
  const path = 'contributorAccounts/alice/works/work/items/item';
  await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), path)));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), path)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
  await assertFails(setDoc(doc(env.authenticatedContext('alice').firestore(), path), { status: 'verified' }));
});
test('training pairs are private to administrators', async () => {
  await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'contributorTrainingPairs/entry')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('admin', { role: 'admin' }).firestore(), 'contributorTrainingPairs/entry')));
});
test('revoked invitations lose access to assigned work', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contributorAccounts/alice'), { status: 'revoked' }));
  await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'contributorAccounts/alice/works/work/items/item')));
});
