import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';

/// The other member in a conversation, as stamped on the chat document.
///
/// Denormalised for the same reason post author stamps are: the inbox has to
/// render a name and a face per row without a second read per row, and it has
/// to keep rendering them when the reader is offline.
class ChatParticipant {
  const ChatParticipant({
    required this.uid,
    required this.displayName,
    required this.username,
    this.avatarUrl,
  });

  final String uid;
  final String displayName;
  final String username;
  final String? avatarUrl;

  String get handle => '@$username';

  String get initials {
    final source = displayName.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  static ChatParticipant fromMap(String uid, Object? raw) {
    final data = raw is Map
        ? raw.map((key, value) => MapEntry(key.toString(), value))
        : const <String, dynamic>{};
    final avatar = data['avatarUrl'];
    return ChatParticipant(
      uid: uid,
      displayName: (data['displayName'] as String?)?.trim().isNotEmpty ?? false
          ? (data['displayName'] as String).trim()
          : 'Community member',
      username: (data['username'] as String?) ?? 'member',
      avatarUrl: avatar is String && avatar.isNotEmpty ? avatar : null,
    );
  }

  static ChatParticipant fromProfile(CommunityProfile profile) =>
      ChatParticipant(
        uid: profile.uid,
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
      );

  Map<String, Object?> toMap() => {
    'displayName': displayName,
    'username': username,
    'avatarUrl': avatarUrl,
  };
}

/// One conversation in the inbox.
class ChatThread {
  const ChatThread({
    required this.id,
    required this.other,
    required this.unreadCount,
    this.lastMessage = '',
    this.lastSenderId = '',
    this.lastMessageAt,
  });

  final String id;
  final ChatParticipant other;
  final String lastMessage;
  final String lastSenderId;
  final DateTime? lastMessageAt;
  final int unreadCount;

  bool get hasUnread => unreadCount > 0;

