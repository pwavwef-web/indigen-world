import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

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
    // Progress arrives from disk a frame or two after the screen does. An
    // empty path beats a spinner here: the layout is identical either way, so
    // the numbers fill themselves in rather than the whole tab blinking.
    final progress =
        ref.watch(learnProgressProvider).value ?? const LearnProgress();
    final nextLesson = _nextLesson(progress);
    final completed = _lessons
        .where((lesson) => progress.hasCompleted(lesson.id))
        .length;

    return CustomScrollView(
      key: const PageStorageKey('learn-path-scroll'),
      slivers: [
        SliverToBoxAdapter(
          child: _LearnHeader(
            xp: progress.xp,
            completed: completed,
            streakClaimed: progress.sparkClaimedToday,
            onClaimStreak: _claimStreak,
            onOpenDictionary: _openDictionary,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 120),
          sliver: SliverList.list(
            children: [
              _DailyQuestCard(
                completed: completed,
                onTap: () => _openLesson(nextLesson),
              ),
              const SizedBox(height: 14),
              _LearningMomentumCard(
                completed: completed,
                total: _lessons.length,
              ),
              const SizedBox(height: 26),
              const _UnitBanner(
                unit: 'UNIT 1',
                title: 'Start a conversation',
                subtitle: 'Greetings, introductions and everyday courtesy',
                color: BrandColors.heritageGreen,
              ),
              const SizedBox(height: 18),
              for (var index = 0; index < _lessons.length; index++) ...[
                _LessonPathNode(
                  lesson: _lessons[index],
                  index: index,
                  completed: progress.hasCompleted(_lessons[index].id),
                  unlocked: index <= nextLesson,
                  current: index == nextLesson,
                  onTap: () => _openLesson(index),
                ),
                if (index != _lessons.length - 1)
                  _LessonRibbon(
                    // Lessons alternate sides, so the segment always leaves the
                    // side this lesson sits on and arrives at the other.
                    startOnRight: index.isOdd,
                    travelled: _travelled(progress, index),
                    frontier: index + 1 == nextLesson,
                  ),
              ],
              const SizedBox(height: 24),
              const _UnitBanner(
                unit: 'UNIT 2 · COMING NEXT',
                title: 'People and places',
                subtitle: 'Family, market, home and finding your way',
                color: BrandColors.terracotta,
              ),
              const SizedBox(height: 14),
              const _LockedUnitPreview(),
            ],
          ),
        ),
      ],
    );
  }

  int _nextLesson(LearnProgress progress) {
    for (var index = 0; index < _lessons.length; index++) {
      if (!progress.hasCompleted(_lessons[index].id)) return index;
    }
    return _lessons.length - 1;
  }

  /// How much of the ribbon below lesson [index] is gold.
  ///
  /// The segment that leads into the lesson the member is on stops part way,
  /// so the trail visibly ends where they have actually got to rather than
  /// running on ahead of them.
  double _travelled(LearnProgress progress, int index) {
    if (progress.hasCompleted(_lessons[index + 1].id)) return 1.0;
    if (progress.hasCompleted(_lessons[index].id)) return 0.56;
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
      const SnackBar(content: Text('Daily spark claimed · +5 XP')),
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
    if (index > _nextLesson(progress)) {
      HapticFeedback.lightImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Finish the lesson above to unlock this one.'),
        ),
      );
      return;
    }
    final completed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => _LessonScreen(
          lesson: _lessons[index],
          lessonNumber: index + 1,
          lessonCount: _lessons.length,
        ),
      ),
    );
    if (completed == true && mounted) {
      HapticFeedback.heavyImpact();
      await ref
          .read(learnProgressProvider.notifier)
          .completeLesson(_lessons[index].id);
    }
  }
}

class _LearnHeader extends StatelessWidget {
  const _LearnHeader({
    required this.xp,
    required this.completed,
    required this.streakClaimed,
    required this.onClaimStreak,
    required this.onOpenDictionary,
  });

