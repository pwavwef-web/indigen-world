import { readFileSync } from 'node:fs';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
let env;
before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-indigen-upgrade', firestore: { host, port: Number(port), rules: readFileSync('firebase/firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'shopOrdersV2/immutable-order'), { uid: 'owner', totalMinor: 2500, paymentStatus: 'paid' });
    await setDoc(doc(db, 'shopCustomers/owner/addresses/home'), { recipient: 'Private fixture' });
    await setDoc(doc(db, 'shopPaymentAuthorizations/private'), { uid: 'owner', code: 'synthetic-private-reference' });
    await setDoc(doc(db, 'shopProducts/public'), { published: true, name: 'Public fixture' });
    await setDoc(doc(db, 'shopProducts/draft'), { published: false, name: 'Draft fixture' });
    await setDoc(doc(db, 'collectionMediaAssets/private'), { ownerUid: 'owner', status: 'ready' });
    await setDoc(doc(db, 'communityNotifications/canonical'), { recipientId: 'owner', read: false, title: 'Canonical fixture' });
  });
});
after(async () => env?.cleanup());
test('financial records, private customer metadata and credentials are callable-only even for admin SDK clients', async () => {
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('owner'), env.authenticatedContext('other'), env.authenticatedContext('staff', { role: 'admin', finance: true })]) {
    const db = context.firestore();
    for (const path of ['shopOrdersV2/immutable-order', 'shopCustomers/owner/addresses/home', 'shopPaymentAuthorizations/private']) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { uid: 'owner', paymentStatus: 'paid', totalMinor: 1 }));
    }
    for (const collection of ['shopInventory', 'shopTransactions', 'shopRefunds', 'shopSettings', 'houseAdCampaigns', 'advertiserProfiles', 'notificationCampaigns']) await assertFails(setDoc(doc(db, `${collection}/forged`), { status: 'approved' }));
  }
});
test('public catalogue visibility and image assets do not confer publication authority', async () => {
  const guest = env.unauthenticatedContext().firestore(), member = env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDoc(doc(guest, 'shopProducts/public')));
  await assertFails(getDoc(doc(guest, 'shopProducts/draft')));
  await assertFails(getDoc(doc(member, 'collectionMediaAssets/private')));
  await assertFails(updateDoc(doc(member, 'collectionMediaAssets/private'), { status: 'published' }));
});
test('a notification recipient can mark read, but cannot change its recipient, target or content', async () => {
  const owner = env.authenticatedContext('owner').firestore(), other = env.authenticatedContext('other').firestore();
  await assertSucceeds(updateDoc(doc(owner, 'communityNotifications/canonical'), { read: true }));
  await assertFails(updateDoc(doc(owner, 'communityNotifications/canonical'), { title: 'Forged alert' }));
  await assertFails(updateDoc(doc(owner, 'communityNotifications/canonical'), { recipientId: 'other' }));
  await assertFails(updateDoc(doc(other, 'communityNotifications/canonical'), { read: false }));
});
