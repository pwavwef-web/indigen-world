import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressSnapshot, checkoutTotals, priceMode, verifiedShopPayment, safeCsv } from '../../services/functions/lib/shop-policy.js';
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
