import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

class LearnScreen extends ConsumerStatefulWidget {
  const LearnScreen({super.key});

  @override
  ConsumerState<LearnScreen> createState() => _LearnScreenState();
}

class _LearnScreenState extends ConsumerState<LearnScreen> {
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    // Lifted clear of the shell's floating glass rail, which the body extends
    // behind.
    floatingActionButton: const Padding(
      padding: EdgeInsets.only(bottom: kFrostedNavBarReservedSpace - 26),
      child: KawuriFab(),
    ),
    body: ScreenContainer(child: _path()),
  );

  Widget _path() {
    // Progress arrives from disk a frame or two after the screen does, and the
    // published path a moment after that. An empty path beats a spinner here:
    // the layout is identical either way, so the numbers fill themselves in
    // rather than the whole tab blinking.
    final progress =
        ref.watch(learnProgressProvider).value ?? const LearnProgress();
    final lessons = ref.watch(lessonPathProvider).value ?? bundledLessons;
    final nextLesson = _nextLesson(progress, lessons);
    final completed = lessons
        .where((lesson) => progress.hasCompleted(lesson.id))
        .length;

    return CustomScrollView(
      key: const PageStorageKey('learn-path-scroll'),
      slivers: [
        SliverToBoxAdapter(
          child: _LearnHeader(
            xp: progress.xp,
            completed: completed,
            total: lessons.length,
            streakDays: progress.streakDays,
            streakClaimed: progress.sparkClaimedToday,
            onClaimStreak: _claimStreak,
            onOpenDictionary: _openDictionary,
            onOpenQuest: () => _openQuest(completed, nextLesson),
            onOpenMomentum: () =>
                _openMomentum(progress, completed, lessons.length),
          ),
        ),
        // The quest and the momentum summary used to open this list as two
        // full-width cards, which pushed the first lesson button most of a
        // screen down a *learning* path. They are status, not the path, so
        // they moved into the header where the rest of the status already is
        // and the trail starts where the tab does.
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 120),
          sliver: SliverList.list(
            children: [
              ..._pathBody(progress, lessons, nextLesson),
              const SizedBox(height: 24),
              const _LockedUnitPreview(),
            ],
          ),
        ),
      ],
    );
  }

  /// Today's quest, in full, on a card that closes again.
  Future<void> _openQuest(int completed, int nextLesson) async {
    final start = await showGlassPopup<bool>(
      context: context,
      title: "Today's quest",
      subtitle: 'Complete 3 quick lessons',
      builder: (popupContext) => _QuestPopupBody(completed: completed),
    );
    if (start == true && mounted) await _openLesson(nextLesson);
  }

  /// How far along the whole path this member is.
  Future<void> _openMomentum(
    LearnProgress progress,
    int completed,
    int total,
  ) => showGlassPopup<void>(
    context: context,
    title: 'Your momentum',
    subtitle: total == 0
        ? 'The path is still being published'
        : '$completed of $total lessons complete',
    builder: (popupContext) => _MomentumPopupBody(
      completed: completed,
      total: total,
      xp: progress.xp,
      streakDays: progress.streakDays,
    ),
  );

  /// The winding trail itself: a banner wherever the unit changes, a node per
  /// lesson, and a ribbon between two lessons that belong to the same unit.
  ///
  /// Units are read off the lessons rather than kept in a second collection,
  /// so publishing a lesson into a new unit is one document rather than two
  /// that can disagree about what the unit is called.
  List<Widget> _pathBody(
    LearnProgress progress,
    List<Lesson> lessons,
    int nextLesson,
  ) {
    final body = <Widget>[];
    for (var index = 0; index < lessons.length; index++) {
      final lesson = lessons[index];
      final startsUnit =
          index == 0 || lessons[index - 1].unitTitle != lesson.unitTitle;
      if (startsUnit) {
        body
          ..add(const SizedBox(height: 26))
          ..add(
            _UnitBanner(
              unit: 'UNIT ${lesson.unitOrder}',
              title: lesson.unitTitle,
              subtitle: lesson.unitSubtitle,
              color: lesson.unitOrder.isOdd
                  ? context.brand.accent
                  : context.brand.terracotta,
            ),
          )
          ..add(const SizedBox(height: 18));
      }
      body.add(
        _LessonPathNode(
          lesson: lesson,
          index: index,
          completed: progress.hasCompleted(lesson.id),
          unlocked: index <= nextLesson,
          current: index == nextLesson,
          onTap: () => _openLesson(index),
        ),
      );
      final continuesUnit =
          index + 1 < lessons.length &&
          lessons[index + 1].unitTitle == lesson.unitTitle;
      if (continuesUnit) {
        body.add(
          _LessonRibbon(
            // Lessons alternate sides, so the segment always leaves the side
            // this lesson sits on and arrives at the other.
            startOnRight: index.isOdd,
            travelled: _travelled(progress, lessons, index),
            frontier: index + 1 == nextLesson,
          ),
        );
      }
    }
    return body;
  }

  int _nextLesson(LearnProgress progress, List<Lesson> lessons) {
    for (var index = 0; index < lessons.length; index++) {
      if (!progress.hasCompleted(lessons[index].id)) return index;
    }
    return lessons.isEmpty ? 0 : lessons.length - 1;
  }

  /// How much of the ribbon below lesson [index] is gold.
  ///
  /// The segment that leads into the lesson the member is on stops part way,
  /// so the trail visibly ends where they have actually got to rather than
  /// running on ahead of them.
  double _travelled(LearnProgress progress, List<Lesson> lessons, int index) {
    if (progress.hasCompleted(lessons[index + 1].id)) return 1.0;
    if (progress.hasCompleted(lessons[index].id)) return 0.56;
    return 0.0;
  }

  Future<void> _claimStreak() async {
    final progress = ref.read(learnProgressProvider).value;
    if (progress != null && progress.sparkClaimedToday) return;
    HapticFeedback.mediumImpact();
    // The controller owns the calendar, so it has the final say on whether
    // there was a spark left to claim today.
    final claimed = await ref
        .read(learnProgressProvider.notifier)
        .claimStreak();
    if (!claimed || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Daily spark claimed · +${LearnProgress.xpPerSpark} XP'),
      ),
    );
  }

  void _openDictionary() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const DictionaryCollectionScreen(),
      ),
    );
  }

  Future<void> _openLesson(int index) async {
    final progress =
        ref.read(learnProgressProvider).value ?? const LearnProgress();
    final lessons = ref.read(lessonPathProvider).value ?? bundledLessons;
    if (lessons.isEmpty) return;
    if (index > _nextLesson(progress, lessons)) {
      HapticFeedback.lightImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Finish the lesson above to unlock this one.'),
        ),
      );
      return;
    }
    final lesson = lessons[index];
    final completed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => _LessonScreen(
          lesson: lesson,
          lessonNumber: index + 1,
          lessonCount: lessons.length,
        ),
      ),
    );
    if (completed == true && mounted) {
      HapticFeedback.heavyImpact();
      await ref
          .read(learnProgressProvider.notifier)
          .completeLesson(lesson.id, xp: lesson.xp);
      // A finished lesson is somebody at their most pleased with the app, and
      // the sheet has already closed — so nothing is being interrupted. The
      // ask is rationed inside; most of the time this does nothing at all.
      if (!mounted) return;
      await maybeRequestReview(
        online: ref.read(connectionBlockProvider) == null,
      );
    }
  }
}

