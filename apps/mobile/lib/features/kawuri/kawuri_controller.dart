import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';
import 'package:shared_preferences/shared_preferences.dart';

@immutable
class KawuriState {
  const KawuriState({
    this.messages = const [],
    this.history = const [],
    this.thinking = false,
    this.restored = false,
    this.conversationId = '',
    this.title = '',
    this.draft = '',
    this.mode = KawuriTaskType.chat,
    this.options = const {},
    this.storageError,
  });
  final List<KawuriMessage> messages;
  final List<KawuriSession> history;
  final bool thinking;
  final bool restored;
  final String conversationId;
  final String title;
  final String draft;
  final KawuriTaskType mode;
  final Map<String, String> options;
  final String? storageError;
  bool get isEmpty => messages.isEmpty;
  KawuriState copyWith({
    List<KawuriMessage>? messages,
    List<KawuriSession>? history,
    bool? thinking,
    bool? restored,
    String? conversationId,
    String? title,
    String? draft,
    KawuriTaskType? mode,
    Map<String, String>? options,
    String? storageError,
  }) => KawuriState(
    messages: messages ?? this.messages,
    history: history ?? this.history,
    thinking: thinking ?? this.thinking,
    restored: restored ?? this.restored,
    conversationId: conversationId ?? this.conversationId,
    title: title ?? this.title,
    draft: draft ?? this.draft,
    mode: mode ?? this.mode,
    options: options ?? this.options,
    storageError: storageError ?? this.storageError,
  );
}

/// Private device history is isolated by account. A request owns its original
/// conversation even when the member opens another chat while it is pending.
class KawuriController extends Notifier<KawuriState> {
  Timer? _saveDebounce;
  int _counter = 0;
  int _epoch = 0;
  String _owner = 'guest';
  final _pending = <String, String>{};
  Future<void> _writes = Future.value();

  @override
  KawuriState build() {
    _owner = ref.watch(currentUidProvider) ?? 'guest';
    final epoch = ++_epoch;
    _pending.clear();
    ref.onDispose(() {
      _saveDebounce?.cancel();
      _epoch++;
    });
    unawaited(_restore(epoch));
    return KawuriState(conversationId: _nextId());
  }

  String get _key => 'kawuri_workspace_v2_$_owner';
  String _nextId() => '${DateTime.now().microsecondsSinceEpoch}_${_counter++}';

