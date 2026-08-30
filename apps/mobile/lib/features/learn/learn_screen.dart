import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/word_lookup.dart';
import 'package:indigen_world_mobile/features/heroes/hero_detail_screen.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_data.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// THE LEARNING PATH
///
/// A trail of round buttons winding down the page, a coloured bar that names
/// whichever unit you are standing in, and a strip of numbers at the top that
/// never leaves. The shape is not an accident and it is not ours: it is what a
/// decade of teaching people languages on a phone converged on, and every part
/// of it is doing a job.
///
///   * **The numbers stay put.** Streak, XP and today's quest are the reason
///     somebody opened the app on a Tuesday. Scrolling three units down used to
///     take all three off the screen, which is exactly when a learner most
///     needs to see what they are about to break.
///   * **The unit says where you are.** The banner sticks to the top of its own
///     stretch of the trail, so the name of what you are learning is on screen
///     the whole time you are learning it, and swaps at the moment you cross
///     into the next one.
///   * **The trail is one line.** Buttons sway around the middle rather than
///     alternating hard left and hard right with a label beside each, which
///     read as a list of rows. A path is something you walk; a list is
///     something you get through.
///   * **The buttons have a floor.** Each one sits on a solid lip of its own
///     colour and presses down onto it. It costs eight pixels and it is the
///     single thing that makes tapping one feel like pressing a button rather
///     than tinting a circle.
/// ─────────────────────────────────────────────────────────────────────────────

/// Height of the strip of numbers pinned to the top of the tab.
const double kLearnStatsBarHeight = 62;

/// Height of a unit's banner, which sticks under the numbers.
const double kLearnUnitBannerHeight = 74;

/// The face of a lesson button, and the lip it presses onto.
const double _nodeSize = 76;
const double _nodeLip = 8;

/// Vertical room one lesson gets on the trail.
const double _nodeRowHeight = 96;

/// How far each lesson sways from the middle, as a fraction of the half-width.
///
/// Eight steps, out and back, so a long unit reads as one continuous wander
/// rather than as a zigzag repeating every other row.
const List<double> _pathSway = [0, -0.34, -0.6, -0.34, 0, 0.34, 0.6, 0.34];

class LearnScreen extends ConsumerStatefulWidget {
  const LearnScreen({super.key});

  @override
  ConsumerState<LearnScreen> createState() => _LearnScreenState();
}

