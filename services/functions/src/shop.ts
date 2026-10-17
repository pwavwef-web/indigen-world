import { createHash } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { initializeTransaction, verifyTransaction, initiateShopRefund, verifyShopRefund, PAYSTACK_SECRET_KEY, isPaystackConfigured } from './paystack.js';
import { addressSnapshot, checkoutTotals, priceMode, searchTokens, verifiedShopPayment, safeCsv, money, type Row, attributeToken, attributeTokens, mergeFacets, variantAttributes } from './shop-policy.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', invoker: 'public' as const, secrets: [PAYSTACK_SECRET_KEY] };
const now = () => new Date().toISOString();
const db = () => getFirestore();
const id = (v: unknown) => { if (typeof v !== 'string' || !/^[\w-]{1,120}$/.test(v)) throw new HttpsError('invalid-argument', 'A valid identifier is required.'); return v; };
const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 40);
const keyFor = (line: Row) => `${id(line.productId)}__${id(line.variantId || 'default')}`;
const publicProduct = (doc: FirebaseFirestore.DocumentSnapshot) => ({ ...doc.data(), id: doc.id });
function fail(error: unknown): never { if (error instanceof HttpsError) throw error; throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'The store could not complete this action.'); }
function audit(tx: FirebaseFirestore.Transaction, uid: string, action: string, targetId: string) {
  tx.create(db().collection('auditLogs').doc(), { actorUid: uid, action: `shop.${action}`, targetId, createdAt: now() });
}
function orderNotification(tx: FirebaseFirestore.Transaction, order: Row, event: string, title: string) {
  const eventKey = `shop_${order.id}_${event}`;
  tx.set(db().collection('communityNotifications').doc(eventKey), { id: eventKey, eventKey, payloadVersion: 2, recipientId: order.uid, type: 'order', category: 'orders', title, body: `Order ${order.id}`, route: `/shop/order/${order.id}`, read: false, createdAt: FieldValue.serverTimestamp() });
}
async function settings() { return (await db().doc('shopSettings/store').get()).data() ?? {}; }
function readiness(s: Row) {
  return [s.checkoutEnabled !== true && 'Enable checkout', s.currency !== 'GHS' && 'Configure supported currency (GHS)', !s.supportEmail && 'Set store support contact', !s.returnsPolicy && 'Set returns policy', !s.deliveryPolicy && 'Set delivery policy', !isPaystackConfigured() && 'Configure Paystack', !/^https:\/\/[^/]+\/shop\//.test(process.env.SHOP_PAYSTACK_CALLBACK_URL ?? '') && 'Configure SHOP_PAYSTACK_CALLBACK_URL'].filter(Boolean);
}

export const shop = onCall(options, async (req) => {
  const data = (req.data ?? {}) as Row;
  const operation = data.operation;
  try {
    if (operation === 'config') {
      const s = await settings();
      const zones = await db().collection('shopDelivery').where('enabled', '==', true).limit(100).get();
      const categories = await db().collection('shopCategories').where('published', '==', true).limit(100).get();
      const facets = (await db().doc('shopFacets/store').get()).get('attributes') ?? {};
      return { settings: s, checkoutReady: readiness(s).length === 0, readiness: readiness(s), delivery: zones.docs.map(publicProduct), categories: categories.docs.map(publicProduct), facets };
    }
    if (operation === 'catalogue') {
      const sort = ['order', 'createdAt', 'priceMinor'].includes(data.sort) ? data.sort : 'order';
      const direction = sort === 'createdAt' ? 'desc' : sort === 'order' ? 'asc' : data.desc === true ? 'desc' : 'asc';
      let query: FirebaseFirestore.Query = db().collection('shopProducts').where('published', '==', true);
      if (data.category) query = query.where('category', '==', String(data.category).slice(0, 100));
      if (data.maker) query = query.where('maker', '==', String(data.maker).slice(0, 100));
      if (data.available === true) query = query.where('inStock', '==', true);
      // One array-contains per query: an attribute filter takes the index and a
      // search alongside it is applied to the page instead.
      const searchToken = data.search ? String(data.search).trim().toLowerCase().slice(0, 40) : '';
      const attribute = typeof data.attribute === 'string' && data.attribute.includes('=') ? attributeToken(data.attribute.split('=')[0], data.attribute.split('=').slice(1).join('=')) : '';
      if (attribute) query = query.where('searchTokens', 'array-contains', attribute);
      else if (searchToken) query = query.where('searchTokens', 'array-contains', searchToken);
      if (data.minimumPrice != null || data.maximumPrice != null) {
        if (sort !== 'priceMinor') throw new Error('Choose a price sort when filtering by price.');
        if (data.minimumPrice != null) query = query.where('priceMinor', '>=', money(data.minimumPrice));
        if (data.maximumPrice != null) query = query.where('priceMinor', '<=', money(data.maximumPrice));
      }
      query = query.orderBy(sort, direction).orderBy('__name__', direction);
      if (data.cursor) {
        const cursor = await db().collection('shopProducts').doc(id(data.cursor)).get();
        if (cursor.exists) query = query.startAfter(cursor);
      }
      const page = await query.limit(24).get();
      const time = now();
      return { items: page.docs.filter((d) => d.get('status') !== 'archived' && (!d.get('publishAt') || d.get('publishAt') <= time) && (!attribute || !searchToken || (d.get('searchTokens') ?? []).includes(searchToken))).map(publicProduct), cursor: page.size === 24 ? page.docs.at(-1)!.id : null };
    }
    if (operation === 'product') {
      const doc = await db().collection('shopProducts').doc(id(data.id)).get();
      if (!doc.exists || doc.get('published') !== true || doc.get('status') === 'archived' || (doc.get('publishAt') && doc.get('publishAt') > now())) throw new HttpsError('not-found', 'This product is unavailable.');
      return publicProduct(doc);
    }
    const uid = requireAuth(req);
    await consumeRateLimit('shop', uid, 100, 60_000);
    const customer = db().collection('shopCustomers').doc(uid);
    if (operation === 'cart') {
      const profile = await customer.get();
      const lines: Row[] = profile.get('cart') ?? [];
      const hydrated = await Promise.all(lines.map(async (line) => {
        const product = await db().collection('shopProducts').doc(id(line.productId)).get();
        const visible = product.exists && product.get('published') === true && product.get('status') !== 'archived';
        return { ...line, product: visible ? publicProduct(product) : { id: line.productId, name: 'Unavailable item', inStock: false } };
      }));
      return { lines: hydrated };
    }
    if (operation === 'profile') {
      const [profile, orders, addresses, methods] = await Promise.all([customer.get(), db().collection('shopOrdersV2').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(50).get(), customer.collection('addresses').limit(100).get(), customer.collection('paymentMethods').limit(20).get()]);
      return { profile: profile.data() ?? {}, orders: orders.docs.map(publicProduct), addresses: addresses.docs.map(publicProduct), paymentMethods: methods.docs.map(publicProduct) };
    }
    if (operation === 'paymentMethod') {
      const methodId = id(data.id), method = customer.collection('paymentMethods').doc(methodId);
      if (!(await method.get()).exists) throw new Error('Payment method not found.');
      if (data.remove === true) {
        await db().runTransaction(async (tx) => { const profile = await tx.get(customer); tx.delete(method); tx.delete(db().collection('shopPaymentAuthorizations').doc(`${uid}_${methodId}`)); if (profile.get('defaultPaymentMethod') === methodId) tx.set(customer, { defaultPaymentMethod: null }, { merge: true }); });
      } else await customer.set({ defaultPaymentMethod: methodId }, { merge: true });
      return { ok: true };
    }
    if (operation === 'saveAddress') {
      const address = addressSnapshot(data.address ?? {});
      const addressId = data.id ? id(data.id) : db().collection('_').doc().id;
      await customer.collection('addresses').doc(addressId).set(address);
      if (data.defaultShipping === true) await customer.set({ defaultShippingId: addressId }, { merge: true });
      if (data.defaultBilling === true) await customer.set({ defaultBillingId: addressId }, { merge: true });
      return { id: addressId };
    }
    if (operation === 'deleteAddress') { await customer.collection('addresses').doc(id(data.id)).delete(); return { ok: true }; }
    if (operation === 'savePreferences') {
      await customer.set({ promotionalContact: data.promotionalContact === true, mobileMoneyPhone: String(data.mobileMoneyPhone ?? '').slice(0, 30) }, { merge: true }); return { ok: true };
    }
    if (operation === 'saveWishlist') {
      const ids = Array.isArray(data.ids) ? [...new Set(data.ids.slice(0, 100).map(id))] : [];
      await customer.set({ wishlist: ids }, { merge: true }); return { ok: true };
    }
    if (operation === 'wishlist') {
      const profile = await customer.get();
      const ids: string[] = profile.get('wishlist') ?? [];
      const products = await Promise.all(ids.slice(0, 100).map((productId) => db().collection('shopProducts').doc(id(productId)).get()));
      return { items: products.filter((p) => p.exists && p.get('published') === true && p.get('status') !== 'archived').map(publicProduct) };
    }
    if (operation === 'mergeCart' || operation === 'saveCart') {
      const lines = Array.isArray(data.lines) ? data.lines.slice(0, 30).map((l: Row) => ({ productId: id(l.productId), variantId: id(l.variantId || 'default'), quantity: Math.max(1, Math.min(20, Math.trunc(l.quantity || 1))) })) : [];
      const mergeKey = operation === 'mergeCart' ? hash(id(data.mergeKey)) : null;
      return await db().runTransaction(async (tx) => {
        const cart = await tx.get(customer);
        if (mergeKey && (cart.get('cartMerges') ?? []).includes(mergeKey)) return { lines: cart.get('cart') ?? [] };
        const merged = new Map<string, Row>();
        if (mergeKey) for (const line of (cart.get('cart') ?? [])) merged.set(keyFor(line), line);
        for (const line of lines) { const previous = merged.get(keyFor(line)); merged.set(keyFor(line), { ...line, quantity: Math.min(20, line.quantity + (previous?.quantity ?? 0)) }); }
        const result = [...merged.values()].slice(0, 30);
        tx.set(customer, { cart: result, cartMerges: [...(cart.get('cartMerges') ?? []), ...(mergeKey ? [mergeKey] : [])].slice(-100) }, { merge: true });
        return { lines: result };
      });
    }
    if (operation === 'inquiry') {
      const productId = id(data.productId), requestId = id(data.requestId);
      const product = await db().collection('shopProducts').doc(productId).get();
      if (!product.exists || product.get('published') !== true) throw new Error('This product is unavailable.');
      await db().collection('shopInquiries').doc(hash(`${uid}:${requestId}`)).set({ uid, productId, contact: String(data.contact ?? '').slice(0, 300), message: String(data.message ?? '').slice(0, 2000), createdAt: now() }); return { ok: true };
    }
    if (operation === 'checkout') return await createCheckout(uid, String(req.auth?.token.email ?? ''), data);
    if (operation === 'order' || operation === 'verifyPayment' || operation === 'startPayment' || operation === 'orderRequest') {
      const ref = db().collection('shopOrdersV2').doc(id(data.id));
      let order = (await ref.get()).data();
      if (!order || order.uid !== uid) throw new HttpsError('not-found', 'Order not found.');
      if (operation === 'verifyPayment') { await settleShopPayment(order.reference); order = (await ref.get()).data()!; }
      if (operation === 'startPayment') {
        if (order.paymentStatus === 'paid') return order;
        if (order.reservationState !== 'held' || order.reservationExpiresAt <= now()) throw new Error('The reservation expired. Review a new checkout to confirm availability and prices.');
        if (order.authorizationUrl) return { authorizationUrl: order.authorizationUrl, testMode: order.testMode };
        // One immutable reference per checkout. After an ambiguous request, verify
        // that reference before retrying; never create a second charge reference.
        const claimed = await db().runTransaction(async (tx) => {
          const fresh = await tx.get(ref);
          if (fresh.get('initializing')) return false;
          tx.update(ref, { initializing: true, paymentStatus: 'pending' }); return true;
        });
        if (!claimed) throw new Error('Payment initialization is pending. Check payment status before trying again.');
        const result = await initializeTransaction({ email: order.email, amountPesewas: order.totalMinor, reference: order.reference, metadata: { purpose: 'shop', orderId: order.id, uid }, callbackUrl: process.env.SHOP_PAYSTACK_CALLBACK_URL, channels: ['mobile_money', 'card'] });
        await ref.update({ authorizationUrl: result.authorizationUrl, initializing: false });
        return { authorizationUrl: result.authorizationUrl };
      }
      if (operation === 'orderRequest') {
        if (!['cancellation', 'return', 'support'].includes(data.kind)) throw new Error('Choose a supported request.');
        const requestId = hash(`${uid}:${id(data.requestId)}`);
        await ref.collection('requests').doc(requestId).set({ uid, kind: data.kind, message: String(data.message ?? '').slice(0, 3000), status: 'open', createdAt: now() });
        return { ok: true };
      }
      return order;
    }
    throw new HttpsError('invalid-argument', 'Unknown shop operation.');
  } catch (error) { fail(error); }
});

async function createCheckout(uid: string, email: string, data: Row) {
  if (!email) throw new Error('Add a verified contact email to your account before checkout.');
  const orderId = hash(`${uid}:${id(data.requestId)}`), ref = db().collection('shopOrdersV2').doc(orderId);
  return db().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data();
    const s = (await tx.get(db().doc('shopSettings/store'))).data() ?? {};
    const missing = readiness(s); if (missing.length) throw new Error(`Checkout is unavailable: ${missing.join('; ')}.`);
    const address = addressSnapshot(data.address ?? {});
    const delivery = (await tx.get(db().collection('shopDelivery').doc(id(data.deliveryId)))).data() ?? {};
    if (!Array.isArray(delivery.countries) || !delivery.countries.includes(address.country) || (delivery.regions?.length && !delivery.regions.includes(address.region))) throw new Error('This address is outside the selected delivery zone.');
    if (!Array.isArray(data.lines) || !data.lines.length || data.lines.length > 30) throw new Error('Choose between 1 and 30 items.');
    const keys = new Set<string>();
    const items: Row[] = [], stockRows: { ref: FirebaseFirestore.DocumentReference; data: Row; quantity: number }[] = [];
    for (const line of data.lines as Row[]) {
      const key = keyFor(line); if (keys.has(key)) throw new Error('Combine duplicate cart lines before checkout.'); keys.add(key);
      const product = await tx.get(db().collection('shopProducts').doc(id(line.productId)));
      const p = product.data() ?? {};
      if (p.published !== true || p.status === 'archived' || p.inStock === false || (p.publishAt && p.publishAt > now())) throw new Error('A product is no longer available. Refresh the cart.');
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const variant = variants.find((v: Row) => v.id === (line.variantId || 'default'));
      if (variants.length && !variant) throw new Error('Choose an available variant.');
      const inventoryRef = db().collection('shopInventory').doc(key), stock = (await tx.get(inventoryRef)).data() ?? {};
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20 || (stock.onHand ?? 0) - (stock.reserved ?? 0) < line.quantity) throw new Error('Stock changed. Reduce the quantity or choose another item.');
      items.push({ productId: product.id, variantId: line.variantId || 'default', sku: variant?.sku ?? p.sku ?? '', name: p.name, variant: variant?.name ?? '', priceMinor: variant?.priceMinor ?? p.priceMinor, priceMode: priceMode(p), currency: p.currency, kind: p.kind ?? 'physical', quantity: line.quantity, imageUrl: p.imageUrl ?? '', category: p.category ?? '' });
      stockRows.push({ ref: inventoryRef, data: stock, quantity: line.quantity });
    }
    const promoRef = data.coupon ? db().collection('shopPromotions').doc(id(String(data.coupon).toUpperCase())) : null;
    const promotion = promoRef ? (await tx.get(promoRef)).data() : null;
    if (promoRef && !promotion) throw new Error('This promotion was not found.');
    // Automatic promotions (no code) are considered too; ineligible ones are skipped.
    const automatic = await tx.get(db().collection('shopPromotions').where('automatic', '==', true).where('enabled', '==', true).limit(20));
    const candidates: Row[] = [
      ...(promoRef && promotion ? [{ ...promotion, id: promoRef.id, explicit: true }] : []),
      ...automatic.docs.filter((doc) => doc.id !== promoRef?.id).map((doc) => ({ ...doc.data(), id: doc.id, explicit: false })),
    ];
    const redemptionRefs = candidates.map((candidate) => db().collection('shopPromotions').doc(candidate.id).collection('redemptions').doc(uid));
    const redemptions = await Promise.all(redemptionRefs.map((ref) => tx.get(ref)));
    const priorUses = Object.fromEntries(candidates.map((candidate, index) => [candidate.id, Number(redemptions[index].get('count') ?? 0)]));
    const paid = await Promise.all(['paid', 'partially_refunded', 'refunded'].map((status) => tx.get(db().collection('shopOrdersV2').where('uid', '==', uid).where('paymentStatus', '==', status).limit(1))));
    const totals = checkoutTotals(items, delivery, candidates, s, Date.now(), { uid, priorUses, isFirstOrder: paid.every((page) => page.empty) });
    const applied = (totals.promotions ?? []) as { id: string; discountMinor: number }[];
    const order = { id: orderId, schemaVersion: 2, uid, email, items, address, delivery: { id: data.deliveryId, name: delivery.name, estimate: delivery.estimate ?? '', pickup: delivery.pickup === true }, ...totals, coupon: applied.some((a) => a.id === promoRef?.id) ? promoRef!.id : null, promotionIds: applied.map((a) => a.id), reference: `shop_${orderId}`, paymentStatus: 'unpaid', fulfillmentStatus: 'unfulfilled', returnStatus: 'none', reservationState: 'held', reservationExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), createdAt: now(), timeline: [{ event: 'Order reserved', at: now() }], refundedMinor: 0, refundReservedMinor: 0 };
    for (const stock of stockRows) tx.update(stock.ref, { reserved: (stock.data.reserved ?? 0) + stock.quantity });
    for (const a of applied) {
      const index = candidates.findIndex((candidate) => candidate.id === a.id);
      tx.update(db().collection('shopPromotions').doc(a.id), { reserved: (candidates[index].reserved ?? 0) + 1 });
      tx.set(redemptionRefs[index], { count: priorUses[a.id] + 1, updatedAt: now() }, { merge: true });
    }
    tx.create(ref, order); audit(tx, uid, 'checkout', orderId); return order;
  });
}

