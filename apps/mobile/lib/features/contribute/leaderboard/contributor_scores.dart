import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';

/// One member's standing on the contribution leaderboard.
///
/// Mirrors `contributorScores/{uid}`, which is public-read and written only by
/// the server. That second half is the whole design: a score somebody's own
/// phone could write is a score nobody would believe, and this app therefore
/// has no code path that writes to this collection at all.
///
/// The identity fields — [displayName], [username], [avatarUrl] — are
/// denormalised onto the score document rather than joined from
/// `communityProfiles`. The alternative was the obvious one: read the top fifty
/// scores, collect their uids, and fetch fifty profiles. That is fifty-one
/// round trips to draw one list, on a screen somebody opens to glance at five
/// faces, and it goes wrong in a second way as well — the profile reads land
/// one at a time, so the list would pop names and pictures in for several
/// seconds after the ranks had settled. The cost of denormalising is that a
/// member who changes their handle keeps the old one on the board until the
/// server next touches their score. That is a stale label for an hour, against
/// a screen that never loads properly, and it was not a close call.
@immutable
class ContributorScore {
  const ContributorScore({
    required this.uid,
    this.points = 0,
    this.approvedCount = 0,
    this.wordCount = 0,
    this.otherCount = 0,
    this.streakDays = 0,
    this.lastContributionDay = '',
    this.displayName = '',
    this.username = '',
    this.avatarUrl,
    this.updatedAt,
  });

  final String uid;

  /// The number the board is ordered by. Server-computed; never derived here.
  final int points;

  /// How many submissions of this member's have been approved, in total.
  final int approvedCount;

  /// Approved Kasem words, counted apart from everything else because they are
  /// the thing the archive is short of.
  final int wordCount;

  /// Everything else approved — songs, stories, films, corrections.
  final int otherCount;

  /// Consecutive days with a contribution on them.
  final int streakDays;

  /// The day key of the most recent contribution, as the server wrote it.
  ///
  /// Nothing on screen reads it today. It is parsed and kept anyway because
  /// this class is the one place the document's shape is written down, and
  /// because it is what the server's streak reminder is computed from — a
  /// field that silently disappeared from the model would be a field the next
  /// person assumed was never there.
  final String lastContributionDay;

  final String displayName;
  final String username;
  final String? avatarUrl;
  final DateTime? updatedAt;

  /// What to print beside the picture.
  ///
  /// Falls through to the handle and then to a neutral phrase rather than to an
  /// empty string: a row with a rank, a score and a blank where the name goes
  /// reads as a bug, and this is a public list where somebody's row appearing
  /// broken is the worst of the available outcomes.
  String get name {
    if (displayName.trim().isNotEmpty) return displayName.trim();
    if (username.trim().isNotEmpty) return '@${username.trim()}';
    return 'A contributor';
  }

  /// The one or two letters shown when there is no photo.
  String get initials {
    final source = displayName.trim().isNotEmpty
        ? displayName.trim()
        : username.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }

  /// Whether this member's run of days is worth a flame.
  ///
  /// Two, not one. Everybody who has ever contributed has a streak of one on
  /// the day they did it, so a flame at one would sit on nearly every row and
  /// mean nothing; at two it marks somebody who came back.
  bool get hasStreak => streakDays >= 2;

  static ContributorScore fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final updated = data['updatedAt'];
    return ContributorScore(
      // The document id is the uid, and it is the one field that cannot be
      // wrong. A `uid` field is written too, but trusting the id means a row
      // whose body is half-written still points at the right member.
      uid: doc.id,
      points: _int(data['points']),
      approvedCount: _int(data['approvedCount']),
      wordCount: _int(data['wordCount']),
      otherCount: _int(data['otherCount']),
      streakDays: _int(data['streakDays']),
      lastContributionDay: _dayKey(data['lastContributionDay']),
      displayName: _text(data['displayName']),
      username: _text(data['username']),
      avatarUrl: _text(data['avatarUrl']).isEmpty
          ? null
          : _text(data['avatarUrl']),
      updatedAt: updated is Timestamp ? updated.toDate() : null,
    );
  }
}

/// The day of the most recent contribution, as `YYYY-MM-DD`.
///
/// Accepts a string or a timestamp because the server writes a day key and a
/// day key is exactly the sort of field that becomes a `Timestamp` the first
/// time somebody rewrites the trigger. Neither shape should be able to throw on
/// a phone months after that decision is made.
String _dayKey(Object? raw) {
  if (raw is String) return raw.trim();
  if (raw is Timestamp) {
    final date = raw.toDate();
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '${date.year}-$month-$day';
  }
  return '';
}

