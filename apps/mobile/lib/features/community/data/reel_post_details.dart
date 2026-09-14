import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';

/// What a reel is about, from a short controlled list.
///
/// ── Why this is not simply [PostCategory] ───────────────────────────────────
/// A post category is a colour on a feed card and a value the Security Rules
/// check, so it stays a handful of broad words. Cultural media wants to be
/// filed more precisely than that — a dance is not a song — so a reel carries
/// its own topic *and* the post category that topic belongs to. Everything
/// that already reads categories (the feed rail, Explore's topic row, the
/// rules) keeps working without learning a new word.
enum ReelTopic {
  storytelling('storytelling', 'Storytelling', PostCategory.story),
  music('music', 'Music', PostCategory.music),
  dance('dance', 'Dance', PostCategory.music),
  traditions('traditions', 'Traditions', PostCategory.culture),
  food('food', 'Food', PostCategory.culture),
  clothing('clothing', 'Clothing', PostCategory.culture),
  craft('craft', 'Craft', PostCategory.culture),
  history('history', 'History', PostCategory.story),
  communityLife('community_life', 'Community life', PostCategory.culture),
  other('other', 'Other', null);

  const ReelTopic(this.wire, this.label, this.postCategory);

  /// The stored value, and what the Security Rules accept.
  final String wire;
  final String label;

  /// The feed category this topic is filed under; null leaves it unfiled.
  final PostCategory? postCategory;

  static ReelTopic? fromWire(Object? raw) {
    for (final topic in values) {
      if (topic.wire == raw) return topic;
    }
    return null;
  }
}

/// The contributor's declaration of their right to publish.
enum ReelRights {
  created('created', 'I created this media'),
  permission('permission', 'I have permission to publish it'),
  lawfulReuse('lawful_reuse', 'This material is lawfully reusable');

  const ReelRights(this.wire, this.label);

  final String wire;

  /// In the contributor's own voice, as they confirm it.
  final String label;

  /// The same declaration in the third person, for a viewer.
  String get credit => switch (this) {
    ReelRights.created => 'Published by the person who created it',
    ReelRights.permission => "Published with the creator's permission",
    ReelRights.lawfulReuse => 'Shared as lawfully reusable material',
  };

  static ReelRights? fromWire(Object? raw) {
    for (final rights in values) {
      if (rights.wire == raw) return rights;
    }
    return null;
  }
}

/// What a reel carries beyond an ordinary community post: its topic, the
/// creator's account of what it shows, whose work it is, and on what terms it
/// is shared. Stored as `reel` on the post document.
@immutable
class ReelPostDetails {
  const ReelPostDetails({
    required this.topic,
    required this.rights,
    this.context = '',
    this.originalCreator = '',
    this.sourceOrganisation = '',
    this.ownWork = true,
    this.draftId,
  });

  static const maxContextLength = 1000;
  static const maxCreditLength = 120;

  final ReelTopic topic;
  final ReelRights rights;

  /// "What is happening?" — shown in Explore's Context sheet, never folded into
  /// the public caption.
  final String context;

  /// Who made the media. The contributor's own name when [ownWork].
  final String originalCreator;

  /// The organisation or community the media came from, when there is one.
  final String sourceOrganisation;

  /// Whether the contributor made the media themselves.
  final bool ownWork;

  /// The on-device draft this post was published from. Recorded so a retry
  /// that finds its own post already written can recognise it.
  final String? draftId;

  /// The attribution a viewer reads, or `''` when the contributor made it and
  /// named no source.
  String get attributionLine {
    final parts = <String>[
      if (!ownWork && originalCreator.trim().isNotEmpty)
        'Created by ${originalCreator.trim()}',
      if (sourceOrganisation.trim().isNotEmpty)
        'Source: ${sourceOrganisation.trim()}',
    ];
    return parts.join(' · ');
  }

  Map<String, Object?> toMap() => {
    'version': 1,
    'topic': topic.wire,
    'rights': rights.wire,
    'context': context.trim(),
    'originalCreator': originalCreator.trim(),
    'sourceOrganisation': sourceOrganisation.trim(),
    'ownWork': ownWork,
    'draftId': ?draftId,
  };

  /// Null when [raw] is not a reel declaration this app can stand behind — in
  /// particular when it names no rights, which the rules never let through.
  static ReelPostDetails? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final rights = ReelRights.fromWire(raw['rights']);
    if (rights == null) return null;
    String text(String key) => raw[key] is String ? raw[key] as String : '';
    return ReelPostDetails(
      topic: ReelTopic.fromWire(raw['topic']) ?? ReelTopic.other,
      rights: rights,
      context: text('context'),
      originalCreator: text('originalCreator'),
      sourceOrganisation: text('sourceOrganisation'),
      ownWork: raw['ownWork'] != false,
      draftId: raw['draftId'] is String ? raw['draftId'] as String : null,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is ReelPostDetails &&
      other.topic == topic &&
      other.rights == rights &&
      other.context == context &&
      other.originalCreator == originalCreator &&
      other.sourceOrganisation == sourceOrganisation &&
      other.ownWork == ownWork &&
      other.draftId == draftId;

  @override
  int get hashCode => Object.hash(
    topic,
    rights,
    context,
    originalCreator,
    sourceOrganisation,
    ownWork,
    draftId,
  );
}
