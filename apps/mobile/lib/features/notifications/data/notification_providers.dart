import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';
import 'package:indigen_world_mobile/features/notifications/data/notifications_repository.dart';

/// The notifications data layer, or `null` when Firebase is unavailable this
/// launch. Consumers treat `null` as "nothing to show", never as an error.
final notificationsRepositoryProvider = Provider<NotificationsRepository?>((
  ref,
) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return NotificationsRepository(FirebaseFirestore.instance);
});

/// The member's notification centre, newest first. Empty for guests.
final notificationFeedProvider = StreamProvider<List<IndigenNotification>>((
  ref,
) {
  final repository = ref.watch(notificationsRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream.value(const <IndigenNotification>[]);
  }
  return repository.watchFeed(uid);
});

/// Live unread count, used for the Community badge and the bell.
final unreadNotificationCountProvider = StreamProvider<int>((ref) {
  final repository = ref.watch(notificationsRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(0);
  return repository.watchUnreadCount(uid);
});
