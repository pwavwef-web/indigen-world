import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Words typed into a conversation and not yet sent.
///
/// ── Why a draft outlives the screen ───────────────────────────────────────
/// Leaving a conversation used to throw away whatever was in the box. People
/// leave mid-sentence all the time — to check a word in the dictionary, to
/// copy a phone number from another thread, because the phone rang — and came
/// back to an empty field and a message they now had to remember. The text is
/// kept per conversation, on this phone, and the inbox row says "Draft:" so a
/// half-written reply is not quietly forgotten either.
///
/// Kept per account as well as per thread: a shared phone must not show one
/// member's unsent words to the next person who signs in.

/// How many conversations keep a draft. Past this the oldest is dropped —
/// a draft nobody has come back to in fifty conversations is not coming back.
const maxChatDrafts = 50;

String chatDraftsKey(String uid) => 'indigen_world_chat_drafts_v1_$uid';

class ChatDrafts extends Notifier<Map<String, String>> {
  String? _uid;
  Completer<void> _loaded = Completer<void>();

  @override
  Map<String, String> build() {
    _uid = ref.watch(currentUidProvider);
    _loaded = Completer<void>();
    unawaited(_load(_uid));
    return const {};
  }

  Future<void> _load(String? uid) async {
    try {
      if (uid == null) return;
      final stored = await _stored(uid);
      if (ref.mounted && uid == _uid) state = stored;
    } finally {
      if (!_loaded.isCompleted) _loaded.complete();
    }
  }

  /// What is on disk for [uid]. Read directly, rather than through [state],
  /// when this store has been torn down — a conversation closed during
  /// sign-out still has its last words to keep.
  static Future<Map<String, String>> _stored(String uid) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(chatDraftsKey(uid));
      final decoded = raw == null ? null : jsonDecode(raw);
      if (decoded is! Map) return const {};
      return {
        for (final entry in decoded.entries)
          if (entry.key is String &&
              entry.value is String &&
              (entry.value as String).trim().isNotEmpty)
            entry.key as String: entry.value as String,
      };
    } on Object {
      // A draft store that cannot be read is an empty one.
      return const {};
    }
  }

  /// The draft for [threadId], once the stored drafts have been read.
  Future<String?> read(String threadId) async {
    await _loaded.future;
    return ref.mounted ? state[threadId] : null;
  }

  /// Keeps [text] as the draft for [threadId], or forgets it when blank.
  Future<void> save(String threadId, String text) async {
    final uid = _uid;
    if (uid == null) return;
    await _loaded.future;
    final kept = text.length > ChatRepository.maxMessageLength
        ? text.substring(0, ChatRepository.maxMessageLength)
        : text;
    final current = ref.mounted ? state : await _stored(uid);
    final blank = kept.trim().isEmpty;
    if (blank ? !current.containsKey(threadId) : current[threadId] == kept) {
      return;
    }
    // Re-inserted at the end, so the map's order is oldest-touched first and
    // trimming drops the draft that has waited longest.
    final next = Map<String, String>.of(current)..remove(threadId);
    if (!blank) next[threadId] = kept;
    while (next.length > maxChatDrafts) {
      next.remove(next.keys.first);
    }
    if (ref.mounted) state = next;
    try {
      final preferences = await SharedPreferences.getInstance();
      if (next.isEmpty) {
        await preferences.remove(chatDraftsKey(uid));
      } else {
        await preferences.setString(chatDraftsKey(uid), jsonEncode(next));
      }
    } on Object {
      /* the draft stays in memory for this session */
    }
  }

  Future<void> clear(String threadId) => save(threadId, '');
}

final chatDraftsProvider = NotifierProvider<ChatDrafts, Map<String, String>>(
  ChatDrafts.new,
);
