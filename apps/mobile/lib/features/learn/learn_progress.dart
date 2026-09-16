import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The kinds of practice outside a lesson, each paying once per day.
enum PracticeKind {
  review('review'),
  listen('listen'),
  speak('speak');

  const PracticeKind(this.wireName);
  final String wireName;

  static PracticeKind? parse(Object? raw) {
    for (final kind in values) {
      if (kind.wireName == raw) return kind;
    }
    return null;
  }
}

/// Where one word stands in spaced repetition.
///
/// A Leitner box rather than an ease factor: five boxes and a doubling
/// interval are easy to explain to a learner ("you knew it, see you in four
/// days"), survive a merge between two phones without arithmetic, and are
/// honest about how little the app actually knows about a person's memory.
@immutable
class ReviewCard {
  const ReviewCard({
    required this.box,
    required this.dueDay,
    required this.lastDay,
    this.reviews = 1,
  });

  /// 0 is "still learning"; [maxBox] is "well known".
  final int box;

  /// The day key this word should come back on.
  final String dueDay;

  /// The day key it was last answered on.
  final String lastDay;

  final int reviews;

  static const maxBox = 5;

  /// Days until a word in each box comes back.
  static const intervals = [0, 1, 2, 4, 8, 16];

  bool isDue(DateTime now) => dueDay.compareTo(dayKey(now)) <= 0;

  /// The card after an answer given on [now].
  ReviewCard answered({required bool knew, required DateTime now}) {
    final nextBox = knew ? math.min(box + 1, maxBox) : 0;
    return ReviewCard(
      box: nextBox,
      dueDay: dayKey(addDays(now, intervals[nextBox])),
      lastDay: dayKey(now),
      reviews: reviews + 1,
    );
  }

  /// A word met for the first time today.
  static ReviewCard first({required bool knew, required DateTime now}) =>
      const ReviewCard(box: 0, dueDay: '', lastDay: '', reviews: 0)
          .answered(knew: knew, now: now);

  Map<String, Object?> toJson() => {
    'box': box,
    'due': dueDay,
    'last': lastDay,
    'reviews': reviews,
  };

  static ReviewCard? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final due = raw['due'];
    final last = raw['last'];
    if (due is! String || !isDayKey(due) || last is! String || !isDayKey(last)) {
      return null;
    }
    return ReviewCard(
      box: _int(raw['box']).clamp(0, maxBox),
      dueDay: due,
      lastDay: last,
      reviews: math.max(1, _int(raw['reviews'])),
    );
  }

  /// The later answer wins; on the same day, the further box — the member
  /// knew it on one of the two phones, and that is what happened.
  static ReviewCard newer(ReviewCard a, ReviewCard b) {
    final byDay = a.lastDay.compareTo(b.lastDay);
    if (byDay != 0) return byDay > 0 ? a : b;
    return a.box >= b.box ? a : b;
  }
}

/// What a member has earned on the Kasem learning path.
///
/// Progress is kept on the device *and*, once there is an account, in
/// Firestore. Neither copy alone is enough: learning works signed out, so a
/// guest's work has to survive without an account, and a member who changes
/// phone has to find their unit where they left it rather than back at lesson
/// one. The two are reconciled by [merge] rather than by one overwriting the
/// other, because both can legitimately move while the other is unreachable.
///
/// ── The calendar ──────────────────────────────────────────────────────────
/// Everything about *when* is kept as sets of day keys in the learner's own
/// timezone (see `learn_calendar.dart`): the days they learned on, the lessons
/// finished on each recent day, the days each kind of practice was done. The
/// streak, today's goal and the week of ticks are all derived from those sets
/// at the moment of drawing, which is what makes a duplicate completion — a
/// replayed lesson, the same day synced from two phones — incapable of
/// counting twice.
@immutable
class LearnProgress {
  const LearnProgress({
    this.completedLessons = const <String>{},
    this.lessonXp = const <String, int>{},
    this.sparkXp = 0,
    this.lastStreakClaim,
    int streakDays = 0,
    this.activeDays = const <String>{},
    this.dayLessons = const <String, Set<String>>{},
    this.lessonSteps = const <String, int>{},
    this.practiceDays = const <PracticeKind, Set<String>>{},
    this.reviewCards = const <String, ReviewCard>{},
  }) : storedStreakDays = streakDays;

