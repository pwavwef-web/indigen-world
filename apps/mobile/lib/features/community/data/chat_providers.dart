import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';

/// The chat data layer, or `null` when Firebase is unavailable this launch.
final chatRepositoryProvider = Provider<ChatRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return ChatRepository(FirebaseFirestore.instance);
});

/// The signed-in member's conversations, most recent first.
final chatInboxProvider = StreamProvider<List<ChatThread>>((ref) {
  final repository = ref.watch(chatRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream.value(const <ChatThread>[]);
  }
  return repository.watchInbox(uid);
});

/// Unread messages across every conversation — the sidebar's Messages badge.
///
/// Deliberately derived from the inbox stream rather than from a second query,
/// so the badge and the list can never disagree about what is unread.
final unreadChatCountProvider = Provider<int>(
  (ref) => (ref.watch(chatInboxProvider).asData?.value ?? const <ChatThread>[])
      .fold<int>(0, (total, thread) => total + thread.unreadCount),
);

final chatMessagesProvider = StreamProvider.family<List<ChatMessage>, String>((
  ref,
  threadId,
) {
  final repository = ref.watch(chatRepositoryProvider);
  if (repository == null) return Stream.value(const <ChatMessage>[]);
  return repository.watchMessages(threadId);
});