String _text(Object? value) => value is String ? value.trim() : '';

int _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return 0;
}

/// How many rows the board asks for.
///
/// Fifty rather than everybody: the query is ordered and limited, so it is one
/// read of a fixed size no matter how large the community grows, and nobody has
/// ever scrolled to position 300 of a leaderboard to look at themselves. The
/// member's own row is handled separately for exactly that reason — see
/// [myContributorScoreProvider].
const int kLeaderboardSize = 50;

/// The collection, or `null` when Firebase never started this launch.
///
/// Every provider below goes through this rather than touching
/// `FirebaseFirestore.instance` itself, so an offline launch and a widget test
/// in a bare `ProviderScope` both get an empty board instead of a crash.
final _contributorScoresProvider =
    Provider<CollectionReference<Map<String, dynamic>>?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return FirebaseFirestore.instance.collection('contributorScores');
    });

/// The top of the board, highest first.
///
/// One query, no joins, no composite index: `orderBy('points')` on a single
/// field is served by the automatic index Firestore already keeps. Rows with no
/// points are dropped here rather than in the query, because a `where` on
/// points alongside the `orderBy` would need an index of its own to save a
/// filter over at most fifty rows.
final contributorScoresProvider = StreamProvider<List<ContributorScore>>((ref) {
  final collection = ref.watch(_contributorScoresProvider);
  if (collection == null) return Stream.value(const <ContributorScore>[]);
  return collection
      .orderBy('points', descending: true)
      .limit(kLeaderboardSize)
      .snapshots()
      .map(
        (snapshot) => List<ContributorScore>.unmodifiable(
          snapshot.docs
              .map(ContributorScore.fromDoc)
              .where((score) => score.points > 0),
        ),
      );
});

/// This member's own score, read straight by uid.
///
/// Deliberately its own document read rather than a search through
/// [contributorScoresProvider]: somebody in position 412 is not in that list,
/// and a leaderboard that cannot show you yourself is a leaderboard you stop
/// opening.
final myContributorScoreProvider = StreamProvider<ContributorScore?>((ref) {
  final collection = ref.watch(_contributorScoresProvider);
  final uid = ref.watch(authStateProvider).asData?.value?.uid;
  if (collection == null || uid == null) {
    return Stream<ContributorScore?>.value(null);
  }
  return collection
      .doc(uid)
      .snapshots()
      .map((doc) => doc.exists ? ContributorScore.fromDoc(doc) : null);
});

/// Contribution points for the signed-in member, or zero.
///
/// Zero while the read is in flight, and zero for a guest. A separate "unknown"
/// state was tried and thrown away: the one place this is read is a total in
/// the Learn header, and a header that renders a dash for half a second every
/// time the tab is opened is worse than one that counts up.
final myContributionPointsProvider = Provider<int>(
  (ref) => ref.watch(myContributorScoreProvider).asData?.value?.points ?? 0,
);

/// Where this member stands on the whole board, or `null` when it is not known.
///
/// An aggregate count of everybody strictly above them, plus one. Ties share a
/// rank — two members on 300 points are both fourth — which is the ordinary
/// competition convention and the only one that can be computed without reading
/// the rows themselves.
///
/// `where('points', isGreaterThan:)` is a single-field range filter, so it
/// needs no composite index, and `count()` is billed by the thousand rather
/// than by the document. The alternative was paging the collection until the
/// member turned up, which for somebody in position 900 is nine hundred
/// document reads to render one small number.
///
/// Null rather than a guess whenever it cannot be worked out. A wrong rank on a
/// public board is worse than no rank at all.
final myLeaderboardRankProvider = FutureProvider<int?>((ref) async {
  final collection = ref.watch(_contributorScoresProvider);
  final mine = ref.watch(myContributorScoreProvider).asData?.value;
  if (collection == null || mine == null || mine.points <= 0) return null;
  try {
    final ahead = await collection
        .where('points', isGreaterThan: mine.points)
        .count()
        .get();
    final count = ahead.count;
    return count == null ? null : count + 1;
  } on Object catch (error) {
    debugPrint('Leaderboard rank could not be read: $error');
    return null;
  }
});