/// The top of the Learn tab.
///
/// Deliberately shallow, and deliberately *not* a card. It used to be a filled
/// green plate with a watermark behind it, which gave the tab a lid: a coloured
/// panel the eye read as a different screen, sitting on top of the trail rather
/// than introducing it. What stays is what changes — how much has been earned,
/// whether the streak is alive, and the four things worth tapping — drawn on
/// the same ground as the path itself.
class _LearnHeader extends StatelessWidget {
  const _LearnHeader({
    required this.xp,
    required this.completed,
    required this.total,
    required this.streakDays,
    required this.streakClaimed,
    required this.onClaimStreak,
    required this.onOpenDictionary,
    required this.onOpenQuest,
    required this.onOpenMomentum,
  });

  final int xp;
  final int completed;

  /// Lessons on the published path.
  final int total;

  /// Consecutive days the daily spark has been claimed.
  final int streakDays;

  final bool streakClaimed;
  final VoidCallback onClaimStreak;
  final VoidCallback onOpenDictionary;
  final VoidCallback onOpenQuest;
  final VoidCallback onOpenMomentum;

  @override
  Widget build(BuildContext context) => Padding(
    // The right inset clears the shell's floating profile orb.
    padding: const EdgeInsets.fromLTRB(20, 26, 20, 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 42),
          child: Text(
            'LEARN',
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.1,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                completed == 0
                    ? 'Speak your first words.'
                    : 'You are building a rhythm.',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            const SizedBox(width: 42),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            _MetricPill(icon: Icons.bolt_rounded, label: '$xp XP'),
            const SizedBox(width: 8),
            // Replaces a hard-coded five hearts that counted nothing and could
            // not be lost. The streak is the number this screen actually keeps,
            // and the one a daily habit is built on.
            _MetricPill(
              icon: streakDays > 0
                  ? Icons.local_fire_department_rounded
                  : Icons.local_fire_department_outlined,
              label: '$streakDays',
              color: streakDays > 0
                  ? const Color(0xFFE0763C)
                  : context.brand.faintInk,
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _HeaderAction(
                icon: Icons.emoji_events_rounded,
                label: "Today's quest",
                badge: '${completed.clamp(0, 3)}/3',
                onTap: onOpenQuest,
              ),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: _HeaderAction(
                icon: Icons.insights_rounded,
                label: 'Momentum',
                badge: total == 0
                    ? '—'
                    : '${((completed / total) * 100).round()}%',
                onTap: onOpenMomentum,
              ),
            ),
          ],
        ),
        const SizedBox(height: 9),
        Row(
          children: [
            Expanded(
              child: _HeaderAction(
                icon: streakClaimed
                    ? Icons.local_fire_department_rounded
                    : Icons.wb_sunny_outlined,
                label: streakClaimed ? 'Spark claimed' : 'Daily spark',
                onTap: onClaimStreak,
                active: streakClaimed,
              ),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: _HeaderAction(
                icon: Icons.menu_book_rounded,
                label: 'Dictionary',
                onTap: onOpenDictionary,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _MetricPill extends StatelessWidget {
  const _MetricPill({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;

  /// Defaults to the palette's gold, which is the highlight on both grounds.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tint = color ?? context.brand.gold;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: context.brand.surfaceMuted,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.brand.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: tint, size: 15),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: context.brand.ink,
              fontSize: 11.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderAction extends StatelessWidget {
  const _HeaderAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// A short figure carried on the right — `2/3`, `18%`. The point of moving
  /// the quest and the momentum into the header is that their *state* still
  /// has to be readable without opening anything.
  final String? badge;

  final bool active;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      label: badge == null ? label : '$label, $badge',
      excludeSemantics: true,
      child: Material(
        color: active ? brand.accentSoft : brand.surfaceMuted,
        borderRadius: BorderRadius.circular(15),
        child: InkWell(
          borderRadius: BorderRadius.circular(15),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              border: Border.all(
                color: active ? brand.accent.withValues(alpha: 0.4)
                    : brand.border,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  color: active ? brand.accent : brand.gold,
                  size: 19,
                ),
                const SizedBox(width: 7),
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (badge case final badge?) ...[
                  const SizedBox(width: 6),
                  Text(
                    badge,
                    style: TextStyle(
                      color: brand.accent,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _QuestPopupBody extends StatelessWidget {
  const _QuestPopupBody({required this.completed});

  final int completed;

  @override
  Widget build(BuildContext context) {
    final done = completed.clamp(0, 3);
    final progress = (completed / 3).clamp(0.0, 1.0);
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
                    value: progress,
                    strokeWidth: 7,
                    strokeCap: StrokeCap.round,
                    color: context.brand.gold,
                    backgroundColor: context.brand.divider,
                  ),
                ),
                Icon(
                  Icons.emoji_events_rounded,
                  color: context.brand.terracotta,
                ),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$done of 3 done',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    done >= 3
                        ? 'Today is finished. Anything further is a head start '
                              'on tomorrow.'
                        : 'Three short lessons is a day. Keep going and the '
                              'streak keeps its spark.',
                    style: TextStyle(
                      color: context.brand.mutedInk,
                      fontSize: 12.5,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: () => Navigator.pop(context, true),
          icon: const Icon(Icons.play_arrow_rounded),
          label: Text(done >= 3 ? 'Keep going' : 'Continue the quest'),
        ),
      ],
    );
  }
}

/// Progress across the whole published path, with the two numbers a daily
/// habit is actually built on.
class _MomentumPopupBody extends StatelessWidget {
  const _MomentumPopupBody({
    required this.completed,
    required this.total,
    required this.xp,
    required this.streakDays,
  });

  final int completed;
  final int total;
  final int xp;
  final int streakDays;

  @override
  Widget build(BuildContext context) {
    final progress = total == 0 ? 0.0 : (completed / total).clamp(0.0, 1.0);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                completed == 0
                    ? 'Your first milestone is ready'
                    : '$completed of $total lessons complete',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            Text(
              '${(progress * 100).round()}%',
              style: TextStyle(
                color: context.brand.accent,
                fontWeight: FontWeight.w900,
                fontSize: 17,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 8,
            color: context.brand.gold,
            backgroundColor: context.brand.accentFill.withValues(alpha: 0.08),
          ),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: _MomentumStat(
                icon: Icons.bolt_rounded,
                value: '$xp',
                label: 'XP earned',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MomentumStat(
                icon: streakDays > 0
                    ? Icons.local_fire_department_rounded
                    : Icons.local_fire_department_outlined,
                value: '$streakDays',
                label: 'day streak',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _MomentumStat extends StatelessWidget {
  const _MomentumStat({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
    decoration: BoxDecoration(
      color: context.brand.surfaceMuted,
      borderRadius: BorderRadius.circular(15),
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

class _UnitBanner extends StatelessWidget {
  const _UnitBanner({
    required this.unit,
    required this.title,
    required this.subtitle,
    required this.color,
  });

  final String unit;
  final String title;
  final String subtitle;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(17),
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: Colors.white12,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(
            Icons.record_voice_over_rounded,
            color: context.brand.gold,
          ),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                unit,
                style: TextStyle(
                  color: context.brand.gold,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Size of a lesson button. The ribbon between two lessons reads its anchor
/// off the width, so nudging the button never leaves the trail pointing at
/// empty space beside it.
const _lessonButtonWidth = 78.0;
const _lessonButtonHeight = 72.0;

class _LessonPathNode extends StatelessWidget {
  const _LessonPathNode({
    required this.lesson,
    required this.index,
    required this.completed,
    required this.unlocked,
    required this.current,
    required this.onTap,
  });

  final Lesson lesson;
  final int index;
  final bool completed;
  final bool unlocked;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final alignRight = index.isOdd;
    return Align(
      alignment: alignRight ? Alignment.centerRight : Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        textDirection: alignRight ? TextDirection.rtl : TextDirection.ltr,
        children: [
          _BouncyLessonButton(
            icon: completed
                ? Icons.check_rounded
                : unlocked
                ? lesson.icon
                : Icons.lock_rounded,
            current: current,
            completed: completed,
            unlocked: unlocked,
            onTap: onTap,
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 150,
            child: Column(
              crossAxisAlignment: alignRight
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                Text(
                  current
                      ? 'UP NEXT'
                      : completed
                      ? 'COMPLETED'
                      : 'LESSON ${index + 1}',
                  style: TextStyle(
                    color: current
                        ? context.brand.terracotta
                        : context.brand.mutedInk,
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.9,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  lesson.title,
                  textAlign: alignRight ? TextAlign.right : TextAlign.left,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  '${lesson.minutes} min · ${lesson.xp} XP',
                  style: TextStyle(color: context.brand.mutedInk, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BouncyLessonButton extends StatefulWidget {
  const _BouncyLessonButton({
    required this.icon,
    required this.current,
    required this.completed,
    required this.unlocked,
    required this.onTap,
  });

  final IconData icon;
  final bool current;
  final bool completed;
  final bool unlocked;
  final VoidCallback onTap;

  @override
  State<_BouncyLessonButton> createState() => _BouncyLessonButtonState();
}

class _BouncyLessonButtonState extends State<_BouncyLessonButton> {
  var _pressed = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.completed
        ? context.brand.gold
        : widget.unlocked
        ? context.brand.accent
        : const Color(0xFFC8C6BE);
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) {
        setState(() => _pressed = false);
        widget.onTap();
      },
      child: AnimatedScale(
        scale: _pressed
            ? 0.92
            : widget.current
            ? 1.05
            : 1,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutBack,
        child: Container(
          width: _lessonButtonWidth,
          height: _lessonButtonHeight,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: context.brand.background, width: 5),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.35),
                blurRadius: widget.current ? 18 : 7,
                offset: const Offset(0, 7),
              ),
            ],
          ),
          child: Icon(
            widget.icon,
            color: widget.completed ? context.brand.accent : Colors.white,
            size: 31,
          ),
        ),
      ),
    );
  }
}

/// Vertical room one ribbon segment gets. A straight bar needed almost none;
/// a curve needs enough height to be a curve rather than a kink.
const _ribbonHeight = 64.0;

/// How far the ribbon swings past a lesson before crossing to the next one.
/// Wide enough that four segments read as one winding trail, narrow enough
/// that the curve never leaves its own box.
const _ribbonBow = 26.0;

/// Spacing of the beads threaded along the ribbon.
const _ribbonBeadSpacing = 16.0;

/// The trail between two lessons.
///
/// Lessons alternate sides of the page, and this is the ribbon that joins
/// them: it leaves the bottom of one button, bows away from that side, then
/// crosses and arrives at the top of the next. Consecutive segments bow
/// opposite ways, so the whole unit spirals down the page as one path rather
/// than a column of disconnected hops.
class _LessonRibbon extends StatefulWidget {
  const _LessonRibbon({
    required this.startOnRight,
    required this.travelled,
    required this.frontier,
  });

  /// Side the lesson above sits on. The one below sits on the other.
  final bool startOnRight;

  /// How much of this segment the member has walked, 0 to 1.
  final double travelled;

  /// True for the single segment that leads into the lesson they are on now.
  final bool frontier;

  @override
  State<_LessonRibbon> createState() => _LessonRibbonState();
}

class _LessonRibbonState extends State<_LessonRibbon>
    with SingleTickerProviderStateMixin {
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncBreath();
  }

  @override
  void didUpdateWidget(covariant _LessonRibbon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.frontier != widget.frontier) _syncBreath();
  }

  @override
  void dispose() {
    _breath.dispose();
    super.dispose();
  }

  /// Only the frontier breathes, and only when the member has not asked the
  /// system to hold animation still. Everywhere else the ribbon is a still
  /// drawing, which costs nothing to leave on screen.
  void _syncBreath() {
    final animate =
        widget.frontier &&
        !MediaQuery.disableAnimationsOf(context) &&
        !MediaQuery.accessibleNavigationOf(context);
    if (animate) {
      if (!_breath.isAnimating) _breath.repeat(reverse: true);
    } else if (_breath.isAnimating || _breath.value != 0) {
      _breath
        ..stop()
        ..value = 0;
    }
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    // Pure decoration. A screen reader should hear four lessons, not three
    // descriptions of a squiggle between them.
    child: RepaintBoundary(
      child: AnimatedBuilder(
        animation: _breath,
        builder: (context, _) => CustomPaint(
          size: const Size(double.infinity, _ribbonHeight),
          painter: _LessonRibbonPainter(
            brand: context.brand,
            startOnRight: widget.startOnRight,
            travelled: widget.travelled,
            glow: widget.frontier
                ? Curves.easeInOut.transform(_breath.value)
                : 0.0,
          ),
        ),
      ),
    ),
  );
}

class _LessonRibbonPainter extends CustomPainter {
  const _LessonRibbonPainter({
    required this.brand,
    required this.startOnRight,
    required this.travelled,
    required this.glow,
  });

  /// A painter has no context of its own, so the palette comes in with the
  /// rest of the paint data — and takes part in [shouldRepaint], or the
  /// trail would keep its daylight grey after a switch to dark.
  final BrandPalette brand;

  final bool startOnRight;
  final double travelled;

  /// Breath on the frontier segment, 0 when the trail is standing still.
  final double glow;

  @override
  void paint(Canvas canvas, Size size) {
    // The trail meets each button dead centre. Taking the anchor from the
    // button width means the two cannot drift apart.
    final anchor = _lessonButtonWidth / 2;
    final startX = startOnRight ? size.width - anchor : anchor;
    final endX = startOnRight ? anchor : size.width - anchor;
    final outward = startOnRight ? _ribbonBow : -_ribbonBow;

    final ribbon = Path()
      ..moveTo(startX, 0)
      ..cubicTo(
        startX + outward,
        size.height * 0.34,
        endX - outward,
        size.height * 0.66,
        endX,
        size.height,
      );

    // A wide, barely-there green underneath — the same warm shadow the cards
    // carry, so the ribbon rests on the page instead of floating over it.
    canvas.drawPath(
      ribbon,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 12
        ..strokeCap = StrokeCap.round
        ..color = brand.shadow.withValues(alpha: brand.isDark ? 0.5 : 0.06),
    );

    final metric = ribbon.computeMetrics().first;
    final walked = metric.length * travelled.clamp(0.0, 1.0);

    final thread = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    if (walked < metric.length) {
      canvas.drawPath(
        metric.extractPath(walked, metric.length),
        thread..color = brand.divider,
      );
    }
    if (walked > 0) {
      final trail = metric.extractPath(0, walked);
      if (glow > 0) {
        canvas.drawPath(
          trail,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 11
            ..strokeCap = StrokeCap.round
            ..color = brand.gold.withValues(alpha: 0.1 + (glow * 0.22))
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
        );
      }
      canvas.drawPath(trail, thread..color = brand.gold);
    }

    _paintBeads(canvas, metric, walked);
  }

  /// Beads are what turn a curve into a path somebody is walking. Each wears
  /// the same white collar as the lesson buttons, so the trail and its stops
  /// clearly belong to one another.
  void _paintBeads(Canvas canvas, PathMetric metric, double walked) {
    final bead = Paint();
    final collar = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..color = brand.background;

    for (
      var distance = _ribbonBeadSpacing;
      distance < metric.length - 6;
      distance += _ribbonBeadSpacing
    ) {
      final tangent = metric.getTangentForOffset(distance);
      if (tangent == null) continue;
      final reached = distance <= walked;
      final radius = reached ? 3.4 : 2.7;
      canvas
        ..drawCircle(
          tangent.position,
          radius,
          bead..color = reached ? brand.gold : brand.divider,
        )
        ..drawCircle(tangent.position, radius, collar);
    }
  }

  @override
  bool shouldRepaint(_LessonRibbonPainter oldDelegate) =>
      oldDelegate.brand != brand ||
      oldDelegate.startOnRight != startOnRight ||
      oldDelegate.travelled != travelled ||
      oldDelegate.glow != glow;
}

class _LockedUnitPreview extends StatelessWidget {
  const _LockedUnitPreview();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: context.brand.surface,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: context.brand.border),
    ),
    child: Row(
      children: [
        Icon(Icons.lock_clock_rounded, color: context.brand.mutedInk),
        const SizedBox(width: 12),
        const Expanded(
          child: Text(
            // Deliberately vague about what comes next: units are configured
            // in the admin console now, so promising "six lessons and a story
            // challenge" would be a claim this screen cannot keep.
            'More units open as the project publishes them. Finish what is here '
            'and check back.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

/// One lesson, worked through question by question.
///
/// A lesson used to be a single card, so "finish the lesson" and "get one
/// answer right" were the same event and a wrong answer simply reset it. With
/// several questions the two come apart: the member moves forward whether they
/// got it right or not, the explanation does the teaching, and the score at the
/// end says how it went. Nobody is held at a card they cannot pass.
class _LessonScreen extends StatefulWidget {
  const _LessonScreen({
    required this.lesson,
    required this.lessonNumber,
    required this.lessonCount,
  });

  final Lesson lesson;
  final int lessonNumber;
  final int lessonCount;

  @override
  State<_LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<_LessonScreen> {
  int _question = 0;
  int? _selected;
  var _checked = false;
  var _correctCount = 0;

  /// Whether this question has already counted towards the score. A member who
  /// checks, reads the explanation and taps again must not be paid twice.
  var _scored = false;

  List<LessonQuestion> get _questions => widget.lesson.questions;
  LessonQuestion get _current => _questions[_question];
  bool get _correct => _selected == _current.correctAnswer;
  bool get _isLast => _question == _questions.length - 1;

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    // Resolved from the theme rather than pinned to dark icons, which vanish
    // against the dark palette's near-black system bars.
    value: brandOverlayStyle(context.brand),
    child: Scaffold(
      backgroundColor: context.brand.background,
      body: Stack(
        children: [
          const Positioned.fill(child: _LessonAtmosphere()),
          SafeArea(
            bottom: false,
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: Column(
                  children: [
                    _LessonTopBar(
                      current: widget.lessonNumber,
                      total: widget.lessonCount,
                      question: _question + 1,
                      questionCount: _questions.length,
                      onClose: () => Navigator.pop(context),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        key: PageStorageKey(
                          'lesson-${widget.lessonNumber}-scroll',
                        ),
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 132),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _LessonHero(lesson: widget.lesson),
                            const SizedBox(height: 24),
                            Text(
                              _questions.length == 1
                                  ? 'QUICK PRACTICE'
                                  : 'QUESTION ${_question + 1} OF ${_questions.length}',
                              style: TextStyle(
                                color: context.brand.terracotta,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2,
                              ),
                            ),
                            const SizedBox(height: 7),
                            Text(
                              _current.prompt,
                              style: Theme.of(context).textTheme.headlineMedium
                                  ?.copyWith(height: 1.08),
                            ),
                            if (_current.support.isNotEmpty) ...[
                              const SizedBox(height: 9),
                              Text(
                                _current.support,
                                style: TextStyle(
                                  color: context.brand.mutedInk,
                                  fontSize: 15,
                                ),
                              ),
                            ],
                            const SizedBox(height: 22),
                            for (
                              var index = 0;
                              index < _current.answers.length;
                              index++
                            ) ...[
                              _AnswerTile(
                                // Keyed by question as well as position, so
                                // moving to the next card rebuilds the tiles
                                // rather than animating the previous answer's
                                // colours into the new one.
                                key: ValueKey('q${_question}_a$index'),
                                index: index,
                                answer: _current.answers[index],
                                selected: _selected == index,
                                checked: _checked,
                                correct: index == _current.correctAnswer,
                                onTap: _checked
                                    ? null
                                    : () => setState(() => _selected = index),
                              ),
                              const SizedBox(height: 10),
                            ],
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 220),
                              child: !_checked
                                  ? const SizedBox(height: 2)
                                  : _LessonFeedback(
                                      correct: _correct,
                                      explanation: _current.explanation,
                                    ),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              'Learning preview · phrases await community language validation.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: context.brand.mutedInk,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: FilledButton.icon(
          key: const Key('lesson-primary-action'),
          style: FilledButton.styleFrom(
            backgroundColor: _checked && _correct
                ? context.brand.success
                : context.brand.accent,
          ),
          onPressed: _selected == null ? null : _advance,
          icon: Icon(
            _checked && _isLast
                ? Icons.stars_rounded
                : Icons.arrow_forward_rounded,
          ),
          label: Text(_actionLabel),
        ),
      ),
    ),
  );

  /// What the one button at the bottom does next.
  ///
  /// The score is shown on the final button rather than in a results screen:
  /// a lesson that ends by dismissing a modal is a lesson that ends twice.
  String get _actionLabel {
    if (!_checked) return 'Check answer';
    if (!_isLast) return 'Next question';
    if (_questions.length == 1) return 'Collect ${widget.lesson.xp} XP';
    return '$_correctCount/${_questions.length} · Collect ${widget.lesson.xp} XP';
  }

  void _advance() {
    if (!_checked) {
      HapticFeedback.selectionClick();
      setState(() {
        _checked = true;
        if (!_scored && _correct) {
          _correctCount++;
          _scored = true;
        }
      });
      return;
    }
    if (_isLast) {
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
      return;
    }
    setState(() {
      _question++;
      _selected = null;
      _checked = false;
      _scored = false;
    });
  }
}

class _LessonAtmosphere extends StatelessWidget {
  const _LessonAtmosphere();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: DecoratedBox(
      decoration: BoxDecoration(
        // A literal cream reads as a grey smear on the dark palette; the wash
        // is lifted off the ground it sits on instead.
        gradient: BrandGradients.pageWash(context.brand),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -70,
            top: 90,
            child: Container(
              width: 190,
              height: 190,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: context.brand.gold.withValues(alpha: 0.08),
              ),
            ),
          ),
          Positioned(
            left: -24,
            bottom: 130,
            child: Opacity(
              opacity: 0.045,
              child: Text(
                '✣',
                style: TextStyle(
                  color: context.brand.accent,
                  fontSize: 130,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _LessonTopBar extends StatelessWidget {
  const _LessonTopBar({
    required this.current,
    required this.total,
    required this.question,
    required this.questionCount,
    required this.onClose,
  });

  final int current;
  final int total;

  /// Which question of this lesson is on screen, and how many there are.
  final int question;
  final int questionCount;

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
    child: Row(
      children: [
        IconButton.filledTonal(
          tooltip: 'Close lesson',
          onPressed: onClose,
          icon: const Icon(Icons.close_rounded),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'LESSON $current OF $total',
                style: TextStyle(
                  color: context.brand.mutedInk,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  // Fills across the questions inside this lesson, so the bar
                  // moves while somebody is working rather than only when they
                  // leave. It used to measure the lesson's place in the unit,
                  // which the line above it already says.
                  value: questionCount == 0 ? 0 : question / questionCount,
                  minHeight: 7,
                  color: context.brand.gold,
                  backgroundColor: context.brand.accentFill.withValues(
                    alpha: 0.1,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 13),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: context.brand.surface,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: context.brand.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.help_outline_rounded,
                color: context.brand.accent,
                size: 17,
              ),
              const SizedBox(width: 4),
              Text(
                '$question/$questionCount',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _LessonHero extends StatelessWidget {
  const _LessonHero({required this.lesson});

  final Lesson lesson;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(25),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [BrandColors.heritageGreen, BrandColors.savannahGreen],
      ),
      boxShadow: const [
        BoxShadow(
          color: Color(0x2B0B3D2E),
          blurRadius: 24,
          offset: Offset(0, 12),
        ),
      ],
    ),
    child: Row(
      children: [
        Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white24),
          ),
          child: Icon(lesson.icon, color: context.brand.gold, size: 29),
        ),
        const SizedBox(width: 15),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'TODAY\'S STEP',
                style: TextStyle(
                  color: context.brand.gold,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                lesson.title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                '${lesson.minutes} min · ${lesson.xp} XP',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.72),
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _LessonFeedback extends StatelessWidget {
  const _LessonFeedback({required this.correct, required this.explanation});

  final bool correct;
  final String explanation;

  @override
  Widget build(BuildContext context) {
    final color = correct ? context.brand.success : context.brand.terracotta;
    return Container(
      key: ValueKey(correct),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            correct ? Icons.auto_awesome_rounded : Icons.refresh_rounded,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              correct ? 'Beautiful! $explanation' : 'Almost. $explanation',
              style: TextStyle(color: color, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnswerTile extends StatelessWidget {
  const _AnswerTile({
    required this.index,
    super.key,
    required this.answer,
    required this.selected,
    required this.checked,
    required this.correct,
    required this.onTap,
  });

  final int index;
  final String answer;
  final bool selected;
  final bool checked;
  final bool correct;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final revealCorrect = checked && correct;
    final revealWrong = checked && selected && !correct;
    final borderColor = revealCorrect
        ? context.brand.success
        : revealWrong
        ? context.brand.terracotta
        : selected
        ? context.brand.gold
        : context.brand.divider;
    return Material(
      color: revealCorrect
          ? context.brand.success.withValues(alpha: 0.08)
          : revealWrong
          ? context.brand.terracotta.withValues(alpha: 0.08)
          : context.brand.surface,
      borderRadius: BorderRadius.circular(17),
      child: InkWell(
        borderRadius: BorderRadius.circular(17),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(17),
            border: Border.all(
              color: borderColor,
              width: selected || revealCorrect ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: borderColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Center(
                  child: Text(
                    '${index + 1}',
                    style: TextStyle(
                      color: borderColor,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  answer,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (revealCorrect)
                Icon(Icons.check_circle_rounded, color: context.brand.success),
              if (revealWrong)
                Icon(Icons.cancel_rounded, color: context.brand.terracotta),
            ],
          ),
        ),
      ),
    );
  }
}
