import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// What a member has earned on the Kasem learning path.
///
/// Progress is kept on the device *and*, once there is an account, in
/// Firestore. Neither copy alone is enough: learning works signed out, so a
/// guest's work has to survive without an account, and a member who changes
/// phone has to find their unit where they left it rather than back at lesson
/// one. The two are reconciled by [merge] rather than by one overwriting the
/// other, because both can legitimately move while the other is unreachable.
@immutable
class LearnProgress {
  const LearnProgress({
    this.completedLessons = const <String>{},
    this.lessonXp = const <String, int>{},
    this.sparkXp = 0,
    this.lastStreakClaim,
    this.streakDays = 0,
  });

  /// XP a lesson is worth when its own value is not known — the value every
  /// bundled lesson carries, and what pre-existing local progress is credited
  /// with now that lessons set their own.
  static const defaultLessonXp = 15;

  /// XP the daily spark is worth.
  static const xpPerSpark = 5;

  /// Slugs of the lessons already finished.
  final Set<String> completedLessons;

  /// What each finished lesson actually paid out. Recorded rather than
  /// recomputed so that re-pricing a lesson never takes XP back off somebody
  /// who already earned it.
  final Map<String, int> lessonXp;

  /// Everything the daily spark has paid out, ever.
  ///
  /// Used to be derived from "was today's spark claimed", which quietly
  /// deleted every previous day's five points at midnight.
  final int sparkXp;

  /// When the daily spark was last taken, or null if it never has been.
  final DateTime? lastStreakClaim;

  /// Consecutive days the spark has been claimed.
  final int streakDays;

  /// Whether today's spark has already been taken.
  bool get sparkClaimedToday => isSameDay(lastStreakClaim, DateTime.now());

  /// Whether yesterday's was — the streak is alive but today is unclaimed.
  bool get streakAtRisk =>
      streakDays > 0 &&
      !sparkClaimedToday &&
      isSameDay(
        lastStreakClaim,
        DateTime.now().subtract(const Duration(days: 1)),
      );

  /// What the *learning path* has paid: lessons plus the daily spark.
  ///
  /// Not the number on the badge in the header any more. That badge shows this
  /// plus the member's contribution points, and the addition happens in
  /// `learn_screen.dart` at the moment of drawing rather than in here.
  ///
  /// Contribution points must never be folded into this class. Everything on
  /// it is device-first and reconciled by [merge], which takes the *more
  /// generous* of the device and server copies — the right rule for a lesson
  /// finished on a plane, and a licence to print money for a score the server
  /// is meant to own, since one stale phone carrying a higher contribution
  /// total would push it back up permanently. `learnProgress/{uid}` is also
  /// owner-writable, and a public leaderboard figure has no business living in
  /// a document its own subject can write.
  int get xp =>
      lessonXp.values.fold<int>(0, (total, value) => total + value) + sparkXp;

  bool hasCompleted(String lessonId) => completedLessons.contains(lessonId);

  LearnProgress copyWith({
    Set<String>? completedLessons,
    Map<String, int>? lessonXp,
    int? sparkXp,
    DateTime? lastStreakClaim,
    int? streakDays,
  }) => LearnProgress(
    completedLessons: completedLessons ?? this.completedLessons,
    lessonXp: lessonXp ?? this.lessonXp,
    sparkXp: sparkXp ?? this.sparkXp,
    lastStreakClaim: lastStreakClaim ?? this.lastStreakClaim,
    streakDays: streakDays ?? this.streakDays,
  );

  /// The union of two records of the same person's learning.
  ///
  /// Everything here takes the more generous of the two values on purpose. A
  /// merge runs when a device and the server disagree — a lesson finished
  /// offline, a phone that has been away for a week — and in every one of
  /// those cases the work was really done. Losing it to a stale copy would be
  /// the one failure a learner would never forgive.
  LearnProgress merge(LearnProgress other) {
    final xpByLesson = <String, int>{...lessonXp};
    other.lessonXp.forEach((lesson, value) {
      final mine = xpByLesson[lesson];
      if (mine == null || value > mine) xpByLesson[lesson] = value;
    });
    final claim = switch ((lastStreakClaim, other.lastStreakClaim)) {
      (null, final b) => b,
      (final a, null) => a,
      (final a?, final b?) => a.isAfter(b) ? a : b,
    };
    return LearnProgress(
      completedLessons: {...completedLessons, ...other.completedLessons},
      lessonXp: xpByLesson,
      sparkXp: sparkXp > other.sparkXp ? sparkXp : other.sparkXp,
      lastStreakClaim: claim,
      streakDays: streakDays > other.streakDays ? streakDays : other.streakDays,
    );
  }

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

  Map<String, Object?> toFirestore(String uid) => {
    'uid': uid,
    'completedLessons': completedLessons.toList(growable: false),
    'lessonXp': lessonXp,
    'sparkXp': sparkXp,
    'xp': xp,
    'streakDays': streakDays,
    'lastStreakClaim': lastStreakClaim == null
        ? null
        : Timestamp.fromDate(lastStreakClaim!),
    'updatedAt': FieldValue.serverTimestamp(),
  };

  static LearnProgress fromFirestore(Map<String, dynamic> data) {
    final claim = data['lastStreakClaim'];
    return LearnProgress(
      completedLessons: (data['completedLessons'] as List<Object?>? ?? const [])
          .whereType<String>()
          .toSet(),
      lessonXp: _xpMap(data['lessonXp']),
      sparkXp: _int(data['sparkXp']),
      streakDays: _int(data['streakDays']),
      lastStreakClaim: claim is Timestamp
          ? claim.toDate()
          : (claim is String ? DateTime.tryParse(claim) : null),
    );
  }
}

