import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Letting a member who is already here take a Kassena name.
 *
 * ── Why this is a callable ────────────────────────────────────────────────
 * A handle is frozen after creation, and for good reasons: it is how people
 * find each other, and a community where names move is a community where
 * impersonation is easy. But freezing it also meant the kente ring could only
 * ever be earned by somebody signing up *after* the ring existed — everybody
 * already in the community was locked out of it permanently, which is the
 * opposite of what a reward for taking a Kassena name is for.
 *
 * So: exactly one change, and only ever to a name on the curated list. A rename
 * touches the profile and the uniqueness registry together and must not leave
 * a handle owned by nobody or by two people, which is what a transaction with
 * admin credentials is for.
 *
 * Old posts do not need rewriting. The feed already prefers the live profile
 * over the stamp on a post for the name, handle, picture and mark — that is what
 * makes a change of photograph appear on year-old posts — so a changed handle
 * shows everywhere the moment it is written. The frozen copy inside a *quote*
 * keeps the old handle on purpose, because a quote is a snapshot of what was
 * said at the time.
 */

const HANDLE_SHAPE = /^[a-z][a-z0-9_]{2,19}$/;

/** Handles the platform speaks under, which no member may take. */
const RESERVED = new Set([
  'kawuri',
  'indigen',
  'indigenworld',
  'admin',
  'support',
  'help',
  'staff',
  'official',
  'moderator',
]);

const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * The ASCII a handle can hold, from a name written properly.
 *
 * Must fold exactly as the mobile client does — the client decides which
 * avatars wear a ring, and this decides which handles may be taken. If the two
 * disagree, somebody claims a name and then does not get the ring for it.
 */
export function foldKasemToAscii(raw: string): string {
  return Array.from(
    // Decomposing first turns every precomposed accented vowel into its base
    // letter plus a combining mark, so tone written either way — the composer's
    // tone keys, or a pasted `á` — folds to the same handle.
    raw.toLowerCase().normalize('NFD'),
  )
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

/** Whether [handle] carries one of [names]. Mirrors the client's rule. */
export function carriesKasemName(handle: string, names: Set<string>): boolean {
  const folded = foldKasemToAscii(handle);
  if (!folded || names.size === 0) return false;
  if (names.has(folded)) return true;
  return folded
    .split('_')
    .map((part) => part.replace(/\d+$/, ''))
    .some((part) => part.length >= 3 && names.has(part));
}

async function publishedKasemNames(): Promise<Set<string>> {
  const snap = await getFirestore()
    .collection('kasemNames')
    .where('published', '==', true)
    .get();
  const names = new Set<string>();
  for (const doc of snap.docs) {
    const stored = doc.get('ascii');
    const source = typeof stored === 'string' && stored ? stored : String(doc.get('name') ?? '');
    const ascii = foldKasemToAscii(source);
    if (ascii.length >= 3) names.add(ascii);
  }
  return names;
}

export const claimKasemHandle = onCall(
  {
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('claimKasemHandle', uid, 5, 60 * 60 * 1000);

    const raw = (req.data ?? {}).handle;
    const handle = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^@/, '') : '';
    if (!HANDLE_SHAPE.test(handle)) {
      throw new HttpsError(
        'invalid-argument',
        'A handle is 3 to 20 characters: lowercase letters, numbers and underscores, starting with a letter.',
      );
    }
    if (RESERVED.has(handle)) {
      throw new HttpsError('invalid-argument', 'That handle is reserved.');
    }

    const names = await publishedKasemNames();
    if (!carriesKasemName(handle, names)) {
      // The one thing this callable exists for. Anything else would make it a
      // general rename, which is precisely what the freeze is protecting
      // against.
      throw new HttpsError(
        'failed-precondition',
        'This is only for taking a Kassena name. Choose one from the list.',
      );
    }

    const db = getFirestore();
    const profileRef = db.collection('communityProfiles').doc(uid);
    const nextRef = db.collection('communityUsernames').doc(handle);
    const auditRef = db.collection('auditLogs').doc();

    const previous = await db.runTransaction(async (tx) => {
      const profile = await tx.get(profileRef);
      if (!profile.exists) {
        throw new HttpsError('failed-precondition', 'Set up your community profile first.');
      }
      if (profile.get('usernameChangedAt')) {
        throw new HttpsError('failed-precondition', 'You have already taken your one name change.');
      }
      const current = String(profile.get('username') ?? '');
      if (current === handle) {
        throw new HttpsError('already-exists', 'That is already your handle.');
      }

      const taken = await tx.get(nextRef);
      if (taken.exists) {
        throw new HttpsError('already-exists', 'That handle is already taken.');
      }

      // Registry and profile move together, so the handle is never owned by
      // nobody and never owned by two people.
      tx.set(nextRef, { uid, createdAt: FieldValue.serverTimestamp() });
      if (current) tx.delete(db.collection('communityUsernames').doc(current));
      tx.update(profileRef, {
        username: handle,
        usernameChangedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, {
        id: auditRef.id,
        action: 'community.kasemHandleClaimed',
        actorUid: uid,
        targetUid: uid,
        detail: `${current} -> ${handle}`,
        createdAt: FieldValue.serverTimestamp(),
      });
      return current;
    });

    logger.info('Kassena handle claimed', { uid, from: previous, to: handle });
    return { username: handle };
  },
);
