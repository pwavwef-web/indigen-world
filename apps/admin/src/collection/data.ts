import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * The two catalogues behind the Collection tab's Apps and Shop cards.
 *
 * Both are plain admin-curated lists rather than anything transactional. An
 * app entry is a link out to a store; a product is a thing somebody can ask to
 * buy. No payment is taken anywhere in the app — an order is a request that a
 * person answers — which is deliberate: taking money would drag PCI scope,
 * refunds and chargebacks into a cultural archive, and the volumes here do not
 * justify any of it.
 */

/** Where an app entry sends somebody. */
export const APP_PLATFORMS = ['android', 'ios', 'web'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

export const APP_CATEGORIES = [
  'Kasem',
  'Scripture',
  'Indigen World',
  'Language tools',
  'Community',
  'Other',
] as const;

export interface DirectoryApp {
  id: string;
  name: string;
  developer: string;
  description: string;
  category: string;
  iconUrl: string;
  /** Store or web link per platform. At least one is required. */
  links: Partial<Record<AppPlatform, string>>;
  order: number;
  published: boolean;
}

export const PRODUCT_CATEGORIES = [
  'Souvenirs',
  'Books',
  'Shea butter',
  'Textiles',
  'Crafts',
  'Music',
  'Other',
] as const;

export interface ShopProduct {
  id: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  /** Minor units (pesewas) so no price is ever a floating-point number. */
  priceMinor: number;
  currency: string;
  imageUrl: string;
  /** Blank means "ask us" rather than zero. */
  maker: string;
  inStock: boolean;
  order: number;
  published: boolean;
}

export type OrderStatus = 'requested' | 'contacted' | 'fulfilled' | 'cancelled';

export interface ShopOrderItem {
  productId: string;
  name: string;
  quantity: number;
  priceMinor: number;
  currency: string;
}

export interface ShopOrder {
  id: string;
  uid: string;
  contact: string;
  note: string;
  status: OrderStatus;
  items: ShopOrderItem[];
  totalMinor: number;
  currency: string;
  createdAt: Timestamp | null;
}

export const ORDER_STATUSES: { id: OrderStatus; label: string }[] = [
  { id: 'requested', label: 'Requested' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'fulfilled', label: 'Fulfilled' },
  { id: 'cancelled', label: 'Cancelled' },
];

/** Money as a person reads it. Stored in minor units, shown in major ones. */
export function formatPrice(priceMinor: number, currency: string): string {
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) return 'Ask for a price';
  return `${currency} ${(priceMinor / 100).toFixed(2)}`;
}

export function emptyApp(order: number): DirectoryApp {
  return {
    id: '',
    name: '',
    developer: '',
    description: '',
    category: 'Kasem',
    iconUrl: '',
    links: {},
    order,
    published: false,
  };
}

export function emptyProduct(order: number): ShopProduct {
  return {
    id: '',
    name: '',
    summary: '',
    description: '',
    category: 'Souvenirs',
    priceMinor: 0,
    currency: 'GHS',
    imageUrl: '',
    maker: '',
    inStock: true,
    order,
    published: false,
  };
}

export function slug(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

/** Only http(s) links are stored — a store link is opened on a member's phone. */
export function badLink(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol !== 'https:' && url.protocol !== 'http:';
  } catch {
    return true;
  }
}

export function appProblems(app: DirectoryApp): string[] {
  const problems: string[] = [];
  if (!app.name.trim()) problems.push('Give the app a name.');
  const links = Object.values(app.links).filter((link) => (link ?? '').trim().length > 0);
  if (links.length === 0) problems.push('Add at least one store or web link.');
  for (const [platform, link] of Object.entries(app.links)) {
    if (badLink(link ?? '')) problems.push(`The ${platform} link must be a complete https link.`);
  }
  if (badLink(app.iconUrl)) problems.push('The icon URL must be a complete https link.');
  return problems;
}

export function productProblems(product: ShopProduct): string[] {
  const problems: string[] = [];
  if (!product.name.trim()) problems.push('Give the product a name.');
  if (!product.summary.trim()) problems.push('Add a one-line summary.');
  if (product.priceMinor < 0) problems.push('The price cannot be negative.');
  if (!/^[A-Z]{3}$/.test(product.currency)) problems.push('Use a three-letter currency code.');
  if (badLink(product.imageUrl)) problems.push('The image URL must be a complete https link.');
  return problems;
}