  /// Reads a thread from any snapshot — an inbox row or a single document
  /// fetched by id, which is all a deep link from a push has to go on.
  static ChatThread? fromDoc(
    DocumentSnapshot<Map<String, dynamic>> doc,
    String myUid,
  ) {
    final data = doc.data();
    if (data == null) return null;
    final rawParticipants = data['participants'];
    if (rawParticipants is! List) return null;
    final participants = rawParticipants.whereType<String>().toList();
    final otherUid = participants.firstWhere(
      (uid) => uid != myUid,
      orElse: () => '',
    );
    if (otherUid.isEmpty) return null;
    final profiles = data['participantProfiles'];
    final rawUnread = data['unread'];
    final unread = rawUnread is Map ? rawUnread[myUid] : null;
    return ChatThread(
      id: doc.id,
      other: ChatParticipant.fromMap(
        otherUid,
        profiles is Map ? profiles[otherUid] : null,
      ),
      lastMessage: (data['lastMessage'] as String?) ?? '',
      lastSenderId: (data['lastSenderId'] as String?) ?? '',
      lastMessageAt: (data['lastMessageAt'] as Timestamp?)?.toDate(),
      unreadCount: unread is num ? unread.toInt() : 0,
    );
  }
}

/// One message in a thread.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.senderId,
    required this.text,
    this.createdAt,
  });

  final String id;
  final String senderId;
  final String text;
  final DateTime? createdAt;

  static ChatMessage? fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final senderId = data['senderId'];
    final text = data['text'];
    if (senderId is! String || text is! String) return null;
    return ChatMessage(
      id: doc.id,
      senderId: senderId,
      text: text,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

/// Private one-to-one conversations between community members.
///
/// A thread id is the two account ids in sorted order joined by an underscore,
/// so a pair of members can only ever have one conversation however they reach
/// each other — no lookup, no race between two people opening a chat at the
/// same moment, and an id both clients can compute offline.
///
///   * `communityChats/{a_b}`                    — the thread and its stamps
///   * `communityChats/{a_b}/messages/{msgId}`   — the messages themselves
///
/// Unread totals live on the thread document rather than being counted, so
/// the inbox badge costs nothing to read. Both participants may write the
/// thread document, which is the narrowest grant that lets a sender mark the
/// other side unread and a reader clear their own count.
class ChatRepository {
  const ChatRepository(this._firestore);

  final FirebaseFirestore _firestore;

  static const maxMessageLength = 2000;
  static const threadPageSize = 50;
  static const messagePageSize = 100;

  CollectionReference<Map<String, dynamic>> get _chats =>
      _firestore.collection('communityChats');

  /// The one id a pair of members share, whichever of them asks for it.
  static String threadId(String a, String b) {
    final pair = [a, b]..sort();
    return '${pair.first}_${pair.last}';
  }

  Query<Map<String, dynamic>> _inboxQuery(String uid) => _chats
      .where('participants', arrayContains: uid)
      .orderBy('lastMessageAt', descending: true)
      .limit(threadPageSize);

  Stream<List<ChatThread>> watchInbox(String uid) =>
      _inboxQuery(uid).snapshots().map(
        (snapshot) => snapshot.docs
            .map((doc) => ChatThread.fromDoc(doc, uid))
            .whereType<ChatThread>()
            .toList(growable: false),
      );

  /// Total unread messages across every conversation, for the sidebar badge.
  Stream<int> watchUnreadTotal(String uid) => watchInbox(uid).map(
    (threads) =>
        threads.fold<int>(0, (total, thread) => total + thread.unreadCount),
  );

  Stream<List<ChatMessage>> watchMessages(String threadId) => _chats
      .doc(threadId)
      .collection('messages')
      .orderBy('createdAt', descending: true)
      .limit(messagePageSize)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(ChatMessage.fromDoc)
            .whereType<ChatMessage>()
            .toList(growable: false),
      );

  /// Makes sure the thread document exists, and returns its id.
  ///
  /// Deliberately a blind merge rather than a read-then-write. Reading first
  /// would mean asking for a document the reader may not be a participant of,
  /// and a rule that has to answer that question can only do it by revealing
  /// whether two other people are talking. Writing what we already know is the
  /// same round trip and tells nobody anything.
  ///
  /// Only the participants and their stamps are written. No `lastMessageAt`
  /// means the thread is not yet in the inbox's ordered query — so opening a
  /// conversation and saying nothing leaves no empty row on either side. The
  /// document has to exist all the same: it is what the message rule reads to
  /// decide who is allowed to write into the thread.
  Future<String> openThread({
    required CommunityProfile me,
    required CommunityProfile other,
  }) async {
    final id = threadId(me.uid, other.uid);
    await _chats.doc(id).set({
      'participants': [me.uid, other.uid]..sort(),
      'participantProfiles': {
        me.uid: ChatParticipant.fromProfile(me).toMap(),
        other.uid: ChatParticipant.fromProfile(other).toMap(),
      },
    }, SetOptions(merge: true));
    return id;
  }

  Future<void> sendMessage({
    required String threadId,
    required CommunityProfile sender,
    required String recipientId,
    required String text,
  }) async {
    final body = text.trim();
    if (body.isEmpty) return;
    final trimmed = body.length > maxMessageLength
        ? body.substring(0, maxMessageLength)
        : body;
    final doc = _chats.doc(threadId);
    final batch = _firestore.batch()
      ..set(doc.collection('messages').doc(), {
        'senderId': sender.uid,
        'text': trimmed,
        'createdAt': FieldValue.serverTimestamp(),
      })
      ..update(doc, {
        'lastMessage': trimmed,
        'lastSenderId': sender.uid,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unread.$recipientId': FieldValue.increment(1),
        // Sending is also reading: whatever the other side said before this
        // reply, the sender has plainly seen it.
        'unread.${sender.uid}': 0,
        'participantProfiles.${sender.uid}': ChatParticipant.fromProfile(sender)
            .toMap(),
      });
    await batch.commit();
  }

  /// Clears this member's unread count. Best-effort: a failed clear costs a
  /// badge that is one conversation stale, never a lost message.
  /// Loads one conversation by id.
  ///
  /// A push carries a thread id and nothing else, so the name and face the
  /// screen needs have to be recovered from the thread's own stamps. Returns
  /// null when the thread is gone or the reader is not part of it — the rules
  /// refuse the read in that case, and a refusal is the same answer as absent.
  Future<ChatThread?> loadThread({
    required String threadId,
    required String uid,
  }) async {
    try {
      final doc = await _chats.doc(threadId).get();
      if (!doc.exists) return null;
      return ChatThread.fromDoc(doc, uid);
    } on FirebaseException {
      return null;
    }
  }

  Future<void> markRead({required String threadId, required String uid}) async {
    try {
      await _chats.doc(threadId).update({'unread.$uid': 0});
    } on FirebaseException {
      // The thread may not exist yet, which means there is nothing to clear.
    }
  }

  Future<void> deleteMessage({
    required String threadId,
    required String messageId,
  }) => _chats.doc(threadId).collection('messages').doc(messageId).delete();
}
