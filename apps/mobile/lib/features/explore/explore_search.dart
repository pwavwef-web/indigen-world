import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Searching Explore.
///
/// The reels are matched on the device, against the feed already held in
/// memory. That is a deliberate choice rather than a placeholder for a search
/// service: it answers as the member types, it keeps answering when the
/// connection does not, and the corpus it searches is exactly what Explore is
/// willing to show — so a result can never be something the feed would have
/// filtered out.

/// How many terms the recents list keeps. Long enough to be useful, short
/// enough that it is still a list somebody can read rather than a log.
const int kMaxRecentSearches = 8;

const String _recentSearchesKey = 'explore.recentSearches';

/// Reels matching [query], strongest first.
///
/// Scored rather than merely filtered, because the fields are not equal: a
/// term in a title is what somebody meant, and the same term buried in a
/// licence line usually is not.
List<Reel> searchReels(List<Reel> reels, String query) {
  final needle = query.trim().toLowerCase();
  if (needle.isEmpty) return const <Reel>[];
  final words = needle.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return const <Reel>[];

  final scored = <({Reel reel, int score})>[];
  for (final reel in reels) {
    final score = _score(reel, words);
    if (score > 0) scored.add((reel: reel, score: score));
  }
  scored.sort((left, right) => right.score.compareTo(left.score));
  return List.unmodifiable([for (final entry in scored) entry.reel]);
}

/// Every word has to land somewhere, so "kasem drum" does not return
/// everything about drums and everything in Kasem.
int _score(Reel reel, List<String> words) {
  var total = 0;
  for (final word in words) {
    final hit = _fieldScore(reel, word);
    if (hit == 0) return 0;
    total += hit;
  }
  return total;
}

int _fieldScore(Reel reel, String word) {
  var score = 0;
  if (_has(reel.title, word)) score += 10;
  if (_has(reel.creator, word)) score += 8;
  if (_has(reel.caption, word)) score += 5;
  if (_has(reel.label, word)) score += 4;
  if (_has(reel.englishSummary, word)) score += 3;
  if (_has(reel.culturalNotes, word)) score += 3;
  if (_has(reel.sound, word)) score += 2;
  if (_has(reel.credit, word)) score += 1;
  // A live piece outranks a curated preview card on an otherwise equal match:
  // the preview is illustrative, and nobody searching means to find it.
  if (score > 0 && reel.isLive) score += 1;
  return score;
}

bool _has(String haystack, String needle) =>
    haystack.toLowerCase().contains(needle);

/// A handful of terms worth trying, drawn from the feed itself.
///
/// The eyebrow on each reel already names its category, its language and where
/// it is from — which is exactly the vocabulary somebody would search in, and
/// it stays honest because it is only ever words the feed can actually answer.
List<String> trendingTerms(List<Reel> reels, {int limit = 10}) {
  final counts = <String, int>{};
  for (final reel in reels) {
    if (!reel.isLive) continue;
    for (final part in reel.label.split('·')) {
      final term = _tidy(part);
      if (term.isEmpty) continue;
      counts[term] = (counts[term] ?? 0) + 1;
    }
  }
  final terms = counts.keys.toList(growable: false)
    ..sort((left, right) {
      final byCount = counts[right]!.compareTo(counts[left]!);
      return byCount != 0 ? byCount : left.compareTo(right);
    });
  return List.unmodifiable(terms.take(limit));
}

/// Title-cases a shouted eyebrow fragment back into something readable.
String _tidy(String raw) {
  final trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 28) return '';
  return trimmed
      .split(RegExp(r'\s+'))
      .map(
        (word) => word.isEmpty
            ? word
            : word[0].toUpperCase() + word.substring(1).toLowerCase(),
      )
      .join(' ');
}

/// The terms this device has searched for, newest first.
///
/// Local and unsynced on purpose: what somebody looked for is theirs, and a
/// search history is not something this project has any reason to hold on a
/// server.
class RecentSearches extends AsyncNotifier<List<String>> {
  @override
  Future<List<String>> build() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getStringList(_recentSearchesKey) ?? const <String>[];
  }

  /// Puts [term] at the top, without letting it appear twice under a different
  /// capitalisation.
  Future<void> remember(String term) async {
    final tidy = term.trim();
    if (tidy.isEmpty) return;
    final current = state.value ?? const <String>[];
    final next = <String>[
      tidy,
      for (final existing in current)
        if (existing.toLowerCase() != tidy.toLowerCase()) existing,
    ].take(kMaxRecentSearches).toList(growable: false);
    if (_same(current, next)) return;
    await _write(next);
  }

  Future<void> forget(String term) async {
    final current = state.value ?? const <String>[];
    final next = [
      for (final existing in current)
        if (existing != term) existing,
    ];
    if (_same(current, next)) return;
    await _write(next);
  }

  Future<void> clear() => _write(const <String>[]);

  Future<void> _write(List<String> terms) async {
    state = AsyncData(List.unmodifiable(terms));
    final preferences = await SharedPreferences.getInstance();
    await preferences.setStringList(_recentSearchesKey, terms);
  }

  static bool _same(List<String> left, List<String> right) {
    if (left.length != right.length) return false;
    for (var index = 0; index < left.length; index++) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }
}

final recentSearchesProvider =
    AsyncNotifierProvider<RecentSearches, List<String>>(RecentSearches.new);
