/// Shared capability vocabulary. Availability reflects implemented adapters,
/// never whether an icon has been added to the screen.
enum KawuriTaskType {
  chat('chat', 'Ask Kawuri'),
  translation('translation', 'Translate'),
  imageGeneration('image_generation', 'Create image'),
  videoGeneration('video_generation', 'Create video'),
  mediaAnalysis('media_analysis', 'Analyse media'),
  languagePractice('language_practice', 'Practice language'),
  contributionHelp('contribution_help', 'Help me contribute'),
  storyHelp('story_help', 'Write a story'),
  pronunciation('pronunciation', 'Pronunciation'),
  imageEdit('image_edit', 'Edit image'),
  culturalContext('cultural_context', 'Cultural context');

  const KawuriTaskType(this.wireName, this.label);
  final String wireName;
  final String label;

  bool get available => switch (this) {
    chat ||
    translation ||
    languagePractice ||
    contributionHelp ||
    storyHelp ||
    culturalContext => true,
    _ => false,
  };

  static KawuriTaskType parse(Object? value) =>
      values.firstWhere((type) => type.wireName == value, orElse: () => chat);
}

enum KawuriTaskStatus {
  draft,
  queued,
  generating,
  processing,
  ready,
  failed,
  cancelled,
  expired;

  bool get terminal => switch (this) {
    ready || failed || cancelled || expired => true,
    _ => false,
  };
}

/// Provider-neutral envelope. Authentication on the server must determine
/// ownership; userId is context, never an authorization assertion.
class KawuriRequest {
  const KawuriRequest({
    required this.id,
    required this.conversationId,
    required this.userId,
    required this.type,
    required this.prompt,
    required this.createdAt,
    required this.updatedAt,
    this.languageContext = const {},
    this.communityContext = const {},
    this.generationOptions = const {},
    this.attachments = const [],
    this.status = KawuriTaskStatus.draft,
    this.provider,
  });
  final String id;
  final String conversationId;
  final String? userId;
  final KawuriTaskType type;
  final String prompt;
  final List<Map<String, Object?>> attachments;
  final Map<String, String> languageContext;
  final Map<String, String> communityContext;
  final Map<String, String> generationOptions;
  final KawuriTaskStatus status;
  final String? provider;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => {
    'requestId': id,
    'conversationId': conversationId,
    'userId': userId,
    'capability': type.wireName,
    'prompt': prompt,
    'attachments': attachments,
    'languageContext': languageContext,
    'communityContext': communityContext,
    'generationOptions': generationOptions,
    'status': status.name,
    'provider': provider,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };
}
