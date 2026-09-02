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
  where,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { StoredFile } from './audiobookUpload';

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

/* ------------------------------------------------------------ Audiobooks */

/**
 * Audiobooks the project publishes itself, curated here beside the app
 * directory.
 *
 * ── Why this is not a contribution ────────────────────────────────────────
 * Recording a book is not the act contributing a song is. There is a rights
 * holder, a narrator who is usually not the person uploading, a file that runs
 * to hours, and a licence somebody negotiated — none of which fits a phone form,
 * and all of which the community review queue would have to take on trust from
 * whoever pressed send. So audiobook contribution came off the phone and landed
 * where the apps collection is curated.
 *
 * ── Why the writes are callables ──────────────────────────────────────────
 * `publishedContent` is `allow write: if false` in firestore.rules: it is the
 * one collection the mobile app consumes, and nothing holding a browser session
 * writes into it. Reads are a different matter — staff may read unpublished
 * records — so the list below is an ordinary Firestore query, and only the two
 * mutations go through `publishAdminAudiobook` / `deleteAdminAudiobook`, which
 * validate the payload, mint the public media and leave an audit entry naming
 * the administrator who acted.
 */

/** What kind of recording this is. Travels as a tag, not as the destination. */
export const AUDIOBOOK_FORMATS = [
  'Audiobook',
  'Oral reading',
  'Spoken word',
  'Serial narration',
  'Other',
] as const;

/**
 * The same five answers the mobile contribution form offered, kept verbatim so
 * a filter written against contributed work still matches these records.
 */
export const AUDIOBOOK_DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'] as const;

/** Language codes, as the shared contract defines them. Mirrors the callable. */
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * The separator `publishAdminAudiobook` joins author and narrator with when it
 * builds the one artist line a player has room for. Written out here because
 * this file has to take that line apart again to fill the editor: the published
 * record keeps the joined string, not the two names.
 */
const NARRATED_BY = ' · narrated by ';

export interface LibraryAudiobook {
  /** Empty only for a record whose id has not been minted yet. */
  id: string;
  title: string;
  author: string;
  narrator: string;
  /** The shelf copy — what the Collection card and the player show. */
  description: string;
  /** The transcript or synopsis, where one exists. Optional, and often long. */
  body: string;
  category: string;
  dialect: string;
  language: string;
  /** The rights line. Blank means the callable writes its own default. */
  licenceDisplay: string;
  published: boolean;
  /** Read-only, minted server-side after a publish. */
  audioUrl: string;
  coverUrl: string;
  /** ISO, or blank for a record that has never been live. */
  publishedAt: string;
  /**
   * 'admin' for the records this panel made. Anything else came through
   * community review, and both callables refuse to touch it — so the panel says
   * so rather than offering buttons that are going to fail.
   */
  publicationRoute: string;
  removed: boolean;
}

/**
 * Splits the joined artist line back into the two people it names.
 *
 * The callable collapses the pair when they are the same person, so a line with
 * no separator means the author read their own book — which is why the narrator
 * falls back to the author rather than to empty. Getting that wrong would make
 * every self-narrated record fail its own validation the moment it was reopened.
 */
export function splitAudiobookAttribution(raw: string): { author: string; narrator: string } {
  const at = raw.indexOf(NARRATED_BY);
  if (at < 0) return { author: raw.trim(), narrator: raw.trim() };
  return { author: raw.slice(0, at).trim(), narrator: raw.slice(at + NARRATED_BY.length).trim() };
}

/** The format tag read back off a published record, folded to the listed one. */
function audiobookFormatFromTags(tags: unknown): string {
  const list = Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  for (const tag of list) {
    const match = AUDIOBOOK_FORMATS.find((format) => format.toLowerCase() === tag.toLowerCase());
    if (match) return match;
  }
  return 'Audiobook';
}

export function emptyAudiobook(): LibraryAudiobook {
  return {
    id: '',
    title: '',
    author: '',
    narrator: '',
    description: '',
    body: '',
    category: 'Audiobook',
    dialect: 'Navrongo',
    language: 'xsm',
    licenceDisplay: '',
    published: false,
    audioUrl: '',
    coverUrl: '',
    publishedAt: '',
    publicationRoute: 'admin',
    removed: false,
  };
}

/**
 * Mints the id a new audiobook will carry, before anything is uploaded.
 *
 * The narration is filed under `collection-audiobooks/{id}/…` and the callable
 * writes the record at that same id, so the two have to agree *before* the
 * first byte goes up. Letting the server allocate the id would mean uploading
 * to a temporary path and moving the files afterwards, which for a 400 MB
 * recording is a second full copy for no reason. The random suffix is what
 * keeps two books of the same name apart — a slug alone would have the second
 * "Nsoawa" silently overwrite the first.
 */
export function newAudiobookId(title: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 6);
  return `${slug(title, 'audiobook')}-${suffix}`;
}

/**
 * Everything wrong with this audiobook, as sentences somebody can act on.
 *
 * The narration is checked as a separate argument rather than as a field,
 * because it is not part of the record: it is a file that either finished
 * uploading or did not, and Save has to stay unavailable until it has. The
 * length ceilings mirror `publishAdminAudiobook` so an over-long synopsis is a
 * greyed-out button rather than an invalid-argument thrown back after the wait.
 */
