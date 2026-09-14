import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart'
    show creatorOrderSeed;
import 'package:indigen_world_mobile/features/explore/explore_topics.dart';
import 'package:indigen_world_mobile/features/explore/reel_engagement.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

/// What For you knows about the member when it orders the feed.
///
/// Every input is something the app already holds for another reason — who
/// they follow, which communities they joined, what they appreciated and kept.
/// Nothing is collected for ranking's sake. Location is not among them: the
/// app has no location permission to ask with, so the ranking uses a
/// community's own stated place only through membership.
class ExploreSignals {
  const ExploreSignals({
    required this.now,
    this.followedCreators = const <String>{},
    this.joinedCommunities = const <String>{},
    this.likedIds = const <String>{},
    this.savedIds = const <String>{},
  });

  /// The moment the ranking treats as "now". Frozen with the rest of the
  /// signals — see [ExploreSignalsSnapshot] — so recency does not drift while
  /// somebody scrolls.
  final DateTime now;

  final Set<String> followedCreators;
  final Set<String> joinedCommunities;

  /// Reel ids — and `community:` ids for posts — this member appreciated or
  /// kept. Engagement history, as far as the app records one.
  final Set<String> likedIds;
  final Set<String> savedIds;

  ExploreSignals copyWith({DateTime? now}) => ExploreSignals(
    now: now ?? this.now,
    followedCreators: followedCreators,
    joinedCommunities: joinedCommunities,
    likedIds: likedIds,
    savedIds: savedIds,
  );
}

/// The signals, held still while the member watches.
///
/// ── Why they are frozen ──────────────────────────────────────────────────
/// The pager addresses reels by position. A ranking that re-read the live
/// follow and like streams would reorder the feed every time somebody tapped
/// the heart — shuffling the reels ahead of them, throwing away the one being
/// preloaded, and on a bad frame moving the reel under their thumb. So the
/// snapshot is taken when Explore opens, when the feed or topic changes, and
/// while the member is still on the first reel (which is when the streams are
/// still arriving). After that it holds until the next of those moments.
class ExploreSignalsSnapshot extends Notifier<ExploreSignals> {
  var _locked = false;

  @override
  ExploreSignals build() {
    void refreshIfOpen(Object? _, Object? _) {
      if (!_locked) state = _capture();
    }

    ref
      ..listen(followingIdsProvider, refreshIfOpen)
      ..listen(myMembershipsProvider, refreshIfOpen)
      ..listen(myReelLikesProvider, refreshIfOpen)
      ..listen(myReelSavesProvider, refreshIfOpen)
      ..listen(myLikesProvider, refreshIfOpen)
      ..listen(myBookmarksProvider, refreshIfOpen);
    return _capture();
  }

  ExploreSignals _capture() {
    final memberships =
        ref.read(myMembershipsProvider).asData?.value ?? const [];
    return ExploreSignals(
      now: DateTime.now(),
      followedCreators: {...?ref.read(followingIdsProvider).asData?.value},
      joinedCommunities: {
        for (final membership in memberships)
          if (membership.isActive) membership.communityId,
      },
      likedIds: {
        ...?ref.read(myReelLikesProvider).asData?.value,
        for (final id in ref.read(myLikesProvider).asData?.value ?? const {})
          'community:$id',
      },
      savedIds: {
        ...?ref.read(myReelSavesProvider).asData?.value,
        for (final id
            in ref.read(myBookmarksProvider).asData?.value ?? const {})
          'community:$id',
      },
    );
  }

  /// Stops following the live streams until the next [refresh]. Called once
  /// the member moves past the first reel.
  void lock() => _locked = true;

  /// Takes a fresh snapshot and follows the streams again.
  void refresh() {
    _locked = false;
    state = _capture();
  }
}

final exploreSignalsProvider =
    NotifierProvider<ExploreSignalsSnapshot, ExploreSignals>(
      ExploreSignalsSnapshot.new,
    );

// ── Scoring ─────────────────────────────────────────────────────────────────

