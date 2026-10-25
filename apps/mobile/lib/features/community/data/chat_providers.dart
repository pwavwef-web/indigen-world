import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

/// One conversation, fetched by id for a deep link that carries nothing else.
final chatThreadProvider = FutureProvider.family<ChatThread?, String>((
  ref,
  threadId,
) async {
  final repository = ref.watch(chatRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return null;
  return repository.loadThread(threadId: threadId, uid: uid);
});

/// The conversation the member is looking at right now, if any.
///
/// Set by [ChatScreen] while it is on screen. The fan-out cannot know this —
/// there is no signal from a phone saying which screen is in front of somebody
/// — so it falls to the client not to draw an alert about the very message
/// being read. Only the foreground path consults it; a backgrounded device is
/// by definition not showing the thread.
class ActiveChatThread extends Notifier<String?> {
  @override
  String? build() => null;

  void open(String threadId) => state = threadId;

  /// Clears only if [threadId] is still the open one, so a thread that was
  /// disposed after a newer one opened cannot clear its successor.
  void close(String threadId) {
    if (state == threadId) state = null;
  }
}

final activeChatThreadProvider = NotifierProvider<ActiveChatThread, String?>(
  ActiveChatThread.new,
);

final chatMessagesProvider = StreamProvider.family<List<ChatMessage>, String>((
  ref,
  threadId,
) {
  final repository = ref.watch(chatRepositoryProvider);
  if (repository == null) return Stream.value(const <ChatMessage>[]);
  return repository.watchMessages(threadId);
});

/// One conversation's document, live: whether it is muted, and how far the
/// other member has read.
final chatThreadLiveProvider = StreamProvider.family<ChatThread?, String>((
  ref,
  threadId,
) {
  final repository = ref.watch(chatRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) return Stream.value(null);
  return repository.watchThread(threadId, uid);
});

/// Where the read-receipts choice is written down. On this phone.
const chatReadReceiptsPreferenceKey = 'indigen_chat_read_receipts_v1';

/// Whether this member shares when they have read a conversation — and so
/// sees when others have read theirs. Both ways or neither, the way people
/// expect it to work.
class ChatReadReceipts extends Notifier<bool> {
  @override
  bool build() {
    unawaited(_restore());
    return true;
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      state = preferences.getBool(chatReadReceiptsPreferenceKey) ?? true;
    } on Object {
      // On, the default.
    }
  }

  Future<void> set(bool on) async {
    state = on;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(chatReadReceiptsPreferenceKey, on);
    } on Object {
      // Holds for this session.
    }
  }
}

final chatReadReceiptsProvider = NotifierProvider<ChatReadReceipts, bool>(
  ChatReadReceipts.new,
);

/// Whether "Seen" belongs under [newestMine]: the other member read the
/// conversation after it was sent.
bool chatMessageSeen({
  required ChatMessage? newestMine,
  required DateTime? otherReadAt,
}) {
  final sentAt = newestMine?.createdAt;
  if (sentAt == null || otherReadAt == null) return false;
  return !otherReadAt.isBefore(sentAt);
}

/// A day heading between messages, or null when [message] is on the same day
/// as [older] — the one sent just before it.
String? chatDayLabel(
  ChatMessage message,
  ChatMessage? older, {
  required DateTime now,
}) {
  final at = message.createdAt?.toLocal();
  if (at == null) return null;
  final before = older?.createdAt?.toLocal();
  if (before != null &&
      before.year == at.year &&
      before.month == at.month &&
      before.day == at.day) {
    return null;
  }
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(at.year, at.month, at.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo == 0) return 'Today';
  if (daysAgo == 1) return 'Yesterday';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final label = '${weekdays[at.weekday - 1]} ${at.day} ${months[at.month - 1]}';
  return at.year == now.year ? label : '$label ${at.year}';
}
