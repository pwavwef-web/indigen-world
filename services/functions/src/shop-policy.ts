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
/** Who is checking out, for promotion eligibility. */
export interface PromotionContext {
  uid?: string;
  /** This member's existing redemptions of each promotion, by promotion id. */
  priorUses?: Record<string, number>;
  /** True when the member has no paid order yet. */
  isFirstOrder?: boolean;
}

function lineTotal(item: Row) { return money(item.priceMinor) * item.quantity; }

/**
 * The discount one promotion gives this cart, or an explanation of why it gives
 * none. Never throws: the caller decides whether an ineligible promotion is an
 * error (a code the member typed) or simply skipped (an automatic one).
 */
export function promotionDiscount(promotion: Row, items: Row[], context: PromotionContext = {}, now = Date.now()): { discountMinor: number } | { reason: string } {
  if (promotion.enabled !== true || !(Date.parse(promotion.startsAt) <= now) || !(Date.parse(promotion.endsAt) > now)) return { reason: 'This promotion is not active.' };
  if (promotion.limit && (promotion.used ?? 0) + (promotion.reserved ?? 0) >= promotion.limit) return { reason: 'This promotion has reached its redemption limit.' };
  const segment = String(promotion.segment ?? 'all');
  if (segment === 'first_order' && context.isFirstOrder !== true) return { reason: 'This promotion is for a first order.' };
  if (segment === 'customers' && !(Array.isArray(promotion.customerIds) && context.uid && promotion.customerIds.includes(context.uid))) return { reason: 'This promotion is not available on your account.' };
  const perCustomer = Number(promotion.perCustomerLimit ?? 0);
  if (perCustomer > 0 && (context.priorUses?.[String(promotion.id)] ?? 0) >= perCustomer) return { reason: 'You have already used this promotion.' };
  // Eligible lines: everything, or only the listed categories / products.
  const categories = Array.isArray(promotion.categories) ? promotion.categories.map(String) : [];
  const productIds = Array.isArray(promotion.productIds) ? promotion.productIds.map(String) : [];
  const scoped = categories.length > 0 || productIds.length > 0;
  const eligibleMinor = items.reduce((sum, item) => (!scoped || categories.includes(String(item.category ?? '')) || productIds.includes(String(item.productId ?? ''))) ? sum + lineTotal(item) : sum, 0);
  if (eligibleMinor <= 0) return { reason: 'Nothing in your cart is eligible for this promotion.' };
  if (eligibleMinor < money(promotion.minimumMinor ?? 0)) return { reason: 'The minimum spend for this promotion has not been reached.' };
  let discountMinor: number;
  if (promotion.kind === 'percent') {
    const bps = money(promotion.percentBps ?? 0, 'percentage');
    if (bps < 1 || bps > 10000) return { reason: 'This promotion is misconfigured.' };
    discountMinor = Math.floor(eligibleMinor * bps / 10000);
    const cap = money(promotion.maxDiscountMinor ?? 0);
    if (cap > 0) discountMinor = Math.min(discountMinor, cap);
  } else {
    discountMinor = money(promotion.amountMinor ?? 0);
  }
  return { discountMinor: Math.min(discountMinor, eligibleMinor) };
}

/**
 * Which promotions apply and for how much. A promotion the member entered
 * (`explicit`) must apply or checkout stops with its reason; automatic ones
 * that do not apply are skipped. Stacking: promotions combine only when every
 * applicable one is marked `stackable`; otherwise the single largest discount
 * wins (the member's code on a tie). The total never exceeds the subtotal.
 */
