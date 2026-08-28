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

export interface PushMessage {
  title: string;
  body: string;
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
   */
  collapseKey?: string;
  tag?: string;
}

interface DeviceRow {
  token: string;
  previews: boolean;
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
): Promise<void> {
  if (!uid) return;

  try {
    const devices = await devicesFor(db, uid);
    if (devices.length === 0) return;

    const groups =
      message.redactedBody === undefined
        ? [{ body: message.body, tokens: devices.map((device) => device.token) }]
        : [
            {
              body: message.body,
              tokens: devices.filter((d) => d.previews).map((d) => d.token),
            },
            {
              body: message.redactedBody,
              tokens: devices.filter((d) => !d.previews).map((d) => d.token),
            },
          ];

    const stale: string[] = [];
    for (const group of groups) {
      if (group.tokens.length === 0) continue;
      const response = await getMessaging().sendEachForMulticast({
        tokens: group.tokens,
        notification: { title: message.title, body: group.body },
        data: message.data,
        android: {
          priority: 'high',
          ...(message.collapseKey ? { collapseKey: message.collapseKey } : {}),
          notification: {
            channelId: message.channelId,
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            ...(message.tag ? { tag: message.tag } : {}),
          },
        },
        apns: {
          payload: { aps: { sound: 'default' } },
          ...(message.collapseKey
            ? { headers: { 'apns-collapse-id': message.collapseKey } }
            : {}),
        },
      });

      response.responses.forEach((result, index) => {
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
  } catch (error) {
    logger.error('Push fan-out failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}
