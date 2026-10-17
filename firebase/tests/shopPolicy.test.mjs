import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressSnapshot, applyPromotions, attributeToken, attributeTokens, mergeFacets, variantAttributes, checkoutTotals, priceMode, promotionDiscount, verifiedShopPayment, safeCsv } from '../../services/functions/lib/shop-policy.js';
const item = { priceMinor: 12000, priceMode: 'fixed', quantity: 2, currency: 'GHS', kind: 'physical' };
test('legacy zero prices remain quote-only and never enter checkout', () => {
  assert.equal(priceMode({ priceMinor: 0 }), 'quote');
  assert.throws(() => checkoutTotals([{ ...item, priceMinor: 0 }], { enabled: true }, null, { currency: 'GHS' }), /inquiry/);
  assert.throws(() => checkoutTotals([{ ...item, kind: 'digital' }], { enabled: true }, null, { currency: 'GHS' }), /platform billing/);
});
test('checkout validates currency, quantities, delivery and bounded integer totals', () => {
  assert.deepEqual(checkoutTotals([item], { enabled: true, feeMinor: 350 }, null, { currency: 'GHS', taxBps: 100 }), { subtotalMinor: 24000, discountMinor: 0, deliveryMinor: 350, taxMinor: 240, totalMinor: 24590, currency: 'GHS' });
  for (const changes of [{ quantity: 0 }, { quantity: 1.5 }, { currency: 'USD' }, { priceMinor: 1.5 }]) assert.throws(() => checkoutTotals([{ ...item, ...changes }], { enabled: true }, null, { currency: 'GHS' }));
  assert.throws(() => checkoutTotals([item], { enabled: false }, null, { currency: 'GHS' }), /unavailable/);
});
test('promotion eligibility and reserved capacity are enforced', () => {
  const promotion = { enabled: true, startsAt: '2026-01-01', endsAt: '2026-12-31', limit: 2, reserved: 1, used: 1, amountMinor: 500 };
  assert.throws(() => checkoutTotals([item], { enabled: true }, promotion, { currency: 'GHS' }, Date.parse('2026-10-16')), /limit/);
  assert.throws(() => checkoutTotals([item], { enabled: true }, { ...promotion, used: 0, minimumMinor: 99999 }, { currency: 'GHS' }, Date.parse('2026-10-16')), /minimum/);
});
test('settlement checks reference, amount, currency, customer, purpose and order ownership', () => {
  const order = { id: 'order', uid: 'member', email: 'member@example.test', reference: 'shop_order', totalMinor: 120, currency: 'GHS' };
  const good = { status: 'success', reference: order.reference, amountPesewas: 120, currency: 'GHS', customerEmail: order.email, metadata: { purpose: 'shop', orderId: order.id, uid: order.uid } };
  assert.equal(verifiedShopPayment(order, good), true);
  for (const patch of [{ reference: 'ad_order_1' }, { amountPesewas: 1 }, { currency: 'USD' }, { customerEmail: 'other@example.test' }, { metadata: { purpose: 'ad', orderId: order.id, uid: order.uid } }]) assert.equal(verifiedShopPayment(order, { ...good, ...patch }), false);
});
test('Ghana address does not require postal code and CSV exports neutralize formulas', () => {
  assert.equal(addressSnapshot({ recipient: 'Test member', country: 'GH', city: 'Test town', street: 'Test landmark', phone: '+233200000000' }).country, 'GH');
  assert.equal(safeCsv(' =HYPERLINK("test")'), '"\' =HYPERLINK(""test"")"');
});

