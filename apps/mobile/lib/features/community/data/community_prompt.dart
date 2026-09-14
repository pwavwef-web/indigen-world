import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';

/// The language the main Community feed prompts in when nobody has published a
/// prompt of their own.
///
/// Configuration, not architecture: nothing that draws a prompt knows this
/// value. A community that speaks something else passes its own language, and
/// a prompt document overrides both.
const String kHomeFeedPromptLanguage = 'Kasem';

/// The scope the main feed's prompt document is stored under.
const String kHomeFeedPromptScope = 'home';

/// One small invitation to take part — "Today in Kasem: share a word from
/// home" — drawn as a strip above the composer.
///
/// Mirrors `communityPrompts/{scope}`, where `scope` is [kHomeFeedPromptScope]
/// for the main feed or a community's slug. Staff rotate the document; the app
/// only ever reads it, and falls back to a built-in invitation whenever there
/// is no document, it is switched off, or its dates have passed. That fallback
/// is why an empty collection is a perfectly good production state.
class CommunityPrompt {
  const CommunityPrompt({
    required this.id,
    required this.title,
    required this.subtitle,
    this.composeHint,
    this.initialText = '',
    this.category,
    this.imageUrl,
  });

  final String id;
  final String title;
  final String subtitle;

  /// What the composer's empty field says when the prompt opens it.
  final String? composeHint;

  /// Words the composer starts with, for a prompt that wants a shape.
  final String initialText;

  /// The label a post written from this prompt carries.
  final PostCategory? category;

  /// A picture to use in place of the drawn textile motif.
  final String? imageUrl;

  /// The prompt in [data], or null when it should not be shown at [now].
  static CommunityPrompt? fromMap(
    String id,
    Map<String, dynamic> data, {
    DateTime? now,
  }) {
    if (data['active'] == false) return null;
    final title = data['title'];
    final subtitle = data['subtitle'];
    if (title is! String || title.trim().isEmpty) return null;
    final moment = now ?? DateTime.now();
    final startsAt = (data['startsAt'] as Timestamp?)?.toDate();
    final endsAt = (data['endsAt'] as Timestamp?)?.toDate();
    if (startsAt != null && moment.isBefore(startsAt)) return null;
    if (endsAt != null && !moment.isBefore(endsAt)) return null;
    final hint = data['composeHint'];
    final initial = data['initialText'];
    final image = data['imageUrl'];
    return CommunityPrompt(
      id: id,
      title: title.trim(),
      subtitle: subtitle is String ? subtitle.trim() : '',
      composeHint: hint is String && hint.trim().isNotEmpty
          ? hint.trim()
          : null,
      initialText: initial is String ? initial : '',
      category: PostCategory.fromWire(data['category']),
      imageUrl: image is String && image.isNotEmpty ? image : null,
    );
  }
}
