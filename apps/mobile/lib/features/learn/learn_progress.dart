import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// What a member has earned on the Kasem learning path.
///
/// Progress lives on the device rather than in Firestore on purpose. Learning
/// works without an account, so tying a finished lesson to a sign-in would
/// mean a guest loses everything the moment the process dies — which is
/// exactly the thing this class exists to stop.
@immutable
class LearnProgress {
  const LearnProgress({
    this.completedLessons = const <String>{},
    this.lastStreakClaim,
    this.streakDays = 0,
  });

  /// XP one finished lesson is worth.
  static const xpPerLesson = 15;

  /// XP the daily spark is worth.
  static const xpPerSpark = 5;

  /// Slugs of the lessons already finished.
  ///
  /// Slugs rather than positions: a lesson dropped into the middle of the unit
  /// later would otherwise shift every index and silently hand somebody a tick
  /// for work they have not done.
  final Set<String> completedLessons;

  /// When the daily spark was last taken, or null if it never has been.
  final DateTime? lastStreakClaim;

  /// Consecutive days the spark has been claimed.
  final int streakDays;

  /// Whether today's spark has already been taken.
  ///
  /// Read from the stored date rather than kept as a flag, because midnight
  /// passes while the app is open and a flag would keep yesterday's claim
  /// forever.
  bool get sparkClaimedToday => isSameDay(lastStreakClaim, DateTime.now());

  /// XP on the badge in the header.
  ///
  /// Counted from the stored slugs rather than from the lessons currently
  /// shipping, so reshuffling the unit never takes XP back off somebody.
  int get xp =>
      completedLessons.length * xpPerLesson +
      (sparkClaimedToday ? xpPerSpark : 0);

  bool hasCompleted(String lessonId) => completedLessons.contains(lessonId);

  LearnProgress copyWith({
    Set<String>? completedLessons,
    DateTime? lastStreakClaim,
    int? streakDays,
  }) => LearnProgress(
    completedLessons: completedLessons ?? this.completedLessons,
    lastStreakClaim: lastStreakClaim ?? this.lastStreakClaim,
    streakDays: streakDays ?? this.streakDays,
  );

  /// True when [a] and [b] fall on the same local calendar day.
  ///
  /// The spark is a daily habit, not a twenty-four hour timer: someone who
  /// claims at 11pm should be able to claim again after breakfast.
  static bool isSameDay(DateTime? a, DateTime? b) =>
      a != null &&
      b != null &&
      a.year == b.year &&
      a.month == b.month &&
      a.day == b.day;
}

/// Reads and writes the learning path's progress.
class LearnProgressController extends AsyncNotifier<LearnProgress> {
  static const completedLessonsKey = 'learn.completedLessons';
  static const lastStreakClaimKey = 'learn.lastStreakClaim';
  static const streakDaysKey = 'learn.streakDays';

  @override
  Future<LearnProgress> build() => load();

  /// Reads what is on disk.
  ///
  /// Anything unreadable is treated as "no progress yet" rather than raised as
  /// an error. A member who finds an empty path can walk it again; one who
  /// finds an error screen cannot learn anything at all.
  Future<LearnProgress> load() async {
    final preferences = await SharedPreferences.getInstance();
    final claimedAt = preferences.getString(lastStreakClaimKey);
    return LearnProgress(
      completedLessons:
          preferences.getStringList(completedLessonsKey)?.toSet() ??
          const <String>{},
      lastStreakClaim: claimedAt == null ? null : DateTime.tryParse(claimedAt),
      streakDays: preferences.getInt(streakDaysKey) ?? 0,
    );
  }

  /// Marks [lessonId] finished. Calling it twice is harmless.
  Future<void> completeLesson(String lessonId) async {
    final current = await future;
    if (current.hasCompleted(lessonId)) return;

    final next = current.copyWith(
      completedLessons: {...current.completedLessons, lessonId},
    );
    // The tick lands in memory first. Holding the celebration until the disk
    // agrees would make finishing a lesson feel like it did not register.
    state = AsyncData(next);
    await _write(next);
  }

  /// Claims today's spark, returning false when today's was already taken.
  ///
  /// The run only continues when yesterday was claimed too — a streak that
  /// survives a skipped day is not a streak, it is a counter. The caller gets
  /// the answer back so it can stay quiet rather than congratulate somebody
  /// for a claim that did not happen.
  Future<bool> claimStreak() async {
    final current = await future;
    final now = DateTime.now();
    if (LearnProgress.isSameDay(current.lastStreakClaim, now)) return false;

    final yesterday = DateTime(now.year, now.month, now.day - 1);
    final continued = LearnProgress.isSameDay(
      current.lastStreakClaim,
      yesterday,
    );
    final next = current.copyWith(
      lastStreakClaim: now,
      streakDays: continued ? current.streakDays + 1 : 1,
    );
    state = AsyncData(next);
    await _write(next);
    return true;
  }

  Future<void> _write(LearnProgress progress) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(
        completedLessonsKey,
        progress.completedLessons.toList(growable: false),
      );
      final claimedAt = progress.lastStreakClaim;
      if (claimedAt != null) {
        await preferences.setString(
          lastStreakClaimKey,
          claimedAt.toIso8601String(),
        );
      }
      await preferences.setInt(streakDaysKey, progress.streakDays);
    } on Object catch (error) {
      // A refused write costs the next launch, not this session — what the
      // member just earned stays on screen either way.
      debugPrint('Learn progress save failed: $error');
    }
  }
}

final learnProgressProvider =
    AsyncNotifierProvider<LearnProgressController, LearnProgress>(
      LearnProgressController.new,
    );