Map<String, int> _xpMap(Object? raw) {
  if (raw is! Map) return const {};
  final parsed = <String, int>{};
  raw.forEach((key, value) {
    if (key is String) parsed[key] = _int(value);
  });
  return parsed;
}

int _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return 0;
}

/// Reads and writes the learning path's progress, on the device and — once
/// somebody is signed in — in Firestore.
class LearnProgressController extends AsyncNotifier<LearnProgress> {
  static const completedLessonsKey = 'learn.completedLessons';
  static const lessonXpKey = 'learn.lessonXp';
  static const sparkXpKey = 'learn.sparkXp';
  static const lastStreakClaimKey = 'learn.lastStreakClaim';
  static const streakDaysKey = 'learn.streakDays';

  @override
  Future<LearnProgress> build() async {
    // Watching the signed-in uid is what makes signing in pull the account's
    // progress down and fold it into whatever this device already had.
    final uid = ref.watch(authStateProvider).asData?.value?.uid;
    final local = await load();
    if (uid == null) return local;

    final remote = await _readRemote(uid);
    if (remote == null) {
      // First sign-in on this account, or Firestore unreachable. Publishing
      // what the device has is right in the first case and harmless in the
      // second, where the write simply fails.
      unawaited(_writeRemote(uid, local));
      return local;
    }
    final merged = local.merge(remote);
    await _write(merged);
    // Only push back when the device actually knew something the server did
    // not; a plain read should not cost a write on every launch.
    if (merged.xp != remote.xp ||
        merged.completedLessons.length != remote.completedLessons.length) {
      unawaited(_writeRemote(uid, merged));
    }
    return merged;
  }

  /// Reads what is on disk.
  ///
  /// Anything unreadable is treated as "no progress yet" rather than raised as
  /// an error. A member who finds an empty path can walk it again; one who
  /// finds an error screen cannot learn anything at all.
  Future<LearnProgress> load() async {
    final preferences = await SharedPreferences.getInstance();
    final claimedAt = preferences.getString(lastStreakClaimKey);
    final completed =
        preferences.getStringList(completedLessonsKey)?.toSet() ??
        const <String>{};
    return LearnProgress(
      completedLessons: completed,
      lessonXp: _storedLessonXp(preferences, completed),
      sparkXp: preferences.getInt(sparkXpKey) ?? 0,
      lastStreakClaim: claimedAt == null ? null : DateTime.tryParse(claimedAt),
      streakDays: preferences.getInt(streakDaysKey) ?? 0,
    );
  }

  /// Per-lesson XP from disk, with anything finished before lessons carried
  /// their own value credited at the old flat rate.
  static Map<String, int> _storedLessonXp(
    SharedPreferences preferences,
    Set<String> completed,
  ) {
    final stored = <String, int>{};
    final raw = preferences.getString(lessonXpKey);
    if (raw != null) {
      try {
        (jsonDecode(raw) as Map<String, dynamic>).forEach((key, value) {
          stored[key] = _int(value);
        });
      } on Object {
        // Corrupt cache; the completed set below still restores the total.
      }
    }
    for (final lesson in completed) {
      stored.putIfAbsent(lesson, () => LearnProgress.defaultLessonXp);
    }
    return stored;
  }

  /// Marks [lessonId] finished, worth [xp]. Calling it twice is harmless.
  Future<void> completeLesson(String lessonId, {required int xp}) async {
    final current = await future;
    if (current.hasCompleted(lessonId)) return;

    final next = current.copyWith(
      completedLessons: {...current.completedLessons, lessonId},
      lessonXp: {...current.lessonXp, lessonId: xp},
    );
    // The tick lands in memory first. Holding the celebration until the disk
    // agrees would make finishing a lesson feel like it did not register.
    state = AsyncData(next);
    await _persist(next);
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
      sparkXp: current.sparkXp + LearnProgress.xpPerSpark,
    );
    state = AsyncData(next);
    await _persist(next);
    return true;
  }

  Future<void> _persist(LearnProgress progress) async {
    await _write(progress);
    final uid = ref.read(authStateProvider).asData?.value?.uid;
    if (uid != null) unawaited(_writeRemote(uid, progress));
  }

  Future<void> _write(LearnProgress progress) async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(
        completedLessonsKey,
        progress.completedLessons.toList(growable: false),
      );
      await preferences.setString(lessonXpKey, jsonEncode(progress.lessonXp));
      await preferences.setInt(sparkXpKey, progress.sparkXp);
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

  Future<LearnProgress?> _readRemote(String uid) async {
    if (!ref.read(firebaseReadyProvider)) return null;
    try {
      final doc = await FirebaseFirestore.instance
          .collection('learnProgress')
          .doc(uid)
          .get();
      final data = doc.data();
      return data == null ? null : LearnProgress.fromFirestore(data);
    } on Object catch (error) {
      debugPrint('Learn progress could not be read: $error');
      return null;
    }
  }

  Future<void> _writeRemote(String uid, LearnProgress progress) async {
    if (!ref.read(firebaseReadyProvider)) return;
    try {
      await FirebaseFirestore.instance
          .collection('learnProgress')
          .doc(uid)
          .set(progress.toFirestore(uid), SetOptions(merge: true));
    } on Object catch (error) {
      // Offline writes are queued by Firestore and a hard failure only costs
      // the sync, never the device copy written just above.
      debugPrint('Learn progress could not be synced: $error');
    }
  }
}

final learnProgressProvider =
    AsyncNotifierProvider<LearnProgressController, LearnProgress>(
      LearnProgressController.new,
    );
