import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The community choices that live on this phone and nowhere else: muted
/// words, where a member last left each feed, and which communities' rules
/// they have already read.
///
/// ── Why on the phone ──────────────────────────────────────────────────────
/// None of these is anybody else's business, none of them has to follow a
/// member to a second phone for the feature to work, and keeping them out of
/// Firestore means no rule, index or function had to change for them. Each is
/// keyed by account, so two people sharing a phone do not share a list.

String _owner(String? uid) => uid ?? 'guest';

// ── Muted words ─────────────────────────────────────────────────────────────

const mutedWordsKeyPrefix = 'indigen_community_muted_words_v1_';

/// Most a member may mute. Enough for a list of real annoyances; a list of a
/// thousand would be a filter nobody can remember the reasons for.
const maxMutedWords = 50;

/// The muted word or phrase [post] contains, or null when it is clean.
///
/// Folded the way community search folds — case and tone marks dropped — so
/// muting "kasena" also hides "Kasɛna" written with its marks. A single word
/// matches only as a whole word, so muting "art" does not hide every post
/// about a party; a phrase with a space in it matches anywhere.
String? mutedWordIn(CommunityPost post, List<String> words) {
  if (words.isEmpty) return null;
  final haystack = communityFold(
    [
      post.text,
      for (final option in post.poll?.options ?? const <CommunityPollOption>[])
        option.text,
    ].join('\n'),
  ).replaceAll(RegExp(r'\s+'), ' ');
  for (final word in words) {
    final needle = communityFold(word.trim()).replaceAll(RegExp(r'\s+'), ' ');
    if (needle.isEmpty) continue;
    if (needle.contains(' ')) {
      if (haystack.contains(needle)) return word;
      continue;
    }
    final pattern = RegExp(
      '(?<![\\p{L}\\p{N}])${RegExp.escape(needle)}(?![\\p{L}\\p{N}])',
      unicode: true,
    );
    if (pattern.hasMatch(haystack)) return word;
  }
  return null;
}

class MutedWordsController extends Notifier<List<String>> {
  late String _key;

  @override
  List<String> build() {
    _key = '$mutedWordsKeyPrefix${_owner(ref.watch(currentUidProvider))}';
    unawaited(_restore(_key));
    return const <String>[];
  }

  Future<void> _restore(String key) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getStringList(key) ?? const <String>[];
      // The account may have changed while the read was in flight.
      if (key == _key) state = List.unmodifiable(stored);
    } on Object {
      // Nothing muted, which is what a first launch is anyway.
    }
  }

  /// Adds [word], ignoring case and tone marks when checking for a duplicate.
  /// Returns false when there was nothing to add.
  Future<bool> add(String word) async {
    final cleaned = word.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (cleaned.isEmpty || cleaned.length > 60) return false;
    final folded = communityFold(cleaned);
    if (state.any((existing) => communityFold(existing) == folded)) {
      return false;
    }
    if (state.length >= maxMutedWords) return false;
    await _save([...state, cleaned]);
    return true;
  }

  Future<void> remove(String word) => _save([
    for (final existing in state)
      if (existing != word) existing,
  ]);

  Future<void> _save(List<String> next) async {
    state = List.unmodifiable(next);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(_key, next);
    } on Object {
      // Holds for this session.
    }
  }
}

final mutedWordsProvider = NotifierProvider<MutedWordsController, List<String>>(
  MutedWordsController.new,
);

/// Posts the member has chosen to read despite a muted word, this session.
class RevealedPostsController extends Notifier<Set<String>> {
  @override
  Set<String> build() => const <String>{};

  void reveal(String postId) => state = {...state, postId};
}

final revealedMutedPostsProvider =
    NotifierProvider<RevealedPostsController, Set<String>>(
      RevealedPostsController.new,
    );

// ── Where the member last left a feed ───────────────────────────────────────

const feedVisitKeyPrefix = 'indigen_community_feed_seen_v1_';

/// The newest post a member had in front of them the last time they read a
/// feed, by feed — what the "You're caught up" line is drawn against.
class FeedVisitStore {
  const FeedVisitStore({required this.uid});

  final String? uid;

  String _key(String feed) => '$feedVisitKeyPrefix${_owner(uid)}_$feed';

  Future<DateTime?> read(String feed) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final millis = preferences.getInt(_key(feed));
      return millis == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
    } on Object {
      return null;
    }
  }

  /// Moves the mark forward to [newest]. Never backwards: a feed that has not
  /// loaded its newest page yet must not undo a later visit.
  Future<void> write(String feed, DateTime newest) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final previous = preferences.getInt(_key(feed));
      final at = newest.toUtc().millisecondsSinceEpoch;
      if (previous != null && previous >= at) return;
      await preferences.setInt(_key(feed), at);
    } on Object {
      // The line is a convenience; without the write it just will not move.
    }
  }
}