/* ------------------------------------------------------------------- Apps */

export async function listApps(): Promise<DirectoryApp[]> {
  const snapshot = await getDocs(query(collection(db, 'collectionApps'), orderBy('order')));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<DirectoryApp>;
    return {
      id: entry.id,
      name: data.name ?? '',
      developer: data.developer ?? '',
      description: data.description ?? '',
      category: data.category ?? 'Other',
      iconUrl: data.iconUrl ?? '',
      links: (data.links ?? {}) as DirectoryApp['links'],
      order: typeof data.order === 'number' ? data.order : 0,
      published: data.published === true,
    };
  });
}

export async function saveApp(app: DirectoryApp): Promise<void> {
  const id = app.id || slug(app.name, 'app');
  const links: DirectoryApp['links'] = {};
  for (const platform of APP_PLATFORMS) {
    const link = app.links[platform]?.trim();
    if (link) links[platform] = link;
  }
  await setDoc(
    doc(db, 'collectionApps', id),
    {
      id,
      name: app.name.trim(),
      developer: app.developer.trim(),
      description: app.description.trim(),
      category: app.category,
      iconUrl: app.iconUrl.trim(),
      links,
      order: Math.max(0, Math.round(app.order)),
      published: app.published,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteApp(id: string): Promise<void> {
  await deleteDoc(doc(db, 'collectionApps', id));
}

/* --------------------------------------------------------------- Products */

export async function listProducts(): Promise<ShopProduct[]> {
  const snapshot = await getDocs(query(collection(db, 'shopProducts'), orderBy('order')));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<ShopProduct>;
    return {
      id: entry.id,
      name: data.name ?? '',
      summary: data.summary ?? '',
      description: data.description ?? '',
      category: data.category ?? 'Other',
      priceMinor: typeof data.priceMinor === 'number' ? data.priceMinor : 0,
      currency: data.currency ?? 'GHS',
      imageUrl: data.imageUrl ?? '',
      maker: data.maker ?? '',
      inStock: data.inStock !== false,
      order: typeof data.order === 'number' ? data.order : 0,
      published: data.published === true,
    };
  });
}

export async function saveProduct(product: ShopProduct): Promise<void> {
  const id = product.id || slug(product.name, 'product');
  await setDoc(
    doc(db, 'shopProducts', id),
    {
      id,
      name: product.name.trim(),
      summary: product.summary.trim(),
      description: product.description.trim(),
      category: product.category,
      priceMinor: Math.max(0, Math.round(product.priceMinor)),
      currency: product.currency.trim().toUpperCase(),
      imageUrl: product.imageUrl.trim(),
      maker: product.maker.trim(),
      inStock: product.inStock,
      order: Math.max(0, Math.round(product.order)),
      published: product.published,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, 'shopProducts', id));
}

/* ------------------------------------------------------- Kassena heroes */

export const HERO_FIELDS = [
  'Chief',
  'Elder',
  'Linguist',
  'Musician',
  'Writer',
  'Educator',
  'Athlete',
  'Other',
] as const;

export interface KasemHero {
  id: string;
  name: string;
  /** A praise name, a title, a stage name - whatever else they are known by. */
  alsoKnownAs: string;
  /**
   * Free text rather than dates. Much of what is known is approximate, and a
   * date picker would force somebody to invent precision.
   */
  era: string;
  field: string;
  summary: string;
  story: string;
  birthplace: string;
  portraitUrl: string;
  /** Where the account came from, so a claim can be checked. */
  sourceUrl: string;
  order: number;
  published: boolean;
}

export async function listHeroes(): Promise<KasemHero[]> {
  const snapshot = await getDocs(query(collection(db, 'kasemHeroes'), orderBy('order')));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<KasemHero>;
    return {
      id: entry.id,
      name: data.name ?? '',
      alsoKnownAs: data.alsoKnownAs ?? '',
      era: data.era ?? '',
      field: data.field ?? 'Other',
      summary: data.summary ?? '',
      story: data.story ?? '',
      birthplace: data.birthplace ?? '',
      portraitUrl: data.portraitUrl ?? '',
      sourceUrl: data.sourceUrl ?? '',
      order: typeof data.order === 'number' ? data.order : 0,
      published: data.published === true,
    };
  });
}

