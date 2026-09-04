import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Unfurling a link somebody pasted into a post.
 *
 * ── Why the server does this and not the phone ────────────────────────────
 * A link card is a picture, a headline and a sentence read out of somebody
 * else's web page. Fetching that page is a metered, slow, failure-prone thing
 * to do, and if every phone did it for itself the same article shared to a
 * community of five hundred people would be fetched five hundred times over
 * rural data — for one card. Done here it is fetched once, written to
 * `linkPreviews`, and every phone afterwards reads a document the size of a
 * paragraph.
 *
 * It also keeps three things off the handset that have no business there: the
 * member's IP address (a card should not tell a stranger's tracker where the
 * reader lives), a full HTML parser, and the redirect chain — which is exactly
 * the surface a malicious link would use to make a phone fetch something it
 * was never asked to.
 *
 * ── What this deliberately is not ─────────────────────────────────────────
 * It is not a crawler. It reads one page, follows a handful of redirects, and
 * stops at the first half-megabyte. It identifies itself honestly in the
 * User-Agent with somewhere to complain, and a site that says no gets a plain
 * link chip on the card instead of a picture — never a retry from a different
 * disguise.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

const CALLABLE_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
  memory: '256MiB' as const,
  timeoutSeconds: 30,
};

export const LINK_PREVIEW_COLLECTION = 'linkPreviews';

/**
 * How much of a page is read before the reader gives up.
 *
 * Everything this needs lives in `<head>`, which is the first few kilobytes of
 * every well-formed document; half a megabyte is a generous allowance for the
 * inline scripts some sites put in front of it, and a hard stop for the ones
 * that stream a hundred megabytes of anything.
 */
const MAX_BODY_BYTES = 512 * 1024;

/** How much of what was read is handed to the tag parsers. See `parseableHead`. */
const PARSE_LIMIT_BYTES = 128 * 1024;

/** One page, one connection, one honest wait. */
const FETCH_TIMEOUT_MS = 8_000;

/**
 * The whole redirect chain's budget.
 *
 * Five hops at eight seconds each is forty, and the callable itself is killed
 * at thirty — so a slow chain used to end as a platform timeout, with no
 * `failed` record written and therefore every reader of that post trying the
 * same dead link again. The chain now gives up with time left to write down
 * that it did.
 */
const TOTAL_BUDGET_MS = 20_000;

/** Enough for the shortener, the https bump and the canonical host, no more. */
const MAX_REDIRECTS = 4;

/** How long a card stands before it is read again. */
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a refusal stands.
 *
 * Shorter than a success on purpose: a site that was down, rate-limiting or
 * mid-deploy should get another chance the same day, and a site that means it
 * costs one fetch every six hours rather than one per reader.
 */
const FAILED_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Said plainly, with somewhere to complain.
 *
 * Every unfurler on the internet announces itself — `facebookexternalhit`,
 * `Twitterbot`, `Slackbot-LinkExpanding` — because a site operator has a right
 * to know who is reading them and to say no in robots.txt or at the edge.
 * Pretending to be a browser to get a better hit rate is the one thing this
 * will not do.
 */
const USER_AGENT =
  'Mozilla/5.0 (compatible; IndigenWorldBot/1.0; +https://indigenworld.com/bot)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Query parameters that identify the *sharer* rather than the page.
 *
 * Dropped before the cache key is taken, so the same article shared by twenty
 * people through twenty different campaign tags is one document and one fetch
 * rather than twenty — and so the key never carries somebody's click id.
 */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'ref_url',
  's_cid',
  'twclid',
  'yclid',
  '_ga',
  '_gl',
]);

const TITLE_LIMIT = 160;
const DESCRIPTION_LIMIT = 320;

export type LinkPreviewStatus = 'ok' | 'bare' | 'failed';

export interface LinkPreviewRecord {
  url: string;
  host: string;
  canonicalUrl: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: LinkPreviewStatus;
  fetchedAt: number;
}

// ── The cache key ───────────────────────────────────────────────────────────

