import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Everything the Kawuri screen renders.
@immutable
class KawuriState {
  const KawuriState({
    this.messages = const [],
    this.history = const [],
    this.thinking = false,
    this.restored = false,
  });

  final List<KawuriMessage> messages;

  /// Past conversations, newest first.
  final List<KawuriSession> history;

  /// True while an answer is in flight.
  final bool thinking;

  /// True once the saved conversation has been read back from disk, so the
  /// welcome state does not flash before a restored chat appears.
  final bool restored;

  bool get isEmpty => messages.isEmpty;

  KawuriState copyWith({
    List<KawuriMessage>? messages,
    List<KawuriSession>? history,
    bool? thinking,
    bool? restored,
  }) => KawuriState(
    messages: messages ?? this.messages,
    history: history ?? this.history,
    thinking: thinking ?? this.thinking,
    restored: restored ?? this.restored,
  );
}

/// Drives one Kawuri conversation and persists it across launches.
///
/// History lives in shared preferences rather than Firestore on purpose: a
/// conversation with an assistant is a private working note, and keeping it on
/// the device means a guest gets the full feature without an account and
/// nothing is uploaded that nobody asked to upload.
class KawuriController extends Notifier<KawuriState> {
  static const _activeKey = 'kawuri_active_conversation_v1';
  static const _historyKey = 'kawuri_conversation_history_v1';

  /// Past conversations kept. Beyond this the oldest are dropped, so the
  /// preference blob cannot grow without bound.
  static const maxHistory = 20;

  Timer? _saveDebounce;
  var _messageCounter = 0;

  @override
  KawuriState build() {
    ref.onDispose(() => _saveDebounce?.cancel());
    unawaited(_restore());
    return const KawuriState();
  }

  Future<void> _restore() async {
    final preferences = await SharedPreferences.getInstance();
    final messages = _decodeMessages(preferences.getString(_activeKey));
    final history = _decodeHistory(preferences.getString(_historyKey));
    state = state.copyWith(
      // A member can start typing before the disk read lands. Their live
      // conversation wins — restoring over it would delete what they just said.
      messages: state.messages.isEmpty ? messages : state.messages,
      history: history,
      restored: true,
    );
  }

  /// Sends [text] and appends Kawuri's answer.
  Future<void> send(String text) async {
    final question = text.trim();
    if (question.isEmpty || state.thinking) return;

    final asked = KawuriMessage(
      id: _nextId(),
      role: KawuriRole.you,
      text: question,
      sentAt: DateTime.now(),
    );
    final conversation = [...state.messages, asked];
    state = state.copyWith(messages: conversation, thinking: true);

    final answer = await ref.read(kawuriServiceProvider).ask(conversation);

    // The member may have started a new chat, or opened an old one, while the
    // answer was in flight. Dropping the reply into whatever is on screen now
    // would attach it to a question nobody asked.
    if (state.messages.lastOrNull?.id != asked.id) {
      state = state.copyWith(thinking: false);
      return;
    }

    state = state.copyWith(
      thinking: false,
      messages: [
        ...state.messages,
        KawuriMessage(
          id: _nextId(),
          role: KawuriRole.kawuri,
          text: answer.text,
          sentAt: DateTime.now(),
          fromOfflineGuide: answer.fromOfflineGuide,
        ),
      ],
    );
    _scheduleSave();
  }

  /// Re-asks the last question, replacing the answer that followed it.
  Future<void> retryLast() async {
    if (state.thinking) return;
    final messages = [...state.messages];
    while (messages.isNotEmpty && !messages.last.isYou) {
      messages.removeLast();
    }
    if (messages.isEmpty) return;
    final question = messages.removeLast().text;
    state = state.copyWith(messages: messages);
    await send(question);
  }

  /// Files the current conversation into history and starts an empty one.
  Future<void> startNewConversation() async {
    final current = state.messages;
    if (current.isEmpty) return;

    final session = KawuriSession(
      id: _nextId(),
      title: KawuriSession.titleFor(current),
      messages: current,
      updatedAt: DateTime.now(),
    );
    final history = [
      session,
      ...state.history,
    ].take(maxHistory).toList(growable: false);

    state = state.copyWith(messages: const [], history: history);
    await _save();
  }

  /// Reopens a saved conversation, filing the current one first so nothing is
  /// lost by switching.
  Future<void> openSession(KawuriSession session) async {
    if (state.messages.isNotEmpty) await startNewConversation();
    state = state.copyWith(
      messages: session.messages,
      history: state.history
          .where((item) => item.id != session.id)
          .toList(growable: false),
    );
    await _save();
  }

  Future<void> deleteSession(KawuriSession session) async {
    state = state.copyWith(
      history: state.history
          .where((item) => item.id != session.id)
          .toList(growable: false),
    );
    await _save();
  }

  Future<void> clearEverything() async {
    state = state.copyWith(messages: const [], history: const []);
    await _save();
  }

  String _nextId() =>
      '${DateTime.now().microsecondsSinceEpoch}_${_messageCounter++}';

  /// Writes are debounced so a fast exchange does not hit the disk on every
  /// keystroke-sized state change.
  void _scheduleSave() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(const Duration(milliseconds: 600), () {
      unawaited(_save());
    });
  }

  Future<void> _save() async {
    _saveDebounce?.cancel();
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _activeKey,
        jsonEncode(state.messages.map((message) => message.toJson()).toList()),
      );
      await preferences.setString(
        _historyKey,
        jsonEncode(state.history.map((session) => session.toJson()).toList()),
      );
    } on Object catch (error) {
      debugPrint('Kawuri history save failed: $error');
    }
  }

  static List<KawuriMessage> _decodeMessages(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map<String, Object?>>()
          .map(KawuriMessage.fromJson)
          .where((message) => message.text.trim().isNotEmpty)
          .toList(growable: false);
    } on Object {
      // A corrupt blob is not worth crashing over; start fresh.
      return const [];
    }
  }

  static List<KawuriSession> _decodeHistory(String? raw) {
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map<String, Object?>>()
          .map(KawuriSession.fromJson)
          .whereType<KawuriSession>()
          .toList(growable: false);
    } on Object {
      return const [];
    }
  }
}

final kawuriControllerProvider =
    NotifierProvider<KawuriController, KawuriState>(KawuriController.new);