class _LearnScreenState extends ConsumerState<LearnScreen> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Tapping Learn while already on Learn walks back to the start of the path.
    ref.listen<TabReselect>(tabReselectProvider, (previous, next) {
      if (next.index != kLearnTabIndex || previous?.tick == next.tick) return;
      if (!_scroll.hasClients) return;
      unawaited(
        _scroll.animateTo(
          0,
          duration: const Duration(milliseconds: 420),
          curve: Curves.easeOutCubic,
        ),
      );
    });

    return Scaffold(
      backgroundColor: Colors.transparent,
      // Lifted clear of the shell's floating glass rail, which the body extends
      // behind.
      floatingActionButton: const Padding(
        padding: EdgeInsets.only(bottom: kFrostedNavBarReservedSpace - 26),
        child: KawuriFab(),
      ),
      body: ScreenContainer(child: _path()),
    );
  }

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
    final units = _groupUnits(lessons);
    final word = ref.watch(wordOfTheDayProvider);
    final hero = ref.watch(heroOfTheWeekProvider);

    return CustomScrollView(
      key: const PageStorageKey('learn-path-scroll'),
      controller: _scroll,
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: _StatsBarDelegate(
            xp: progress.xp,
            streakDays: progress.streakDays,
            streakClaimed: progress.sparkClaimedToday,
            streakAtRisk: progress.streakAtRisk,
            questDone: completed.clamp(0, 3),
            onClaimStreak: _claimStreak,
            onOpenQuest: () => _openQuest(completed, nextLesson),
            onOpenMomentum: () =>
                _openMomentum(progress, completed, lessons.length),
            onOpenDictionary: _openDictionary,
          ),
        ),
        if (word != null)
          SliverToBoxAdapter(child: _WordOfTheDayCard(entry: word)),
        if (hero != null)
          SliverToBoxAdapter(child: _HeroOfTheWeekCard(hero: hero)),
        for (final unit in units)
          // A group is what lets each unit's banner stick for exactly as long
          // as its own lessons are on screen, and then be pushed off by the
          // next one rather than piling up.
          SliverMainAxisGroup(
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _UnitBannerDelegate(
                  unit: unit,
                  done: unit.lessons
                      .where((lesson) => progress.hasCompleted(lesson.id))
                      .length,
                  // A banner is a surface, so it takes the accent's *fill*
                  // rather than its foreground: on charcoal the foreground
                  // green is a lit mint meant for small marks, and a whole bar
                  // of it is the loudest thing in the app.
                  colour: unit.order.isOdd
                      ? context.brand.accentFill
                      : BrandColors.terracotta,
                  // Gold sits well on the deep green and disappears on the
                  // terracotta, which is warm enough to be gold already.
                  eyebrow: unit.order.isOdd
                      ? context.brand.gold
                      : Colors.white70,
                ),
              ),
              SliverToBoxAdapter(
                child: _UnitTrail(
                  unit: unit,
                  progress: progress,
                  nextLesson: nextLesson,
                  lessonCount: lessons.length,
                  onOpen: _openLesson,
                ),
              ),
            ],
          ),
        const SliverPadding(
          padding: EdgeInsets.fromLTRB(20, 26, 20, 130),
          sliver: SliverToBoxAdapter(child: _LockedUnitPreview()),
        ),
      ],
    );
  }

  /// The units on the published path, in order, each carrying its own lessons.
  ///
  /// Read off the lessons rather than kept in a second collection, so
  /// publishing a lesson into a new unit is one document rather than two that
  /// can disagree about what the unit is called.
  List<_LearnUnit> _groupUnits(List<Lesson> lessons) {
    final units = <_LearnUnit>[];
    for (var index = 0; index < lessons.length; index++) {
      final lesson = lessons[index];
      if (units.isEmpty || units.last.title != lesson.unitTitle) {
        units.add(
          _LearnUnit(
            title: lesson.unitTitle,
            subtitle: lesson.unitSubtitle,
            order: lesson.unitOrder,
            firstIndex: index,
            lessons: [lesson],
          ),
        );
        continue;
      }
      units.last.lessons.add(lesson);
    }
    return units;
  }

  /// Today's quest, in full, on a card that closes again.
  Future<void> _openQuest(int completed, int nextLesson) async {
    final l10n = AppLocalizations.of(context);
    final start = await showGlassPopup<bool>(
      context: context,
      title: l10n.learnQuestTitle,
      subtitle: l10n.learnQuestSubtitle,
      builder: (popupContext) => _QuestPopupBody(completed: completed),
    );
    if (start == true && mounted) await _openLesson(nextLesson);
  }

  /// How far along the whole path this member is.
  Future<void> _openMomentum(LearnProgress progress, int completed, int total) {
    final l10n = AppLocalizations.of(context);
    return showGlassPopup<void>(
      context: context,
      title: l10n.learnMomentumTitle,
      subtitle: total == 0
          ? l10n.learnMomentumUnpublished
          : l10n.learnMomentumProgress(completed, total),
      builder: (popupContext) => _MomentumPopupBody(
        completed: completed,
        total: total,
        xp: progress.xp,
        streakDays: progress.streakDays,
      ),
    );
  }

  int _nextLesson(LearnProgress progress, List<Lesson> lessons) {
    for (var index = 0; index < lessons.length; index++) {
      if (!progress.hasCompleted(lessons[index].id)) return index;
    }
    return lessons.isEmpty ? 0 : lessons.length - 1;
  }

  Future<void> _claimStreak() async {
    final l10n = AppLocalizations.of(context);
    final progress = ref.read(learnProgressProvider).value;
    if (progress != null && progress.sparkClaimedToday) {
      // Nothing left to take today, so the flame explains itself instead of
      // doing nothing at all.
      final lessons = ref.read(lessonPathProvider).value ?? bundledLessons;
      final completed = lessons
          .where((lesson) => progress.hasCompleted(lesson.id))
          .length;
      await _openMomentum(progress, completed, lessons.length);
      return;
    }
    HapticFeedback.mediumImpact();
    // The controller owns the calendar, so it has the final say on whether
    // there was a spark left to claim today.
    final claimed = await ref
        .read(learnProgressProvider.notifier)
        .claimStreak();
    if (!claimed || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.learnSparkClaimed(LearnProgress.xpPerSpark)),
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
    final l10n = AppLocalizations.of(context);
    final progress =
        ref.read(learnProgressProvider).value ?? const LearnProgress();
    final lessons = ref.read(lessonPathProvider).value ?? bundledLessons;
    if (lessons.isEmpty) return;
    if (index > _nextLesson(progress, lessons)) {
      HapticFeedback.lightImpact();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l10n.learnLockedAbove)));
      return;
    }
    final lesson = lessons[index];
    final alreadyDone = progress.hasCompleted(lesson.id);
    final result = await Navigator.of(context).push<LessonResult>(
      MaterialPageRoute<LessonResult>(
        builder: (context) => _LessonScreen(
          lesson: lesson,
          lessonNumber: index + 1,
          lessonCount: lessons.length,
        ),
      ),
    );
    if (result == null || !mounted) return;

    HapticFeedback.heavyImpact();
    await ref
        .read(learnProgressProvider.notifier)
        .completeLesson(lesson.id, xp: lesson.xp);
    if (!mounted) return;

    // The lesson is over, the tally is in, and this is the moment somebody is
    // most pleased with themselves. A snackbar sliding out of the bottom of a
    // scrolling path was the least this could have been.
    final after = ref.read(learnProgressProvider).value ?? progress;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (context) => LessonCompleteScreen(
          lesson: lesson,
          result: result,
          // Repeating a lesson is worth doing and worth nothing: the XP was
          // paid the first time, and saying otherwise would be a lie the
          // total on the next screen would immediately contradict.
          xpEarned: alreadyDone ? 0 : lesson.xp,
          totalXp: after.xp,
          streakDays: after.streakDays,
        ),
      ),
    );
    if (!mounted) return;
    // The ask is rationed inside; most of the time this does nothing at all.
    await maybeRequestReview(online: ref.read(connectionBlockProvider) == null);
  }
}