/** Also called by the existing authenticated Paystack webhook dispatcher. */
/** The promotions an order holds: its applied list, or the legacy single coupon. */
function promotionIdsOf(order: Row): string[] {
  if (Array.isArray(order.promotionIds)) return order.promotionIds.map(String);
  return order.coupon ? [String(order.coupon)] : [];
}

/** Reads (before any write in the transaction) what releasing an order's promotions needs. */
async function readOrderPromotions(tx: FirebaseFirestore.Transaction, order: Row) {
  return Promise.all(promotionIdsOf(order).map(async (promotionId) => {
    const ref = db().collection('shopPromotions').doc(promotionId);
    const redemptionRef = ref.collection('redemptions').doc(String(order.uid));
    const [promo, redemption] = await Promise.all([tx.get(ref), tx.get(redemptionRef)]);
    return { ref, promo: promo.data(), redemptionRef, redemption: redemption.data() };
  }));
}

/** A held order's promotions go back: capacity, and the member's own count. */
function releaseOrderPromotions(tx: FirebaseFirestore.Transaction, rows: Awaited<ReturnType<typeof readOrderPromotions>>) {
  for (const { ref, promo, redemptionRef, redemption } of rows) {
    if (promo) tx.update(ref, { reserved: Math.max(0, (promo.reserved ?? 0) - 1) });
    if (redemption) tx.set(redemptionRef, { count: Math.max(0, (redemption.count ?? 0) - 1), updatedAt: now() }, { merge: true });
  }
}