  /// XP a lesson is worth when its own value is not known — the value every
  /// bundled lesson carries, and what pre-existing local progress is credited
  /// with now that lessons set their own.
  static const defaultLessonXp = 15;

  /// XP the daily spark is worth.
  static const xpPerSpark = 5;

  /// XP one kind of practice pays, once per day.
  static const xpPerPracticeDay = 5;

  /// Activities that make a day's goal: lessons finished plus kinds of
  /// practice done.
  static const dailyGoal = 3;

  /// Days a week that make the weekly goal.
  static const weeklyGoalDays = 3;

  /// How much calendar is kept. A year and a bit of days is enough for any
  /// streak anybody will have; the rules cap the stored list at 800.
  static const keptDays = 400;

  /// Recent days whose finished lessons are remembered, for today's goal.
  static const keptLessonDays = 21;

  /// Slugs of the lessons already finished.
  final Set<String> completedLessons;

  /// What each finished lesson actually paid out. Recorded rather than
  /// recomputed so that re-pricing a lesson never takes XP back off somebody
  /// who already earned it.
  final Map<String, int> lessonXp;

  /// Everything the daily spark has paid out, ever.
  final int sparkXp;

  /// When the daily spark was last taken, or null if it never has been.
  final DateTime? lastStreakClaim;

  /// The run of spark claims as the old counter kept it. Only read to backfill
  /// [activeDays] for somebody whose progress predates the calendar; the
  /// streak itself is [streakDays], derived from the days.
  final int storedStreakDays;

  /// Day keys on which the member did any learning at all.
  final Set<String> activeDays;

  /// Recent day keys, each with the lessons finished that day.
  final Map<String, Set<String>> dayLessons;

  /// Questions already answered in lessons started and not yet finished, so a
  /// lesson reopens where it was left and the hero can say "3 of 4".
  final Map<String, int> lessonSteps;

  /// The days each kind of practice was done.
  final Map<PracticeKind, Set<String>> practiceDays;

  /// Spaced repetition, by dictionary entry id.
  final Map<String, ReviewCard> reviewCards;

  // ── Derived ───────────────────────────────────────────────────────────────

  String get _today => dayKey(learnNow());
  String get _yesterday => dayKey(addDays(learnNow(), -1));

  bool get activeToday => activeDays.contains(_today);

  /// Consecutive days of learning, ending today — or ending yesterday, while
  /// today is still there to be kept.
  int get streakDays {
    final now = learnNow();
    var cursor = activeDays.contains(dayKey(now)) ? now : addDays(now, -1);
    var run = 0;
    while (activeDays.contains(dayKey(cursor))) {
      run++;
      cursor = addDays(cursor, -1);
    }
    return run;
  }

  /// The longest run of consecutive days in the calendar.
  int get longestStreak {
    final days = activeDays.map(parseDayKey).whereType<DateTime>().toList()
      ..sort();
    var best = 0;
    var run = 0;
    DateTime? previous;
    for (final day in days) {
      run = previous != null && addDays(previous, 1) == day ? run + 1 : 1;
      best = math.max(best, run);
      previous = day;
    }
    return best;
  }

  /// Whether today's spark has already been taken.
  bool get sparkClaimedToday => isSameDay(lastStreakClaim, learnNow());

  /// The streak is alive but today has nothing in it yet.
  bool get streakAtRisk =>
      streakDays > 0 && !activeToday && activeDays.contains(_yesterday);

  int get lessonsToday => dayLessons[_today]?.length ?? 0;

  int get practiceToday =>
      practiceDays.values.where((days) => days.contains(_today)).length;

  /// Today's activities towards [dailyGoal].
  int get activitiesToday => lessonsToday + practiceToday;