/**
 * The one form of a link that both this and the phone agree on.
 *
 * Built from parts rather than by handing the string back to a URL printer,
 * because the phone's printer and this one disagree about small things — an
 * empty path, a default port — and every disagreement would be a cache the
 * phone could never hit. The same rules, in the same order, live in
 * `apps/mobile/lib/features/community/data/link_preview.dart`, and a Dart test
 * pins them.
 *
 * If the two ever do drift, the cost is a cache miss and a second call, never
 * a wrong card: the phone reads a document that is not there, asks for the
 * link, and this hands back the one it computed for itself.
 */
export function normaliseLinkUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new HttpsError('invalid-argument', 'That is not a link.');
  }
  const scheme = parsed.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new HttpsError('invalid-argument', 'Only web links can be previewed.');
  }
  // A link carrying credentials is either a mistake or a trap, and either way
  // is not something to fetch on somebody's behalf.
  if (parsed.username || parsed.password) {
    throw new HttpsError('invalid-argument', 'That link cannot be previewed.');
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new HttpsError('invalid-argument', 'That is not a link.');

  const defaultPort = scheme === 'https' ? '443' : '80';
  const port = parsed.port && parsed.port !== defaultPort ? ':' + parsed.port : '';
  const path = parsed.pathname || '/';
  const query = keepableQuery(parsed.search);

  return scheme + '://' + host + port + path + query;
}

/** The query minus the parts that describe the sharer. Order is preserved. */
function keepableQuery(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return '';
  const kept = raw.split('&').filter((pair) => {
    if (!pair) return false;
    const name = pair.split('=')[0].toLowerCase();
    return !name.startsWith('utm_') && !TRACKING_PARAMS.has(name);
  });
  return kept.length ? '?' + kept.join('&') : '';
}

/** The document a normalised link is cached under. */
export function linkPreviewKey(normalisedUrl: string): string {
  return createHash('sha256').update(normalisedUrl).digest('hex');
}

// ── Not fetching the inside of our own network ──────────────────────────────

/**
 * Whether an address belongs to the public internet.
 *
 * A link preview is the textbook server-side request forgery: a stranger hands
 * the backend a URL and the backend fetches it from the backend's own network
 * position. `http://169.254.169.254/` is the metadata service of the machine
 * this runs on; `http://10.x` is whatever else is in the project. Neither is a
 * web page, and neither may be read on a stranger's say-so.
 */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return isPublicIPv4(address);
  if (isIPv6(address)) return isPublicIPv6(address);
  return false;
}

/**
 * The eight 16-bit groups of an IPv6 address, however it was spelled.
 *
 * `::1`, `0:0:0:0:0:0:0:1` and `0000::0001` are three spellings of the address
 * that means "this machine", and `::ffff:127.0.0.1` is a fourth. A check that
 * pattern-matched the text would catch whichever spellings its author happened
 * to think of and wave the rest straight through to the loopback interface —
 * so the address is turned into numbers before anything is decided about it.
 */
export function expandIPv6(address: string): number[] | null {
  let text = address.toLowerCase();

  // A trailing dotted quad: ::ffff:127.0.0.1 and its long-hand spellings.
  let quadGroups: number[] = [];
  const dotted = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (dotted) {
    const quad = dotted[2].split('.').map((part) => Number.parseInt(part, 10));
    if (quad.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    quadGroups = [(quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3]];
    text = dotted[1].slice(0, -1); // drop the ':' that introduced the quad
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parse = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const piece of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      out.push(Number.parseInt(piece, 16));
    }
    return out;
  };

  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if (head === null || tail === null) return null;

  const known = [...head, ...tail, ...quadGroups];
  if (halves.length === 1) return known.length === 8 ? known : null;
  if (known.length >= 8) return null;
  return [
    ...head,
    ...new Array<number>(8 - known.length).fill(0),
    ...tail,
    ...quadGroups,
  ];
}