/// One unit of the published path, with the lessons that belong to it.
class _LearnUnit {
  _LearnUnit({
    required this.title,
    required this.subtitle,
    required this.order,
    required this.firstIndex,
    required this.lessons,
  });

  final String title;
  final String subtitle;
  final int order;

  /// Where this unit's first lesson sits on the whole path, so a node can name
  /// its own number without the trail having to count.
  final int firstIndex;

  final List<Lesson> lessons;
}

// ── The strip of numbers ────────────────────────────────────────────────────

class _StatsBarDelegate extends SliverPersistentHeaderDelegate {
  const _StatsBarDelegate({
    required this.xp,
    required this.streakDays,
    required this.streakClaimed,
    required this.streakAtRisk,
    required this.questDone,
    required this.onClaimStreak,
    required this.onOpenQuest,
    required this.onOpenMomentum,
    required this.onOpenDictionary,
  });

  final int xp;
  final int streakDays;
  final bool streakClaimed;
  final bool streakAtRisk;
  final int questDone;
  final VoidCallback onClaimStreak;
  final VoidCallback onOpenQuest;
  final VoidCallback onOpenMomentum;
  final VoidCallback onOpenDictionary;

  @override
  double get minExtent => kLearnStatsBarHeight;

  @override
  double get maxExtent => kLearnStatsBarHeight;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) =>
      // A pinned header is measured by what its child actually is, not by what
      // the delegate says it may be: a row of chips is as tall as a chip, and
      // the viewport then refuses a layout extent bigger than what was painted.
      SizedBox(
        height: kLearnStatsBarHeight,
        child: _LearnStatsBar(
          xp: xp,
          streakDays: streakDays,
          streakClaimed: streakClaimed,
          streakAtRisk: streakAtRisk,
          questDone: questDone,
          onClaimStreak: onClaimStreak,
          onOpenQuest: onOpenQuest,
          onOpenMomentum: onOpenMomentum,
          onOpenDictionary: onOpenDictionary,
        ),
      );

  @override
  bool shouldRebuild(_StatsBarDelegate old) =>
      old.xp != xp ||
      old.streakDays != streakDays ||
      old.streakClaimed != streakClaimed ||
      old.streakAtRisk != streakAtRisk ||
      old.questDone != questDone;
}

/// Streak, XP, today's quest and the dictionary, on one line that never leaves.
///
/// This replaced a header of stacked pills and paired buttons that was most of
/// a screen tall — a *lid* on a tab whose whole point is the trail underneath
/// it. Everything it carried is still here; it is one row now, and it stays.
class _LearnStatsBar extends StatelessWidget {
  const _LearnStatsBar({
    required this.xp,
    required this.streakDays,
    required this.streakClaimed,
    required this.streakAtRisk,
    required this.questDone,
    required this.onClaimStreak,
    required this.onOpenQuest,
    required this.onOpenMomentum,
    required this.onOpenDictionary,
  });