export function audiobookProblems(book: LibraryAudiobook, audio: StoredFile | null): string[] {
  const problems: string[] = [];
  if (!book.title.trim()) problems.push('Give the audiobook a title.');
  if (book.title.trim().length > 180) problems.push('The title is longer than 180 characters.');
  if (!book.author.trim()) problems.push('Name the author, so the work is attributed.');
  if (!book.narrator.trim()) {
    problems.push('Name the narrator. If the author read it themselves, put their name here too.');
  }
  if (!book.description.trim()) {
    problems.push('Write the shelf description — it is what the Collection card shows.');
  }
  if (book.description.trim().length > 4000) {
    problems.push('The description is longer than 4000 characters. Put the long text in the body.');
  }
  if (book.licenceDisplay.trim().length > 300) {
    problems.push('The licence line is longer than 300 characters.');
  }
  if (!LANGUAGE_PATTERN.test(book.language.trim().toLowerCase())) {
    problems.push('Language must be a code such as xsm or en, not a language name.');
  }
  if (!audio) {
    problems.push('Choose the narration audio and let it finish uploading before saving.');
  }
  if (book.publicationRoute && book.publicationRoute !== 'admin') {
    problems.push('This record was published through community review and cannot be edited here.');
  }
  return problems;
}

/**
 * Every audiobook on the shelf, published or not.
 *
 * A single equality filter and no `orderBy`, sorted below instead: Firestore
 * indexes single fields on its own, and the moment a query pairs a filter with
 * a sort it needs a composite index deployed before it will run at all. This
 * repo keeps that dependency out of the console by convention — a few hundred
 * audiobooks sort in a millisecond in the browser.
 */
export async function listAudiobooks(): Promise<LibraryAudiobook[]> {
  const snapshot = await getDocs(
    query(collection(db, 'publishedContent'), where('collectionKind', '==', 'audiobooks')),
  );
  const books = snapshot.docs.map((entry) => {
    const data = entry.data() as Record<string, unknown>;
    const attribution = splitAudiobookAttribution(
      typeof data.sourceAttribution === 'string' ? data.sourceAttribution : '',
    );
    const book: LibraryAudiobook = {
      id: entry.id,
      title: typeof data.title === 'string' ? data.title : '',
      author: attribution.author,
      narrator: attribution.narrator,
      description: typeof data.description === 'string' ? data.description : '',
      body: typeof data.body === 'string' ? data.body : '',
      category: audiobookFormatFromTags(data.tags),
      dialect: typeof data.dialect === 'string' && data.dialect ? data.dialect : 'Not sure',
      language: typeof data.language === 'string' && data.language ? data.language : 'xsm',
      licenceDisplay: typeof data.licenceDisplay === 'string' ? data.licenceDisplay : '',
      published: data.publicationStatus === 'published',
      audioUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : '',
      coverUrl: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : '',
      publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : '',
      publicationRoute:
        typeof data.publicationRoute === 'string' ? data.publicationRoute : 'reviewed',
      removed: data.correctionState === 'removed',
    };
    return book;
  });
  // ISO strings compare the way the dates they encode do, so nothing is parsed.
  // A record that has never been live has no publishedAt and sorts to the
  // bottom, which is where a draft belongs on a shelf.
  books.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return books;
}

interface PublishAudiobookPayload {
  audiobookId: string | null;
  title: string;
  author: string;
  narrator: string;
  description: string;
  body: string;
  category: string;
  dialect: string;
  language: string;
  licenceDisplay: string;
  audio: StoredFile;
  cover: StoredFile | null;
  published: boolean;
}

export interface PublishAudiobookResult {
  id: string;
  /**
   * False when the record was written but copying the narration into the public
   * path failed. The callable reports that rather than throwing, because the
   * publish is idempotent: saving the same record again retries the copy. The
   * panel repeats the distinction instead of claiming a clean success.
   */
  mediaPublished: boolean;
}

/** Publishes or rewrites one audiobook. Idempotent on the id it is given. */
export async function publishAudiobook(
  book: LibraryAudiobook,
  audio: StoredFile,
  cover: StoredFile | null,
): Promise<PublishAudiobookResult> {
  const call = httpsCallable<PublishAudiobookPayload, PublishAudiobookResult>(
    functions,
    'publishAdminAudiobook',
  );
  const result = await call({
    audiobookId: book.id || null,
    title: book.title.trim(),
    author: book.author.trim(),
    narrator: book.narrator.trim(),
    description: book.description.trim(),
    body: book.body.trim(),
    category: book.category,
    dialect: book.dialect,
    language: book.language.trim().toLowerCase(),
    licenceDisplay: book.licenceDisplay.trim(),
    audio,
    cover,
    published: book.published,
  });
  return { id: result.data.id, mediaPublished: result.data.mediaPublished !== false };
}

/**
 * Takes an audiobook off the shelf.
 *
 * Named for what it does rather than for the callable behind it: the server
 * unpublishes the record and marks it removed, and never deletes it. Somebody
 * who downloaded a chapter should not have their library rewritten because a
 * document vanished, and the audit trail has to keep pointing at something.
 */
export async function unpublishAudiobook(audiobookId: string): Promise<void> {
  const call = httpsCallable<{ audiobookId: string }, { id: string }>(
    functions,
    'deleteAdminAudiobook',
  );
  await call({ audiobookId });
}
