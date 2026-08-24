import 'package:flutter/foundation.dart';

/// Who said it.
enum KawuriRole { you, kawuri }

/// One turn in a Kawuri conversation.
@immutable
class KawuriMessage {
  const KawuriMessage({
    required this.id,
    required this.role,
    required this.text,
    required this.sentAt,
    this.isStreaming = false,
    this.failed = false,
    this.fromOfflineGuide = false,
  });

  final String id;
  final KawuriRole role;
  final String text;
  final DateTime sentAt;
  final bool isStreaming;
  final bool failed;

  /// True when this answer came from the on-device guide rather than the model,
  /// so the UI can label it honestly instead of passing it off as a full
  /// answer.
  final bool fromOfflineGuide;

  bool get isYou => role == KawuriRole.you;

  KawuriMessage copyWith({
    String? text,
    bool? isStreaming,
    bool? failed,
    bool? fromOfflineGuide,
  }) => KawuriMessage(
    id: id,
    role: role,
    text: text ?? this.text,
    sentAt: sentAt,
    isStreaming: isStreaming ?? this.isStreaming,
    failed: failed ?? this.failed,
    fromOfflineGuide: fromOfflineGuide ?? this.fromOfflineGuide,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'role': role.name,
    'text': text,
    'sentAt': sentAt.millisecondsSinceEpoch,
    if (failed) 'failed': true,
    if (fromOfflineGuide) 'offline': true,
  };

  static KawuriMessage fromJson(Map<String, Object?> json) => KawuriMessage(
    id: (json['id'] as String?) ?? '${json['sentAt'] ?? ''}',
    role: json['role'] == 'you' ? KawuriRole.you : KawuriRole.kawuri,
    text: (json['text'] as String?) ?? '',
    sentAt: DateTime.fromMillisecondsSinceEpoch(
      (json['sentAt'] as int?) ?? 0,
      isUtc: false,
    ),
    failed: json['failed'] == true,
    fromOfflineGuide: json['offline'] == true,
  );
}

/// A saved conversation, as it appears in the history sheet.
@immutable
class KawuriSession {
  const KawuriSession({
    required this.id,
    required this.title,
    required this.messages,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final List<KawuriMessage> messages;
  final DateTime updatedAt;

  /// A short label for the history list, taken from the opening question.
  static String titleFor(List<KawuriMessage> messages) {
    final first = messages
        .where((message) => message.isYou && message.text.trim().isNotEmpty)
        .map((message) => message.text.trim())
        .firstOrNull;
    if (first == null || first.isEmpty) return 'New conversation';
    final single = first.replaceAll(RegExp(r'\s+'), ' ');
    return single.length <= 42 ? single : '${single.substring(0, 41)}…';
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'updatedAt': updatedAt.millisecondsSinceEpoch,
    'messages': messages.map((message) => message.toJson()).toList(),
  };

  static KawuriSession? fromJson(Map<String, Object?> json) {
    final rawMessages = json['messages'];
    if (rawMessages is! List) return null;
    final messages = rawMessages
        .whereType<Map<String, Object?>>()
        .map(KawuriMessage.fromJson)
        .where((message) => message.text.trim().isNotEmpty)
        .toList(growable: false);
    if (messages.isEmpty) return null;
    return KawuriSession(
      id: (json['id'] as String?) ?? '${json['updatedAt'] ?? ''}',
      title: (json['title'] as String?)?.trim().isNotEmpty ?? false
          ? (json['title'] as String).trim()
          : KawuriSession.titleFor(messages),
      messages: messages,
      updatedAt: DateTime.fromMillisecondsSinceEpoch(
        (json['updatedAt'] as int?) ?? 0,
      ),
    );
  }
}

/// A tappable starter shown on the empty state.
@immutable
class KawuriPrompt {
  const KawuriPrompt({
    required this.label,
    required this.prompt,
    required this.glyph,
  });

  final String label;
  final String prompt;

  /// A cultural motif rather than an icon, so the starters read as Indigen.
  final String glyph;
}

const kawuriPrompts = <KawuriPrompt>[
  KawuriPrompt(
    glyph: '✣',
    label: 'Greetings',
    prompt:
        'Teach me how greetings work in Kasena culture — who greets first, '
        'and what a respectful exchange looks like.',
  ),
  KawuriPrompt(
    glyph: '▥',
    label: 'Festivals',
    prompt: 'Tell me about the Fao festival and what it means to the Kasena.',
  ),
  KawuriPrompt(
    glyph: '◒',
    label: 'Compound houses',
    prompt:
        'Explain the painted Kasena compound houses of Sirigu and Paga — how '
        'they are built and what the patterns mean.',
  ),
  KawuriPrompt(
    glyph: '◉',
    label: 'Contribute well',
    prompt:
        'How should I record a word from an elder so it is useful and '
        'respectful when I contribute it to Indigen World?',
  ),
  KawuriPrompt(
    glyph: '●',
    label: 'Practice plan',
    prompt: 'Build me a gentle 7-day plan for learning my first Kasem phrases.',
  ),
  KawuriPrompt(
    glyph: '◆',
    label: 'Proverbs',
    prompt:
        'What role do proverbs play in Kasena storytelling, and how are they '
        'used in everyday speech?',
  ),
];
