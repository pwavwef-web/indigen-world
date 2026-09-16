import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/learn_catalog.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

const _flame = Color(0xFFE0763C);

// ── Streak ──────────────────────────────────────────────────────────────────

/// The streak, explained, with today's spark if it is still there to claim.
Future<void> showStreakSheet(BuildContext context, WidgetRef ref) {
  final l10n = AppLocalizations.of(context);
  return showGlassPopup<void>(
    context: context,
    title: 'Your streak',
    subtitle: 'Days in a row with a lesson or practice',
    builder: (popupContext) => Consumer(
      builder: (context, ref, _) {
        final progress =
            ref.watch(learnProgressProvider).asData?.value ??
            const LearnProgress();
        final brand = context.brand;
        final streak = progress.streakDays;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  streak > 0
                      ? Icons.local_fire_department_rounded
                      : Icons.local_fire_department_outlined,
                  color: _flame,
                  size: 44,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        streak == 1 ? '1 day' : '$streak days',
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        'Longest: ${progress.longestStreak} '
                        '${progress.longestStreak == 1 ? 'day' : 'days'}',
                        style: TextStyle(color: brand.mutedInk, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            WeekDots(progress: progress, compact: true),
            const SizedBox(height: 14),
            Text(
              progress.streakAtRisk
                  ? 'Learn something today to keep your streak going.'
                  : progress.activeToday
                  ? 'Today counts. Come back tomorrow to keep it going.'
                  : 'Finish a lesson or a practice to start a streak.',
              style: TextStyle(color: brand.ink, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              'Days follow your phone’s own clock. Several lessons in one day still count as one day.',
              style: TextStyle(color: brand.mutedInk, fontSize: 12),
            ),
            const SizedBox(height: 16),
            if (!progress.sparkClaimedToday)
              FilledButton.icon(
                key: const Key('claim-spark'),
                onPressed: () async {
                  HapticFeedback.mediumImpact();
                  final claimed = await ref
                      .read(learnProgressProvider.notifier)
                      .claimStreak();
                  if (!claimed || !context.mounted) return;
                  ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                    SnackBar(
                      content: Text(
                        l10n.learnSparkClaimed(LearnProgress.xpPerSpark),
                      ),
                    ),
                  );
                },
                icon: const Icon(Icons.bolt_rounded),
                label: const Text(
                  'Claim today’s spark · +${LearnProgress.xpPerSpark} XP',
                ),
              )
            else
              Text(
                'Today’s spark is claimed.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: brand.gold,
                  fontWeight: FontWeight.w800,
                ),
              ),
          ],
        );
      },
    ),
  );
}

// ── Today's goal ────────────────────────────────────────────────────────────

/// What today's goal is made of. Returns true when the member asks to carry on.
Future<bool?> showDailyGoalSheet(BuildContext context) => showGlassPopup<bool>(
  context: context,
  title: 'Today’s goal',
  subtitle: '${LearnProgress.dailyGoal} activities a day',
  builder: (popupContext) => Consumer(
    builder: (context, ref, _) {
      final progress =
          ref.watch(learnProgressProvider).asData?.value ??
          const LearnProgress();
      final brand = context.brand;
      final done = progress.activitiesToday.clamp(0, LearnProgress.dailyGoal);
      final met = progress.dailyGoalMet;
      Widget row(IconData icon, String label, bool ticked, String value) =>
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Icon(
                  icon,
                  size: 20,
                  color: ticked ? brand.gold : brand.faintInk,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(label, style: TextStyle(color: brand.ink)),
                ),
                Text(
                  value,
                  style: TextStyle(
                    color: ticked ? brand.gold : brand.mutedInk,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          );
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox.square(
                    dimension: 62,
                    child: CircularProgressIndicator(
                      value: done / LearnProgress.dailyGoal,
                      strokeWidth: 7,
                      strokeCap: StrokeCap.round,
                      color: brand.gold,
                      backgroundColor: brand.divider,
                    ),
                  ),
                  Icon(Icons.emoji_events_rounded, color: brand.gold),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$done of ${LearnProgress.dailyGoal} done',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      met
                          ? 'Today’s goal is complete. Anything more is a head start on tomorrow.'
                          : 'Each lesson you finish, and each kind of practice, counts once.',
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          row(
            Icons.school_rounded,
            'Lessons finished today',
            progress.lessonsToday > 0,
            '${progress.lessonsToday}',
          ),
          for (final kind in PracticeKind.values)
            row(
              switch (kind) {
                PracticeKind.review => Icons.menu_book_rounded,
                PracticeKind.listen => Icons.headphones_rounded,
                PracticeKind.speak => Icons.mic_rounded,
              },
              switch (kind) {
                PracticeKind.review => 'Review words',
                PracticeKind.listen => 'Listen',
                PracticeKind.speak => 'Speak',
              },
              progress.practisedToday(kind),
              progress.practisedToday(kind) ? '✓' : '—',
            ),
          const SizedBox(height: 14),
          FilledButton.icon(
            key: const Key('goal-continue'),
            onPressed: () => Navigator.pop(popupContext, true),
            icon: const Icon(Icons.play_arrow_rounded),
            label: Text(met ? 'Keep going' : 'Continue learning'),
          ),
        ],
      );
    },
  ),
);