  final int xp;
  final int streakDays;
  final bool streakClaimed;
  final bool streakAtRisk;
  final int questDone;
  final VoidCallback onClaimStreak;
  final VoidCallback onOpenQuest;
  final VoidCallback onOpenMomentum;
  final VoidCallback onOpenDictionary;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: brand.background.withValues(alpha: 0.88),
            border: Border(bottom: BorderSide(color: brand.divider)),
          ),
          child: Padding(
            // The right inset clears the shell's floating profile orb.
            padding: const EdgeInsets.fromLTRB(14, 0, 52, 0),
            child: Row(
              children: [
                _StatChip(
                  icon: streakDays > 0
                      ? Icons.local_fire_department_rounded
                      : Icons.local_fire_department_outlined,
                  label: '$streakDays',
                  // A streak that is alive but unclaimed is the one number on
                  // this bar somebody has to act on today.
                  tint: streakAtRisk
                      ? const Color(0xFFE0763C)
                      : streakDays > 0
                      ? const Color(0xFFE0763C)
                      : brand.faintInk,
                  pulsing: streakAtRisk,
                  semantics: streakClaimed
                      ? l10n.learnStreakClaimed(streakDays)
                      : l10n.learnDailySpark(streakDays),
                  onTap: onClaimStreak,
                ),
                _StatChip(
                  icon: Icons.bolt_rounded,
                  label: '$xp',
                  tint: brand.gold,
                  semantics: l10n.learnXpSemantics(xp),
                  onTap: onOpenMomentum,
                ),
                _StatChip(
                  icon: Icons.emoji_events_rounded,
                  label: '$questDone/3',
                  tint: brand.accent,
                  semantics: l10n.learnQuestSemantics(questDone),
                  onTap: onOpenQuest,
                ),
                const Spacer(),
                IconButton(
                  tooltip: l10n.learnDictionary,
                  onPressed: onOpenDictionary,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints.tightFor(
                    width: 42,
                    height: 42,
                  ),
                  icon: Icon(Icons.menu_book_rounded, color: brand.accent),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.label,
    required this.tint,
    required this.semantics,
    required this.onTap,
    this.pulsing = false,
  });

  final IconData icon;
  final String label;
  final Color tint;
  final String semantics;
  final VoidCallback onTap;

  /// Set on a streak that is alive and unclaimed. Nothing else on this bar ever
  /// moves — which is the only reason the one thing that does gets noticed.
  final bool pulsing;

  @override
  Widget build(BuildContext context) {
    final glyph = Icon(icon, color: tint, size: 20);
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: InkResponse(
        radius: 26,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (pulsing) _Breathing(child: glyph) else glyph,
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                  color: context.brand.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A slow swell, for the one glyph on a screen that is asking for something.
class _Breathing extends StatefulWidget {
  const _Breathing({required this.child});

  final Widget child;

  @override
  State<_Breathing> createState() => _BreathingState();
}

class _BreathingState extends State<_Breathing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // A member who has asked the system to hold animation still gets a still
    // glyph; the colour is already carrying the message.
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScaleTransition(
    scale: Tween<double>(
      begin: 0.9,
      end: 1.14,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut)),
    child: widget.child,
  );
}

// ── The unit banner ─────────────────────────────────────────────────────────

class _UnitBannerDelegate extends SliverPersistentHeaderDelegate {
  const _UnitBannerDelegate({
    required this.unit,
    required this.done,
    required this.colour,
    required this.eyebrow,
  });

  final _LearnUnit unit;
  final int done;
  final Color colour;
  final Color eyebrow;

  @override
  double get minExtent => kLearnUnitBannerHeight;

  @override
  double get maxExtent => kLearnUnitBannerHeight;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => _UnitBanner(
    unit: unit,
    done: done,
    colour: colour,
    eyebrow: eyebrow,
    // Only lifts once the trail is actually running underneath it, so a banner
    // sitting in the flow is flat and one that is holding its place is not.
    raised: overlapsContent,
  );

  @override
  bool shouldRebuild(_UnitBannerDelegate old) =>
      old.unit != unit ||
      old.done != done ||
      old.colour != colour ||
      old.eyebrow != eyebrow;
}

/// The coloured bar that names the stretch of trail underneath it.
///
/// Full width rather than an inset card: it has to hide the path passing behind
/// it while it is stuck to the top, and a card with margins leaves two channels
/// down the sides for lesson buttons to slide through.
class _UnitBanner extends StatelessWidget {
  const _UnitBanner({
    required this.unit,
    required this.done,
    required this.colour,
    required this.eyebrow,
    required this.raised,
  });

  final _LearnUnit unit;
  final int done;
  final Color colour;
  final Color eyebrow;
  final bool raised;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      height: kLearnUnitBannerHeight,
      padding: const EdgeInsets.fromLTRB(20, 0, 16, 0),
      decoration: BoxDecoration(
        color: colour,
        boxShadow: raised
            ? [
                BoxShadow(
                  color: context.brand.shadow.withValues(alpha: 0.28),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
              ]
            : const [],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.learnUnitNumber(unit.order),
                  style: TextStyle(
                    color: eyebrow,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  unit.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.3,
                  ),
                ),
                if (unit.subtitle.isNotEmpty)
                  Text(
                    unit.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white70, fontSize: 11),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '$done/${unit.lessons.length}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Word of the day ─────────────────────────────────────────────────────────

/// One published entry, the same for everybody, for the whole of one day.
///
/// The dictionary is the biggest thing this project is building and it lived
/// two taps away behind a collection screen. A learner opening the app to do a
/// lesson now meets one word of their own language on the way in — which is
/// four seconds of learning from somebody who had budgeted none.
class _WordOfTheDayCard extends StatelessWidget {
  const _WordOfTheDayCard({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Material(
        color: brand.surface,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => showWordLookup(context, entry),
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 13, 12, 13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: brand.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.learnWordOfTheDay,
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        entry.headword,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.4,
                        ),
                      ),
                      Text(
                        entry.translation,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: brand.mutedInk, fontSize: 13.5),
                      ),
                    ],
                  ),
                ),
                PronunciationButton(audioUrl: entry.audioUrl),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One life, the same for everybody, for the whole of a week.
///
/// The archive spent its first year collecting words and none of it said who
/// spoke them. A learner opening the app to do a lesson now meets one of the
/// people the language belongs to on the way in — by the week rather than the
/// day, because a life is worth more than a glance.
class _HeroOfTheWeekCard extends StatelessWidget {
  const _HeroOfTheWeekCard({required this.hero});

  final KasemHero hero;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 4),
      child: Material(
        color: brand.surface,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) => HeroDetailScreen(hero: hero),
            ),
          ),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: brand.border),
            ),
            child: Row(
              children: [
                HeroPortrait(hero: hero, size: 52),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.learnHeroOfTheWeek,
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        hero.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.3,
                        ),
                      ),
                      if (hero.subtitle.isNotEmpty)
                        Text(
                          hero.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: brand.mutedInk, fontSize: 13),
                        ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: brand.mutedInk),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── The trail ───────────────────────────────────────────────────────────────

