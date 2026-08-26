import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { askKawuri, type Turn } from './kawuri.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Kawuri answering an `@kawuri` mention inside a community thread.
 *
 * The assistant is reachable from the Learn tab as a private chat. This is the
 * other half: naming it in a post pulls it into a conversation other members
 * are already having, and its answer lands as an ordinary reply everyone can
 * read, argue with, and correct.
 *
 * That publicness is the whole design constraint. A wrong answer in a private
 * chat costs one person; a wrong answer in a thread gets screenshotted. So the
 * reply is written under the same instruction as every other Kawuri turn —
 * never invent Kasem, never settle contested practice — plus one more that
 * only applies here: it is a guest in somebody else's conversation and should
 * say less, not more.
 */

const REGION = 'us-central1';

/** The handle that summons the assistant, and the uid its replies post under. */
export const KAWURI_UID = 'kawuri';
const KAWURI_HANDLE = 'kawuri';

/** How many posts of surrounding thread are handed to the model. */
const MAX_CONTEXT_POSTS = 8;

/** How much of one post survives into the prompt. */
const MAX_CONTEXT_CHARS = 1200;

/**
 * Summons per member per minute.
 *
 * Lower than the private chat's allowance on purpose: every answer here is a
 * write to a public feed, so a runaway loop is visible to the whole community
 * rather than just expensive.
 */
const SUMMONS_PER_MINUTE = 4;

const THREAD_INSTRUCTION = `You have been mentioned by name in a public
community thread on Indigen World, and your answer will be posted as a reply
that every member can read.

Because of that:
- Answer only what the person who named you actually asked. Do not summarise
  the thread back to it, and do not address people who did not ask you.
- Be brief. Two or three short paragraphs at the very most; one is usually
  better. Nobody scrolling a feed wants an essay.
- Do not open with a greeting or close with an offer of further help.
- You are a guest in a conversation between members. If the thread is a
  disagreement between people, do not take a side — say what is documented,
  say what varies, and leave the judgement to them.
- If you were named but there is no question for you, say so in one line
  rather than inventing something to answer.
- Never repeat a member's personal details back into the thread.`;

/** True when [text] names the assistant as a mention rather than in passing. */
export function summonsKawuri(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  return new RegExp(`(?:^|[^\\w@])@${KAWURI_HANDLE}\\b`, 'i').test(text);
}

/** Trims one post's body down to what is worth spending prompt on. */
function contextText(text: unknown): string {
  if (typeof text !== 'string') return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_CONTEXT_CHARS
    ? `${collapsed.slice(0, MAX_CONTEXT_CHARS - 1)}…`
    : collapsed;
}

/**
 * The assistant's own community profile, created on first use.
 *
 * It exists so Kawuri's replies render like anybody else's — an avatar, a
 * name, a handle — and so the notification writer has an actor to stamp. The
 * handle is also reserved in the username registry, because a member holding
 * `@kawuri` would be answered over by a machine in their own replies.
 */
