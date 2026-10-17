import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { shop, shopAdmin, settleShopPayment, settleShopRefund } from '../../services/functions/lib/shop.js';
import { notificationAction } from '../../services/functions/lib/notification-actions.js';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Use the Firestore emulator; never run this fixture against production.');
process.env.PAYSTACK_SECRET_KEY = 'sk_test_synthetic_emulator_only';
process.env.SHOP_PAYSTACK_CALLBACK_URL = 'https://example.test/shop/payment-complete';
let app, db;
const call = (fn, uid, data, token = {}) => fn.run({ auth: { uid, token: { email: `${uid}@example.test`, ...token } }, data, rawRequest: {} });
const address = { recipient: 'Synthetic member', country: 'GH', city: 'Synthetic town', street: 'Synthetic landmark', phone: '+233200000000' };
before(async () => {
  app = initializeApp({ projectId: 'demo-indigen-upgrade' }); db = getFirestore();
  await db.doc('shopSettings/store').set({ checkoutEnabled: true, currency: 'GHS', supportEmail: 'store@example.test', returnsPolicy: 'Test policy', deliveryPolicy: 'Test delivery' });
  await db.doc('shopDelivery/test-zone').set({ enabled: true, countries: ['GH'], feeMinor: 100, name: 'Synthetic pickup' });
  await db.doc('shopProducts/test-product').set({ name: 'Synthetic physical product', published: true, priceMinor: 2500, currency: 'GHS', priceMode: 'fixed', order: 1 });
  await db.doc('shopInventory/test-product__default').set({ onHand: 1, reserved: 0 });
});
after(async () => { await deleteApp(app); });
test('concurrent customers cannot reserve the same last item; client totals are ignored', async () => {
  const input = { operation: 'checkout', requestId: 'checkout-risk-test', lines: [{ productId: 'test-product', quantity: 1, priceMinor: 1 }], address, deliveryId: 'test-zone', totalMinor: 1 };
  const result = await Promise.allSettled([call(shop, 'member-a', input), call(shop, 'member-b', input)]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  const order = result.find((r) => r.status === 'fulfilled').value;
  assert.equal(order.totalMinor, 2600); assert.equal(order.items[0].priceMinor, 2500);
  const again = await call(shop, order.uid, input); assert.equal(again.id, order.id);
  assert.equal((await db.doc('shopInventory/test-product__default').get()).get('reserved'), 1);
  const stranger = order.uid === 'member-a' ? 'member-b' : 'member-a';
  await assert.rejects(call(shop, stranger, { operation: 'order', id: order.id }), { code: 'not-found' });
});
test('guest cart merge is additive once and safe on retries; members cannot authorize refunds', async () => {
  const input = { operation: 'mergeCart', mergeKey: 'synthetic-merge-key', lines: [{ productId: 'test-product', quantity: 2 }] };
  assert.equal((await call(shop, 'cart-member', input)).lines[0].quantity, 2);
  const restored = await call(shop, 'cart-member', { operation: 'cart' });
  assert.equal(restored.lines[0].product.name, 'Synthetic physical product');
  assert.equal((await call(shop, 'cart-member', input)).lines[0].quantity, 2);
  await assert.rejects(call(shopAdmin, 'member-a', { operation: 'list', section: 'orders' }), { code: 'permission-denied' });
  await assert.rejects(call(shopAdmin, 'admin-a', { operation: 'reconcileRefund', section: 'orders', providerId: '123' }, { role: 'admin' }), { code: 'permission-denied' });
  await assert.rejects(call(shopAdmin, 'catalogue-admin', { operation: 'list', section: 'customers' }, { role: 'admin', shopScopes: ['catalogue'] }), { code: 'permission-denied' });
});
test('scheduled products stay hidden from old readers and cancellation resolution releases a reservation once', async () => {
  await call(shopAdmin, 'admin-a', { operation: 'save', section: 'products', id: 'scheduled-fixture', value: { name: 'Future fixture', priceMinor: 100, published: true, publishAt: '2099-01-01T00:00:00Z' } }, { role: 'admin' });
  assert.equal((await db.doc('shopProducts/scheduled-fixture').get()).get('published'), false);
  await assert.rejects(call(shop, 'member-a', { operation: 'product', id: 'scheduled-fixture' }), { code: 'not-found' });
  const order = (await db.collection('shopOrdersV2').limit(1).get()).docs[0];
  await call(shop, order.get('uid'), { operation: 'orderRequest', id: order.id, requestId: 'cancel-once', kind: 'cancellation', message: 'Synthetic cancellation' });
  const request = (await order.ref.collection('requests').limit(1).get()).docs[0];
  const input = { operation: 'resolveRequest', section: 'orders', id: order.id, requestId: request.id, status: 'approved', message: 'Cancelled before dispatch' };
  await call(shopAdmin, 'admin-a', input, { role: 'admin' });
  await call(shopAdmin, 'admin-a', input, { role: 'admin' });
  assert.equal((await db.doc('shopInventory/test-product__default').get()).get('reserved'), 0);
  assert.equal((await order.ref.get()).get('fulfillmentStatus'), 'cancelled');
  assert.equal((await order.ref.get()).get('paymentStatus'), 'unpaid');
});
test('verified settlement and refunds are idempotent, never double-decrement stock, and preserve purpose isolation', async () => {
  await db.doc('shopInventory/test-product__default').set({ onHand: 5, reserved: 0 });
  await call(shop, 'payment-member', { operation: 'saveCart', lines: [{ productId: 'test-product', quantity: 2 }] });
  const order = await call(shop, 'payment-member', { operation: 'checkout', requestId: 'paid-fixture', lines: [{ productId: 'test-product', quantity: 1 }], address, deliveryId: 'test-zone' });
  const nativeFetch = globalThis.fetch;
  let purpose = 'advertising', refundPosts = 0, merchant = '';
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://api.paystack.co/'), 'Provider fixture must intercept every network request');
    let data;
    if (String(url).includes('/transaction/verify/')) data = { status: 'success', reference: order.reference, amount: order.totalMinor, currency: 'GHS', paid_at: '2026-10-16T12:00:00Z', channel: 'card', customer: { email: order.email }, metadata: { purpose, orderId: order.id, uid: order.uid }, authorization: { authorization_code: 'synthetic-server-only', last4: '0000', brand: 'Synthetic', exp_month: '12', exp_year: '2099', reusable: true } };
    else if (init.method === 'POST') { refundPosts++; merchant = JSON.parse(init.body).merchant_note; data = { id: 456, status: 'pending' }; }
    else data = { status: 'processed', amount: 1000, currency: 'GHS', transaction: { reference: order.reference }, merchant_note: merchant };
    return new Response(JSON.stringify({ status: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await assert.rejects(settleShopPayment(order.reference), /does not match/);
    assert.equal((await db.doc(`shopOrdersV2/${order.id}`).get()).get('paymentStatus'), 'unpaid');
    purpose = 'shop'; await settleShopPayment(order.reference); await settleShopPayment(order.reference);
    assert.equal((await db.doc('shopInventory/test-product__default').get()).get('onHand'), 4);
    assert.equal((await call(shop, order.uid, { operation: 'cart' })).lines[0].quantity, 1, 'Only purchased quantities are removed once');
    const profile = await call(shop, order.uid, { operation: 'profile' });
    assert.equal(profile.paymentMethods[0].last4, '0000'); assert.ok(!JSON.stringify(profile).includes('synthetic-server-only'));
    const refund = { operation: 'refund', section: 'orders', id: order.id, requestId: 'partial-refund', amountMinor: 1000, reason: 'Synthetic refund test' };
    await call(shopAdmin, 'finance-admin', refund, { role: 'admin', finance: true });
    await call(shopAdmin, 'finance-admin', refund, { role: 'admin', finance: true });
    assert.equal(refundPosts, 1);
    await settleShopRefund('456'); await settleShopRefund('456');
    await settleShopPayment(order.reference); // delayed duplicate after partial refund
    const latest = (await db.doc(`shopOrdersV2/${order.id}`).get()).data();
    assert.equal(latest.paymentStatus, 'partially_refunded'); assert.equal(latest.refundedMinor, 1000);
    assert.equal((await db.doc('shopInventory/test-product__default').get()).get('onHand'), 4, 'Refunds never silently restock goods');
    await assert.rejects(call(shopAdmin, 'finance-admin', { ...refund, requestId: 'over-refund', amountMinor: 2000 }, { role: 'admin', finance: true }), /not available for refund/);
  } finally { globalThis.fetch = nativeFetch; }
});
test('notification actions target the canonical reply and repeated actions have one effect', async () => {
  await db.doc('communityProfiles/member-a').set({ displayName: 'Synthetic member', username: 'synthetic' });
  await db.doc('communityPosts/root').set({ authorId: 'member-a', text: 'Root', likeCount: 0, replyCount: 1 });
  await db.doc('communityPosts/actual-reply').set({ authorId: 'member-b', text: 'Reply', parentId: 'root', rootId: 'root', isReply: true, likeCount: 0, replyCount: 0 });
  await db.doc('communityNotifications/notification-test').set({ recipientId: 'member-a', type: 'reply', postId: 'root', actionTargetPostId: 'actual-reply', read: false });
  const input = { recipientId: 'member-a', notificationId: 'notification-test', action: 'like' };
  await Promise.all([call(notificationAction, 'member-a', input), call(notificationAction, 'member-a', input)]);
  assert.equal((await db.doc('communityPosts/actual-reply').get()).get('likeCount'), 1);
  assert.equal((await db.doc('communityPosts/root').get()).get('likeCount'), 0);
  assert.equal((await db.doc('communityNotifications/notification-test').get()).get('read'), false);
  await assert.rejects(call(notificationAction, 'member-b', input), { code: 'permission-denied' });
  const reply = { ...input, action: 'reply', text: 'Synthetic response', actionId: 'one-reply' };
  const a = await call(notificationAction, 'member-a', reply), b = await call(notificationAction, 'member-a', reply);
  assert.equal(a.postId, b.postId); assert.equal((await db.doc('communityPosts/actual-reply').get()).get('replyCount'), 1);
  assert.equal((await db.doc(`communityPosts/${a.postId}`).get()).get('rootId'), 'root');
  assert.equal((await db.doc(`communityPosts/${a.postId}`).get()).get('isReply'), true);
  await call(notificationAction, 'member-a', { ...input, action: 'read' });
  assert.equal((await db.doc('communityNotifications/notification-test').get()).get('read'), true);
});
