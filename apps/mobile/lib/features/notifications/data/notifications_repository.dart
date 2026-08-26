import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';

/// Reads and updates the member's notification centre.
///
/// Notifications are written server-side by Cloud Functions triggers (a like, a
/// reply, a follow, a publication) — a client may only mark its own rows read,
/// which is exactly what the Firestore rules allow. Nothing here can forge an
/// alert.
class NotificationsRepository {
  const NotificationsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  static const feedLimit = 80;

  /// Cap on the live unread query. Anything past this shows as "99+" anyway,
  /// so reading more would cost documents for no visible difference.
  static const unreadWatchLimit = 100;

  CollectionReference<Map<String, dynamic>> get _notifications =>
      _firestore.collection('communityNotifications');

  Stream<List<IndigenNotification>> watchFeed(String uid) => _notifications
      .where('recipientId', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(feedLimit)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(IndigenNotification.fromDoc)
            .toList(growable: false),
      );

  /// Live unread count for the rail badge.
  ///
  /// Two equality filters and no ordering, so Firestore serves this from the
  /// single-field indexes — no composite index to deploy.
  Stream<int> watchUnreadCount(String uid) => _notifications
      .where('recipientId', isEqualTo: uid)
      .where('read', isEqualTo: false)
      .limit(unreadWatchLimit)
      .snapshots()
      .map((snapshot) => snapshot.docs.length);

  Future<void> markRead(String notificationId) async {
    try {
      await _notifications.doc(notificationId).update({'read': true});
    } on FirebaseException {
      // Marking read is cosmetic; a lost write costs the member nothing and the
      // row will simply still look unread next time.
    }
  }

  /// Marks everything currently unread as read, in batches of 400 (Firestore
  /// allows 500 writes per batch, leaving headroom).
  Future<void> markAllRead(String uid) async {
    final snapshot = await _notifications
        .where('recipientId', isEqualTo: uid)
        .where('read', isEqualTo: false)
        .limit(400)
        .get();
    if (snapshot.docs.isEmpty) return;
    final batch = _firestore.batch();
    for (final doc in snapshot.docs) {
      batch.update(doc.reference, {'read': true});
    }
    await batch.commit();
  }

  /// Registers this device for push so the fan-out trigger can reach it.
  ///
  /// Keyed by the FCM token itself, so a reinstall or token refresh replaces
  /// the old row instead of accumulating dead devices, and one token can never
  /// be claimed by two accounts at once.
  /// [messagePreviews] rides on the device row rather than the account: a
  /// member with a private phone and a shared tablet wants a different answer
  /// on each, and the fan-out reads it per token when it addresses them.
  Future<void> registerDevice({
    required String uid,
    required String token,
    required String platform,
    required bool messagePreviews,
  }) => _firestore.collection('communityDevices').doc(token).set({
    'uid': uid,
    'token': token,
    'platform': platform,
    'messagePreviews': messagePreviews,
    'updatedAt': FieldValue.serverTimestamp(),
  });

  /// Removes this device on sign-out so alerts stop following a shared handset
  /// to the next person who signs in.
  Future<void> unregisterDevice(String token) async {
    try {
      await _firestore.collection('communityDevices').doc(token).delete();
    } on FirebaseException {
      // Already gone, or no longer ours.
    }
  }
}