// ── XP and achievements ─────────────────────────────────────────────────────

@immutable
class LearnAchievement {
  const LearnAchievement({
    required this.icon,
    required this.title,
    required this.progress,
    required this.target,
  });

  final IconData icon;
  final String title;
  final int progress;
  final int target;

  bool get earned => progress >= target;
}

/// Achievements, derived from stored progress rather than stored themselves:
/// nothing can be earned that the progress record does not show, and nothing
/// earned can be lost to a stale copy.
List<LearnAchievement> achievementsFor(
  LearnProgress progress,
  CourseOutline outline,
) => [
  LearnAchievement(
    icon: Icons.school_rounded,
    title: 'First lesson',
    progress: progress.completedLessons.length,
    target: 1,
  ),
  LearnAchievement(
    icon: Icons.emoji_events_rounded,
    title: 'Unit complete',
    progress: outline.units
        .where((unit) => unit.state == UnitState.completed)
        .length,
    target: 1,
  ),
  LearnAchievement(
    icon: Icons.local_fire_department_rounded,
    title: '3-day streak',
    progress: progress.longestStreak,
    target: 3,
  ),
  LearnAchievement(
    icon: Icons.whatshot_rounded,
    title: '7-day streak',
    progress: progress.longestStreak,
    target: 7,
  ),
  LearnAchievement(
    icon: Icons.menu_book_rounded,
    title: '10 words reviewed',
    progress: progress.reviewCards.length,
    target: 10,
  ),
  LearnAchievement(
    icon: Icons.headphones_rounded,
    title: 'Listened on 3 days',
    progress: progress.practiceDays[PracticeKind.listen]?.length ?? 0,
    target: 3,
  ),
  LearnAchievement(
    icon: Icons.mic_rounded,
    title: 'First recording sent',
    progress: progress.practiceDays[PracticeKind.speak]?.length ?? 0,
    target: 1,
  ),
  LearnAchievement(
    icon: Icons.bolt_rounded,
    title: '100 XP',
    progress: progress.xp,
    target: 100,
  ),
];

