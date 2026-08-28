import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Asking somebody to rate Indigen World on Google Play.
///
/// Three things about the Play in-app review API shape everything here, and all
/// three are easy to get wrong:
///
///  * **No question may precede it.** Play's policy forbids gating the review
///    card behind anything that asks how the member feels — no "Enjoying
///    Indigen? [Yes] [No]", and no button labelled "Rate us" that calls
///    `requestReview`. The card is shown unprompted or not at all. The manual
///    path in Settings is a different call, [openStoreListing], which is
///    allowed precisely because it leaves the app.
///  * **There is no callback.** `requestReview` completes whether or not the
///    card was drawn. Play silently discards requests over quota, and there is
///    no way to detect, retry or measure it.
///  * **The quota is small** — roughly a handful per member per year. Every
///    mistimed ask spends one that cannot be recovered.
///
/// So the ask is rationed by [shouldRequestReview] and fired at a moment the
/// member has just finished something, never at start-up.

/// When this install was first seen, in milliseconds since the epoch.
const ratingFirstLaunchKey = 'indigen_world_rating_first_launch_v1';

/// The days this install has been used, as `yyyy-mm-dd`, comma separated.
const ratingActiveDaysKey = 'indigen_world_rating_active_days_v1';

/// When the review flow was last requested, in milliseconds since the epoch.
const ratingLastAskedKey = 'indigen_world_rating_last_ask_v1';

/// The app version that last requested it.
const ratingLastVersionKey = 'indigen_world_rating_last_version_v1';

/// How many days of use are remembered. Well past the largest threshold, and
/// bounded so the stored value cannot grow without limit.
const _activeDayMemory = 40;

/// What the ask is rationed by, published through Remote Config.
///
/// Held remotely because the rating prompt is the one feature here with no
/// rollback: a badly timed ask spends a quota slot that cannot be given back,
/// and waiting for a release to stop it is too slow. It ships disabled.
@immutable
class RatingRules {
  const RatingRules({
    required this.enabled,
    required this.minDays,
    required this.minActiveDays,
    required this.cooldownDays,
  });

  final bool enabled;

  /// Days since first launch before anybody is asked. Nobody rates an app they
  /// installed this morning.
  final int minDays;

  /// Distinct days of use before anybody is asked. One long evening is not a
  /// habit, and the question being asked is really "is this part of your week".
  final int minActiveDays;

  /// Days before a second ask, on a later version. Deliberately tighter than
  /// Play's own quota, which we cannot see.
  final int cooldownDays;

  static const disabled = RatingRules(
    enabled: false,
    minDays: 7,
    minActiveDays: 3,
    cooldownDays: 120,
  );

  /// Reads the live rules, falling back to [disabled] if Remote Config cannot
  /// be reached — the safe direction, since not asking costs nothing.
  static RatingRules fromRemoteConfig() {
    try {
      final config = FirebaseRemoteConfig.instance;
      return RatingRules(
        enabled: config.getBool('rating_prompt_enabled'),
        minDays: config.getInt('rating_min_days'),
        minActiveDays: config.getInt('rating_min_active_days'),
        cooldownDays: config.getInt('rating_cooldown_days'),
      );
    } on Object {
      return disabled;
    }
  }
}

/// Everything the decision needs, read once before it is made.
@immutable
class RatingState {
  const RatingState({
    required this.firstLaunch,
    required this.activeDays,
    required this.currentVersion,
    this.lastAskedAt,
    this.lastAskedVersion,
  });

  final DateTime firstLaunch;

  /// Distinct `yyyy-mm-dd` days this install has been opened.
  final Set<String> activeDays;

  final String currentVersion;
  final DateTime? lastAskedAt;
  final String? lastAskedVersion;
}

/// The calendar day [when] falls on, as the stored key.
String ratingDayKey(DateTime when) =>
    '${when.year.toString().padLeft(4, '0')}-'
    '${when.month.toString().padLeft(2, '0')}-'
    '${when.day.toString().padLeft(2, '0')}';

/// Whether the review flow may be requested right now.
///
/// Pure, and the only place the policy lives — every condition here is one that
/// silently spends a quota slot if it is wrong, and none of them can be
/// observed after the fact.
bool shouldRequestReview({
  required RatingState state,
  required RatingRules rules,
  required DateTime now,
  required bool online,
}) {
  if (!rules.enabled) return false;
  // Play needs the network to fetch the review flow. Offline it fails silently,
  // which would look exactly like a member declining to rate.
  if (!online) return false;
  if (now.difference(state.firstLaunch).inDays < rules.minDays) return false;
  if (state.activeDays.length < rules.minActiveDays) return false;

  final lastAskedAt = state.lastAskedAt;
  if (lastAskedAt == null) return true;

  // Both, not either. The cooldown keeps us well inside Play's own quota; the
  // version check means the second ask follows a release the member has
  // actually seen, rather than repeating the same question about the same app.
  if (now.difference(lastAskedAt).inDays < rules.cooldownDays) return false;
  return state.lastAskedVersion != state.currentVersion;
}

