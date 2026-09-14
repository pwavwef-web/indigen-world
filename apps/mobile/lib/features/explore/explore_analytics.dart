import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

/// Explore's measurements, through the analytics the app already starts.
///
/// `FirebaseBootstrap` enables Firebase Analytics collection in production and
/// disables it everywhere else, so nothing here needs its own environment
/// check: in development these calls are accepted and dropped by the SDK.
///
/// ── What is deliberately not sent ───────────────────────────────────────
/// No member id, no creator id, no caption, no search text. The events describe
/// what kind of thing was watched and what was done to it — the content id, its
/// source and media kind, the feed and topic — which is enough to compute
/// completion rates and topic usage without building a record of a person.
enum ExploreEvent {
  impression('explore_impression'),
  qualifiedView('explore_qualified_view'),
  completion('explore_completion'),
  replay('explore_replay'),
  like('explore_like'),
  commentOpen('explore_comment_open'),
  save('explore_save'),
  follow('explore_follow'),
  communityJoin('explore_community_join'),
  contextOpen('explore_context_open'),
  translationOpen('explore_translation_open'),
  pronunciationPlay('explore_pronunciation_play'),
  topicFilter('explore_topic_filter'),
  report('explore_report'),
  notInterested('explore_not_interested');

  const ExploreEvent(this.wire);

  /// The Firebase event name: at most 40 characters of letters, digits and
  /// underscores.
  final String wire;
}

abstract class ExploreAnalytics {
  const ExploreAnalytics();

  void log(ExploreEvent event, {Map<String, Object> parameters = const {}});

  /// The same event about [reel], with the parameters every reel event shares.
  void logReel(
    ExploreEvent event,
    Reel reel, {
    Map<String, Object> extra = const {},
  }) => log(event, parameters: {...reelAnalyticsParameters(reel), ...extra});
}

/// The shared shape of a reel event. Values are clipped to Firebase's hundred
/// characters so a long id can never make the SDK drop the whole event.
Map<String, Object> reelAnalyticsParameters(Reel reel) => {
  'content_id': _clip(reel.id),
  'source': reel.isSponsored
      ? 'sponsored'
      : reel.isCommunity
      ? 'community'
      : 'published',
  'media_kind': reel.isVideo ? 'video' : 'image',
  'is_replay_pass': reel.isReplay ? 1 : 0,
  if (reel.community case final community?) 'community_id': _clip(community.id),
};

String _clip(String value) =>
    value.length <= 100 ? value : value.substring(0, 100);

class FirebaseExploreAnalytics extends ExploreAnalytics {
  const FirebaseExploreAnalytics();

  @override
  void log(ExploreEvent event, {Map<String, Object> parameters = const {}}) {
    // Never awaited and never allowed to throw into a gesture handler:
    // measuring a like must not be able to break the like.
    FirebaseAnalytics.instance
        .logEvent(name: event.wire, parameters: parameters)
        .catchError((Object error) {
          debugPrint('Explore analytics dropped ${event.wire}: $error');
        });
  }
}

class NoopExploreAnalytics extends ExploreAnalytics {
  const NoopExploreAnalytics();

  @override
  void log(ExploreEvent event, {Map<String, Object> parameters = const {}}) {}
}

final exploreAnalyticsProvider = Provider<ExploreAnalytics>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return const NoopExploreAnalytics();
  return const FirebaseExploreAnalytics();
});

// ── When looking counts as watching ─────────────────────────────────────────

/// How long a reel has to stay in front of somebody before it counts as seen.
///
/// A fling through ten reels is ten reels going past, not ten impressions, and
/// counting them would make every metric downstream of this one a measure of
/// thumb speed.
const Duration kExploreImpressionDwell = Duration(milliseconds: 1000);

/// How long a reel has to actually play — or a picture stay on screen — before
/// it is a view worth counting.
const Duration kExploreQualifiedDwell = Duration(seconds: 3);

/// The milestones one continuous look at a reel has reached.
class ExploreDwell {
  const ExploreDwell({required this.impression, required this.qualified});

  final bool impression;
  final bool qualified;
}

/// Which milestones [watched] reaches.
///
/// [watched] is time on screen for the impression and, for video, time spent
/// *playing* for the qualified view, so a clip paused on its first frame is not
/// a view however long it sits there. A clip shorter than twice the qualifying
/// dwell qualifies at half its length — a four-second proverb watched to the
/// end is plainly a view.
ExploreDwell exploreDwellFor({
  required Duration onScreen,
  required Duration watched,
  Duration? videoLength,
}) {
  var qualifying = kExploreQualifiedDwell;
  if (videoLength != null &&
      videoLength > Duration.zero &&
      videoLength < kExploreQualifiedDwell * 2) {
    qualifying = videoLength ~/ 2;
  }
  return ExploreDwell(
    impression: onScreen >= kExploreImpressionDwell,
    qualified: onScreen >= kExploreImpressionDwell && watched >= qualifying,
  );
}

/// Whether a looping clip has just come back round to its start.
///
/// `video_player` reports no "completed" event for a looping clip, so the loop
/// is read off the position: a jump from the last tenth of the clip to its
/// first tenth, on a clip long enough for the tenths to mean something.
bool exploreLoopedBack({
  required Duration previous,
  required Duration current,
  required Duration length,
}) {
  if (length < const Duration(milliseconds: 800)) return false;
  final tenth = length ~/ 10;
  return previous >= length - tenth && current <= tenth;
}