export async function settleShopPayment(reference: string) {
  if (!/^shop_[a-f0-9]{40}$/.test(reference)) throw new Error('Invalid shop reference.');
  const verified = await verifyTransaction(reference);
  if (verified.status !== 'success') return;
  const ref = db().collection('shopOrdersV2').doc(reference.slice(5));
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref), order = snap.data();
    if (!order || !verifiedShopPayment(order, verified)) throw new Error('Payment verification does not match the shop order.');
    if (['paid', 'refund_required', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) return;
    const stocks = await Promise.all((order.items as Row[]).map(async (line) => { const stockRef = db().collection('shopInventory').doc(keyFor(line)); return { line, ref: stockRef, data: (await tx.get(stockRef)).data() ?? {} }; }));
    const customerRef = db().collection('shopCustomers').doc(order.uid), customer = await tx.get(customerRef);
    const held = order.reservationState === 'held';
    const available = order.fulfillmentStatus !== 'cancelled' && stocks.every(({ line, data: stock }) => (stock.onHand ?? 0) - (held ? 0 : (stock.reserved ?? 0)) >= line.quantity);
    const promos = await readOrderPromotions(tx, order);
    if (available) for (const { line, ref: stockRef, data: stock } of stocks) tx.update(stockRef, { onHand: stock.onHand - line.quantity, reserved: Math.max(0, (stock.reserved ?? 0) - (held ? line.quantity : 0)) });
    if (!available && held) for (const { line, ref: stockRef, data: stock } of stocks) tx.update(stockRef, { reserved: Math.max(0, (stock.reserved ?? 0) - line.quantity) });
    for (const { ref: promoRef, promo } of promos) if (promo) tx.update(promoRef, { used: (promo.used ?? 0) + 1, reserved: Math.max(0, (promo.reserved ?? 0) - (held ? 1 : 0)) });
    if (available && customer.exists) {
      const purchased = new Map((order.items as Row[]).map((line) => [keyFor(line), line.quantity]));
      const cart = ((customer.get('cart') ?? []) as Row[]).map((line) => ({ ...line, quantity: Math.max(0, line.quantity - (purchased.get(keyFor(line)) ?? 0)) })).filter((line) => line.quantity > 0);
      tx.set(customerRef, { cart }, { merge: true });
    }
    tx.update(ref, { paymentStatus: available ? 'paid' : 'refund_required', reservationState: available ? 'allocated' : 'exception', paidAt: verified.paidAt, timeline: FieldValue.arrayUnion({ event: available ? 'Payment verified' : 'Payment received after stock became unavailable — refund required', at: now() }) });
    orderNotification(tx, order, 'payment', available ? 'Your shop payment is confirmed' : 'Your order needs a refund review');
    tx.set(db().collection('shopTransactions').doc(reference), { orderId: order.id, uid: order.uid, purpose: 'shop', reference, amountMinor: order.totalMinor, currency: order.currency, kind: 'payment', verifiedAt: now(), exception: !available });
    if (verified.authorization?.reusable) {
      const auth = verified.authorization, methodId = hash(auth.code);
      tx.set(db().collection('shopPaymentAuthorizations').doc(`${order.uid}_${methodId}`), { uid: order.uid, code: auth.code, purpose: 'shop', createdAt: now() });
      tx.set(db().collection('shopCustomers').doc(order.uid).collection('paymentMethods').doc(methodId), { last4: auth.last4, brand: auth.brand, expMonth: auth.expMonth, expYear: auth.expYear, provider: 'paystack', reusable: true });
    }
  });
}

