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
  /**
   * Who the alert is about, drawn as its avatar on phones that render their
   * own alerts — the same face the row wears in the notification centre.
   * Omitted for alerts nobody in particular sent (an order, an announcement),
   * which wear the Indigen mark instead.
   */
  actor?: { name?: string; avatarUrl?: string | null };
  /**
   * Accepted for envelopes recorded by earlier builds of this function, and
   * ignored. Whether a phone draws its own actions is now the phone's answer
   * (see [rendersOnDevice]), not the sender's.
   */
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

export interface DeviceRow {
  token: string;
  previews: boolean;
  platform: string;
  /** The highest alert layout this build can draw itself; 0 when it draws none. */
  renderer: number;
}

/**
 * The alert layout this backend sends to phones that draw their own.
 *
 * Version 2 is the notification-centre design carried into the phone's
 * notification shade: the actor's avatar with its kind badge, the attached
 * picture, and Reply / Like / Mark as read, all drawn by the app from a
 * data-only message. A build announces it on its device row
 * (`pushRenderer`), and only a build that announced it is ever sent a
 * data-only message — an older build would receive it and draw nothing.
 */
export const RICH_PUSH_RENDERER = 2;

/**
 * Whether [device] is sent a data-only message it draws itself.
 *
 * Android only: an iOS app is not woken for a data-only message reliably
 * enough to be trusted with the only copy of an alert. The environment switch
 * exists purely as a kill switch — set `RICH_NOTIFICATION_PUSH_ENABLED=false`
 * and every device falls back to the system-drawn notification on the next
 * send, with no app release involved.
 */
export function rendersOnDevice(
  device: Pick<DeviceRow, 'platform' | 'renderer'>,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.RICH_NOTIFICATION_PUSH_ENABLED === 'false') return false;
  return device.platform === 'android' && device.renderer >= RICH_PUSH_RENDERER;
}

/**
 * Hosts the app is allowed to download a notification picture from.
 *
 * A phone fetching an image for an alert tells that host the phone exists, so
 * the list is the places the app's own pictures already live: Firebase
 * Storage for uploads, and Google's profile-photo host for avatars carried
 * over from Google sign-in. Must match `allowedAlertImageHosts` in the app.
 */
const ALERT_IMAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
]);

/** [value] when it is an https URL on [ALERT_IMAGE_HOSTS], otherwise ''. */
export function alertImageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALERT_IMAGE_HOSTS.has(url.hostname) ? value : '';
  } catch {
    return '';
  }
}

/** One multicast: a set of tokens and everything they are sent. */
export interface PushGroup {
  tokens: string[];
  /** Whether these devices draw the alert themselves (data-only message). */
  local: boolean;
  previews: boolean;
  notification?: { title: string; body: string; imageUrl?: string };
  data: Record<string, string>;
}

/**
 * How one alert is split across [devices], and what each group is sent.
 *
 * Two axes: whether the handset shows previews (a shared tablet turns them
 * off), and whether it draws its own alerts. Pure, so the split — which is the
 * difference between an alert that arrives and one that silently does not —
 * can be tested without FCM.
 *
 * A group that draws its own alert gets no `notification` block at all. With
 * one, Android draws the system notification itself while the app is in the
 * background and never wakes it — so the avatar, the picture and the action
 * buttons would only ever appear while the app was already open.
 */
export function planPushGroups(
  devices: DeviceRow[],
  message: PushMessage,
  sentAt: number,
  env: Record<string, string | undefined> = process.env,
): PushGroup[] {
  const imageUrl = alertImageUrl(message.imageUrl);
  const actorName = message.actor?.name?.trim() ?? '';
  const actorAvatarUrl = alertImageUrl(message.actor?.avatarUrl);
  const groups: PushGroup[] = [];
  for (const previews of [true, false]) {
    for (const local of [true, false]) {
      const tokens = devices
        .filter((device) => device.previews === previews && rendersOnDevice(device, env) === local)
        .map((device) => device.token);
      if (tokens.length === 0) continue;
      const title = previews ? message.title : 'Indigen World';
      const body = previews
        ? message.body
        : message.redactedBody ?? 'Open Indigen World to view this update.';
      groups.push({
        tokens,
        local,
        previews,
        ...(local
          ? {}
          : { notification: { title, body, ...(previews && imageUrl ? { imageUrl } : {}) } }),
        data: {
          ...message.data,
          title,
          body,
          // A hidden preview hides the face and the picture as well as the
          // words: a lock screen showing whose avatar wrote is a preview.
          imageUrl: previews ? imageUrl : '',
          actorName: previews ? actorName : '',
          actorAvatarUrl: previews ? actorAvatarUrl : '',
          previews: String(previews),
          channelId: message.channelId,
          sentAt: String(sentAt),
          ...(local ? { renderLocally: 'true' } : {}),
        },
      });
    }
  }
  return groups;
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
      // Absent on every row written before builds drew their own alerts, and
      // absence must mean "draws none": those builds would receive a data-only
      // message and show nothing at all.
      renderer: typeof doc.get('pushRenderer') === 'number' ? doc.get('pushRenderer') : 0,
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

    const groups = planPushGroups(devices, message, Date.now());

    const stale: string[] = [];
    let accepted = 0, failed = 0;
    for (const group of groups) {
      const response = await getMessaging().sendEachForMulticast({
        tokens: group.tokens,
        ...(group.notification ? { notification: group.notification } : {}),
        data: group.data,
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
          payload: { aps: { sound: 'default', category: ['like', 'reply', 'quote', 'mention', 'post', 'thread_reply'].includes(message.data.type) ? 'community_actions' : 'notification_read', ...(group.previews && group.notification?.imageUrl && process.env.IOS_RICH_MEDIA_ENABLED === 'true' ? { mutableContent: true } : {}) } },
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
