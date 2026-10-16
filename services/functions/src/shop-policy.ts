/** Pure, shared checkout invariants. Amounts are always integer minor units. */
export type Row = Record<string, any>;
export function money(value: unknown, name = 'amount'): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 100_000_000) throw new Error(`${name} must be a nonnegative integer in minor units.`);
  return Number(value);
}
export function priceMode(product: Row): 'fixed' | 'quote' {
  return product.priceMode === 'quote' || !(product.priceMinor > 0) ? 'quote' : 'fixed';
}
export function addressSnapshot(raw: Row): Row {
  const fields = ['label', 'recipient', 'country', 'region', 'city', 'street', 'phone', 'digitalAddress', 'instructions'];
  const result = Object.fromEntries(fields.map((key) => [key, String(raw[key] ?? '').trim().slice(0, key === 'instructions' ? 1000 : 200)]));
  for (const key of ['recipient', 'country', 'city', 'street', 'phone']) if (!result[key]) throw new Error(`Address ${key} is required.`);
  if (!/^[A-Z]{2}$/.test(result.country)) throw new Error('Use a two-letter country code.');
  if (!/^[+\d][\d ()-]{5,25}$/.test(result.phone)) throw new Error('Enter a valid contact phone number.');
  return result;
}
export function checkoutTotals(items: Row[], delivery: Row, promotion: Row | null, settings: Row, now = Date.now()): Row {
  if (!items.length || items.length > 30) throw new Error('Choose between 1 and 30 items.');
  const subtotalMinor = items.reduce((sum, item) => {
    if (item.kind === 'digital') throw new Error('Digital goods require platform billing.');
    if (priceMode(item) !== 'fixed') throw new Error('Quote-only items need an inquiry.');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error('Quantity must be between 1 and 20.');
    if (item.currency !== settings.currency) throw new Error('The item currency is not supported.');
    return money(sum + money(item.priceMinor) * item.quantity);
  }, 0);
  if (delivery.enabled !== true) throw new Error('This delivery option is unavailable. Choose another option or contact the store.');
  let discountMinor = 0;
  if (promotion) {
    if (promotion.enabled !== true || Date.parse(promotion.startsAt) > now || !(Date.parse(promotion.endsAt) > now)) throw new Error('This promotion is not active.');
    if (subtotalMinor < money(promotion.minimumMinor ?? 0)) throw new Error('The minimum spend for this promotion has not been reached.');
    if (promotion.limit && (promotion.used ?? 0) + (promotion.reserved ?? 0) >= promotion.limit) throw new Error('This promotion has reached its redemption limit.');
    discountMinor = Math.min(subtotalMinor, money(promotion.amountMinor));
  }
  const deliveryMinor = money(delivery.feeMinor ?? 0);
  const taxBps = money(settings.taxBps ?? 0, 'tax basis points');
  if (taxBps > 10000) throw new Error('The configured tax rate is invalid.');
  const taxMinor = Math.round((subtotalMinor - discountMinor) * taxBps / 10000);
  return { subtotalMinor, discountMinor, deliveryMinor, taxMinor, totalMinor: money(subtotalMinor - discountMinor + deliveryMinor + taxMinor), currency: settings.currency };
}
export function verifiedShopPayment(order: Row, verification: Row): boolean {
  return verification.status === 'success' && verification.reference === order.reference &&
    verification.amountPesewas === order.totalMinor && verification.currency === order.currency &&
    verification.customerEmail?.toLowerCase() === order.email?.toLowerCase() &&
    verification.metadata?.purpose === 'shop' && verification.metadata?.orderId === order.id && verification.metadata?.uid === order.uid;
}
export function searchTokens(text: string): string[] {
  return [...new Set(text.toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).flatMap((word) => Array.from({ length: Math.min(word.length, 24) }, (_, i) => word.slice(0, i + 1))))].slice(0, 250);
}
export function safeCsv(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `"${value}"`;
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