/// One unit's stretch of path: its lessons, and the chest at the end of them.
class _UnitTrail extends StatelessWidget {
  const _UnitTrail({
    required this.unit,
    required this.progress,
    required this.nextLesson,
    required this.lessonCount,
    required this.onOpen,
  });

  final _LearnUnit unit;
  final LearnProgress progress;

  /// Index on the whole path of the lesson the member is up to.
  final int nextLesson;

  final int lessonCount;
  final Future<void> Function(int index) onOpen;

  @override
  Widget build(BuildContext context) {
    final finished = unit.lessons.every(
      (lesson) => progress.hasCompleted(lesson.id),
    );
    return Padding(
      // The bubble over the current lesson hangs a good way above the button it
      // belongs to, and the unit banner is pinned right there — so the trail
      // starts far enough down that the two never meet.
      padding: const EdgeInsets.only(top: 46, bottom: 6),
      child: Column(
        children: [
          for (var offset = 0; offset < unit.lessons.length; offset++)
            _LessonPathNode(
              lesson: unit.lessons[offset],
              index: unit.firstIndex + offset,
              lessonCount: lessonCount,
              sway: _pathSway[(unit.firstIndex + offset) % _pathSway.length],
              completed: progress.hasCompleted(unit.lessons[offset].id),
              unlocked: unit.firstIndex + offset <= nextLesson,
              current: unit.firstIndex + offset == nextLesson,
              onOpen: onOpen,
            ),
          _UnitChest(unlocked: finished, unit: unit.title),
        ],
      ),
    );
  }
}

/// One stop on the trail.
class _LessonPathNode extends StatelessWidget {
  const _LessonPathNode({
    required this.lesson,
    required this.index,
    required this.lessonCount,
    required this.sway,
    required this.completed,
    required this.unlocked,
    required this.current,
    required this.onOpen,
  });

  final Lesson lesson;
  final int index;
  final int lessonCount;
  final double sway;
  final bool completed;
  final bool unlocked;
  final bool current;
  final Future<void> Function(int index) onOpen;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: _nodeRowHeight,
    child: Align(
      alignment: Alignment(sway, 0),
      child: Stack(
        // The bubble over the current lesson hangs above its own row. Nothing
        // clips it, and the row below is painted after this one, so it can
        // never be covered.
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          _PathButton(
            icon: completed
                ? Icons.check_rounded
                : unlocked
                ? lesson.icon
                : Icons.lock_rounded,
            semantics: _semantics(AppLocalizations.of(context)),
            completed: completed,
            unlocked: unlocked,
            current: current,
            onTap: (anchor) => _open(context, anchor),
          ),
          if (current)
            const Positioned(bottom: _nodeSize + 8, child: _StartBubble()),
        ],
      ),
    ),
  );

  String _semantics(AppLocalizations l10n) {
    final state = completed
        ? l10n.learnStateCompleted
        : unlocked
        ? l10n.learnStateReady
        : l10n.learnStateLocked;
    return l10n.learnNodeSemantics(index + 1, lessonCount, lesson.title, state);
  }

  Future<void> _open(BuildContext context, Rect anchor) async {
    final start = await showLessonBubble(
      context,
      anchor: anchor,
      lesson: lesson,
      number: index + 1,
      total: lessonCount,
      completed: completed,
      unlocked: unlocked,
    );
    if (start == true && context.mounted) await onOpen(index);
  }
}

/// The button itself: a coloured face resting on a lip of its own colour, which
/// it presses down onto.
class _PathButton extends StatefulWidget {
  const _PathButton({
    required this.icon,
    required this.semantics,
    required this.completed,
    required this.unlocked,
    required this.current,
    required this.onTap,
  });

  final IconData icon;
  final String semantics;
  final bool completed;
  final bool unlocked;
  final bool current;

  /// Handed the button's place on the screen, so whatever opens can point at
  /// the thing that was pressed.
  final void Function(Rect anchor) onTap;

  @override
  State<_PathButton> createState() => _PathButtonState();
}

class _PathButtonState extends State<_PathButton> {
  var _pressed = false;

  Color _face(BrandPalette brand) => widget.completed
      ? brand.gold
      : widget.unlocked
      ? brand.accentFill
      : brand.pick(const Color(0xFFD6D3CA), const Color(0xFF2A312E));

  void _fire() {
    HapticFeedback.selectionClick();
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.hasSize) {
      widget.onTap(Rect.zero);
      return;
    }
    final origin = box.localToGlobal(Offset.zero);
    widget.onTap(origin & box.size);
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final face = _face(brand);
    // The lip is the same colour standing in its own shadow, which is what
    // makes it read as the underside of one object rather than as a second
    // circle behind the first.
    final lip = Color.alphaBlend(Colors.black.withValues(alpha: 0.28), face);
    final glyph = widget.completed
        ? brand.pick(brand.accent, const Color(0xFF10231B))
        : widget.unlocked
        ? brand.onAccentFill
        : brand.faintInk;