function isPublicIPv6(address: string): boolean {
  const groups = expandIPv6(address);
  if (groups === null) return false;

  const [first, second] = groups;
  const zeroPrefix = groups.slice(0, 5).every((group) => group === 0);
  // ::ffff:0:0/96 — an IPv4 address wearing an IPv6 coat is still that address.
  if (zeroPrefix && groups[5] === 0xffff) {
    const quad = [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join('.');
    return isPublicIPv4(quad);
  }
  if (zeroPrefix && groups[5] === 0) return false; // ::/96, which holds :: and ::1
  if ((first & 0xfe00) === 0xfc00) return false; // unique-local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (first === 0x2002) return false; // 6to4, which carries an embedded v4
  if (first === 0x0064 && second === 0xff9b) return false; // NAT64
  return true;
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false; // link-local, and the metadata service
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false; // 192.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

/**
 * Refuses a hop whose host resolves anywhere but the public internet.
 *
 * Checked at every hop rather than once at the start, because a redirect is
 * the easy way round a check that only looked at the link somebody pasted.
 *
 * A name that resolves publicly here and privately a moment later during the
 * fetch itself is not defended against — that is DNS rebinding, and closing it
 * properly means pinning the resolved address into the connection, which the
 * platform's fetch does not expose. What is left is one unauthenticated GET
 * whose response never reaches the person who asked for it, which is the trade
 * every unfurler makes.
 */
async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '');
  const refuse = (): never => {
    throw new HttpsError('invalid-argument', 'That link cannot be previewed.');
  };

  if (isIPv4(host) || isIPv6(host)) {
    if (!isPublicAddress(host)) refuse();
    return;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    refuse();
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpsError('not-found', 'That link could not be reached.');
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    refuse();
  }
}

// ── Reading the page ────────────────────────────────────────────────────────

/** At most [MAX_BODY_BYTES] of the response, decoded with its own charset. */
async function readCappedBody(response: Response, contentType: string): Promise<string> {
  const body = response.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const joined = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= joined.length) break;
    const room = joined.length - offset;
    joined.set(chunk.length > room ? chunk.subarray(0, room) : chunk, offset);
    offset += Math.min(chunk.length, room);
  }

  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  for (const label of [declared, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label, { fatal: false }).decode(joined);
    } catch {
      // An unknown charset label is not worth failing the whole card over.
    }
  }
  return '';
}

/**
 * The tag scanners, and why every one of them is bounded.
 *
 * `[^>]*` looks harmless and is not: at each `<meta` the engine scans forward
 * for a `>`, and against a page of twenty thousand `<meta` with no `>` between
 * them that is the whole document walked twenty thousand times. Whoever posts
 * the link chooses the page, so "no page would do that" is not an argument.
 *
 * 2 KB is far past any tag worth reading — the longest thing taken out of one
 * is a description, capped at 320 characters — and it turns the worst case from
 * quadratic into linear-with-a-small-constant.
 */
const META_TAG = /<meta\b[^>]{0,2048}>/gi;
const TAG_ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const LINK_TAG = /<link\b[^>]{0,2048}>/gi;

/**
 * The text of the first `<title>`, found by scanning rather than by matching.
 *
 * A lazy `([\s\S]*?)<\/title>` is the same trap as above and worse: with no
 * closing tag anywhere, every `<title` in the document scans to the end of it.
 * Four plain forward searches cannot do that.
 */
function titleText(html: string): string | null {
  const lower = html.toLowerCase();
  const tag = lower.indexOf('<title');
  if (tag < 0) return null;
  const open = lower.indexOf('>', tag);
  if (open < 0) return null;
  const close = lower.indexOf('</title', open);
  if (close < 0) return null;
  return html.slice(open + 1, close);
}

/** The named entities a page title actually contains, plus numeric escapes. */
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    mdash: '—',
    ndash: '–',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    const token = body.toLowerCase();
    if (token.startsWith('#x')) return fromCodePoint(token.slice(2), 16) ?? whole;
    if (token.startsWith('#')) return fromCodePoint(token.slice(1), 10) ?? whole;
    return named[token] ?? whole;
  });
}

/**
 * One character from a numeric escape, or null if it does not name one.
 *
 * The range check is not tidiness. `String.fromCodePoint` *throws* above
 * U+10FFFF, so `&#99999999;` on any page anywhere would have taken the whole
 * callable down with an uncaught RangeError; and between U+D800 and U+DFFF it
 * returns half of a surrogate pair, which is not a character at all — Firestore
 * rejects a string containing one, and the reply to the phone would carry text
 * that cannot be encoded.
 */