/// How quickly a reel's recency counts for less. Three weeks is long enough
/// that an archive publishing a few pieces a week still shows last month's
/// work, short enough that this morning's clip leads.
const double kExploreRecencyDays = 21;

/// How far back the diversity rules look.
const int kExploreCreatorWindow = 4;
const int kExploreCommunityWindow = 3;
const int kExploreLanguageWindow = 8;

/// How many of the best remaining reels the diversity pass chooses between.
/// Wide enough to route round a run, narrow enough that a great reel is never
/// pushed far down for being by somebody popular.
const int kExploreDiversityLookahead = 12;

/// The relevance of [reel] to one member, before diversity is applied.
///
/// A sum of small, legible terms rather than a learned model — the archive is
/// young, and a ranking the team can read is one the team can defend when a
/// community asks why their work sits where it does.
double exploreScore(
  Reel reel,
  ExploreSignals signals, {
  required Map<ExploreTopic, double> topicAffinity,
  required Set<String> affinityCreators,
}) {
  var score = 0.0;

  // Recency.
  final when = reel.publishedAt ?? reel.createdAt;
  if (when != null) {
    final days = math.max(0, signals.now.difference(when).inHours) / 24;
    score += 1.2 * math.exp(-days / kExploreRecencyDays);
  } else {
    score += 0.3;
  }

  // Relationships.
  if (reel.creatorId.isNotEmpty) {
    if (signals.followedCreators.contains(reel.creatorId)) score += 1.0;
    if (affinityCreators.contains(reel.creatorId)) score += 0.35;
  }
  if (reel.community case final community?) {
    if (signals.joinedCommunities.contains(community.id)) score += 0.9;
  }

  // Topic preference, learned only from what the member appreciated or kept.
  for (final topic in reelTopics(reel)) {
    score += 0.5 * (topicAffinity[topic] ?? 0);
  }

  // Quality and cultural relevance: the piece carries its own context, a
  // person reviewed it, it says what language it is in.
  if (reel.isReviewed) score += 0.45;
  if (reel.culturalNotes.trim().isNotEmpty ||
      reel.englishSummary.trim().isNotEmpty ||
      reel.translations.isNotEmpty) {
    score += 0.3;
  }
  if (reel.caption.trim().isNotEmpty) score += 0.1;
  if (reel.language.trim().isNotEmpty || reel.dialect.trim().isNotEmpty) {
    score += 0.1;
  }
  if (reel.isVideo) score += 0.1;

  // Community response, in coarse steps. A like moving a reel from 11 to 12
  // must not reorder anything; one moving it from 99 to 100 may.
  final response = reel.likes + reel.comments * 2;
  score += 0.12 * math.min(3, (math.log(response + 1) / math.ln10).floor());

  // Already appreciated or kept: still welcome, just not news.
  if (signals.likedIds.contains(reel.id) ||
      signals.savedIds.contains(reel.id)) {
    score -= 0.25;
  }
  return score;
}

/// The member's leaning across topics, from the reels they engaged with, as a
/// share between 0 and 1.
Map<ExploreTopic, double> exploreTopicAffinity(
  List<Reel> reels,
  ExploreSignals signals,
) {
  final counts = <ExploreTopic, int>{};
  var engaged = 0;
  for (final reel in reels) {
    if (!signals.likedIds.contains(reel.id) &&
        !signals.savedIds.contains(reel.id)) {
      continue;
    }
    engaged++;
    for (final topic in reelTopics(reel)) {
      counts[topic] = (counts[topic] ?? 0) + 1;
    }
  }
  if (engaged == 0) return const {};
  return {for (final entry in counts.entries) entry.key: entry.value / engaged};
}