  final int xp;
  final int completed;
  final bool streakClaimed;
  final VoidCallback onClaimStreak;
  final VoidCallback onOpenDictionary;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 52, 16, 16),
    padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
    decoration: BoxDecoration(
      color: BrandColors.heritageGreen,
      borderRadius: BorderRadius.circular(28),
      boxShadow: const [
        BoxShadow(
          color: Color(0x260B3D2E),
          blurRadius: 24,
          offset: Offset(0, 12),
        ),
      ],
    ),
    child: Stack(
      children: [
        const Positioned(
          right: -18,
          bottom: -32,
          child: Opacity(
            opacity: 0.09,
            child: Text(
              '✣',
              style: TextStyle(fontSize: 140, color: Colors.white),
            ),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'KASEM LEARNING PATH',
                    style: TextStyle(
                      color: BrandColors.kenteGold,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.25,
                    ),
                  ),
                ),
                _MetricPill(icon: Icons.bolt_rounded, label: '$xp XP'),
                const SizedBox(width: 7),
                const _MetricPill(
                  icon: Icons.favorite_rounded,
                  label: '5',
                  color: Color(0xFFFF8A80),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              completed == 0
                  ? 'Speak your first words.'
                  : 'You are building a rhythm.',
              style: Theme.of(context).textTheme.headlineMedium
                  ?.copyWith(color: Colors.white, height: 1.02),
            ),
            const SizedBox(height: 8),
            Text(
              'Short, joyful practice made for real moments—one step at a time.',
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: Colors.white.withValues(alpha: 0.76)),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: _HeaderAction(
                    icon: streakClaimed
                        ? Icons.local_fire_department_rounded
                        : Icons.wb_sunny_outlined,
                    label: streakClaimed
                        ? 'Spark claimed'
                        : 'Claim daily spark',
                    onTap: onClaimStreak,
                    active: streakClaimed,
                  ),
                ),
                const SizedBox(width: 10),
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
      ],
    ),
  );
}

class _MetricPill extends StatelessWidget {
  const _MetricPill({
    required this.icon,
    required this.label,
    this.color = BrandColors.kenteGold,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.white12),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 15),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    ),
  );
}