function fromCodePoint(digits: string, radix: number): string | null {
  const code = Number.parseInt(digits, radix);
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  return String.fromCodePoint(code);
}

function tidy(value: string | null | undefined, limit: number): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= limit) return text;

  let cut = text.slice(0, limit - 1);
  // A headline can end on an emoji, and slicing by code unit can land between
  // its two halves — leaving a lone surrogate, which Firestore will not store.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trimEnd() + '…';
}

function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  TAG_ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_ATTRIBUTE.exec(tag)) !== null) {
    const name = match[1].toLowerCase();
    if (!(name in attributes)) {
      attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return attributes;
}

/**
 * Every `<meta>` key a page offers, first value wins.
 *
 * `property` before `name` because that is the order Open Graph and the
 * Twitter card spec use, and `itemprop` last for the microdata-only pages.
 */
export function readMetaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  META_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = META_TAG.exec(html)) !== null) {
    const attributes = attributesOf(match[0]);
    const key = (
      attributes.property ??
      attributes.name ??
      attributes.itemprop ??
      ''
    ).toLowerCase();
    const content = attributes.content;
    if (!key || content === undefined) continue;
    if (!tags.has(key)) tags.set(key, content);
  }
  return tags;
}

function canonicalHref(html: string): string | null {
  LINK_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_TAG.exec(html)) !== null) {
    const attributes = attributesOf(match[0]);
    if ((attributes.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')) {
      return attributes.href ?? null;
    }
  }
  return null;
}

/** An absolute `http(s)` address for [href], or null if it is not one. */
function absoluteUrl(href: string | null | undefined, base: URL): string | null {
  if (!href) return null;
  let resolved: URL;
  try {
    resolved = new URL(decodeEntities(href.trim()), base);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
  // The phone is what loads this one, so the check is about what a handset
  // would be pointed at rather than about this machine: a card must never make
  // somebody fetch their own router.
  const host = resolved.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return null;
  if ((isIPv4(host) || isIPv6(host)) && !isPublicAddress(host)) return null;
  return resolved.toString();
}

function bareHost(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

/**
 * The part of a document the tags are actually in.
 *
 * Everything read here is declared in `<head>`, so the rest of a page is dead
 * weight — and worse than dead weight against a hostile one. `TITLE_TAG` scans
 * forward from each `<title` for a closing tag, so a page carrying ten thousand
 * unclosed `<title` and half a megabyte of filler makes the regex engine walk
 * the whole document ten thousand times. Bounding what is handed to the parsers
 * turns that from minutes of CPU into milliseconds, and costs nothing real: a
 * page that has not declared its Open Graph tags within 128 KB of its own start
 * has not declared them.
 */
function parseableHead(html: string): string {
  const closed = html.search(/<\/head\s*>/i);
  const end = closed >= 0 ? closed : Math.min(html.length, PARSE_LIMIT_BYTES);
  return html.slice(0, Math.min(end, PARSE_LIMIT_BYTES));
}

/** What a fetched page says about itself. */
export function previewFromHtml(
  raw: string,
  finalUrl: URL,
): Omit<LinkPreviewRecord, 'fetchedAt'> {
  const html = parseableHead(raw);
  const meta = readMetaTags(html);
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta.get(key);
      if (value && value.trim()) return value;
    }
    return null;
  };

  const title =
    tidy(pick('og:title', 'twitter:title'), TITLE_LIMIT) ??
    tidy(titleText(html), TITLE_LIMIT);
  const description = tidy(
    pick('og:description', 'twitter:description', 'description'),
    DESCRIPTION_LIMIT,
  );
  const imageUrl = absoluteUrl(
    pick(
      'og:image:secure_url',
      'og:image:url',
      'og:image',
      'twitter:image',
      'twitter:image:src',
    ),
    finalUrl,
  );
  const siteName = tidy(pick('og:site_name', 'application-name'), 80);
  const canonicalUrl =
    absoluteUrl(pick('og:url'), finalUrl) ?? absoluteUrl(canonicalHref(html), finalUrl);

  return {
    url: finalUrl.toString(),
    host: bareHost(finalUrl),
    canonicalUrl,
    title,
    description,
    imageUrl,
    siteName,
    // "bare" is a page that answered but told us nothing worth drawing. The
    // phone shows the plain chip for it, and — the point of keeping it apart
    // from a failure — does not ask again tomorrow.
    status: title || imageUrl || description ? 'ok' : 'bare',
  };
}