/// Where the line goes: the index of the first post the member had already
/// had the chance to see, or null when there is no line to draw.
///
/// Only drawn between a post newer than the last visit and a run of posts no
/// newer — a feed that is all new, or all old, has no "caught up" boundary
/// inside it. The run is what keeps the line honest on For you, where an
/// older post that few people saw is lifted a few rows up (see
/// `preventPostBurial`): one old post sitting among new ones is not the place
/// the member's reading ran out.
int? caughtUpIndex(
  List<CommunityPost> posts,
  DateTime? lastSeen, {
  int run = 3,
}) {
  if (lastSeen == null || posts.length < 2) return null;
  bool isNew(CommunityPost post) =>
      post.feedTimestamp?.isAfter(lastSeen) ?? false;
  for (var index = 1; index < posts.length; index++) {
    if (!isNew(posts[index - 1])) continue;
    final end = index + run < posts.length ? index + run : posts.length;
    if (posts.sublist(index, end).every((post) => !isNew(post))) return index;
  }
  return null;
}

// ── Community visits and rules ──────────────────────────────────────────────

const communityVisitsKeyPrefix = 'indigen_community_space_visits_v1_';
const communityRulesReadKeyPrefix = 'indigen_community_rules_read_v1_';

/// When the member last opened each community they belong to, by slug.
class CommunityVisitsController extends Notifier<Map<String, DateTime>> {
  late String _key;

  @override
  Map<String, DateTime> build() {
    _key = '$communityVisitsKeyPrefix${_owner(ref.watch(currentUidProvider))}';
    unawaited(_restore(_key));
    return const <String, DateTime>{};
  }

  Future<void> _restore(String key) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final raw = preferences.getString(key);
      if (raw == null || key != _key) return;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      state = {
        for (final MapEntry(:key, :value) in decoded.entries)
          if (key is String && value is int)
            key: DateTime.fromMillisecondsSinceEpoch(value, isUtc: true),
        // Anything visited this session before the read finished wins.
        ...state,
      };
    } on Object {
      // Every community reads as unvisited, which only shows dots.
    }
  }

  Future<void> visit(String communityId, {DateTime? at}) async {
    state = {...state, communityId: (at ?? DateTime.now()).toUtc()};
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        _key,
        jsonEncode({
          for (final MapEntry(:key, :value) in state.entries)
            key: value.millisecondsSinceEpoch,
        }),
      );
    } on Object {
      // Holds for this session.
    }
  }
}

final communityVisitsProvider =
    NotifierProvider<CommunityVisitsController, Map<String, DateTime>>(
      CommunityVisitsController.new,
    );

/// Whether a community has posts the member has not been back to see.
///
/// A community never visited on this phone counts as having nothing new: the
/// dot means "something since you were last here", and there was no last time.
bool communityHasNews({required DateTime? latestPost, DateTime? lastVisit}) =>
    latestPost != null && lastVisit != null && latestPost.isAfter(lastVisit);

/// Whether the member has read a community's rules before posting into it.
class CommunityRulesReadStore {
  const CommunityRulesReadStore({required this.uid});

  final String? uid;

  String get _key => '$communityRulesReadKeyPrefix${_owner(uid)}';

  Future<bool> hasRead(String communityId) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      return (preferences.getStringList(_key) ?? const <String>[]).contains(
        communityId,
      );
    } on Object {
      // Unknown reads as read: a rules sheet on every post because storage
      // failed would be worse than one sheet missed.
      return true;
    }
  }

  Future<void> markRead(String communityId) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final read = preferences.getStringList(_key) ?? const <String>[];
      if (read.contains(communityId)) return;
      await preferences.setStringList(_key, [...read, communityId]);
    } on Object {
      // Asked again next time, which is harmless.
    }
  }
}

/// When the newest post in a community was written, for its dot.
typedef CommunityAddress = ({String id, bool isPrivate});

final communityLatestPostAtProvider = FutureProvider.autoDispose
    .family<DateTime?, CommunityAddress>((ref, address) async {
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return null;
      try {
        return await repository.latestCommunityPostAt(
          address.id,
          isPrivate: address.isPrivate,
        );
      } on Object {
        // No dot is the quiet failure.
        return null;
      }
    });

/// Whether [address] has posts since the member was last in it.
final communityHasNewsProvider = Provider.autoDispose
    .family<bool, CommunityAddress>((ref, address) {
      final lastVisit = ref.watch(
        communityVisitsProvider.select((visits) => visits[address.id]),
      );
      final latest = ref
          .watch(communityLatestPostAtProvider(address))
          .asData
          ?.value;
      return communityHasNews(latestPost: latest, lastVisit: lastVisit);
    });