class _HeaderAction extends StatelessWidget {
  const _HeaderAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => Material(
    color: active
        ? BrandColors.kenteGold.withValues(alpha: 0.24)
        : Colors.white.withValues(alpha: 0.09),
    borderRadius: BorderRadius.circular(15),
    child: InkWell(
      borderRadius: BorderRadius.circular(15),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: BrandColors.kenteGold, size: 19),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _DailyQuestCard extends StatelessWidget {
  const _DailyQuestCard({required this.completed, required this.onTap});

  final int completed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final progress = (completed / 3).clamp(0.0, 1.0);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox.square(
                    dimension: 58,
                    child: CircularProgressIndicator(
                      value: progress,
                      strokeWidth: 7,
                      strokeCap: StrokeCap.round,
                      color: BrandColors.kenteGold,
                      backgroundColor: BrandColors.divider,
                    ),
                  ),
                  const Icon(
                    Icons.emoji_events_rounded,
                    color: BrandColors.terracotta,
                  ),
                ],
              ),
              const SizedBox(width: 15),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TODAY\'S QUEST',
                      style: TextStyle(
                        color: BrandColors.terracotta,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Complete 3 quick lessons',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${completed.clamp(0, 3)} of 3 · Tap to continue',
                      style: const TextStyle(
                        color: BrandColors.mutedInk,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.arrow_forward_rounded,
                color: BrandColors.heritageGreen,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LearningMomentumCard extends StatelessWidget {
  const _LearningMomentumCard({required this.completed, required this.total});

  final int completed;
  final int total;

  @override
  Widget build(BuildContext context) {
    final progress = total == 0 ? 0.0 : (completed / total).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 15),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Colors.white.withValues(alpha: 0.92),
            BrandColors.kenteGold.withValues(alpha: 0.08),
          ],
        ),
        borderRadius: BorderRadius.circular(19),
        border: Border.all(
          color: BrandColors.kenteGold.withValues(alpha: 0.28),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: BrandColors.heritageGreen.withValues(alpha: 0.09),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(
                  Icons.insights_rounded,
                  size: 19,
                  color: BrandColors.heritageGreen,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'YOUR MOMENTUM',
                      style: TextStyle(
                        color: BrandColors.terracotta,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.1,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      completed == 0
                          ? 'Your first milestone is ready'
                          : '$completed of $total lessons complete',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
              Text(
                '${(progress * 100).round()}%',
                style: const TextStyle(
                  color: BrandColors.heritageGreen,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 7,
              color: BrandColors.kenteGold,
              backgroundColor: BrandColors.heritageGreen.withValues(
                alpha: 0.08,
              ),
            ),
          ),
        ],
      ),
    );
  }
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
          child: const Icon(
            Icons.record_voice_over_rounded,
            color: BrandColors.kenteGold,
          ),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                unit,
                style: const TextStyle(
                  color: BrandColors.kenteGold,
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

  final _Lesson lesson;
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
                        ? BrandColors.terracotta
                        : BrandColors.mutedInk,
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
                  style: const TextStyle(
                    color: BrandColors.mutedInk,
                    fontSize: 11,
                  ),
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
        ? BrandColors.kenteGold
        : widget.unlocked
        ? BrandColors.heritageGreen
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
            border: Border.all(color: Colors.white, width: 5),
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
            color: widget.completed ? BrandColors.heritageGreen : Colors.white,
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
    required this.startOnRight,
    required this.travelled,
    required this.glow,
  });

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
        ..color = BrandColors.heritageGreen.withValues(alpha: 0.06),
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
        thread..color = BrandColors.divider,
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
            ..color = BrandColors.kenteGold.withValues(
              alpha: 0.1 + (glow * 0.22),
            )
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
        );
      }
      canvas.drawPath(trail, thread..color = BrandColors.kenteGold);
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
      ..color = Colors.white;

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
          bead..color = reached ? BrandColors.kenteGold : BrandColors.divider,
        )
        ..drawCircle(tangent.position, radius, collar);
    }
  }

  @override
  bool shouldRepaint(_LessonRibbonPainter oldDelegate) =>
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
      color: Colors.white.withValues(alpha: 0.55),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: BrandColors.divider),
    ),
    child: const Row(
      children: [
        Icon(Icons.lock_clock_rounded, color: BrandColors.mutedInk),
        SizedBox(width: 12),
        Expanded(
          child: Text(
            'Complete Unit 1 to open six new lessons and a story challenge.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _LessonScreen extends StatefulWidget {
  const _LessonScreen({
    required this.lesson,
    required this.lessonNumber,
    required this.lessonCount,
  });

  final _Lesson lesson;
  final int lessonNumber;
  final int lessonCount;

  @override
  State<_LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<_LessonScreen> {
  int? _selected;
  var _checked = false;

  bool get _correct => _selected == widget.lesson.correctAnswer;

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: BrandColors.plasterCream,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
    child: Scaffold(
      backgroundColor: BrandColors.plasterCream,
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
                            const Text(
                              'QUICK PRACTICE',
                              style: TextStyle(
                                color: BrandColors.terracotta,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2,
                              ),
                            ),
                            const SizedBox(height: 7),
                            Text(
                              widget.lesson.prompt,
                              style: Theme.of(context).textTheme.headlineMedium
                                  ?.copyWith(height: 1.08),
                            ),
                            const SizedBox(height: 9),
                            Text(
                              widget.lesson.support,
                              style: const TextStyle(
                                color: BrandColors.mutedInk,
                                fontSize: 15,
                              ),
                            ),
                            const SizedBox(height: 22),
                            for (
                              var index = 0;
                              index < widget.lesson.answers.length;
                              index++
                            ) ...[
                              _AnswerTile(
                                index: index,
                                answer: widget.lesson.answers[index],
                                selected: _selected == index,
                                checked: _checked,
                                correct: index == widget.lesson.correctAnswer,
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
                                      explanation: widget.lesson.explanation,
                                    ),
                            ),
                            const SizedBox(height: 14),
                            const Text(
                              'Learning preview · phrases await community language validation.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: BrandColors.mutedInk,
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
                ? BrandColors.savannahGreen
                : BrandColors.heritageGreen,
          ),
          onPressed: _selected == null ? null : _advance,
          icon: Icon(
            _checked && _correct
                ? Icons.stars_rounded
                : Icons.arrow_forward_rounded,
          ),
          label: Text(
            !_checked
                ? 'Check answer'
                : _correct
                ? 'Collect ${widget.lesson.xp} XP'
                : 'Try again',
          ),
        ),
      ),
    ),
  );

  void _advance() {
    if (!_checked) {
      HapticFeedback.selectionClick();
      setState(() => _checked = true);
      return;
    }
    if (_correct) {
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
      return;
    }
    setState(() {
      _checked = false;
      _selected = null;
    });
  }
}

class _LessonAtmosphere extends StatelessWidget {
  const _LessonAtmosphere();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFFCF2), BrandColors.plasterCream],
        ),
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
                color: BrandColors.kenteGold.withValues(alpha: 0.08),
              ),
            ),
          ),
          const Positioned(
            left: -24,
            bottom: 130,
            child: Opacity(
              opacity: 0.045,
              child: Text(
                '✣',
                style: TextStyle(
                  color: BrandColors.heritageGreen,
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
    required this.onClose,
  });

  final int current;
  final int total;
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
                style: const TextStyle(
                  color: BrandColors.mutedInk,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: current / total,
                  minHeight: 7,
                  color: BrandColors.kenteGold,
                  backgroundColor: BrandColors.heritageGreen.withValues(
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
            color: Colors.white.withValues(alpha: 0.78),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: BrandColors.divider),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.favorite_rounded, color: Color(0xFFE75555), size: 17),
              SizedBox(width: 4),
              Text('5', style: TextStyle(fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      ],
    ),
  );
}