export function applyPromotions(promotions: Row[], items: Row[], context: PromotionContext = {}, now = Date.now()): { discountMinor: number; applied: { id: string; discountMinor: number }[] } {
  const candidates: { id: string; discountMinor: number; stackable: boolean; explicit: boolean }[] = [];
  for (const promotion of promotions) {
    const result = promotionDiscount(promotion, items, context, now);
    if ('reason' in result) { if (promotion.explicit) throw new Error(result.reason); continue; }
    if (result.discountMinor > 0) candidates.push({ id: String(promotion.id), discountMinor: result.discountMinor, stackable: promotion.stackable === true, explicit: promotion.explicit === true });
  }
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  let chosen = candidates;
  if (candidates.length > 1 && candidates.some((c) => !c.stackable)) {
    chosen = [[...candidates].sort((a, b) => b.discountMinor - a.discountMinor || Number(b.explicit) - Number(a.explicit))[0]];
  }
  let remaining = subtotal;
  const applied = chosen.map((c) => { const discountMinor = Math.min(c.discountMinor, remaining); remaining -= discountMinor; return { id: c.id, discountMinor }; }).filter((a) => a.discountMinor > 0);
  return { discountMinor: subtotal - remaining, applied };
}

export function checkoutTotals(items: Row[], delivery: Row, promotion: Row | Row[] | null, settings: Row, now = Date.now(), context: PromotionContext = {}): Row {
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
  let applied: { id: string; discountMinor: number }[] | null = null;
  if (promotion) {
    // A single promotion passed on its own is one the member entered.
    const list = Array.isArray(promotion) ? promotion : [{ explicit: true, ...promotion }];
    if (list.length) ({ discountMinor, applied } = applyPromotions(list, items, context, now));
  }
  const deliveryMinor = money(delivery.feeMinor ?? 0);
  const taxBps = money(settings.taxBps ?? 0, 'tax basis points');
  if (taxBps > 10000) throw new Error('The configured tax rate is invalid.');
  const taxMinor = Math.round((subtotalMinor - discountMinor) * taxBps / 10000);
  const totals: Row = { subtotalMinor, discountMinor, deliveryMinor, taxMinor, totalMinor: money(subtotalMinor - discountMinor + deliveryMinor + taxMinor), currency: settings.currency };
  if (applied && applied.length) totals.promotions = applied;
  return totals;
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
/** One variant attribute as written by staff ("Size" / "A3"), tidied for display. */
function attributePart(value: unknown): string {
  return String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f=;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
}

/** Variant attributes, bounded: at most 5 per variant, display casing kept. */
export function variantAttributes(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw as Row).slice(0, 5)) {
    const k = attributePart(key), v = attributePart(value);
    if (k && v) result[k] = v;
  }
  return result;
}

/**
 * The search token an attribute filter matches: `attr:size=a3`. Kept in the
 * product's existing `searchTokens` array so attribute filtering reuses the
 * search indexes rather than needing a new family of composite indexes.
 */
export function attributeToken(key: string, value: string): string {
  const norm = (text: string) => attributePart(text).toLocaleLowerCase();
  return `attr:${norm(key)}=${norm(value)}`;
}

/** Every attribute token across a product's variants. */
export function attributeTokens(variants: Row[]): string[] {
  const tokens = new Set<string>();
  for (const variant of variants) for (const [k, v] of Object.entries(variantAttributes(variant.attributes))) tokens.add(attributeToken(k, v));
  return [...tokens].slice(0, 50);
}

/** Adds a product's attributes to the store-wide facet list (bounded). */
export function mergeFacets(existing: Row | undefined, variants: Row[]): Record<string, string[]> {
  const facets: Record<string, string[]> = { ...((existing ?? {}) as Record<string, string[]>) };
  for (const variant of variants) {
    for (const [k, v] of Object.entries(variantAttributes(variant.attributes))) {
      const key = Object.keys(facets).find((existingKey) => existingKey.toLocaleLowerCase() === k.toLocaleLowerCase()) ?? k;
      if (!facets[key] && Object.keys(facets).length >= 12) continue;
      const values = facets[key] ?? [];
      if (!values.some((value) => value.toLocaleLowerCase() === v.toLocaleLowerCase()) && values.length < 24) facets[key] = [...values, v];
      else facets[key] = values;
    }
  }
  return facets;
}

export function safeCsv(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `"${value}"`;
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