/** Follows [target] to a page and reads what it says about itself. */
async function readPreview(target: URL): Promise<Omit<LinkPreviewRecord, 'fetchedAt'>> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);

    const left = deadline - Date.now();
    if (left <= 0) {
      throw new HttpsError('deadline-exceeded', 'That link took too long to answer.');
    }

    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left)),
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'en',
        },
      });
    } catch (error) {
      logger.debug('link preview fetch failed', { url: current.toString(), error });
      throw new HttpsError('unavailable', 'That link could not be reached.');
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        break;
      }
      // A `Location:` naming anything but the web is a page trying to point
      // this at something that is not a page. `assertPublicHost` would refuse
      // most of them by accident, on a hostname it could not resolve; saying so
      // here means it is refused on purpose.
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new HttpsError('invalid-argument', 'That link cannot be previewed.');
      }
      current = next;
      continue;
    }

    if (response.status >= 400) {
      throw new HttpsError('not-found', 'That link could not be read.');
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.startsWith('image/')) {
      // A link straight to a photograph is its own preview.
      return {
        url: current.toString(),
        host: bareHost(current),
        canonicalUrl: null,
        title: null,
        description: null,
        imageUrl: current.toString(),
        siteName: null,
        status: 'ok',
      };
    }
    if (contentType && !contentType.includes('html') && !contentType.includes('xml')) {
      return {
        url: current.toString(),
        host: bareHost(current),
        canonicalUrl: null,
        title: null,
        description: null,
        imageUrl: null,
        siteName: null,
        status: 'bare',
      };
    }

    const html = await readCappedBody(response, contentType);
    return previewFromHtml(html, current);
  }

  throw new HttpsError('unavailable', 'That link redirects too many times.');
}

// ── The callable ────────────────────────────────────────────────────────────

/** Whether a stored card is young enough to hand back without a fetch. */
function isFresh(record: LinkPreviewRecord): boolean {
  const stamped = typeof record.fetchedAt === 'number' ? record.fetchedAt : 0;
  const age = Date.now() - stamped;
  return age >= 0 && age < (record.status === 'failed' ? FAILED_TTL_MS : OK_TTL_MS);
}

/**
 * The card for one link, from the cache when there is one.
 *
 * The phone reads `linkPreviews/{key}` itself first and only calls this on a
 * miss, so a link that has been shared before costs a document read and no
 * invocation at all. This exists for the first person to share something, and
 * for the week-old card that is due another look.
 */
export const fetchLinkPreview = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = requireAuth(request);
  const raw = (request.data as { url?: unknown } | undefined)?.url;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new HttpsError('invalid-argument', 'A link is required.');
  }

  const url = normaliseLinkUrl(raw);
  const key = linkPreviewKey(url);
  const db = getFirestore();
  const ref = db.collection(LINK_PREVIEW_COLLECTION).doc(key);

  const cached = await ref.get();
  const stored = cached.exists ? (cached.data() as LinkPreviewRecord | undefined) : undefined;
  if (stored && isFresh(stored)) return { ...stored };

  // Sixty links a minute is far past reading and well short of a crawl.
  await consumeRateLimit('fetchLinkPreview', uid, 60, 60_000);

  const now = Date.now();
  let record: LinkPreviewRecord;
  try {
    record = { ...(await readPreview(new URL(url))), fetchedAt: now };
  } catch (error) {
    // A refusal is written down too. Without that, a link to something that no
    // longer exists is fetched again by every single reader of the post.
    record = {
      url,
      host: bareHost(new URL(url)),
      canonicalUrl: null,
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
      status: 'failed',
      fetchedAt: now,
    };
    logger.debug('link preview unavailable', { url, error });
  }

  try {
    await ref.set(record);
  } catch (error) {
    // The card is already in hand; failing to cache it is not worth failing on.
    logger.warn('link preview not cached', { url, error });
  }
  return { ...record };
});