class _LessonHero extends StatelessWidget {
  const _LessonHero({required this.lesson});

  final _Lesson lesson;

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
          child: Icon(lesson.icon, color: BrandColors.kenteGold, size: 29),
        ),
        const SizedBox(width: 15),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'TODAY\'S STEP',
                style: TextStyle(
                  color: BrandColors.kenteGold,
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
    final color = correct ? BrandColors.savannahGreen : BrandColors.terracotta;
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
        ? BrandColors.savannahGreen
        : revealWrong
        ? BrandColors.terracotta
        : selected
        ? BrandColors.kenteGold
        : BrandColors.divider;
    return Material(
      color: revealCorrect
          ? BrandColors.savannahGreen.withValues(alpha: 0.08)
          : revealWrong
          ? BrandColors.terracotta.withValues(alpha: 0.08)
          : Colors.white,
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
                const Icon(
                  Icons.check_circle_rounded,
                  color: BrandColors.savannahGreen,
                ),
              if (revealWrong)
                const Icon(Icons.cancel_rounded, color: BrandColors.terracotta),
            ],
          ),
        ),
      ),
    );
  }
}

class _Lesson {
  const _Lesson({
    required this.id,
    required this.title,
    required this.icon,
    required this.minutes,
    required this.xp,
    required this.prompt,
    required this.support,
    required this.answers,
    required this.correctAnswer,
    required this.explanation,
  });

  /// Stable slug this lesson is remembered by.
  ///
  /// Progress is stored against these rather than against list positions, so a
  /// lesson added to the middle of the unit later cannot quietly hand somebody
  /// credit for the one that moved into its place.
  final String id;

  final String title;
  final IconData icon;
  final int minutes;
  final int xp;
  final String prompt;
  final String support;
  final List<String> answers;
  final int correctAnswer;
  final String explanation;
}

const _lessons = [
  _Lesson(
    id: 'unit1-say-hello',
    title: 'Say hello',
    icon: Icons.waving_hand_rounded,
    minutes: 2,
    xp: 15,
    prompt: 'Choose the greeting',
    support: 'Which phrase would you use to welcome someone?',
    answers: ['De zaanem', 'Ko gara', 'Mbesem'],
    correctAnswer: 0,
    explanation:
        '“De zaanem” is used here as the welcome phrase in this preview.',
  ),
  _Lesson(
    id: 'unit1-listen-and-choose',
    title: 'Listen & choose',
    icon: Icons.headphones_rounded,
    minutes: 3,
    xp: 15,
    prompt: 'How are things?',
    support: 'Pick the response shown in the community preview.',
    answers: ['Ko gara', 'De zaanem', 'Afi'],
    correctAnswer: 0,
    explanation: '“Ko gara” is the intended response for this practice card.',
  ),
  _Lesson(
    id: 'unit1-build-a-phrase',
    title: 'Build a phrase',
    icon: Icons.extension_rounded,
    minutes: 3,
    xp: 15,
    prompt: 'Complete the exchange',
    support: 'Choose the phrase that keeps the greeting going.',
    answers: ['Mbesem', 'De N lei', 'Naba'],
    correctAnswer: 1,
    explanation: 'The lesson pairs “De N lei” with the greeting exchange.',
  ),
  _Lesson(
    id: 'unit1-conversation-check',
    title: 'Conversation check',
    icon: Icons.forum_rounded,
    minutes: 4,
    xp: 15,
    prompt: 'Finish the mini dialogue',
    support: 'A friend says “De zaanem.” What do you choose?',
    answers: ['Ko gara', 'Good night', 'Thank you'],
    correctAnswer: 0,
    explanation: 'You completed your first practice conversation.',
  ),
];
