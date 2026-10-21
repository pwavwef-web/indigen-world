import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { shop, shopAdmin } from '../../services/functions/lib/shop.js';
import { verifiedStaff } from './fixtures/staffSession.mjs';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Use the Firestore emulator; never run this fixture against production.');
process.env.PAYSTACK_SECRET_KEY = 'sk_test_synthetic_emulator_only';
process.env.SHOP_PAYSTACK_CALLBACK_URL = 'https://example.test/shop/payment-complete';

let app, db;
const call = (fn, uid, data, token = {}) => fn.run({ auth: { uid, token: { email: `${uid}@example.test`, ...token, ...verifiedStaff() } }, data, rawRequest: {} });
const admin = (data) => call(shopAdmin, 'catalogue-admin', data, { role: 'admin' });
const address = { recipient: 'Synthetic member', country: 'GH', city: 'Synthetic town', street: 'Synthetic landmark', phone: '+233200000000' };
const window = { startsAt: '2026-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' };

before(async () => {
  app = initializeApp({ projectId: 'demo-indigen-catalogue' }); db = getFirestore();
  await db.doc('shopSettings/store').set({ checkoutEnabled: true, currency: 'GHS', supportEmail: 'store@example.test', returnsPolicy: 'Test policy', deliveryPolicy: 'Test delivery' });
  await db.doc('shopDelivery/zone').set({ enabled: true, countries: ['GH'], feeMinor: 0, name: 'Synthetic pickup' });
});
after(async () => { await deleteApp(app); });

async function stock(productId, variantId = 'default', onHand = 10) {
  await db.doc(`shopInventory/${productId}__${variantId}`).set({ onHand, reserved: 0 }, { merge: true });
}

test('variant attributes become a filter that reuses the search index', async () => {
  const saved = await admin({ operation: 'save', section: 'products', id: 'attr-print', value: { name: 'Synthetic print', category: 'Prints', priceMode: 'fixed', priceMinor: 1000, published: true, inStock: true, order: 1, variants: [{ id: 'a4', name: 'A4', priceMinor: 1000, attributes: { Size: 'A4' } }, { id: 'a3', name: 'A3', priceMinor: 1500, attributes: { Size: 'A3', Frame: 'Oak' } }] } });
  assert.equal(saved.id, 'attr-print');
  await admin({ operation: 'save', section: 'products', id: 'attr-card', value: { name: 'Synthetic card', category: 'Prints', priceMode: 'fixed', priceMinor: 500, published: true, inStock: true, order: 2, variants: [{ id: 'small', name: 'Small', priceMinor: 500, attributes: { Size: 'A6' } }] } });
  const config = await call(shop, 'browser', { operation: 'config' });
  assert.deepEqual(config.facets.Size.sort(), ['A3', 'A4', 'A6']);
  assert.deepEqual(config.facets.Frame, ['Oak']);
  const a3 = await call(shop, 'browser', { operation: 'catalogue', attribute: 'size=a3' });
  assert.deepEqual(a3.items.map((p) => p.id), ['attr-print']);
  // Attribute plus search: the attribute takes the index, the search filters the page.
  const both = await call(shop, 'browser', { operation: 'catalogue', attribute: 'Size=A6', search: 'card' });
  assert.deepEqual(both.items.map((p) => p.id), ['attr-card']);
  const none = await call(shop, 'browser', { operation: 'catalogue', attribute: 'Size=A6', search: 'poster' });
  assert.deepEqual(none.items, []);
});

test('bulk status changes publish only what a single save would allow, and never delete', async () => {
  await db.doc('shopProducts/bulk-ok').set({ name: 'Bulk ok', published: false, status: 'draft', priceMinor: 100, priceMode: 'fixed', order: 9 });
  await db.doc('shopProducts/bulk-unnamed').set({ name: '', published: false, status: 'draft' });
  await db.doc('shopProducts/bulk-processing').set({ name: 'Processing', published: false, gallery: [{ status: 'processing' }] });
  const published = await admin({ operation: 'bulkStatus', section: 'products', action: 'publish', ids: ['bulk-ok', 'bulk-unnamed', 'bulk-processing', 'missing'] });
  assert.equal(published.changed, 1);
  assert.deepEqual(published.skipped.map((s) => s.reason).sort(), ['images still processing', 'missing name', 'not found']);
  assert.equal((await db.doc('shopProducts/bulk-ok').get()).get('published'), true);
  await admin({ operation: 'bulkStatus', section: 'products', action: 'archive', ids: ['bulk-ok'] });
  const archived = await db.doc('shopProducts/bulk-ok').get();
  assert.equal(archived.exists, true);
  assert.equal(archived.get('status'), 'archived');
  assert.equal(archived.get('published'), false);
  await assert.rejects(call(shopAdmin, 'member', { operation: 'bulkStatus', section: 'products', action: 'publish', ids: ['bulk-ok'] }), { code: 'permission-denied' });
  await assert.rejects(admin({ operation: 'bulkStatus', section: 'products', action: 'delete', ids: ['bulk-ok'] }));
});

test('automatic, percentage and per-customer promotions are enforced at checkout', async () => {
  await db.doc('shopProducts/promo-item').set({ name: 'Promo item', category: 'Prints', published: true, priceMinor: 10000, currency: 'GHS', priceMode: 'fixed', order: 3 });
  await stock('promo-item');
  await admin({ operation: 'save', section: 'promotions', id: 'AUTO10', value: { name: 'Ten percent', kind: 'percent', percentBps: 1000, maxDiscountMinor: 700, automatic: true, enabled: true, ...window } });
  await admin({ operation: 'save', section: 'promotions', id: 'ONCE', value: { name: 'Once each', amountMinor: 1500, perCustomerLimit: 1, enabled: true, ...window } });
  const line = [{ productId: 'promo-item', quantity: 1 }];
  // Automatic only: 10% of 10000 capped at 700.
  const auto = await call(shop, 'promo-member', { operation: 'checkout', requestId: 'auto-1', lines: line, address, deliveryId: 'zone' });
  assert.equal(auto.discountMinor, 700);
  assert.deepEqual(auto.promotionIds, ['AUTO10']);
  // A code that is not stackable with the automatic one: the larger discount wins.
  const coded = await call(shop, 'promo-member', { operation: 'checkout', requestId: 'code-1', lines: line, address, deliveryId: 'zone', coupon: 'once' });
  assert.equal(coded.discountMinor, 1500);
  assert.deepEqual(coded.promotionIds, ['ONCE']);
  assert.equal(coded.coupon, 'ONCE');
  // The same member cannot use ONCE again while the first order still holds it.
  await assert.rejects(call(shop, 'promo-member', { operation: 'checkout', requestId: 'code-2', lines: line, address, deliveryId: 'zone', coupon: 'ONCE' }), /already used/);
  // Another member can.
  const other = await call(shop, 'other-member', { operation: 'checkout', requestId: 'code-3', lines: line, address, deliveryId: 'zone', coupon: 'ONCE' });
  assert.equal(other.discountMinor, 1500);
  // Client-sent totals are still ignored.
  assert.equal(other.totalMinor, 8500);
  // Redemption counters are server-only bookkeeping.
  assert.equal((await db.doc('shopPromotions/ONCE/redemptions/promo-member').get()).get('count'), 1);
});