/// Notes that the app has been opened today.
///
/// Called once per launch. Also stamps first launch, so the clock starts at the
/// first run of a build carrying this rather than at install — which is the
/// honest reading for anybody upgrading into it.
Future<void> recordRatingActivity({DateTime? now}) async {
  final preferences = await SharedPreferences.getInstance();
  final today = now ?? DateTime.now();

  if (preferences.getInt(ratingFirstLaunchKey) == null) {
    await preferences.setInt(
      ratingFirstLaunchKey,
      today.millisecondsSinceEpoch,
    );
  }

  final stored = preferences.getString(ratingActiveDaysKey) ?? '';
  final days = stored.split(',').where((day) => day.isNotEmpty).toList();
  final key = ratingDayKey(today);
  if (days.contains(key)) return;
  days.add(key);
  final kept = days.length > _activeDayMemory
      ? days.sublist(days.length - _activeDayMemory)
      : days;
  await preferences.setString(ratingActiveDaysKey, kept.join(','));
}

/// Reads what [shouldRequestReview] needs.
Future<RatingState> readRatingState({
  required String version,
  DateTime? now,
}) async {
  final preferences = await SharedPreferences.getInstance();
  final firstLaunch = preferences.getInt(ratingFirstLaunchKey);
  final lastAsked = preferences.getInt(ratingLastAskedKey);
  return RatingState(
    firstLaunch: firstLaunch == null
        ? (now ?? DateTime.now())
        : DateTime.fromMillisecondsSinceEpoch(firstLaunch),
    activeDays: (preferences.getString(ratingActiveDaysKey) ?? '')
        .split(',')
        .where((day) => day.isNotEmpty)
        .toSet(),
    currentVersion: version,
    lastAskedAt: lastAsked == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(lastAsked),
    lastAskedVersion: preferences.getString(ratingLastVersionKey),
  );
}

/// Records that the flow was requested, whatever came of it.
///
/// Written *before* the request, not after. `requestReview` reports nothing, so
/// a failure is indistinguishable from a success — and treating it as "did not
/// happen" would ask again on the next lesson, and the one after that.
Future<void> recordReviewRequested({
  required String version,
  DateTime? now,
}) async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.setInt(
    ratingLastAskedKey,
    (now ?? DateTime.now()).millisecondsSinceEpoch,
  );
  await preferences.setString(ratingLastVersionKey, version);
}

/// The version string the cooldown compares, including the build number so a
/// rebuild of the same marketing version counts as a new release.
Future<String> currentAppVersion() async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version}+${info.buildNumber}';
}

/// Asks for the review card, if every condition in [shouldRequestReview] holds.
///
/// Call from a moment the member has just finished something worth being
/// pleased about. **Never** put a question in front of this — see the notes at
/// the top of this file.
///
/// Silent throughout: there is no outcome to report, nothing for a member to
/// act on, and a failure here must never disturb whatever they were doing.
Future<void> maybeRequestReview({required bool online, DateTime? now}) async {
  try {
    final rules = RatingRules.fromRemoteConfig();
    if (!rules.enabled) return;

    final version = await currentAppVersion();
    final state = await readRatingState(version: version, now: now);
    if (!shouldRequestReview(
      state: state,
      rules: rules,
      now: now ?? DateTime.now(),
      online: online,
    )) {
      return;
    }

    // Checked before the attempt is recorded: on a dev or staging flavour, and
    // on any handset without Play, this is false and no slot should be spent.
    final review = InAppReview.instance;
    if (!await review.isAvailable()) return;

    await recordReviewRequested(version: version, now: now);
    await review.requestReview();
  } on Object catch (error) {
    debugPrint('Review prompt skipped (continuing): $error');
  }
}

/// Opens the Play listing so somebody can review deliberately.
///
/// A different call from [maybeRequestReview], and the reason Settings may have
/// a button at all: leaving the app for the store is allowed, whereas a button
/// that triggers the in-app card is not.
Future<void> openStoreListing() async {
  try {
    await InAppReview.instance.openStoreListing();
  } on Object catch (error) {
    debugPrint('Could not open the store listing (continuing): $error');
  }
}
