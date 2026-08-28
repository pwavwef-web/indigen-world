import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { MESSAGES_CHANNEL_ID, pushToUser } from './push.js';

/**
 * Push for private one-to-one conversations.
 *
 * Deliberately writes **no** `communityNotifications` row. The alert centre is
 * for things that happened to your work; a conversation lives in the inbox,
 * which already keeps its own unread count on the thread document. Writing both
 * would give one unread state two sources of truth, and they would drift.
 *
 * Reads `communityChats/{chatId}` rather than a profile: the sender's name is
 * already stamped on the thread by the client on every send, so an alert costs
 * one document read.
 */

const REGION = 'us-central1';

/** How much of a message reaches the lock screen. */
const PREVIEW_LENGTH = 120;

/**
 * How long after alerting somebody the conversation stays quiet.
 *
 * Somebody typing four short messages in a row is having one thought, not four.
 * The window only applies while an earlier message is *still unread* — once the
 * recipient has caught up, the next message is news again and rings normally.
 */
const QUIET_PERIOD_MS = 45_000;

export function preview(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > PREVIEW_LENGTH
    ? `${collapsed.slice(0, PREVIEW_LENGTH - 1)}…`
    : collapsed;
}

/**
 * The other person in the conversation, or null when there isn't exactly one.
 *
 * A thread is always a pair, but the data is read defensively: a malformed
 * participant list must produce no alert rather than an alert aimed at the
 * sender, or at somebody who was never in the conversation.
 */
export function recipientOf(participants: unknown, senderId: string): string | null {
  if (!Array.isArray(participants)) return null;
  const others = participants.filter(
    (uid): uid is string => typeof uid === 'string' && uid !== senderId,
  );
  return others.length === 1 ? others[0] : null;
}

/** Whether [recipientId] has muted this conversation. */
export function isMutedBy(mutedBy: unknown, recipientId: string): boolean {
  return Array.isArray(mutedBy) && mutedBy.includes(recipientId);
}

/**
 * Whether this message should ring, given what the thread already showed.
 *
 * `outstanding` is the recipient's unread count, raised by the client in the
 * same batch as the message — so it already counts this one, and more than one
 * means something was waiting before it. Ringing is suppressed only when both
 * are true: something was already unread, *and* the conversation rang recently.
 * A first message always rings, and so does one that arrives after the quiet
 * period, however far behind the recipient is.
 */
export function shouldAlert({
  outstanding,
  lastPushAtMillis,
  nowMillis,
}: {
  outstanding: unknown;
  lastPushAtMillis: number | null;
  nowMillis: number;
}): boolean {
  const waiting = typeof outstanding === 'number' && outstanding > 1;
  if (!waiting) return true;
  if (lastPushAtMillis === null) return true;
  return nowMillis - lastPushAtMillis >= QUIET_PERIOD_MS;
}

/** The sender's display name, as stamped on the thread. */
export function senderName(participantProfiles: unknown, senderId: string): string {
  const profile = participantProfiles && typeof participantProfiles === 'object'
    ? (participantProfiles as Record<string, unknown>)[senderId]
    : undefined;
  const displayName = profile && typeof profile === 'object'
    ? (profile as Record<string, unknown>).displayName
    : undefined;
  return typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : 'A member';
}

/**
 * Claims the right to alert [recipientId] about this thread, or declines it.
 *
 * A transaction rather than a read-then-write because a burst is exactly the
 * case this exists for: two messages landing together would both read the same
 * stale `lastPushAt` and both decide to ring. Stamping the claim inside the
 * transaction means only one of them can.
 */
async function claimAlertSlot(
  db: FirebaseFirestore.Firestore,
  threadRef: FirebaseFirestore.DocumentReference,
  recipientId: string,
): Promise<boolean> {
  return db.runTransaction(async (transaction) => {
    const thread = await transaction.get(threadRef);
    if (!thread.exists) return false;

    const unread = thread.get('unread');
    const lastPushAt = thread.get('lastPushAt');
    const ring = shouldAlert({
      outstanding: unread && typeof unread === 'object'
        ? (unread as Record<string, unknown>)[recipientId]
        : undefined,
      lastPushAtMillis: lastPushAt instanceof Timestamp ? lastPushAt.toMillis() : null,
      nowMillis: Date.now(),
    });
    if (!ring) return false;

    transaction.update(threadRef, { lastPushAt: FieldValue.serverTimestamp() });
    return true;
  });
}

export const onChatMessageCreated = onDocumentCreated(
  { document: 'communityChats/{chatId}/messages/{messageId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const senderId = data.senderId;
    const text = data.text;
    if (typeof senderId !== 'string' || typeof text !== 'string') return;

    const chatId = event.params.chatId;
    const db = getFirestore();
    const threadRef = db.collection('communityChats').doc(chatId);
    const thread = await threadRef.get();
    if (!thread.exists) return;

    const recipientId = recipientOf(thread.get('participants'), senderId);
    if (!recipientId) return;

    // Muting is the member's own decision about one conversation, and it comes
    // before everything else — including the debounce, which would otherwise
    // stamp `lastPushAt` for an alert that is never sent.
    if (isMutedBy(thread.get('mutedBy'), recipientId)) return;

    if (!(await claimAlertSlot(db, threadRef, recipientId))) return;

    const name = senderName(thread.get('participantProfiles'), senderId);
    await pushToUser(db, recipientId, {
      title: name,
      body: preview(text),
      // What a device shows when its owner has turned lock-screen previews off.
      // The name still appears as the title: knowing who wrote is the point of
      // the alert, and it is already on the inbox row either way.
      redactedBody: 'Sent you a message',
      channelId: MESSAGES_CHANNEL_ID,
      data: {
        type: 'message',
        threadId: chatId,
        route: `/chat/${chatId}`,
      },
      // One conversation is one entry, however many messages arrive. The
      // collapse key covers a device that was offline; the tag covers what is
      // already on its screen.
      collapseKey: `chat_${chatId}`,
      tag: `chat_${chatId}`,
    });
  },
);