  bool get dailyGoalMet => activitiesToday >= dailyGoal;

  bool practisedToday(PracticeKind kind) =>
      practiceDays[kind]?.contains(_today) ?? false;

  /// Monday to Sunday of this week, each with whether it was a learning day.
  List<({DateTime day, bool active, bool isToday, bool isFuture})> get week {
    final now = learnNow();
    final today = dayKey(now);
    return [
      for (final day in weekOf(now))
        (
          day: day,
          active: activeDays.contains(dayKey(day)),
          isToday: dayKey(day) == today,
          isFuture: dayKey(day).compareTo(today) > 0,
        ),
    ];
  }

  int get activeDaysThisWeek => week.where((entry) => entry.active).length;

  bool get weeklyGoalMet => activeDaysThisWeek >= weeklyGoalDays;

  int get practiceXp =>
      practiceDays.values.fold<int>(0, (total, days) => total + days.length) *
      xpPerPracticeDay;

  /// What the *learning path* has paid: lessons, the daily spark and practice.
  ///
  /// Not the number on the badge in the header. That badge shows this plus the
  /// member's contribution points, and the addition happens at the moment of
  /// drawing rather than in here.
  ///
  /// Contribution points must never be folded into this class. Everything on
  /// it is device-first and reconciled by [merge], which takes the *more
  /// generous* of the device and server copies — the right rule for a lesson
  /// finished on a plane, and a licence to print money for a score the server
  /// is meant to own. `learnProgress/{uid}` is also owner-writable, and a
  /// public leaderboard figure has no business living in a document its own
  /// subject can write.
  int get xp =>
      lessonXp.values.fold<int>(0, (total, value) => total + value) +
      sparkXp +
      practiceXp;

  bool hasCompleted(String lessonId) => completedLessons.contains(lessonId);

  /// Questions answered in [lessonId] so far; zero for a finished lesson.
  int stepsIn(String lessonId) =>
      hasCompleted(lessonId) ? 0 : (lessonSteps[lessonId] ?? 0);

  /// Words whose review is due now.
  Iterable<String> get dueReviewIds {
    final now = learnNow();
    return reviewCards.entries
        .where((entry) => entry.value.isDue(now))
        .map((entry) => entry.key);
  }

  LearnProgress copyWith({
    Set<String>? completedLessons,
    Map<String, int>? lessonXp,
    int? sparkXp,
    DateTime? lastStreakClaim,
    int? storedStreakDays,
    Set<String>? activeDays,
    Map<String, Set<String>>? dayLessons,
    Map<String, int>? lessonSteps,
    Map<PracticeKind, Set<String>>? practiceDays,
    Map<String, ReviewCard>? reviewCards,
  }) => LearnProgress(
    completedLessons: completedLessons ?? this.completedLessons,
    lessonXp: lessonXp ?? this.lessonXp,
    sparkXp: sparkXp ?? this.sparkXp,
    lastStreakClaim: lastStreakClaim ?? this.lastStreakClaim,
    streakDays: storedStreakDays ?? this.storedStreakDays,
    activeDays: activeDays ?? this.activeDays,
    dayLessons: dayLessons ?? this.dayLessons,
    lessonSteps: lessonSteps ?? this.lessonSteps,
    practiceDays: practiceDays ?? this.practiceDays,
    reviewCards: reviewCards ?? this.reviewCards,
  );

  /// Today marked as a learning day.
  LearnProgress markActive([DateTime? at]) {
    final key = dayKey(at ?? learnNow());
    if (activeDays.contains(key)) return this;
    return copyWith(activeDays: {...activeDays, key}).pruned();
  }

