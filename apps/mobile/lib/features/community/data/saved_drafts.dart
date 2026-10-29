import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/data/post_event.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A post somebody chose to finish later.
///
/// ── Not the rescue draft ──────────────────────────────────────────────────
/// `ComposeDraftStore` holds the one post Android may have destroyed while the
/// camera was open, and it is cleared whenever a composer closes — because a
/// rescue that outlived an ordinary exit would offer back posts nobody wants.
/// These are the opposite: kept because the member said "save draft" on the
/// way out, listed under Drafts, and gone only when posted or thrown away.
///
/// Only top-level posts are kept. A half-written reply belongs to a
/// conversation that will have moved on by the time it is picked up again.
@immutable
class SavedDraft {
  const SavedDraft({
    required this.id,
    required this.text,
    required this.savedAt,
    this.category,
    this.community,
    this.attachmentPaths = const <String>[],
    this.descriptions = const <String>[],
    this.event,
  });

  final String id;
  final String text;
  final DateTime savedAt;
  final PostCategory? category;
  final PostCommunityStamp? community;

  /// Staged photos and clips, in the app's own cache. One that the system has
  /// since cleaned away is dropped when the draft is opened.
  final List<String> attachmentPaths;

  /// Each attachment's image description, by position.
  final List<String> descriptions;
  final PostEvent? event;

  bool get isEmpty => text.trim().isEmpty && attachmentPaths.isEmpty;

  /// The attachments that still exist on disk, with their descriptions.
  List<({String path, String description})> get survivingAttachments => [
    for (final (index, path) in attachmentPaths.indexed)
      if (File(path).existsSync())
        (
          path: path,
          description: index < descriptions.length ? descriptions[index] : '',
        ),
  ];

  Map<String, Object?> toJson() => {
    'id': id,
    'text': text,
    'savedAt': savedAt.millisecondsSinceEpoch,
    'category': ?category?.wire,
    if (community case final stamp?)
      'community': {
        'id': stamp.id,
        'name': stamp.name,
        'isPrivate': stamp.isPrivate,
      },
    if (attachmentPaths.isNotEmpty) 'attachments': attachmentPaths,
    if (descriptions.any((text) => text.isNotEmpty))
      'descriptions': descriptions,
    'event': ?event?.toJson(),
  };

  static SavedDraft? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    final text = raw['text'];
    final savedAt = raw['savedAt'];
    if (id is! String || text is! String || savedAt is! int) return null;
    final community = raw['community'];
    return SavedDraft(
      id: id,
      text: text,
      savedAt: DateTime.fromMillisecondsSinceEpoch(savedAt),
      category: PostCategory.fromWire(raw['category']),
      community: community is Map && community['id'] is String
          ? PostCommunityStamp(
              id: community['id'] as String,
              name: community['name'] is String
                  ? community['name'] as String
                  : community['id'] as String,
              isPrivate: community['isPrivate'] == true,
            )
          : null,
      attachmentPaths: [
        for (final path
            in raw['attachments'] is List
                ? raw['attachments'] as List
                : const [])
          if (path is String) path,
      ],
      descriptions: [
        for (final text
            in raw['descriptions'] is List
                ? raw['descriptions'] as List
                : const [])
          text is String ? text : '',
      ],
      event: PostEvent.fromMap(raw['event']),
    );
  }
}

const savedDraftsKeyPrefix = 'indigen_community_saved_drafts_v1_';

/// How many drafts are kept. Saving a twenty-first drops the oldest — a
/// drafts list long enough to need its own search is not a list anybody
/// returns to.
const maxSavedDrafts = 20;

class SavedDraftsController extends Notifier<List<SavedDraft>> {
  late String _key;

  @override
  List<SavedDraft> build() {
    _key = '$savedDraftsKeyPrefix${ref.watch(currentUidProvider) ?? 'guest'}';
    unawaited(_restore(_key));
    return const <SavedDraft>[];
  }

  Future<void> _restore(String key) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(key);
      if (raw == null || key != _key) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      state = List.unmodifiable(
        decoded.map(SavedDraft.fromJson).whereType<SavedDraft>(),
      );
    } on Object {
      // No drafts, which is what a first launch is anyway.
    }
  }

  /// Saves [draft], replacing any earlier copy with the same id, newest first.
  Future<void> save(SavedDraft draft) async {
    if (draft.isEmpty) return remove(draft.id);
    final next = [
      draft,
      for (final existing in state)
        if (existing.id != draft.id) existing,
    ];
    await _write(next.take(maxSavedDrafts).toList(growable: false));
  }

  Future<void> remove(String id) async {
    if (!state.any((draft) => draft.id == id)) return;
    await _write([
      for (final existing in state)
        if (existing.id != id) existing,
    ]);
  }

  Future<void> _write(List<SavedDraft> next) async {
    state = List.unmodifiable(next);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _key,
        jsonEncode([for (final draft in next) draft.toJson()]),
      );
    } on Object {
      // Holds for this session.
    }
  }
}

final savedDraftsProvider =
    NotifierProvider<SavedDraftsController, List<SavedDraft>>(
      SavedDraftsController.new,
    );

/// A fresh draft id.
String newDraftId() => 'draft-${DateTime.now().microsecondsSinceEpoch}';