const now = Date.parse('2026-10-17');
const live = { enabled: true, startsAt: '2026-01-01', endsAt: '2026-12-31' };
const cart = [
  { productId: 'print', category: 'Prints', priceMinor: 10000, priceMode: 'fixed', quantity: 2, currency: 'GHS', kind: 'physical' },
  { productId: 'cards', category: 'Kitchen', priceMinor: 5000, priceMode: 'fixed', quantity: 1, currency: 'GHS', kind: 'physical' },
];
test('percentage promotions are floored, capped and limited to eligible lines', () => {
  assert.deepEqual(promotionDiscount({ ...live, id: 'p', kind: 'percent', percentBps: 1000 }, cart, {}, now), { discountMinor: 2500 });
  assert.deepEqual(promotionDiscount({ ...live, id: 'p', kind: 'percent', percentBps: 1000, maxDiscountMinor: 800 }, cart, {}, now), { discountMinor: 800 });
  assert.deepEqual(promotionDiscount({ ...live, id: 'p', kind: 'percent', percentBps: 1500, categories: ['Kitchen'] }, cart, {}, now), { discountMinor: 750 });
  assert.deepEqual(promotionDiscount({ ...live, id: 'p', amountMinor: 999999, productIds: ['cards'] }, cart, {}, now), { discountMinor: 5000 });
  assert.match(promotionDiscount({ ...live, id: 'p', amountMinor: 100, categories: ['Books'] }, cart, {}, now).reason, /eligible/);
  // Minimum spend counts eligible lines only.
  assert.match(promotionDiscount({ ...live, id: 'p', amountMinor: 100, categories: ['Kitchen'], minimumMinor: 6000 }, cart, {}, now).reason, /minimum/);
});
test('segments and per-customer limits are enforced server-side', () => {
  const first = { ...live, id: 'welcome', amountMinor: 500, segment: 'first_order' };
  assert.match(promotionDiscount(first, cart, { isFirstOrder: false }, now).reason, /first order/);
  assert.deepEqual(promotionDiscount(first, cart, { isFirstOrder: true }, now), { discountMinor: 500 });
  const named = { ...live, id: 'vip', amountMinor: 500, segment: 'customers', customerIds: ['member-a'] };
  assert.match(promotionDiscount(named, cart, { uid: 'member-b' }, now).reason, /not available/);
  assert.deepEqual(promotionDiscount(named, cart, { uid: 'member-a' }, now), { discountMinor: 500 });
  const once = { ...live, id: 'once', amountMinor: 500, perCustomerLimit: 1 };
  assert.match(promotionDiscount(once, cart, { priorUses: { once: 1 } }, now).reason, /already used/);
  assert.deepEqual(promotionDiscount(once, cart, { priorUses: { once: 0 } }, now), { discountMinor: 500 });
});
test('stacking: all-stackable combine, otherwise the single best discount wins', () => {
  const a = { ...live, id: 'a', amountMinor: 1000, stackable: true };
  const b = { ...live, id: 'b', amountMinor: 1500, stackable: true };
  assert.deepEqual(applyPromotions([a, b], cart, {}, now), { discountMinor: 2500, applied: [{ id: 'a', discountMinor: 1000 }, { id: 'b', discountMinor: 1500 }] });
  const c = { ...live, id: 'c', amountMinor: 1200 };
  assert.deepEqual(applyPromotions([a, b, c], cart, {}, now), { discountMinor: 1500, applied: [{ id: 'b', discountMinor: 1500 }] });
  // Never more than the subtotal, even stacked.
  const big = { ...live, id: 'big', amountMinor: 30000, stackable: true };
  assert.equal(applyPromotions([big, b], cart, {}, now).discountMinor, 25000);
});
test('a code the member typed must apply; automatic promotions are skipped quietly', () => {
  const expired = { ...live, id: 'old', amountMinor: 100, endsAt: '2026-02-01' };
  assert.throws(() => applyPromotions([{ ...expired, explicit: true }], cart, {}, now), /not active/);
  assert.deepEqual(applyPromotions([{ ...expired, explicit: false }], cart, {}, now), { discountMinor: 0, applied: [] });
  const totals = checkoutTotals(cart, { enabled: true }, [{ ...live, id: 'auto', kind: 'percent', percentBps: 1000, automatic: true }], { currency: 'GHS' }, now);
  assert.equal(totals.discountMinor, 2500);
  assert.deepEqual(totals.promotions, [{ id: 'auto', discountMinor: 2500 }]);
  assert.equal(totals.totalMinor, 22500);
});

test('variant attributes are bounded, tokenised for filtering and collected as facets', () => {
  assert.deepEqual(variantAttributes({ ' Size ': 'A3', Colour: 'Blue', bad: '', 'x=y': 'z;w' }), { Size: 'A3', Colour: 'Blue', 'x y': 'z w' });
  assert.equal(Object.keys(variantAttributes(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 'v'])))).length, 5);
  assert.equal(attributeToken('Size', 'A3'), 'attr:size=a3');
  assert.deepEqual(attributeTokens([{ attributes: { Size: 'A3' } }, { attributes: { size: 'a3', Colour: 'Blue' } }]), ['attr:size=a3', 'attr:colour=blue']);
  // Facets keep the first display casing and never duplicate a value.
  assert.deepEqual(mergeFacets({ Size: ['A4'] }, [{ attributes: { size: 'a4' } }, { attributes: { SIZE: 'A3', Colour: 'Blue' } }]), { Size: ['A4', 'A3'], Colour: ['Blue'] });
});