export async function saveHero(hero: KasemHero, id: string): Promise<void> {
  await setDoc(
    doc(db, 'kasemHeroes', id),
    {
      id,
      name: hero.name.trim(),
      alsoKnownAs: hero.alsoKnownAs.trim(),
      era: hero.era.trim(),
      field: hero.field,
      summary: hero.summary.trim(),
      story: hero.story.trim(),
      birthplace: hero.birthplace.trim(),
      portraitUrl: hero.portraitUrl.trim(),
      sourceUrl: hero.sourceUrl.trim(),
      order: hero.order,
      published: hero.published,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteHero(id: string): Promise<void> {
  await deleteDoc(doc(db, 'kasemHeroes', id));
}

/* -------------------------------------------------------- Kassena names */

export const NAME_KINDS = ['given', 'clan', 'place'] as const;
export type NameKind = (typeof NAME_KINDS)[number];

export interface KasemNameEntry {
  id: string;
  /** As it is properly written. */
  name: string;
  /** The folded form a handle can hold. Derived, never typed. */
  ascii: string;
  meaning: string;
  kind: NameKind;
  order: number;
  published: boolean;
}

/**
 * The ASCII a handle can hold, from a name written properly.
 *
 * Written here and **stored** on the document, so the mobile client and the
 * handle-claim callable both read the same string instead of each deriving one.
 * If they derived their own and disagreed by a single letter, somebody would
 * claim a name and then not get the ring for it.
 */
export function foldKasemToAscii(raw: string): string {
  return Array.from(raw.toLowerCase().normalize('NFD'))
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x025b || code === 0x0259 || code === 0x0246) return 'e';
      if (code === 0x0254) return 'o';
      if (code === 0x014b) return 'ng';
      if (code === 0x028b) return 'v';
      if (code === 0x0269 || code === 0x026a) return 'i';
      if (code >= 0x0300 && code <= 0x036f) return '';
      return char;
    })
    .join('')
    .replace(/[^a-z0-9_]/g, '');
}

export async function listKasemNames(): Promise<KasemNameEntry[]> {
  const snapshot = await getDocs(query(collection(db, 'kasemNames'), orderBy('order')));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<KasemNameEntry>;
    const name = data.name ?? '';
    return {
      id: entry.id,
      name,
      ascii: data.ascii || foldKasemToAscii(name),
      meaning: data.meaning ?? '',
      kind: (NAME_KINDS as readonly string[]).includes(String(data.kind))
        ? (data.kind as NameKind)
        : 'given',
      order: typeof data.order === 'number' ? data.order : 0,
      published: data.published === true,
    };
  });
}

export async function saveKasemName(entry: KasemNameEntry, id: string): Promise<void> {
  await setDoc(
    doc(db, 'kasemNames', id),
    {
      id,
      name: entry.name.trim(),
      ascii: foldKasemToAscii(entry.name),
      meaning: entry.meaning.trim(),
      kind: entry.kind,
      order: entry.order,
      published: entry.published,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteKasemName(id: string): Promise<void> {
  await deleteDoc(doc(db, 'kasemNames', id));
}

/* ----------------------------------------------------------------- Orders */

export async function listOrders(): Promise<ShopOrder[]> {
  const snapshot = await getDocs(
    query(collection(db, 'shopOrders'), orderBy('createdAt', 'desc')),
  );
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<ShopOrder> & { createdAt?: Timestamp };
    return {
      id: entry.id,
      uid: data.uid ?? '',
      contact: data.contact ?? '',
      note: data.note ?? '',
      status: (data.status as OrderStatus) ?? 'requested',
      items: Array.isArray(data.items) ? data.items : [],
      totalMinor: typeof data.totalMinor === 'number' ? data.totalMinor : 0,
      currency: data.currency ?? 'GHS',
      createdAt: data.createdAt ?? null,
    };
  });
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await updateDoc(doc(db, 'shopOrders', id), { status, updatedAt: serverTimestamp() });
}