export const shopAdmin = onCall(options, async (req) => {
  const uid = requireAuth(req); requireRole(req, 'admin');
  const data = (req.data ?? {}) as Row;
  const collections: Record<string, string> = { products: 'shopProducts', categories: 'shopCategories', orders: 'shopOrdersV2', inventory: 'shopInventory', customers: 'shopCustomers', delivery: 'shopDelivery', promotions: 'shopPromotions', transactions: 'shopTransactions', inquiries: 'shopInquiries' };
  const financial = ['transactions', 'refund'].includes(data.section) || ['refund', 'reconcileRefund'].includes(data.operation);
  if (financial && req.auth?.token.finance !== true && req.auth?.token.superAdmin !== true && req.auth?.token.role !== 'super_admin') throw new HttpsError('permission-denied', 'Finance permission is required.');
  const capability = financial ? 'finance' : ['customers', 'inquiries'].includes(data.section) ? 'customer_data' : ['orders', 'inventory'].includes(data.section) ? 'fulfillment' : 'catalogue';
  const scopes = req.auth?.token.shopScopes;
  if (req.auth?.token.role !== 'super_admin' && scopes != null && (!Array.isArray(scopes) || !scopes.includes(capability))) throw new HttpsError('permission-denied', `Shop ${capability} permission is required.`);
  try {
    if (data.operation === 'readiness') { const s = await settings(); return { settings: s, tasks: readiness(s) }; }
    if (data.operation === 'settings') {
      const s = data.value ?? {};
      const value = { currency: s.currency === 'GHS' ? 'GHS' : '', supportEmail: String(s.supportEmail ?? '').slice(0, 300), storeName: String(s.storeName ?? '').slice(0, 100), returnsPolicy: String(s.returnsPolicy ?? '').slice(0, 10000), deliveryPolicy: String(s.deliveryPolicy ?? '').slice(0, 10000), taxBps: money(s.taxBps ?? 0), checkoutEnabled: s.checkoutEnabled === true };
      await db().runTransaction(async (tx) => { tx.set(db().doc('shopSettings/store'), value); audit(tx, uid, 'settings', 'store'); }); return value;
    }
    const collectionName = collections[data.section]; if (!collectionName) throw new Error('Unknown shop workspace.');
    if (data.operation === 'customer' && data.section === 'customers') {
      const customerId = id(data.id);
      const [orders, inquiries] = await Promise.all([db().collection('shopOrdersV2').where('uid', '==', customerId).orderBy('createdAt', 'desc').limit(50).get(), db().collection('shopInquiries').where('uid', '==', customerId).limit(50).get()]);
      return { orders: orders.docs.map(publicProduct), inquiries: inquiries.docs.map(publicProduct) };
    }
    if (data.operation === 'list' || data.operation === 'export') {
      let query: FirebaseFirestore.Query = db().collection(collectionName).orderBy('__name__');
      if (data.cursor) query = query.startAfter(id(data.cursor));
      const page = await query.limit(50).get(); const rows = page.docs.map(publicProduct);
      if (data.operation === 'export') return { csv: [['id', 'orderId', 'kind', 'amountMinor', 'currency', 'verifiedAt'], ...rows.map((r: Row) => [r.id, r.orderId, r.kind, r.amountMinor, r.currency, r.verifiedAt])].map((r) => r.map(safeCsv).join(',')).join('\r\n') };
      return { items: rows, cursor: page.size === 50 ? page.docs.at(-1)!.id : null };
    }
    if (data.operation === 'requests') {
      const order = db().collection('shopOrdersV2').doc(id(data.id));
      const [requests, notes] = await Promise.all([order.collection('requests').limit(100).get(), order.collection('notes').limit(100).get()]);
      return { items: requests.docs.map(publicProduct), notes: notes.docs.map(publicProduct) };
    }
    if (data.operation === 'resolveRequest' && data.section === 'orders') {
      const orderRef = db().collection('shopOrdersV2').doc(id(data.id));
      const requestRef = orderRef.collection('requests').doc(id(data.requestId));
      if (!['approved', 'declined', 'resolved'].includes(data.status) || !String(data.message ?? '').trim()) throw new Error('Choose a resolution and explain it to the customer.');
      return await db().runTransaction(async (tx) => {
        const order = (await tx.get(orderRef)).data(), request = (await tx.get(requestRef)).data();
        if (!order || !request) throw new Error('Request not found.');
        if (request.status !== 'open') return { ok: true };
        const changes: Row = {};
        if (request.kind === 'cancellation' && data.status === 'approved') {
          if (['dispatched', 'delivered'].includes(order.fulfillmentStatus)) throw new Error('Dispatched orders need a return request.');
          changes.fulfillmentStatus = 'cancelled';
          if (order.reservationState === 'held') {
            const stocks = await Promise.all((order.items as Row[]).map(async (line) => { const ref = db().collection('shopInventory').doc(keyFor(line)); return { ref, line, stock: (await tx.get(ref)).data() }; }));
            const promos = await readOrderPromotions(tx, order);
            for (const { ref, line, stock } of stocks) if (stock) tx.update(ref, { reserved: Math.max(0, (stock.reserved ?? 0) - line.quantity) });
            releaseOrderPromotions(tx, promos);
            changes.reservationState = 'cancelled';
          }
          // A paid cancellation still needs a separately authorized Finance refund.
        }
        if (request.kind === 'return') changes.returnStatus = data.status === 'approved' ? 'authorized' : data.status === 'declined' ? 'declined' : 'resolved';
        const resolution = String(data.message).slice(0, 3000);
        tx.update(requestRef, { status: data.status, resolution, resolvedBy: uid, resolvedAt: now() });
        tx.update(orderRef, { ...changes, timeline: FieldValue.arrayUnion({ event: `${request.kind}: ${data.status}. ${resolution}`, at: now() }) });
        audit(tx, uid, `request:${data.status}`, requestRef.id);
        orderNotification(tx, order, `request_${requestRef.id}`, 'Your shop request has an update');
        return { ok: true };
      });
    }
    if (data.operation === 'refund') {
      const orderRef = db().collection('shopOrdersV2').doc(id(data.id)), refundId = hash(`${data.id}:${id(data.requestId)}`), refundRef = db().collection('shopRefunds').doc(refundId);
      const amountMinor = money(data.amountMinor);
      if (!amountMinor || !String(data.reason ?? '').trim()) throw new Error('Enter a refund amount and reason.');
      const result = await db().runTransaction(async (tx) => {
        const old = await tx.get(refundRef); if (old.exists) return { existing: true, ...old.data() };
        const order = (await tx.get(orderRef)).data();
        if (!order || !['paid', 'refund_required', 'partially_refunded'].includes(order.paymentStatus) || amountMinor > order.totalMinor - order.refundedMinor - (order.refundReservedMinor ?? 0)) throw new Error('This amount is not available for refund.');
        const value = { id: refundId, orderId: order.id, reference: order.reference, currency: order.currency, amountMinor, status: 'initiating', reason: String(data.reason).slice(0, 1000), actorUid: uid, createdAt: now() };
        tx.create(refundRef, value); tx.update(orderRef, { refundReservedMinor: (order.refundReservedMinor ?? 0) + amountMinor }); audit(tx, uid, 'refund-request', order.id); return { existing: false, ...value };
      });
      if (result.existing) return result;
      // Never retry an ambiguous provider mutation. The reserved amount remains
      // visible until a signed webhook or finance reconciliation resolves it.
      try { const created = await initiateShopRefund(String((result as Row).reference), amountMinor, refundId); await refundRef.update({ providerId: String(created.id), status: 'pending' }); return { id: refundId, status: 'pending' }; }
      catch { await refundRef.update({ status: 'uncertain' }); throw new Error('Refund initiation is uncertain. Reconcile its merchant note in Paystack before any retry.'); }
    }
    if (data.operation === 'reconcileRefund') {
      await settleShopRefund(String(data.providerId ?? '')); return { ok: true };
    }
    const recordId = data.id ? id(data.id) : db().collection(collectionName).doc().id, ref = db().collection(collectionName).doc(recordId);
    if (data.operation === 'adjust' && data.section === 'inventory') {
      const delta = Number(data.delta); if (!Number.isSafeInteger(delta) || !String(data.reason ?? '').trim()) throw new Error('Enter an integer adjustment and reason.');
      return await db().runTransaction(async (tx) => { const stock = (await tx.get(ref)).data() ?? {}; const onHand = (stock.onHand ?? 0) + delta; if (onHand < (stock.reserved ?? 0)) throw new Error('Stock cannot be reduced below the reserved quantity.'); tx.set(ref, { ...stock, onHand, reserved: stock.reserved ?? 0, updatedAt: now() }); audit(tx, uid, `inventory:${String(data.reason).slice(0, 200)}`, recordId); return { ok: true }; });
    }
    if (data.operation === 'fulfill' && data.section === 'orders') {
      return await db().runTransaction(async (tx) => {
        const order = (await tx.get(ref)).data(); if (!order) throw new Error('Order not found.');
        const transitions: Record<string, string[]> = { unfulfilled: ['packing'], packing: ['dispatched'], dispatched: ['delivered'], delivered: [] };
        if (order.paymentStatus !== 'paid' || !transitions[order.fulfillmentStatus]?.includes(data.status)) throw new Error('This fulfillment transition is unavailable.');
        tx.update(ref, { fulfillmentStatus: data.status, tracking: String(data.tracking ?? order.tracking ?? '').slice(0, 500), carrier: String(data.carrier ?? order.carrier ?? '').slice(0, 100), timeline: FieldValue.arrayUnion({ event: data.status, at: now() }) }); audit(tx, uid, `fulfill:${data.status}`, recordId); orderNotification(tx, order, data.status, data.status === 'packing' ? 'Your order is being packed' : data.status === 'dispatched' ? 'Your order has been dispatched' : 'Your order has been delivered'); return { ok: true };
      });
    }
    if (data.operation === 'note' && data.section === 'orders') { await ref.collection('notes').add({ text: String(data.text ?? '').slice(0, 3000), actorUid: uid, createdAt: now() }); return { ok: true }; }
    // Safe bulk catalogue changes: publish, unpublish or archive up to 50 selected
    // products in one transaction. Publishing re-checks what a single save checks
    // (a name, every gallery asset ready, scheduling) so a bulk action can never
    // put a product live that the editor would have refused. Nothing is deleted.
    if (data.operation === 'bulkStatus' && data.section === 'products') {
      const action = String(data.action);
      if (!['publish', 'unpublish', 'archive'].includes(action)) throw new Error('Choose publish, unpublish or archive.');
      const ids = [...new Set((Array.isArray(data.ids) ? data.ids : []).map((value: unknown) => id(value)))].slice(0, 50);
      if (!ids.length) throw new Error('Select at least one product.');
      return await db().runTransaction(async (tx) => {
        const refs = ids.map((productId) => db().collection('shopProducts').doc(productId));
        const docs = await Promise.all(refs.map((productRef) => tx.get(productRef)));
        const skipped: Row[] = [];
        let changed = 0;
        const time = now();
        docs.forEach((doc, index) => {
          if (!doc.exists) { skipped.push({ id: ids[index], reason: 'not found' }); return; }
          const product = doc.data() as Row;
          let update: Row;
          if (action === 'archive') update = { published: false, status: 'archived' };
          else if (action === 'unpublish') update = { published: false, status: 'draft' };
          else {
            if (!String(product.name ?? '').trim()) { skipped.push({ id: doc.id, reason: 'missing name' }); return; }
            if ((Array.isArray(product.gallery) ? product.gallery : []).some((a: Row) => a.status && a.status !== 'ready')) { skipped.push({ id: doc.id, reason: 'images still processing' }); return; }
            update = product.publishAt && product.publishAt > time ? { published: false, status: 'scheduled' } : { published: true, status: 'published' };
          }
          tx.update(doc.ref, { ...update, updatedAt: time });
          audit(tx, uid, `bulk:${action}`, doc.id);
          changed += 1;
        });
        return { changed, skipped };
      });
    }
    if (data.operation === 'save' && ['products', 'categories', 'delivery', 'promotions'].includes(data.section)) {
      const value: Row = { ...(data.value ?? {}) }; delete value.id;
      if (JSON.stringify(value).length > 80000) throw new Error('This record is too large.');
      if (data.section === 'products') {
        if (!String(value.name ?? '').trim()) throw new Error('Product name is required.');
        value.priceMinor = money(value.priceMinor ?? 0); value.priceMode = priceMode(value); value.currency = 'GHS'; value.kind = value.kind === 'digital' ? 'digital' : 'physical';
        value.order = Number.isFinite(value.order) ? value.order : 0;
        value.variants = (Array.isArray(value.variants) ? value.variants : []).slice(0, 50);
        value.searchTokens = [...searchTokens(`${value.name} ${value.category ?? ''} ${value.maker ?? ''}`), ...attributeTokens(value.variants)];
        value.createdAt = value.createdAt || now();
        if (value.published === true && value.publishAt && value.publishAt > now()) { value.status = 'scheduled'; value.published = false; }
        value.variants = value.variants.map((v: Row) => ({ id: id(v.id), name: String(v.name).slice(0, 100), sku: String(v.sku ?? '').slice(0, 100), priceMinor: money(v.priceMinor ?? value.priceMinor), attributes: variantAttributes(v.attributes) }));
        value.gallery = (Array.isArray(value.gallery) ? value.gallery : []).slice(0, 12);
        if (value.gallery.some((a: Row) => a.status && a.status !== 'ready')) throw new Error('Wait for all gallery assets to finish processing.');
      }
      if (data.section === 'delivery') { value.feeMinor = money(value.feeMinor ?? 0); if (!Array.isArray(value.countries) || !value.countries.length) throw new Error('Add supported countries.'); }
      if (data.section === 'promotions') {
        value.kind = value.kind === 'percent' ? 'percent' : 'fixed';
        value.amountMinor = money(value.amountMinor ?? 0); value.percentBps = money(value.percentBps ?? 0, 'percentage'); value.maxDiscountMinor = money(value.maxDiscountMinor ?? 0);
        if (value.kind === 'percent' && !(value.percentBps >= 1 && value.percentBps <= 10000)) throw new Error('A percentage promotion needs 1–10000 basis points (100 = 1%).');
        value.segment = ['first_order', 'customers'].includes(value.segment) ? value.segment : 'all';
        for (const field of ['categories', 'productIds', 'customerIds']) value[field] = (Array.isArray(value[field]) ? value[field] : []).map((v: unknown) => String(v).trim().slice(0, 120)).filter(Boolean).slice(0, 200);
        if (value.segment === 'customers' && !value.customerIds.length) throw new Error('Add the customer IDs this promotion is for.');
        value.perCustomerLimit = money(value.perCustomerLimit ?? 0); value.stackable = value.stackable === true; value.automatic = value.automatic === true;
      }
      if (data.section === 'promotions') { value.minimumMinor = money(value.minimumMinor ?? 0); if (!Number.isFinite(Date.parse(value.startsAt)) || !(Date.parse(value.endsAt) > Date.parse(value.startsAt))) throw new Error('Choose a valid promotion date window.'); delete value.used; delete value.reserved; }
      await db().runTransaction(async (tx) => {
        const stockRefs = data.section === 'products' ? (value.variants.length ? value.variants.map((v: Row) => db().collection('shopInventory').doc(`${recordId}__${v.id}`)) : [db().collection('shopInventory').doc(`${recordId}__default`)]) as FirebaseFirestore.DocumentReference[] : [];
        const stocks = await Promise.all(stockRefs.map((stockRef) => tx.get(stockRef)));
        const facetsRef = db().doc('shopFacets/store');
        const facets = data.section === 'products' && value.variants.some((v: Row) => Object.keys(v.attributes ?? {}).length) ? await tx.get(facetsRef) : null;
        if (facets) tx.set(facetsRef, { attributes: mergeFacets(facets.get('attributes'), value.variants), updatedAt: now() }, { merge: true });
        for (const stock of stocks) if (!stock.exists) tx.create(stock.ref, { productId: recordId, name: value.name, onHand: 0, reserved: 0, threshold: 3, updatedAt: now() });
        tx.set(ref, { ...value, updatedAt: now() }, { merge: true }); audit(tx, uid, `save:${data.section}`, recordId);
      }); return { id: recordId };
    }
    throw new Error('Unsupported workspace action.');
  } catch (error) { fail(error); }
});