    return Semantics(
      button: true,
      enabled: widget.unlocked,
      label: widget.semantics,
      excludeSemantics: true,
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: (_) {
          setState(() => _pressed = false);
          _fire();
        },
        child: SizedBox(
          width: _nodeSize,
          height: _nodeSize + _nodeLip,
          child: Stack(
            children: [
              Positioned(
                left: 0,
                right: 0,
                top: _nodeLip,
                height: _nodeSize,
                child: DecoratedBox(
                  decoration: BoxDecoration(color: lip, shape: BoxShape.circle),
                ),
              ),
              AnimatedPositioned(
                duration: const Duration(milliseconds: 90),
                curve: Curves.easeOut,
                left: 0,
                right: 0,
                top: _pressed ? _nodeLip - 2 : 0,
                height: _nodeSize,
                child: _PathButtonFace(
                  face: face,
                  glyph: glyph,
                  icon: widget.icon,
                  current: widget.current,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PathButtonFace extends StatelessWidget {
  const _PathButtonFace({
    required this.face,
    required this.glyph,
    required this.icon,
    required this.current,
  });

  final Color face;
  final Color glyph;
  final IconData icon;
  final bool current;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: face,
      shape: BoxShape.circle,
      border: Border.all(color: context.brand.background, width: 4),
      boxShadow: current
          ? [
              BoxShadow(
                color: face.withValues(alpha: 0.42),
                blurRadius: 18,
                spreadRadius: 1,
              ),
            ]
          : const [],
    ),
    child: Icon(icon, color: glyph, size: 32),
  );
}

/// The nudge over the lesson somebody is up to.
class _StartBubble extends StatefulWidget {
  const _StartBubble();

  @override
  State<_StartBubble> createState() => _StartBubbleState();
}

class _StartBubbleState extends State<_StartBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _bob = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _bob.stop();
    } else if (!_bob.isAnimating) {
      _bob.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _bob.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ExcludeSemantics(
      child: SlideTransition(
        position: Tween(
          begin: Offset.zero,
          end: const Offset(0, -0.14),
        ).animate(CurvedAnimation(parent: _bob, curve: Curves.easeInOut)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
              decoration: BoxDecoration(
                color: brand.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: brand.accent, width: 2),
              ),
              child: Text(
                AppLocalizations.of(context).learnStart,
                style: TextStyle(
                  color: brand.accent,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
            ),
            // The little tail that turns a pill into something pointing at the
            // button underneath it.
            CustomPaint(
              size: const Size(14, 7),
              painter: _BubbleTail(fill: brand.surface, edge: brand.accent),
            ),
          ],
        ),
      ),
    );
  }
}

class _BubbleTail extends CustomPainter {
  const _BubbleTail({required this.fill, required this.edge});

  final Color fill;
  final Color edge;

  @override
  void paint(Canvas canvas, Size size) {
    final tail = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas
      ..drawPath(tail, Paint()..color = fill)
      ..drawPath(
        tail,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = edge,
      );
  }

  @override
  bool shouldRepaint(_BubbleTail old) => old.fill != fill || old.edge != edge;
}

/// What is waiting at the end of a unit.
class _UnitChest extends StatelessWidget {
  const _UnitChest({required this.unlocked, required this.unit});

  final bool unlocked;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final face = unlocked
        ? brand.gold
        : brand.pick(const Color(0xFFD6D3CA), const Color(0xFF2A312E));
    return Semantics(
      label: unlocked
          ? l10n.learnUnitCompleteSemantics(unit)
          : l10n.learnUnitTrophySemantics(unit),
      child: Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 4),
        child: Column(
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                color: face,
                shape: BoxShape.circle,
                border: Border.all(color: brand.background, width: 4),
              ),
              child: Icon(
                unlocked
                    ? Icons.emoji_events_rounded
                    : Icons.emoji_events_outlined,
                color: unlocked
                    ? brand.pick(brand.accent, const Color(0xFF10231B))
                    : brand.faintInk,
                size: 26,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              unlocked ? l10n.learnUnitComplete : l10n.learnUnitTrophy,
              style: TextStyle(
                color: unlocked ? brand.gold : brand.faintInk,
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── The lesson bubble ───────────────────────────────────────────────────────

/// Opens the card that names the lesson somebody just pressed, pointing at the
/// button they pressed.
///
/// Anchored rather than centred on purpose. A card in the middle of the screen
/// has no relationship to the circle that opened it; one that grows out of the
/// button is unmistakably *that lesson*, which matters on a trail where every
/// button looks the same.
Future<bool?> showLessonBubble(
  BuildContext context, {
  required Rect anchor,
  required Lesson lesson,
  required int number,
  required int total,
  required bool completed,
  required bool unlocked,
}) => showGeneralDialog<bool>(
  context: context,
  barrierDismissible: true,
  barrierLabel: 'Close',
  barrierColor: Colors.black.withValues(alpha: 0.18),
  transitionDuration: const Duration(milliseconds: 190),
  pageBuilder: (dialogContext, animation, secondary) => _LessonBubbleLayer(
    anchor: anchor,
    lesson: lesson,
    number: number,
    total: total,
    completed: completed,
    unlocked: unlocked,
  ),
  transitionBuilder: (context, animation, secondary, child) {
    final curve = CurvedAnimation(parent: animation, curve: Curves.easeOutBack);
    return FadeTransition(
      opacity: animation,
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.86, end: 1).animate(curve),
        // Grows out of the top of the button rather than out of its own
        // middle, which is where the finger was.
        alignment: Alignment.topCenter,
        child: child,
      ),
    );
  },
);

class _LessonBubbleLayer extends StatelessWidget {
  const _LessonBubbleLayer({
    required this.anchor,
    required this.lesson,
    required this.number,
    required this.total,
    required this.completed,
    required this.unlocked,
  });

  final Rect anchor;
  final Lesson lesson;
  final int number;
  final int total;
  final bool completed;
  final bool unlocked;

  static const _width = 268.0;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final width = _width > size.width - 32 ? size.width - 32 : _width;
    // Held inside the screen, and pointing at the button wherever that put it.
    final left = (anchor.center.dx - (width / 2)).clamp(
      16.0,
      size.width - width - 16,
    );
    final below = anchor.bottom + 8;
    final fitsBelow = below + 190 < size.height;

    return Stack(
      children: [
        Positioned(
          left: left,
          top: fitsBelow ? below : null,
          bottom: fitsBelow ? null : size.height - anchor.top + 8,
          width: width,
          child: _LessonBubble(
            lesson: lesson,
            number: number,
            total: total,
            completed: completed,
            unlocked: unlocked,
          ),
        ),
      ],
    );
  }
}

class _LessonBubble extends StatelessWidget {
  const _LessonBubble({
    required this.lesson,
    required this.number,
    required this.total,
    required this.completed,
    required this.unlocked,
  });

  final Lesson lesson;
  final int number;
  final int total;
  final bool completed;
  final bool unlocked;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final tint = completed
        ? brand.gold
        : unlocked
        ? brand.accentFill
        : brand.mutedInk;

    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          color: brand.surfaceElevated,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: tint.withValues(alpha: 0.55), width: 2),
          boxShadow: [
            BoxShadow(
              color: brand.shadow.withValues(alpha: brand.isDark ? 0.5 : 0.16),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              completed
                  ? l10n.learnBubbleCompleted(number, total)
                  : unlocked
                  ? l10n.learnBubbleLesson(number, total)
                  : l10n.learnBubbleLocked,
              style: TextStyle(
                color: tint,
                fontSize: 9.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
            const SizedBox(height: 5),
            Text(lesson.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 3),
            Text(
              unlocked
                  ? l10n.learnBubbleMinutes(lesson.minutes, lesson.xp)
                  : l10n.learnBubbleLockedBody,
              style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: unlocked
                    ? () => Navigator.of(context).pop(true)
                    : null,
                style: FilledButton.styleFrom(
                  backgroundColor: tint,
                  foregroundColor: completed
                      ? brand.pick(brand.accent, const Color(0xFF10231B))
                      : brand.onAccentFill,
                  minimumSize: const Size(0, 46),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: Text(
                  completed
                      ? l10n.learnBubblePractise
                      : unlocked
                      ? l10n.learnBubbleStart(lesson.xp)
                      : l10n.learnBubbleLocked,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Finishing ───────────────────────────────────────────────────────────────

/// How a lesson went.
///
/// The lesson screen used to answer "did they finish it" with a bare `true`,
/// which threw away the only thing worth knowing — how many they got right —
/// at the exact moment somebody wanted to be told.
@immutable
class LessonResult {
  const LessonResult({required this.correct, required this.total});

  final int correct;
  final int total;

  bool get isPerfect => total > 0 && correct == total;

  int get percent => total == 0 ? 0 : ((correct / total) * 100).round();
}

/// The screen at the end of a lesson.
///
/// This was a snackbar. A snackbar is what an app says when it has saved a
/// draft — not what it says to somebody who has just learned to greet an elder
/// in their grandmother's language. The tally counts up rather than appearing,
/// because a number that climbs is a number somebody watches.
class LessonCompleteScreen extends StatefulWidget {
  const LessonCompleteScreen({
    required this.lesson,
    required this.result,
    required this.xpEarned,
    required this.totalXp,
    required this.streakDays,
    super.key,
  });

  final Lesson lesson;
  final LessonResult result;

  /// What this sitting paid. Zero for a lesson being walked again, which was
  /// paid for the first time.
  final int xpEarned;

  final int totalXp;
  final int streakDays;

  @override
  State<LessonCompleteScreen> createState() => _LessonCompleteScreenState();
}

class _LessonCompleteScreenState extends State<LessonCompleteScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    _entrance.forward();
  }

  @override
  void dispose() {
    _entrance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final result = widget.result;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: brandOverlayStyle(brand),
      child: Scaffold(
        backgroundColor: brand.background,
        body: Stack(
          children: [
            const Positioned.fill(child: _LessonAtmosphere()),
            SafeArea(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
                    child: Column(
                      children: [
                        const Spacer(),
                        _Medal(animation: _entrance, perfect: result.isPerfect),
                        const SizedBox(height: 26),
                        Text(
                          result.isPerfect
                              ? l10n.learnPerfectLesson
                              : l10n.learnLessonComplete,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.displaySmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          widget.lesson.title,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 28),
                        Row(
                          children: [
                            Expanded(
                              child: _ScoreCard(
                                label: widget.xpEarned > 0
                                    ? l10n.learnXpEarned
                                    : l10n.learnTotalXp,
                                tint: brand.gold,
                                animation: _entrance,
                                target: widget.xpEarned > 0
                                    ? widget.xpEarned
                                    : widget.totalXp,
                                suffix: '',
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _ScoreCard(
                                label: l10n.learnAnswersRight,
                                tint: result.isPerfect
                                    ? brand.success
                                    : brand.accent,
                                animation: _entrance,
                                target: result.percent,
                                suffix: '%',
                              ),
                            ),
                          ],
                        ),
                        if (widget.streakDays > 0) ...[
                          const SizedBox(height: 12),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 13,
                            ),
                            decoration: BoxDecoration(
                              color: brand.surfaceMuted,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(color: brand.border),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.local_fire_department_rounded,
                                  color: Color(0xFFE0763C),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    widget.streakDays == 1
                                        ? l10n.learnStreakDayOne
                                        : l10n.learnStreakDays(
                                            widget.streakDays,
                                          ),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const Spacer(),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            key: const Key('lesson-complete-continue'),
                            onPressed: () => Navigator.of(context).pop(),
                            style: FilledButton.styleFrom(
                              minimumSize: const Size(0, 52),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              l10n.learnContinue,
                              style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The mark at the top of the screen, with a burst of gold behind it.
class _Medal extends StatelessWidget {
  const _Medal({required this.animation, required this.perfect});

  final Animation<double> animation;
  final bool perfect;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return SizedBox(
      width: 190,
      height: 190,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, child) => Stack(
          alignment: Alignment.center,
          children: [
            CustomPaint(
              size: const Size.square(190),
              painter: _SparkBurst(
                progress: Curves.easeOutCubic.transform(
                  animation.value.clamp(0.0, 1.0),
                ),
                colour: brand.gold,
              ),
            ),
            Transform.scale(
              scale: Curves.elasticOut.transform(
                (animation.value * 1.6).clamp(0.0, 1.0),
              ),
              child: child,
            ),
          ],
        ),
        child: Container(
          width: 118,
          height: 118,
          decoration: BoxDecoration(
            color: perfect ? brand.gold : brand.accentFill,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: (perfect ? brand.gold : brand.accentFill).withValues(
                  alpha: 0.35,
                ),
                blurRadius: 26,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Icon(
            perfect ? Icons.workspace_premium_rounded : Icons.check_rounded,
            size: 62,
            color: perfect
                ? brand.pick(brand.accent, const Color(0xFF10231B))
                : brand.onAccentFill,
          ),
        ),
      ),
    );
  }
}

/// Twelve short strokes thrown outwards and fading. Cheap, brief, and the only
/// thing on the screen that moves once the numbers have settled.
class _SparkBurst extends CustomPainter {
  const _SparkBurst({required this.progress, required this.colour});

  final double progress;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0 || progress >= 1) return;
    final centre = size.center(Offset.zero);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 4
      ..color = colour.withValues(alpha: (1 - progress) * 0.85);
    for (var index = 0; index < 12; index++) {
      final angle = (index / 12) * 2 * 3.1415926;
      final inner = 62 + (progress * 26);
      final outer = inner + 12 - (progress * 8);
      canvas.drawLine(
        centre + Offset.fromDirection(angle, inner),
        centre + Offset.fromDirection(angle, outer),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_SparkBurst old) =>
      old.progress != progress || old.colour != colour;
}

/// One number, counted up rather than printed.
class _ScoreCard extends StatelessWidget {
  const _ScoreCard({
    required this.label,
    required this.tint,
    required this.animation,
    required this.target,
    required this.suffix,
  });

  final String label;
  final Color tint;
  final Animation<double> animation;
  final int target;
  final String suffix;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 13),
      decoration: BoxDecoration(
        color: brand.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tint.withValues(alpha: 0.45), width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: tint,
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 5),
          AnimatedBuilder(
            animation: animation,
            builder: (context, _) {
              final shown = (target * Curves.easeOut.transform(animation.value))
                  .round();
              return Text(
                '$shown$suffix',
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.8,
                ),
              );
            },
          ),
        ],
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
      Navigator.pop(
        context,
        LessonResult(correct: _correctCount, total: _questions.length),
      );
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