/// For you: the most relevant reels first, arranged so that no creator,
/// community or language takes over a stretch of the feed.
///
/// Deterministic for the same reels and the same [signals]: ties are broken by
/// a hash of the reel id rather than by arrival order, so a Firestore snapshot
/// arriving in a different order does not rearrange the feed.
List<Reel> rankForYou(List<Reel> reels, ExploreSignals signals) {
  if (reels.length < 2) return reels;
  final topicAffinity = exploreTopicAffinity(reels, signals);
  final affinityCreators = {
    for (final reel in reels)
      if (reel.creatorId.isNotEmpty &&
          (signals.likedIds.contains(reel.id) ||
              signals.savedIds.contains(reel.id)))
        reel.creatorId,
  };
  final scored =
      [
        for (final reel in reels)
          (
            reel: reel,
            score: exploreScore(
              reel,
              signals,
              topicAffinity: topicAffinity,
              affinityCreators: affinityCreators,
            ),
            tie: creatorOrderSeed(reel.id),
          ),
      ]..sort((left, right) {
        final byScore = right.score.compareTo(left.score);
        return byScore != 0 ? byScore : left.tie.compareTo(right.tie);
      });
  return diversify([
    for (final entry in scored) (reel: entry.reel, score: entry.score),
  ]);
}

/// Following: newest first, with the same guard against one person owning a
/// run of it.
List<Reel> rankFollowing(List<Reel> reels) {
  if (reels.length < 2) return reels;
  final epoch = DateTime.fromMillisecondsSinceEpoch(0);
  final ordered = [...reels]
    ..sort((left, right) {
      final byTime = (right.publishedAt ?? right.createdAt ?? epoch).compareTo(
        left.publishedAt ?? left.createdAt ?? epoch,
      );
      return byTime != 0
          ? byTime
          : creatorOrderSeed(left.id).compareTo(creatorOrderSeed(right.id));
    });
  // Recency decides; position only breaks near-ties, so the diversity pass
  // can move a reel a few places but never promote last week over today.
  return diversify([
    for (var index = 0; index < ordered.length; index++)
      (reel: ordered[index], score: -index * 0.2),
  ]);
}

/// Re-orders [ranked] — best first — so that consecutive reels vary.
///
/// Greedy: at each position it considers the next [kExploreDiversityLookahead]
/// candidates and takes the one whose score survives the penalties best. A
/// creator seen in the last [kExploreCreatorWindow] reels costs a lot, a
/// community in the last [kExploreCommunityWindow] costs something, and a
/// language that already fills most of the last [kExploreLanguageWindow]
/// costs a little — enough that a Kasem-only archive is still all Kasem, but
/// the day other languages arrive they are not buried.
List<Reel> diversify(List<({Reel reel, double score})> ranked) {
  final pool = [...ranked];
  final result = <Reel>[];
  while (pool.isNotEmpty) {
    var bestIndex = 0;
    var bestValue = double.negativeInfinity;
    final look = math.min(kExploreDiversityLookahead, pool.length);
    for (var index = 0; index < look; index++) {
      final candidate = pool[index];
      final value = candidate.score - _diversityPenalty(candidate.reel, result);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }
    result.add(pool.removeAt(bestIndex).reel);
  }
  return result;
}

double _diversityPenalty(Reel reel, List<Reel> placed) {
  if (placed.isEmpty) return 0;
  var penalty = 0.0;
  final creator = reel.creatorId;
  if (creator.isNotEmpty) {
    for (var back = 1; back <= kExploreCreatorWindow; back++) {
      if (placed.length < back) break;
      if (placed[placed.length - back].creatorId == creator) {
        // The reel just before costs far more than anything a follow or a
        // good score can earn, so the same person twice in a row happens only
        // when there is nobody else left. Further back it only nudges.
        penalty += back == 1 ? 3.0 : 0.6 / (back - 1);
      }
    }
  }
  if (reel.community case final community?) {
    for (var back = 1; back <= kExploreCommunityWindow; back++) {
      if (placed.length < back) break;
      if (placed[placed.length - back].community?.id == community.id) {
        penalty += 0.9 / back;
      }
    }
  }
  final language = reel.languageLabel;
  if (language.isNotEmpty) {
    final recent = placed.skip(
      math.max(0, placed.length - kExploreLanguageWindow),
    );
    final same = recent
        .where((other) => other.languageLabel == language)
        .length;
    if (recent.length >= 4 && same / recent.length > 0.75) penalty += 0.35;
  }
  return penalty;
}