export async function settleShopRefund(providerId: string) {
  if (!/^\d+$/.test(providerId)) throw new Error('A Paystack refund identifier is required.');
  const verified = await verifyShopRefund(providerId), merchant = String(verified.merchant_note ?? '');
  if (!/^shop:[a-f0-9]{40}$/.test(merchant)) return false;
  const ref = db().collection('shopRefunds').doc(merchant.slice(5));
  return db().runTransaction(async (tx) => {
    const refund = (await tx.get(ref)).data(); if (!refund) throw new Error('Refund not found.');
    const orderRef = db().collection('shopOrdersV2').doc(refund.orderId), order = (await tx.get(orderRef)).data();
    const transactionRef = typeof verified.transaction === 'object' ? verified.transaction?.reference : verified.transaction_reference;
    if (!order || verified.amount !== refund.amountMinor || verified.currency !== refund.currency || transactionRef !== order.reference) throw new Error('The provider refund does not match this order.');
    if (['processed', 'failed'].includes(refund.status)) return true;
    if (verified.status === 'processed') {
      const refundedMinor = order.refundedMinor + refund.amountMinor;
      tx.update(orderRef, { refundedMinor, refundReservedMinor: Math.max(0, order.refundReservedMinor - refund.amountMinor), paymentStatus: refundedMinor === order.totalMinor ? 'refunded' : 'partially_refunded', timeline: FieldValue.arrayUnion({ event: `Refund verified: ${refund.amountMinor} minor units`, at: now() }) });
      tx.set(db().collection('shopTransactions').doc(`refund_${ref.id}`), { orderId: order.id, kind: 'refund', amountMinor: -refund.amountMinor, currency: order.currency, verifiedAt: now(), providerId });
      tx.update(ref, { status: 'processed', providerId, processedAt: now() });
    } else if (verified.status === 'failed') {
      tx.update(orderRef, { refundReservedMinor: Math.max(0, order.refundReservedMinor - refund.amountMinor) }); tx.update(ref, { status: 'failed', providerId });
    } else tx.update(ref, { status: 'pending', providerId });
    return true;
  });
}