  /// Drops calendar older than what is kept, so an owner-writable document
  /// cannot grow for ever.
  LearnProgress pruned() {
    final now = learnNow();
    final oldestDay = dayKey(addDays(now, -keptDays));
    final oldestLessonDay = dayKey(addDays(now, -keptLessonDays));
    bool keep(String key, String oldest) => key.compareTo(oldest) >= 0;
    return LearnProgress(
      completedLessons: completedLessons,
      lessonXp: lessonXp,
      sparkXp: sparkXp,
      lastStreakClaim: lastStreakClaim,
      streakDays: storedStreakDays,
      activeDays: {
        for (final day in activeDays)
          if (keep(day, oldestDay)) day,
      },
      dayLessons: {
        for (final entry in dayLessons.entries)
          if (keep(entry.key, oldestLessonDay)) entry.key: entry.value,
      },
      lessonSteps: lessonSteps,
      // Practice days are what practice XP is counted from, so they are never
      // pruned: dropping one would take XP back.
      practiceDays: practiceDays,
      reviewCards: reviewCards,
    );
  }

  /// Fills the calendar for progress that predates it.
  ///
  /// Before the calendar, the streak was a counter of consecutive spark
  /// claims ending at [lastStreakClaim]. That is exactly a run of days, so it
  /// is written in as one — nobody loses the streak they had the day this
  /// shipped.
  LearnProgress withLegacyBackfill() {
    final claim = lastStreakClaim;
    if (activeDays.isNotEmpty || claim == null || storedStreakDays <= 0) {
      return this;
    }
    final days = {
      for (var offset = 0; offset < storedStreakDays && offset < keptDays; offset++)
        dayKey(addDays(claim, -offset)),
    };
    return copyWith(activeDays: days);
  }

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
    final completed = {...completedLessons, ...other.completedLessons};
    final steps = <String, int>{...lessonSteps};
    other.lessonSteps.forEach((lesson, value) {
      if (value > (steps[lesson] ?? 0)) steps[lesson] = value;
    });
    steps.removeWhere((lesson, _) => completed.contains(lesson));
    final lessonsByDay = <String, Set<String>>{
      for (final entry in dayLessons.entries) entry.key: {...entry.value},
    };
    other.dayLessons.forEach((day, lessons) {
      lessonsByDay.putIfAbsent(day, () => <String>{}).addAll(lessons);
    });
    final practice = <PracticeKind, Set<String>>{
      for (final entry in practiceDays.entries) entry.key: {...entry.value},
    };
    other.practiceDays.forEach((kind, days) {
      practice.putIfAbsent(kind, () => <String>{}).addAll(days);
    });
    final cards = <String, ReviewCard>{...reviewCards};
    other.reviewCards.forEach((id, card) {
      final mine = cards[id];
      cards[id] = mine == null ? card : ReviewCard.newer(mine, card);
    });
    return LearnProgress(
      completedLessons: completed,
      lessonXp: xpByLesson,
      sparkXp: math.max(sparkXp, other.sparkXp),
      lastStreakClaim: claim,
      streakDays: math.max(storedStreakDays, other.storedStreakDays),
      activeDays: {...activeDays, ...other.activeDays},
      dayLessons: lessonsByDay,
      lessonSteps: steps,
      practiceDays: practice,
      reviewCards: cards,
    ).pruned();
  }

  /// True when [a] and [b] fall on the same local calendar day.
  static bool isSameDay(DateTime? a, DateTime? b) =>
      a != null &&
      b != null &&
      a.year == b.year &&
      a.month == b.month &&
      a.day == b.day;

  // ── Serialisation ─────────────────────────────────────────────────────────

  /// The calendar half, as plain JSON — the same shape on disk and in
  /// Firestore.
  Map<String, Object?> calendarJson() => {
    'activeDays': (activeDays.toList()..sort()),
    'dayLessons': {
      for (final entry in dayLessons.entries)
        entry.key: (entry.value.toList()..sort()),
    },
    'lessonSteps': lessonSteps,
    'practiceDays': {
      for (final entry in practiceDays.entries)
        entry.key.wireName: (entry.value.toList()..sort()),
    },
    'reviewCards': {
      for (final entry in reviewCards.entries) entry.key: entry.value.toJson(),
    },
  };

  LearnProgress withCalendarJson(Map<Object?, Object?> raw) {
    Set<String> days(Object? value) => value is List
        ? value.whereType<String>().where(isDayKey).toSet()
        : <String>{};
    final lessonsByDay = <String, Set<String>>{};
    final rawDayLessons = raw['dayLessons'];
    if (rawDayLessons is Map) {
      rawDayLessons.forEach((key, value) {
        if (key is String && isDayKey(key) && value is List) {
          lessonsByDay[key] = value.whereType<String>().toSet();
        }
      });
    }
    final steps = <String, int>{};
    final rawSteps = raw['lessonSteps'];
    if (rawSteps is Map) {
      rawSteps.forEach((key, value) {
        final count = _int(value);
        if (key is String && count > 0) steps[key] = count;
      });
    }
    final practice = <PracticeKind, Set<String>>{};
    final rawPractice = raw['practiceDays'];
    if (rawPractice is Map) {
      rawPractice.forEach((key, value) {
        final kind = PracticeKind.parse(key);
        if (kind != null) practice[kind] = days(value);
      });
    }
    final cards = <String, ReviewCard>{};
    final rawCards = raw['reviewCards'];
    if (rawCards is Map) {
      rawCards.forEach((key, value) {
        final card = ReviewCard.fromJson(value);
        if (key is String && card != null) cards[key] = card;
      });
    }
    return copyWith(
      activeDays: days(raw['activeDays']),
      dayLessons: lessonsByDay,
      lessonSteps: steps,
      practiceDays: practice,
      reviewCards: cards,
    );
  }

  Map<String, Object?> toFirestore(String uid) => {
    'uid': uid,
    'completedLessons': completedLessons.toList(growable: false),
    'lessonXp': lessonXp,
    'sparkXp': sparkXp,
    'xp': xp,
    // The derived streak, so anything reading the document sees the same
    // number the app shows.
    'streakDays': streakDays,
    'longestStreak': longestStreak,
    'lastStreakClaim': lastStreakClaim == null
        ? null
        : Timestamp.fromDate(lastStreakClaim!),
    ...calendarJson(),
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
    ).withCalendarJson(data).withLegacyBackfill();
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
  static const calendarKey = 'learn.calendar.v1';

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
        merged.completedLessons.length != remote.completedLessons.length ||
        merged.activeDays.length != remote.activeDays.length ||
        merged.reviewCards.length != remote.reviewCards.length ||
        !mapEquals(merged.lessonSteps, remote.lessonSteps)) {
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
    var progress = LearnProgress(
      completedLessons: completed,
      lessonXp: _storedLessonXp(preferences, completed),
      sparkXp: preferences.getInt(sparkXpKey) ?? 0,
      lastStreakClaim: claimedAt == null ? null : DateTime.tryParse(claimedAt),
      streakDays: preferences.getInt(streakDaysKey) ?? 0,
    );
    final calendar = preferences.getString(calendarKey);
    if (calendar != null) {
      try {
        progress = progress.withCalendarJson(
          jsonDecode(calendar) as Map<String, dynamic>,
        );
      } on Object {
        // A corrupt calendar costs the ticks, never the lessons above.
      }
    }
    return progress.withLegacyBackfill();
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

  /// The newest progress, once the first load has finished.
  ///
  /// Not `await future` alone: that future completes with the value it was
  /// created with, so two updates started in the same frame — a review answer
  /// and the practice it finishes — would both start from the same snapshot,
  /// and the second would quietly overwrite the first.
  Future<LearnProgress> _latest() async {
    final loaded = await future;
    return state.asData?.value ?? loaded;
  }

  /// Marks [lessonId] finished, worth [xp].
  ///
  /// Finishing a lesson again is still a day of learning and still counts
  /// towards today — once, because the day's lessons are a set — but it pays
  /// nothing: the XP was earned the first time.
  Future<void> completeLesson(String lessonId, {required int xp}) async {
    final current = await _latest();
    final today = dayKey(learnNow());
    final alreadyDone = current.hasCompleted(lessonId);
    final todays = current.dayLessons[today] ?? const <String>{};
    if (alreadyDone && todays.contains(lessonId) && current.activeToday) {
      return;
    }
    final steps = {...current.lessonSteps}..remove(lessonId);
    final next = current
        .copyWith(
          completedLessons: {...current.completedLessons, lessonId},
          lessonXp: alreadyDone
              ? current.lessonXp
              : {...current.lessonXp, lessonId: xp},
          dayLessons: {
            ...current.dayLessons,
            today: {...todays, lessonId},
          },
          lessonSteps: steps,
        )
        .markActive();
    // The tick lands in memory first. Holding the celebration until the disk
    // agrees would make finishing a lesson feel like it did not register.
    state = AsyncData(next);
    await _persist(next);
  }

  /// Records that [answered] questions of [lessonId] are done, so the lesson
  /// can be resumed and the hero can say how far along it is.
  Future<void> recordLessonStep(String lessonId, int answered) async {
    final current = await _latest();
    if (current.hasCompleted(lessonId) ||
        answered <= (current.lessonSteps[lessonId] ?? 0)) {
      if (!current.activeToday) {
        final next = current.markActive();
        state = AsyncData(next);
        await _persist(next);
      }
      return;
    }
    final next = current
        .copyWith(lessonSteps: {...current.lessonSteps, lessonId: answered})
        .markActive();
    state = AsyncData(next);
    await _persist(next);
  }

  /// Records a finished practice session. Pays once a day per kind; returns
  /// whether this one did.
  Future<bool> completePractice(PracticeKind kind) async {
    final current = await _latest();
    final today = dayKey(learnNow());
    final days = current.practiceDays[kind] ?? const <String>{};
    if (days.contains(today)) {
      if (!current.activeToday) {
        final next = current.markActive();
        state = AsyncData(next);
        await _persist(next);
      }
      return false;
    }
    final next = current
        .copyWith(practiceDays: {...current.practiceDays, kind: {...days, today}})
        .markActive();
    state = AsyncData(next);
    await _persist(next);
    return true;
  }

  /// Records one review answer for a dictionary entry.
  Future<void> reviewWord(String entryId, {required bool knew}) async {
    final current = await _latest();
    final now = learnNow();
    final card = current.reviewCards[entryId];
    final next = current
        .copyWith(
          reviewCards: {
            ...current.reviewCards,
            entryId: card == null
                ? ReviewCard.first(knew: knew, now: now)
                : card.answered(knew: knew, now: now),
          },
        )
        .markActive();
    state = AsyncData(next);
    await _persist(next);
  }

  /// Claims today's spark, returning false when today's was already taken.
  ///
  /// The caller gets the answer back so it can stay quiet rather than
  /// congratulate somebody for a claim that did not happen. The spark is a
  /// day of learning too, so it marks today on the calendar.
  Future<bool> claimStreak() async {
    final current = await _latest();
    final now = learnNow();
    if (LearnProgress.isSameDay(current.lastStreakClaim, now)) return false;

    final yesterday = DateTime(now.year, now.month, now.day - 1);
    final continued = LearnProgress.isSameDay(
      current.lastStreakClaim,
      yesterday,
    );
    final next = current
        .copyWith(
          lastStreakClaim: now,
          storedStreakDays: continued ? current.storedStreakDays + 1 : 1,
          sparkXp: current.sparkXp + LearnProgress.xpPerSpark,
        )
        .markActive(now);
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
      await preferences.setInt(streakDaysKey, progress.storedStreakDays);
      await preferences.setString(
        calendarKey,
        jsonEncode(progress.calendarJson()),
      );
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
      final data = progress.toFirestore(uid);
      // Each field replaced whole rather than deep-merged: a merge would keep
      // every calendar day this device has since pruned, and the document
      // would grow for ever. Fields this build does not know are untouched.
      await FirebaseFirestore.instance
          .collection('learnProgress')
          .doc(uid)
          .set(data, SetOptions(mergeFields: data.keys.toList()));
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