  Future<void> _restore(int epoch) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (epoch != _epoch) return;
      final raw = prefs.getString(_key);
      if (raw != null) {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        state = state.copyWith(
          conversationId: data['conversationId'] as String?,
          title: data['title'] as String? ?? '',
          messages: _messages(data['messages']),
          history: _sessions(data['history']),
          draft: data['draft'] as String? ?? '',
          mode: KawuriTaskType.parse(data['mode']),
          options: (data['options'] as Map?)?.map(
            (k, v) => MapEntry('$k', '$v'),
          ),
        );
      } else if (_owner == 'guest') {
        // Old unscoped notes remain guest-owned; never assign them to an account.
        state = state.copyWith(
          messages: _messages(
            _decode(prefs.getString('kawuri_active_conversation_v1')),
          ),
          history: _sessions(
            _decode(prefs.getString('kawuri_conversation_history_v1')),
          ),
        );
      }
    } on Object {
      if (epoch != _epoch) return;
      state = state.copyWith(
        storageError: 'Saved history could not be restored.',
      );
    }
    if (epoch == _epoch) {
      state = state.copyWith(
        restored: true,
        messages: _recoverInterrupted(state.messages),
        history: state.history
            .map(
              (session) => KawuriSession(
                id: session.id,
                title: session.title,
                messages: _recoverInterrupted(session.messages),
                updatedAt: session.updatedAt,
              ),
            )
            .toList(),
      );
    }
  }

  static List<KawuriMessage> _recoverInterrupted(List<KawuriMessage> messages) {
    final last = messages.lastOrNull;
    if (last == null || !last.isYou) return messages;
    return [
      ...messages,
      KawuriMessage(
        id: '${last.id}_interrupted',
        role: KawuriRole.kawuri,
        text: 'This response was interrupted when the app closed. Your question is saved. Retrying sends a new request and may use your chat allowance.',
        sentAt: DateTime.now(),
        failed: true,
        taskType: last.taskType,
        options: last.options,
        conversationId: last.conversationId,
      ),
    ];
  }

  Future<void> flush() => state.restored ? _save() : Future.value();

  void configure(
    KawuriTaskType mode, {
    String? draft,
    Map<String, String>? options,
  }) {
    state = state.copyWith(mode: mode, draft: draft, options: options);
    _scheduleSave();
  }

  void updateDraft(String text) {
    if (!state.restored) return;
    state = state.copyWith(draft: text);
    _scheduleSave();
  }

  Future<void> send(String text) async {
    final question = text.trim();
    if (question.isEmpty ||
        state.thinking ||
        !state.restored ||
        !state.mode.available) {
      return;
    }
    final epoch = _epoch;
    final conversationId = state.conversationId;
    final asked = KawuriMessage(
      id: _nextId(),
      role: KawuriRole.you,
      text: question,
      sentAt: DateTime.now(),
      taskType: state.mode,
      options: state.options,
      conversationId: conversationId,
    );
    final conversation = [...state.messages, asked];
    _pending[conversationId] = asked.id;
    state = state.copyWith(messages: conversation, thinking: true, draft: '');
    unawaited(_save());
    KawuriAnswer answer;
    try {
      answer = await ref
          .read(kawuriServiceProvider)
          .ask(conversation)
          .timeout(const Duration(seconds: 50));
    } on TimeoutException {
      answer = const KawuriAnswer(
        text: 'The request timed out. You can retry when ready.',
        failed: true,
      );
    } on Object {
      answer = const KawuriAnswer(
        text: 'The request failed. Check your connection and retry.',
        failed: true,
      );
    }
    if (epoch != _epoch || _pending[conversationId] != asked.id) return;
    _pending.remove(conversationId);
    final reply = KawuriMessage(
      id: _nextId(),
      role: KawuriRole.kawuri,
      text: answer.text,
      sentAt: DateTime.now(),
      fromOfflineGuide: answer.fromOfflineGuide,
      failed: answer.failed,
      sources: answer.sources,
      incomplete: answer.incomplete,
      taskType: asked.taskType,
      options: asked.options,
      conversationId: conversationId,
    );
    if (state.conversationId == conversationId) {
      state = state.copyWith(
        messages: [...state.messages, reply],
        thinking: false,
      );
    } else {
      state = state.copyWith(
        history: state.history
            .map(
              (session) => session.id != conversationId
                  ? session
                  : KawuriSession(
                      id: session.id,
                      title: session.title,
                      messages: [...session.messages, reply],
                      updatedAt: DateTime.now(),
                    ),
            )
            .toList(),
      );
    }
    await _save();
  }

  void stop() {
    if (!state.thinking) return;
    _pending.remove(state.conversationId);
    state = state.copyWith(
      thinking: false,
      messages: [
        ...state.messages,
        KawuriMessage(
          id: _nextId(),
          role: KawuriRole.kawuri,
          text: 'Stopped waiting for this response. The server request may still finish and count toward your allowance.',
          sentAt: DateTime.now(),
          failed: true,
        ),
      ],
    );
    unawaited(_save());
  }

  Future<void> retryLast() async {
    if (state.thinking) return;
    final messages = [...state.messages];
    while (messages.isNotEmpty && !messages.last.isYou) {
      messages.removeLast();
    }
    if (messages.isEmpty) return;
    final question = messages.removeLast();
    state = state.copyWith(
      messages: messages,
      mode: question.taskType,
      options: question.options,
    );
    await send(question.text);
  }

  List<KawuriSession> _archive() {
    if (state.messages.isEmpty) return state.history;
    return [
      KawuriSession(
        id: state.conversationId,
        title: state.title.isEmpty
            ? KawuriSession.titleFor(state.messages)
            : state.title,
        messages: state.messages,
        updatedAt: DateTime.now(),
      ),
      ...state.history.where((s) => s.id != state.conversationId),
    ];
  }

  Future<void> startNewConversation() async {
    if (!state.restored) return;
    state = state.copyWith(
      history: _archive(),
      messages: [],
      thinking: false,
      conversationId: _nextId(),
      title: '',
      draft: '',
      mode: KawuriTaskType.chat,
      options: {},
    );
    await _save();
  }

  Future<void> openSession(KawuriSession session) async {
    state = state.copyWith(
      history: _archive().where((s) => s.id != session.id).toList(),
      messages: session.messages,
      conversationId: session.id,
      title: session.title,
      thinking: _pending.containsKey(session.id),
      draft: '',
      mode: session.messages.lastOrNull?.taskType ?? KawuriTaskType.chat,
    );
    await _save();
  }

  Future<void> renameSession(KawuriSession session, String title) async {
    if (title.trim().isEmpty) return;
    state = state.copyWith(
      history: state.history
          .map(
            (s) => s.id == session.id
                ? KawuriSession(
                    id: s.id,
                    title: title.trim(),
                    messages: s.messages,
                    updatedAt: s.updatedAt,
                  )
                : s,
          )
          .toList(),
    );
    await _save();
  }

  Future<void> deleteSession(KawuriSession session) async {
    _pending.remove(session.id);
    state = state.copyWith(
      history: state.history.where((s) => s.id != session.id).toList(),
    );
    await _save();
  }

  Future<void> clearEverything() async {
    _pending.clear();
    state = KawuriState(restored: true, conversationId: _nextId());
    await _save();
  }

  void _scheduleSave() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(
      const Duration(milliseconds: 350),
      () => unawaited(_save()),
    );
  }

  Future<void> _save() {
    _saveDebounce?.cancel();
    final key = _key;
    final epoch = _epoch;
    final payload = jsonEncode({
      'conversationId': state.conversationId,
      'title': state.title,
      'draft': state.draft,
      'mode': state.mode.wireName,
      'options': state.options,
      'messages': state.messages.map((m) => m.toJson()).toList(),
      'history': state.history.map((s) => s.toJson()).toList(),
    });
    // Serialize writes so an older snapshot cannot overwrite a new conversation.
    _writes = _writes.then((_) async {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(key, payload);
      } on Object {
        if (epoch == _epoch) {
          state = state.copyWith(
            storageError: 'History could not be saved on this device.',
          );
        }
      }
    });
    return _writes;
  }

  static Object? _decode(String? raw) => raw == null ? null : jsonDecode(raw);
  static List<KawuriMessage> _messages(Object? raw) => raw is! List
      ? []
      : raw
            .whereType<Map>()
            .map((m) => KawuriMessage.fromJson(Map<String, Object?>.from(m)))
            .toList();
  static List<KawuriSession> _sessions(Object? raw) => raw is! List
      ? []
      : raw
            .whereType<Map>()
            .map((m) => KawuriSession.fromJson(Map<String, Object?>.from(m)))
            .whereType<KawuriSession>()
            .toList();
}

final kawuriControllerProvider =
    NotifierProvider<KawuriController, KawuriState>(KawuriController.new);