export const reconcileShopOrders = onSchedule({ schedule: 'every 10 minutes', region: 'us-central1', secrets: [PAYSTACK_SECRET_KEY], timeoutSeconds: 300 }, async () => {
  const scheduled = await db().collection('shopProducts').where('status', '==', 'scheduled').where('publishAt', '<=', now()).limit(100).get();
  for (const product of scheduled.docs) await db().runTransaction(async (tx) => {
    const latest = await tx.get(product.ref);
    if (latest.get('status') === 'scheduled' && latest.get('publishAt') <= now()) tx.update(product.ref, { status: 'published', published: true, updatedAt: now() });
  });
  const page = await db().collection('shopOrdersV2').where('reservationState', '==', 'held').where('reservationExpiresAt', '<=', now()).limit(100).get();
  for (const doc of page.docs) {
    try { if (doc.get('paymentStatus') === 'pending') await settleShopPayment(doc.get('reference')); } catch { /* leave a recoverable pending reference; never assume failed payment */ }
    await db().runTransaction(async (tx) => {
      const order = (await tx.get(doc.ref)).data(); if (!order || order.reservationState !== 'held') return;
      const stocks = await Promise.all((order.items as Row[]).map(async (line) => { const ref = db().collection('shopInventory').doc(keyFor(line)); return { ref, line, stock: (await tx.get(ref)).data() }; }));
      const promos = await readOrderPromotions(tx, order);
      for (const { ref, line, stock } of stocks) if (stock) tx.update(ref, { reserved: Math.max(0, (stock.reserved ?? 0) - line.quantity) });
      releaseOrderPromotions(tx, promos);
      tx.update(doc.ref, { reservationState: 'expired', timeline: FieldValue.arrayUnion({ event: 'Reservation expired; payment status remains independently verifiable', at: now() }) });
    });
  }
  const pending = await db().collection('shopOrdersV2').where('paymentStatus', '==', 'pending').limit(100).get();
  for (const order of pending.docs) try { await settleShopPayment(order.get('reference')); } catch { /* status stays pending for operator reconciliation */ }
});