/// Progress on the whole course, the two halves of the XP badge, and
/// achievements.
Future<void> showProgressSheet(BuildContext context) {
  final l10n = AppLocalizations.of(context);
  return showGlassPopup<void>(
    context: context,
    title: l10n.learnMomentumTitle,
    builder: (popupContext) => Consumer(
      builder: (context, ref, _) {
        final progress =
            ref.watch(learnProgressProvider).asData?.value ??
            const LearnProgress();
        final outline = ref.watch(courseOutlineProvider);
        final contributed = ref.watch(myContributionPointsProvider);
        final brand = context.brand;
        final total = outline.path.length;
        final completed = outline.completedLessons;
        final share = total == 0 ? 0.0 : (completed / total).clamp(0.0, 1.0);
        final achievements = achievementsFor(progress, outline);
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    total == 0
                        ? l10n.learnMomentumUnpublished
                        : l10n.learnMomentumProgress(completed, total),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                Text(
                  '${(share * 100).round()}%',
                  style: TextStyle(
                    color: brand.accent,
                    fontWeight: FontWeight.w900,
                    fontSize: 17,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: share,
                minHeight: 8,
                color: brand.gold,
                backgroundColor: brand.divider,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _Stat(
                    icon: Icons.bolt_rounded,
                    value: '${progress.xp + contributed}',
                    label: 'XP earned',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Stat(
                    icon: Icons.local_fire_department_rounded,
                    value: '${progress.streakDays}',
                    label: 'day streak',
                  ),
                ),
              ],
            ),
            // The header carries one badge; this is the only place it says
            // what that badge is made of — and only for somebody who has
            // contributed, so nobody is shown a nought in a second total.
            if (contributed > 0) ...[
              const SizedBox(height: 10),
              Text(
                '${progress.xp} learning · $contributed contributed',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: 18),
            Text(
              'ACHIEVEMENTS',
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 11,
                letterSpacing: 1.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            for (final achievement in achievements)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: achievement.earned
                            ? brand.gold
                            : brand.surfaceMuted,
                      ),
                      child: Icon(
                        achievement.icon,
                        size: 18,
                        color: achievement.earned
                            ? brand.pick(Colors.white, brand.background)
                            : brand.faintInk,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        achievement.title,
                        style: TextStyle(
                          color: achievement.earned
                              ? brand.ink
                              : brand.mutedInk,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      achievement.earned
                          ? 'Earned'
                          : '${achievement.progress.clamp(0, achievement.target)}/${achievement.target}',
                      style: TextStyle(
                        color: achievement.earned ? brand.gold : brand.faintInk,
                        fontWeight: FontWeight.w800,
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    ),
  );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.value, required this.label});

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    decoration: BoxDecoration(
      color: context.brand.surfaceMuted,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: context.brand.border),
    ),
    child: Row(
      children: [
        Icon(icon, color: context.brand.gold, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(
                  color: context.brand.ink,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              Text(
                label,
                style: TextStyle(color: context.brand.mutedInk, fontSize: 11),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

// ── Language ────────────────────────────────────────────────────────────────

Future<void> showCoursePicker(BuildContext context) => showGlassPopup<void>(
  context: context,
  title: 'Choose a language',
  builder: (popupContext) => Consumer(
    builder: (context, ref, _) {
      final courses =
          ref.watch(learnCoursesProvider).asData?.value ?? const [kasemCourse];
      final selected = ref.watch(selectedCourseIdProvider);
      final brand = context.brand;
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RadioGroup<String>(
            groupValue: selected,
            onChanged: (value) {
              if (value == null) return;
              ref.read(selectedCourseIdProvider.notifier).choose(value);
              Navigator.of(popupContext).pop();
            },
            child: Column(
              children: [
                for (final course in courses)
                  RadioListTile<String>(
                    value: course.id,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      course.languageName,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: course.description.isEmpty
                        ? null
                        : Text(
                            course.description,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'More Indigenous languages will appear here as their courses are published.',
            style: TextStyle(color: brand.mutedInk, fontSize: 12),
          ),
        ],
      );
    },
  ),
);

// ── Units that do not open yet ──────────────────────────────────────────────

/// Explains why [unit] is closed. Returns true when the member asks to go to
/// the unit that has to come first.
Future<bool?> showUnitUnavailableSheet(
  BuildContext context,
  UnitOutline unit,
) => showGlassPopup<bool>(
  context: context,
  title: unit.unit.title,
  subtitle: 'Unit ${unit.unit.order}',
  builder: (popupContext) {
    final brand = popupContext.brand;
    final blockedBy = unit.blockedBy;
    final preparing = unit.state == UnitState.inPreparation;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(
              preparing ? Icons.construction_rounded : Icons.lock_rounded,
              color: brand.gold,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                preparing ? 'Lessons in preparation' : 'Locked for now',
                style: TextStyle(color: brand.ink, fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          preparing
              ? 'The lessons for this unit are still being written and checked with Kasem speakers. They will appear here as soon as they are published.'
              : blockedBy == null
              ? 'Finish the units before this one to open it.'
              : 'Finish Unit ${blockedBy.unit.order} · ${blockedBy.unit.title} first — '
                    '${blockedBy.remaining} ${blockedBy.remaining == 1 ? 'lesson' : 'lessons'} to go.',
          style: TextStyle(color: brand.mutedInk, height: 1.4),
        ),
        if (!preparing && blockedBy != null) ...[
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => Navigator.pop(popupContext, true),
            child: Text('Continue Unit ${blockedBy.unit.order}'),
          ),
        ],
      ],
    );
  },
);

// ── The week, drawn ─────────────────────────────────────────────────────────

/// Monday to Sunday: gold with a tick where the member learned, an outline
/// where they did not, a blue ring on today.
class WeekDots extends StatelessWidget {
  const WeekDots({required this.progress, this.compact = false, super.key});

  final LearnProgress progress;
  final bool compact;

  static const _letters = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) => _dots(
      context,
      // Seven columns always fit: the circles shrink with the row rather than
      // pushing Sunday off the card.
      (constraints.maxWidth / 7 - 4).clamp(18.0, compact ? 28.0 : 32.0),
    ),
  );

  Widget _dots(BuildContext context, double size) {
    final brand = context.brand;
    final week = progress.week;
    return Row(
      children: [
        for (var index = 0; index < week.length; index++)
          Expanded(
            child: Semantics(
              label:
                  '${_letters[index]}, ${week[index].active
                      ? 'learned'
                      : week[index].isFuture
                      ? 'still to come'
                      : 'no learning'}',
              excludeSemantics: true,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    key: ValueKey('week-${dayKey(week[index].day)}'),
                    width: size,
                    height: size,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: week[index].active
                          ? brand.gold
                          : Colors.transparent,
                      border: week[index].active
                          ? null
                          : Border.all(
                              color: week[index].isToday
                                  ? brand.accent
                                  : brand.border,
                              width: week[index].isToday ? 1.6 : 1.2,
                            ),
                    ),
                    child: week[index].active
                        ? Icon(
                            Icons.check_rounded,
                            size: size * 0.6,
                            color: brand.pick(
                              Colors.white,
                              const Color(0xFF1A1407),
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(height: 6),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      _letters[index],
                      maxLines: 1,
                      style: TextStyle(
                        color: week[index].active || week[index].isToday
                            ? brand.ink
                            : brand.mutedInk,
                        fontSize: compact ? 11 : 12,
                        fontWeight: week[index].isToday
                            ? FontWeight.w800
                            : FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