async function ensureKawuriProfile(db: FirebaseFirestore.Firestore): Promise<void> {
  const profile = db.collection('communityProfiles').doc(KAWURI_UID);
  if ((await profile.get()).exists) return;

  await profile.set(
    {
      uid: KAWURI_UID,
      username: KAWURI_HANDLE,
      displayNameLower: 'kawuri',
      displayName: 'Kawuri',
      bio: 'The guide inside Indigen World. Mention me in a thread and I will answer.',
      avatarUrl: null,
      bannerUrl: null,
      location: '',
      dialect: '',
      isVerified: true,
      isAssistant: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db
    .collection('communityUsernames')
    .doc(KAWURI_HANDLE)
    .set({ uid: KAWURI_UID, username: KAWURI_HANDLE, reserved: true }, { merge: true });
}

/**
 * The thread around [postId], oldest first, as model turns.
 *
 * Replies carry `rootId`, so one equality query gets the whole conversation
 * without walking parent links one document at a time. The member who summoned
 * Kawuri speaks last, which is what the model needs to answer the right
 * question.
 */
async function threadTurns(
  db: FirebaseFirestore.Firestore,
  post: FirebaseFirestore.DocumentData,
  postId: string,
): Promise<Turn[]> {
  const rootId = typeof post.rootId === 'string' && post.rootId ? post.rootId : postId;

  const [root, replies] = await Promise.all([
    rootId === postId
      ? Promise.resolve(null)
      : db.collection('communityPosts').doc(rootId).get(),
    db
      .collection('communityPosts')
      .where('rootId', '==', rootId)
      .orderBy('createdAt', 'desc')
      .limit(MAX_CONTEXT_POSTS)
      .get(),
  ]);

  const preceding = replies.docs
    .filter((doc) => doc.id !== postId)
    .reverse()
    .map((doc) => doc.data());
  const ordered = [
    ...(root?.exists ? [root.data() as FirebaseFirestore.DocumentData] : []),
    ...preceding,
  ];

  const turns: Turn[] = [];
  for (const entry of ordered) {
    const body = contextText(entry?.text);
    if (!body) continue;
    const author = entry?.author?.displayName;
    // Kawuri's own earlier replies come back as model turns so it can see what
    // it already said and not say it again.
    turns.push(
      entry?.authorId === KAWURI_UID
        ? { role: 'model', text: body }
        : { role: 'user', text: `${typeof author === 'string' ? author : 'A member'}: ${body}` },
    );
  }

  const asked = contextText(post.text);
  const askedBy = typeof post.author?.displayName === 'string' ? post.author.displayName : 'A member';
  turns.push({ role: 'user', text: `${askedBy}: ${asked}` });

  // Gemini rejects a history that does not alternate cleanly from a user turn,
  // so consecutive same-role turns are folded together.
  const folded: Turn[] = [];
  for (const turn of turns) {
    const last = folded[folded.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n\n${turn.text}`;
    else folded.push({ ...turn });
  }
  while (folded.length > 0 && folded[0].role !== 'user') folded.shift();
  return folded;
}

export const onCommunityKawuriMention = onDocumentCreated(
  { document: 'communityPosts/{postId}', region: REGION, timeoutSeconds: 120 },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const post = snap.data();

    // Never answer itself. Without this, one mention inside a generated reply
    // would summon the next one, for as long as the project had budget.
    if (post.authorId === KAWURI_UID) return;
    if (!summonsKawuri(post.text)) return;

    const db = getFirestore();
    const postId = snap.id;
    const replyRef = db.collection('communityPosts').doc(`kawuri_${postId}`);

    // A derived id makes an at-least-once trigger delivery idempotent: a
    // repeat finds the reply already written and stops before paying for a
    // second generation.
    if ((await replyRef.get()).exists) return;

    const author = typeof post.authorId === 'string' ? post.authorId : 'anonymous';
    try {
      await consumeRateLimit('kawuriMention', author, SUMMONS_PER_MINUTE);
    } catch {
      logger.info('Kawuri summons rate-limited', { author });
      return;
    }

    const answer = await askKawuri(
      await threadTurns(db, post, postId),
      THREAD_INSTRUCTION,
    );
    // Silence beats an apology in a public thread: if the model is unavailable
    // or produced nothing, leave the conversation as the members wrote it.
    if (!answer.configured || !answer.reply) return;

    await ensureKawuriProfile(db);

    const rootId = typeof post.rootId === 'string' && post.rootId ? post.rootId : postId;
    await replyRef.set({
      authorId: KAWURI_UID,
      author: {
        displayName: 'Kawuri',
        username: KAWURI_HANDLE,
        avatarUrl: null,
        isVerified: true,
      },
      text: answer.reply,
      media: [],
      hasMedia: false,
      likeCount: 0,
      replyCount: 0,
      repostCount: 0,
      quoteCount: 0,
      viewCount: 0,
      parentId: postId,
      isReply: true,
      rootId,
      quotedPostId: null,
      quotedPost: null,
      poll: null,
      // The assistant does not write Kasem — it says so itself — so it must not
      // claim the pledge every member gives when they post.
      kasemConfirmed: false,
      isAssistant: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Best-effort, exactly as the client's own reply path treats it: a missed
    // increment costs a displayed number, never the reply.
    try {
      await snap.ref.update({ replyCount: FieldValue.increment(1) });
    } catch {
      logger.info('Kawuri reply count not incremented', { postId });
    }
  },
);
