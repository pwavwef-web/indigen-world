import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

/**
 * Delivering a push to every device one member is signed in on.
 *
 * Shared by the community alert fan-out and by direct messages, which have no
 * `communityNotifications` row to hang off — a conversation belongs in the
 * inbox, and duplicating it into the alert centre would give the same unread
 * state two sources of truth.
 *
 * Dead tokens are pruned as they are discovered: FCM names precisely which
 * registrations are gone, and leaving them in place means every future alert
 * pays to reach a handset that was wiped months ago.
 */

/** Nobody is signed in on more than a handful of devices; the cap is a guard. */
const MAX_DEVICES = 20;

/**
 * The channels the app creates at start-up (local_alerts.dart).
 *
 * Sending an id the app has not created makes Android invent the channel at
 * default importance — silent, no heads-up — and permanently, since a channel's
 * importance can never be raised afterwards. Changing either value means
 * changing it in the app and, for the community channel, in its manifest too.
 */
export const COMMUNITY_CHANNEL_ID = 'indigen_community_v2';
export const MESSAGES_CHANNEL_ID = 'indigen_messages';

/**
 * Decisions and receipts about the member's own work: a submission reviewed,
 * an advert approved or turned down, a payment that went through.
 *
 * Its own channel rather than the community one because these are not activity
 * — they are answers to something the member is waiting on, and somebody who
 * mutes likes and follows must not thereby mute the outcome of the advert they
 * paid for.
 */
export const ACCOUNT_CHANNEL_ID = 'indigen_account';

export interface PushMessage {
  title: string;
  body: string;
  imageUrl?: string;
  richActions?: boolean;
  /**
   * Body used instead on devices whose owner turned lock-screen previews off.
   *
   * When set, devices are addressed in two groups rather than one, because the
   * preference belongs to the handset — a shared phone is exactly the case it
   * exists for.
   */
  redactedBody?: string;
  /** Must be a channel the app creates at start-up. See local_alerts.dart. */
  channelId: string;
  /** Routing payload. Every value has to be a string; that is all FCM carries. */
  data: Record<string, string>;
  /**
   * Groups messages that supersede each other, so a burst arrives as one entry
   * rather than a stack. `collapseKey` covers delivery while the device is
   * offline, `tag` covers what is already on screen — both are needed.
   *
   * Neither reaches an alert that lands while somebody is *looking* at the app:
   * FCM hands those to the app rather than drawing them, and the app draws them
   * itself (local_alerts.dart). A caller that wants a burst collapsed there too
   * has to put the same key in [data] as well, which is what the community
   * fan-out does — otherwise following a prolific poster costs one lock-screen
   * entry and six in-app ones, which is the wrong way round.
   */
  collapseKey?: string;
  tag?: string;
}

interface DeviceRow {
  token: string;
  previews: boolean;
  platform: string;
}

/** The devices [uid] can be reached on, with each one's preview preference. */
async function devicesFor(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<DeviceRow[]> {
  const snapshot = await db
    .collection('communityDevices')
    .where('uid', '==', uid)
    .limit(MAX_DEVICES)
    .get();
  return snapshot.docs
    .map((doc) => ({
      token: doc.get('token'),
      platform: String(doc.get('platform') ?? 'android'),
      // Absent on rows written by older builds, which predate the preference.
      // Previews were what those devices already did, so that is what absence
      // has to mean — anything else silently changes their behaviour.
      previews: doc.get('messagePreviews') !== false,
    }))
    .filter((device): device is DeviceRow =>
      typeof device.token === 'string' && device.token.length > 0);
}

/** Drops registrations FCM has told us are gone. */
async function pruneStale(
  db: FirebaseFirestore.Firestore,
  stale: string[],
): Promise<void> {
  if (stale.length === 0) return;
  const batch = db.batch();
  for (const token of stale) {
    batch.delete(db.collection('communityDevices').doc(token));
  }
  await batch.commit();
}

/**
 * Sends [message] to [uid]'s devices.
 *
 * Never throws. Push is the convenience layer — the notification centre or the
 * inbox already holds what this is announcing — so a delivery failure must not
 * retry-loop the trigger that called it.
 */
export async function pushToUser(
  db: FirebaseFirestore.Firestore,
  uid: string,
  message: PushMessage,
): Promise<{ status: string; accepted: number; failed: number }> {
  if (!uid) return { status: 'skipped', accepted: 0, failed: 0 };

  try {
    const devices = await devicesFor(db, uid);
    if (devices.length === 0) return { status: 'no_devices', accepted: 0, failed: 0 };

    const groups = [true, false].flatMap((previews) => [true, false].map((local) => ({
      previews, local,
      body: previews ? message.body : message.redactedBody ?? 'Open Indigen World to view this update.',
      tokens: devices.filter((d) => d.previews === previews && (message.richActions === true && d.platform === 'android') === local).map((d) => d.token),
    })));

    const stale: string[] = [];
    let accepted = 0, failed = 0;
    for (const group of groups) {
      if (group.tokens.length === 0) continue;
      const response = await getMessaging().sendEachForMulticast({
        tokens: group.tokens,
        ...(group.local ? {} : { notification: { title: group.previews ? message.title : 'Indigen World', body: group.body } }),
        data: { ...message.data, title: group.previews ? message.title : 'Indigen World', body: group.body, imageUrl: group.previews ? message.imageUrl ?? '' : '', previews: String(group.previews), ...(group.local ? { renderLocally: 'true' } : {}) },
        android: {
          priority: 'high',
          ...(message.collapseKey ? { collapseKey: message.collapseKey } : {}),
          ...(group.local ? {} : { notification: {
            channelId: message.channelId,
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            ...(message.tag ? { tag: message.tag } : {}),
          } }),
        },
        apns: {
          payload: { aps: { sound: 'default', category: ['like', 'reply', 'quote', 'mention', 'post', 'thread_reply'].includes(message.data.type) ? 'community_actions' : 'notification_read', ...(group.previews && message.imageUrl && process.env.IOS_RICH_MEDIA_ENABLED === 'true' ? { mutableContent: true } : {}) } },
          ...(message.collapseKey
            ? { headers: { 'apns-collapse-id': message.collapseKey } }
            : {}),
        },
      });

      response.responses.forEach((result, index) => {
        if (result.success) accepted++; else failed++;
        const code = result.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument'
        ) {
          stale.push(group.tokens[index]);
        }
      });
    }

    await pruneStale(db, stale);
    return { status: failed > 0 ? (accepted > 0 ? 'partially_accepted' : 'failed') : 'accepted_by_provider', accepted, failed };
  } catch (error) {
    logger.error('Push fan-out failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return { status: 'failed', accepted: 0, failed: 1 };
  }
}
