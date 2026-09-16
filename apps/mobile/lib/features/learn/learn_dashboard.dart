import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/learn/daily_word.dart';
import 'package:indigen_world_mobile/features/learn/learn_catalog.dart';
import 'package:indigen_world_mobile/features/learn/learn_content.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/learn_sheets.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// THE LEARN DASHBOARD
///
/// One screen that answers the three questions somebody opens a language app
/// with: *what do I do now* (today's lesson), *what else can I do in two
/// minutes* (review, listen, speak, today's word) and *am I keeping it up*
/// (the header numbers and the week). The trail of lessons that used to fill
/// this tab is one tap away under "Course", where it has the room it needs.
///
/// Navy grounds, the ecosystem's blue for what you press and gold for what you
/// have earned. Compact type throughout: nothing
/// larger than a lesson title, no paragraph a thumb has to scroll past.
/// ─────────────────────────────────────────────────────────────────────────────

/// Height of the pinned header strip.
const double kLearnHeaderHeight = 56;

/// The dashboard's own colour roles, resolved from the brand palette.
@immutable
class LearnTokens {
  const LearnTokens._({
    required this.surface,
    required this.border,
    required this.ink,
    required this.mutedInk,
    required this.faintInk,
    required this.action,
    required this.onAction,
    required this.gold,
    required this.flame,
    required this.chip,
  });

  factory LearnTokens.of(BuildContext context) {
    final brand = context.brand;
    return LearnTokens._(
      surface: brand.pick(Colors.white, brand.surface),
      border: brand.border,
      ink: brand.ink,
      mutedInk: brand.mutedInk,
      faintInk: brand.faintInk,
      action: brand.accent,
      onAction: brand.pick(Colors.white, brand.background),
      gold: brand.gold,
      flame: const Color(0xFFE0763C),
      chip: brand.surfaceMuted,
    );
  }

  final Color surface;
  final Color border;
  final Color ink;
  final Color mutedInk;
  final Color faintInk;
  final Color action;
  final Color onAction;
  final Color gold;
  final Color flame;
  final Color chip;
}

TextStyle _eyebrow(Color color) => TextStyle(
  color: color,
  fontSize: 11,
  fontWeight: FontWeight.w800,
  letterSpacing: 1.7,
);

// ── Header ──────────────────────────────────────────────────────────────────

/// Streak, XP, today's goal and the dictionary. The shell's profile orb sits in
/// the corner to the right of it and is the avatar in this row.
class LearnHeaderBar extends StatelessWidget {
  const LearnHeaderBar({
    required this.streakDays,
    required this.streakAtRisk,
    required this.xp,
    required this.goalDone,
    required this.onStreak,
    required this.onXp,
    required this.onGoal,
    required this.onDictionary,
    required this.trailingReserve,
    super.key,
  });

  final int streakDays;
  final bool streakAtRisk;
  final int xp;
  final int goalDone;
  final VoidCallback onStreak;
  final VoidCallback onXp;
  final VoidCallback onGoal;
  final VoidCallback onDictionary;

  /// Room left clear for the shell's orb.
  final double trailingReserve;

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    return SizedBox(
      height: kLearnHeaderHeight,
      child: Padding(
        padding: EdgeInsets.only(left: 8, right: trailingReserve - 6),
        child: LayoutBuilder(
          builder: (context, constraints) => _HeaderCompact(
            compact: constraints.maxWidth < 320,
            child: Row(
              children: [
                _HeaderStat(
                  key: const Key('learn-header-streak'),
                  icon: streakDays > 0
                      ? Icons.local_fire_department_rounded
                      : Icons.local_fire_department_outlined,
                  tint: streakDays > 0 || streakAtRisk
                      ? tokens.flame
                      : tokens.faintInk,
                  label: '$streakDays',
                  semantics: streakAtRisk
                      ? '$streakDays day streak, learn today to keep it'
                      : '$streakDays day streak. Open streak details',
                  onTap: onStreak,
                ),
                _HeaderStat(
                  key: const Key('learn-header-xp'),
                  icon: Icons.bolt_rounded,
                  tint: tokens.gold,
                  label: '$xp',
                  semantics: '$xp XP. Open progress and achievements',
                  onTap: onXp,
                ),
                _HeaderStat(
                  key: const Key('learn-header-goal'),
                  icon: Icons.emoji_events_rounded,
                  tint: goalDone >= LearnProgress.dailyGoal
                      ? tokens.gold
                      : tokens.action,
                  label: '$goalDone/${LearnProgress.dailyGoal}',
                  semantics:
                      'Today’s goal, $goalDone of ${LearnProgress.dailyGoal}. Open today’s goal',
                  onTap: onGoal,
                ),
                const Spacer(),
                IconButton(
                  key: const Key('learn-header-dictionary'),
                  tooltip: 'Kasem dictionary',
                  onPressed: onDictionary,
                  constraints: const BoxConstraints.tightFor(
                    width: 48,
                    height: 48,
                  ),
                  icon: Icon(
                    Icons.menu_book_rounded,
                    color: tokens.action,
                    size: 26,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Tells the header's numbers to tighten up on a narrow row.
class _HeaderCompact extends InheritedWidget {
  const _HeaderCompact({required this.compact, required super.child});

  final bool compact;

  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_HeaderCompact>()?.compact ??
      false;

  @override
  bool updateShouldNotify(_HeaderCompact old) => old.compact != compact;
}

class _HeaderStat extends StatelessWidget {
  const _HeaderStat({
    required this.icon,
    required this.tint,
    required this.label,
    required this.semantics,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final Color tint;
  final String label;
  final String semantics;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final compact = _HeaderCompact.of(context);
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: InkResponse(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        radius: 28,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48, minWidth: 44),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: compact ? 4 : 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: tint, size: compact ? 19 : 22),
                SizedBox(width: compact ? 3 : 6),
                Text(
                  label,
                  maxLines: 1,
                  textScaler: MediaQuery.textScalerOf(context)
                      .clamp(maxScaleFactor: 1.2),
                  style: TextStyle(
                    color: context.brand.ink,
                    fontSize: compact ? 14.5 : 16.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Language and course ─────────────────────────────────────────────────────

class CourseSelectorRow extends StatelessWidget {
  const CourseSelectorRow({
    required this.languageName,
    required this.onLanguage,
    required this.onCourse,
    super.key,
  });

  final String languageName;
  final VoidCallback onLanguage;
  final VoidCallback onCourse;

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    return Container(
      height: 46,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              button: true,
              label: 'Learning $languageName. Change language',
              excludeSemantics: true,
              child: InkWell(
                key: const Key('learn-language'),
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(14),
                ),
                onTap: onLanguage,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Flexible(
                        child: Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: 'Learning ',
                                style: TextStyle(color: tokens.mutedInk),
                              ),
                              TextSpan(
                                text: languageName,
                                style: TextStyle(
                                  color: tokens.ink,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: tokens.mutedInk,
                        size: 22,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Semantics(
            button: true,
            label: 'Course outline',
            excludeSemantics: true,
            child: InkWell(
              key: const Key('learn-course'),
              borderRadius: const BorderRadius.horizontal(
                right: Radius.circular(14),
              ),
              onTap: onCourse,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  children: [
                    Icon(
                      Icons.auto_stories_outlined,
                      color: tokens.mutedInk,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Course',
                      style: TextStyle(
                        color: tokens.ink,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Today's lesson ──────────────────────────────────────────────────────────

/// The featured lesson: the learner's next unfinished one.
class TodayLessonCard extends StatelessWidget {
  const TodayLessonCard({
    required this.outline,
    required this.progress,
    required this.onContinue,
    required this.onReview,
    super.key,
  });

  final CourseOutline outline;
  final LearnProgress progress;
  final VoidCallback onContinue;
  final VoidCallback onReview;

  @override
  Widget build(BuildContext context) {
    final lesson = outline.nextLesson;
    final unit = lesson == null
        ? outline.currentUnit
        : outline.unitOfLesson(lesson);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final narrow = width < 340;
        final textWidth = width * (narrow ? 0.68 : 0.58);
        final artWidth = width * (narrow ? 0.5 : 0.62);
        return ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [context.brand.heroMid, context.brand.nightGround],
              ),
              border: Border.all(
                color: context.brand.nightAccent.withValues(alpha: 0.16),
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: artWidth,
                  child: _HeroArt(
                    unit: unit?.unit,
                    lesson: lesson,
                    // On a narrow phone the picture shrinks and fades further
                    // rather than the words getting smaller.
                    opacity: narrow ? 0.55 : 1,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 14, 18),
                  child: SizedBox(
                    width: textWidth,
                    child: lesson == null
                        ? _HeroFinished(
                            empty: outline.isEmpty,
                            onReview: onReview,
                          )
                        : _HeroLesson(
                            lesson: lesson,
                            unit: unit,
                            progress: progress,
                            onContinue: onContinue,
                          ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _HeroLesson extends StatelessWidget {
  const _HeroLesson({
    required this.lesson,
    required this.unit,
    required this.progress,
    required this.onContinue,
  });

  final Lesson lesson;
  final UnitOutline? unit;
  final LearnProgress progress;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final total = lesson.questions.length;
    final done = progress.stepsIn(lesson.id).clamp(0, total);
    final started = done > 0;
    final goalMet = progress.dailyGoalMet;
    final description = [
      if (lesson.description.isNotEmpty) lesson.description,
      '${lesson.minutes} min',
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Once today's goal is met the card is still the next lesson, and says
        // so rather than calling it today's.
        Text(
          goalMet ? 'UP NEXT · GOAL MET' : 'TODAY’S LESSON',
          style: _eyebrow(Colors.white.withValues(alpha: 0.78)),
        ),
        const SizedBox(height: 6),
        if (unit != null)
          Text(
            'UNIT ${unit!.unit.order}',
            style: _eyebrow(context.brand.highlight),
          ),
        const SizedBox(height: 4),
        Text(
          lesson.title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 21,
            height: 1.15,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          description,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.78),
            fontSize: 13.5,
            height: 1.3,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '$done of $total ${total == 1 ? 'activity' : 'activities'}',
          style: const TextStyle(color: Colors.white, fontSize: 13),
        ),
        const SizedBox(height: 7),
        Semantics(
          label: '$done of $total activities done',
          excludeSemantics: true,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : done / total,
              minHeight: 6,
              color: context.brand.nightAccent,
              backgroundColor: Colors.white.withValues(alpha: 0.16),
            ),
          ),
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          key: const Key('learn-hero-continue'),
          onPressed: onContinue,
          style: FilledButton.styleFrom(
            backgroundColor: context.brand.nightAccent,
            foregroundColor: context.brand.nightGround,
            minimumSize: const Size(150, 48),
            padding: const EdgeInsets.symmetric(horizontal: 22),
            shape: const StadiumBorder(),
            textStyle: Theme.of(context).textTheme.labelLarge
                ?.copyWith(fontSize: 16.5, fontWeight: FontWeight.w800),
          ),
          icon: const Icon(Icons.play_arrow_rounded, size: 26),
          label: Text(started ? 'Continue' : 'Start lesson'),
        ),
      ],
    );
  }
}

class _HeroFinished extends StatelessWidget {
  const _HeroFinished({required this.empty, required this.onReview});

  final bool empty;
  final VoidCallback onReview;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        'TODAY’S LESSON',
        style: _eyebrow(Colors.white.withValues(alpha: 0.78)),
      ),
      const SizedBox(height: 10),
      Text(
        empty ? 'Lessons are on their way' : 'Every lesson is done',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 21,
          height: 1.15,
          fontWeight: FontWeight.w800,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        empty ? 'This course is being prepared with Kasem speakers.' : 'New lessons appear as they are published. Keep your words fresh meanwhile.',
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.78),
          fontSize: 13.5,
          height: 1.3,
        ),
      ),
      const SizedBox(height: 16),
      FilledButton.icon(
        key: const Key('learn-hero-review'),
        onPressed: onReview,
        style: FilledButton.styleFrom(
          backgroundColor: context.brand.nightAccent,
          foregroundColor: context.brand.nightGround,
          minimumSize: const Size(150, 48),
          shape: const StadiumBorder(),
          textStyle: Theme.of(context).textTheme.labelLarge
              ?.copyWith(fontSize: 16, fontWeight: FontWeight.w800),
        ),
        icon: const Icon(Icons.replay_rounded),
        label: const Text('Review words'),
      ),
    ],
  );
}

class _HeroArt extends StatelessWidget {
  const _HeroArt({
    required this.unit,
    required this.lesson,
    required this.opacity,
  });

  final LearnUnit? unit;
  final Lesson? lesson;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    final networkUrl = (lesson?.imageUrl.isNotEmpty ?? false)
        ? lesson!.imageUrl
        : unit?.imageUrl ?? '';
    final asset = unit?.assetImage ?? '';
    final credit = (lesson?.imageUrl.isNotEmpty ?? false)
        ? lesson!.imageAttribution
        : unit?.imageAttribution ?? '';
    if (networkUrl.isEmpty && asset.isEmpty) {
      return ClipRect(
        child: CustomPaint(painter: KassenaPatternPainter(
            tint: context.brand.highlight,
            opacity: 0.08)),
      );
    }
    return Semantics(
      image: true,
      label: credit.isEmpty ? 'Course illustration' : credit,
      child: Opacity(
        opacity: opacity,
        child: ShaderMask(
          // Fades the picture's left edge into the card, so there is no seam.
          blendMode: BlendMode.dstIn,
          shaderCallback: (bounds) => const LinearGradient(
            colors: [Color(0x00000000), Color(0xFF000000)],
            stops: [0, 0.38],
          ).createShader(bounds),
          child: LearnImage(
            networkUrl: networkUrl,
            asset: asset,
            alignment: const Alignment(0.55, 0),
          ),
        ),
      ),
    );
  }
}

/// A course picture: an approved network image, else the bundled asset, else
/// the Kassena wall pattern. Never a broken-image icon.
class LearnImage extends StatelessWidget {
  const LearnImage({
    required this.networkUrl,
    required this.asset,
    this.alignment = Alignment.center,
    super.key,
  });

  final String networkUrl;
  final String asset;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    Widget fallback() => asset.isNotEmpty
        ? Image.asset(
            asset,
            fit: BoxFit.cover,
            alignment: alignment,
            errorBuilder: (_, _, _) => const _PatternFill(),
          )
        : const _PatternFill();
    if (networkUrl.isEmpty) return fallback();
    return CachedNetworkImage(
      imageUrl: networkUrl,
      fit: BoxFit.cover,
      alignment: alignment,
      placeholder: (_, _) => fallback(),
      errorWidget: (_, _, _) => fallback(),
    );
  }
}

class _PatternFill extends StatelessWidget {
  const _PatternFill();

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [context.brand.heroMid, context.brand.nightGround],
      ),
    ),
    child: ClipRect(
      child: CustomPaint(painter: KassenaPatternPainter(
            tint: context.brand.highlight,
            opacity: 0.22)),
    ),
  );
}

// ── Quick practice ──────────────────────────────────────────────────────────

class PracticeActionsRow extends StatelessWidget {
  const PracticeActionsRow({
    required this.progress,
    required this.onReview,
    required this.onListen,
    required this.onSpeak,
    super.key,
  });

  final LearnProgress progress;
  final VoidCallback onReview;
  final VoidCallback onListen;
  final VoidCallback onSpeak;

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    final due = progress.dueReviewIds.length;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _PracticeCard(
              key: const Key('learn-practice-review'),
              icon: Icons.menu_book_rounded,
              tint: tokens.gold,
              title: 'Review words',
              description: due > 0 ? '$due due today' : 'Build your memory',
              done: progress.practisedToday(PracticeKind.review),
              onTap: onReview,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _PracticeCard(
              key: const Key('learn-practice-listen'),
              icon: Icons.headphones_rounded,
              tint: tokens.action,
              title: 'Listen',
              description: 'Train your ear',
              done: progress.practisedToday(PracticeKind.listen),
              onTap: onListen,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _PracticeCard(
              key: const Key('learn-practice-speak'),
              icon: Icons.mic_rounded,
              tint: tokens.gold,
              title: 'Speak',
              description: 'Practise out loud',
              done: progress.practisedToday(PracticeKind.speak),
              onTap: onSpeak,
            ),
          ),
        ],
      ),
    );
  }
}

class _PracticeCard extends StatelessWidget {
  const _PracticeCard({
    required this.icon,
    required this.tint,
    required this.title,
    required this.description,
    required this.done,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final Color tint;
  final String title;
  final String description;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    return Semantics(
      button: true,
      label: '$title. $description${done ? '. Done today' : ''}',
      excludeSemantics: true,
      child: Material(
        color: tokens.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: tokens.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(11, 12, 4, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icon, color: tint, size: 28),
                    const Spacer(),
                    if (done)
                      Icon(
                        Icons.check_circle_rounded,
                        size: 16,
                        color: tokens.gold,
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          title,
                          maxLines: 1,
                          style: TextStyle(
                            color: tokens.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: tokens.mutedInk,
                      size: 18,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      description,
                      maxLines: 1,
                      style: TextStyle(color: tokens.mutedInk, fontSize: 12.5),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Word of the day ─────────────────────────────────────────────────────────

class WordOfTheDayCard extends StatelessWidget {
  const WordOfTheDayCard({
    required this.word,
    required this.onOpen,
    required this.onUnavailable,
    super.key,
  });

  final DailyWord word;
  final VoidCallback onOpen;
  final VoidCallback onUnavailable;

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    final entry = word.entry;
    return Semantics(
      container: true,
      label: 'Word of the day, ${entry.headword}, ${entry.translation}',
      child: Material(
        color: tokens.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: tokens.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: const Key('learn-word-of-the-day'),
          onTap: onOpen,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 92),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    width: 92,
                    child: word.imageUrl.isNotEmpty
                        ? LearnImage(networkUrl: word.imageUrl, asset: '')
                        : _WordMotif(headword: entry.headword),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'WORD OF THE DAY',
                            style: _eyebrow(tokens.mutedInk),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            entry.headword,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: tokens.ink,
                              fontSize: 21,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                          Text(
                            word.hasAudio
                                ? entry.translation
                                : '${entry.translation} · Pronunciation unavailable',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: tokens.mutedInk,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(right: 12, left: 6),
                    child: Center(
                      child: PronunciationButton(
                        key: const Key('learn-word-audio'),
                        audioUrl: entry.audioUrl,
                        dimension: 48,
                        background: tokens.chip,
                        foreground: tokens.ink,
                        onUnavailable: onUnavailable,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _WordMotif extends StatelessWidget {
  const _WordMotif({required this.headword});

  final String headword;

  @override
  Widget build(BuildContext context) {
    final initial = headword.characters.isEmpty
        ? ''
        : headword.characters.first.toUpperCase();
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [context.brand.heroMid, context.brand.nightGround],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRect(
            child: CustomPaint(painter: KassenaPatternPainter(
            tint: context.brand.highlight,
            opacity: 0.28)),
          ),
          Center(
            child: Text(
              initial,
              style: const TextStyle(
                color: Color(0xFFE2B85A),
                fontSize: 34,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── This week ───────────────────────────────────────────────────────────────

class WeeklyConsistencyCard extends StatelessWidget {
  const WeeklyConsistencyCard({required this.progress, super.key});

  final LearnProgress progress;

  String get _motivation {
    if (progress.weeklyGoalMet) return 'Consistency builds fluency.';
    if (progress.streakAtRisk) return 'A lesson today keeps your streak.';
    final left = LearnProgress.weeklyGoalDays - progress.activeDaysThisWeek;
    if (progress.activeDaysThisWeek == 0) {
      return 'Three days a week builds a habit.';
    }
    return left == 1
        ? 'One more day reaches your goal.'
        : '$left more days to your goal.';
  }

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    final days = progress.activeDaysThisWeek;
    final met = progress.weeklyGoalMet;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tokens.border),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stacked = constraints.maxWidth < 300;
          final roomy = constraints.maxWidth >= 380;
          final message = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _motivation,
                maxLines: 4,
                style: TextStyle(
                  color: tokens.mutedInk,
                  fontSize: 12,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 4),
              CustomPaint(
                size: const Size(34, 8),
                painter: _SquigglePainter(color: tokens.gold),
              ),
            ],
          );
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('THIS WEEK', style: _eyebrow(tokens.mutedInk)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Icon(
                          Icons.emoji_events_rounded,
                          color: met ? tokens.gold : tokens.faintInk,
                          size: 20,
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            met
                                ? '${LearnProgress.weeklyGoalDays}-day goal complete!'
                                : '$days of ${LearnProgress.weeklyGoalDays} days',
                            maxLines: 2,
                            textAlign: TextAlign.end,
                            style: TextStyle(
                              color: met ? tokens.gold : tokens.mutedInk,
                              fontWeight: FontWeight.w700,
                              fontSize: 13.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              if (stacked) ...[
                WeekDots(progress: progress),
                const SizedBox(height: 10),
                message,
              ] else
                Row(
                  children: [
                    Expanded(
                      child: WeekDots(progress: progress, compact: !roomy),
                    ),
                    Container(
                      width: 1,
                      height: 52,
                      margin: const EdgeInsets.symmetric(horizontal: 10),
                      color: tokens.border,
                    ),
                    SizedBox(width: roomy ? 100 : 80, child: message),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }
}

class _SquigglePainter extends CustomPainter {
  const _SquigglePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()..moveTo(0, size.height * 0.7);
    path
      ..quadraticBezierTo(
        size.width * 0.25,
        0,
        size.width * 0.5,
        size.height * 0.5,
      )
      ..quadraticBezierTo(
        size.width * 0.75,
        size.height,
        size.width,
        size.height * 0.2,
      );
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_SquigglePainter old) => old.color != color;
}

// ── Explore next ────────────────────────────────────────────────────────────

class ExploreNextSection extends StatelessWidget {
  const ExploreNextSection({
    required this.units,
    required this.onSeeAll,
    required this.onUnit,
    super.key,
  });

  final List<UnitOutline> units;
  final VoidCallback onSeeAll;
  final ValueChanged<UnitOutline> onUnit;

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 8, 0),
          child: Row(
            children: [
              Text('EXPLORE NEXT', style: _eyebrow(tokens.mutedInk)),
              const Spacer(),
              TextButton(
                key: const Key('learn-see-all'),
                onPressed: onSeeAll,
                style: TextButton.styleFrom(foregroundColor: tokens.action),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'See all',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, size: 20),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 150 * scale,
          child: ListView.separated(
            key: const PageStorageKey('learn-explore-next'),
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: units.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) =>
                UnitCard(unit: units[index], onTap: () => onUnit(units[index])),
          ),
        ),
      ],
    );
  }
}

class UnitCard extends StatelessWidget {
  const UnitCard({required this.unit, required this.onTap, super.key});

  final UnitOutline unit;
  final VoidCallback onTap;

  String get _meta {
    final count = unit.lessons.length;
    return switch (unit.state) {
      UnitState.inPreparation => 'UNIT ${unit.unit.order} · SOON',
      _ =>
        'UNIT ${unit.unit.order} · $count ${count == 1 ? 'LESSON' : 'LESSONS'}',
    };
  }

  String get _stateLabel => switch (unit.state) {
    UnitState.completed => 'Completed',
    UnitState.inProgress => '${unit.completed}/${unit.lessons.length} done',
    UnitState.available => 'Open',
    UnitState.locked => 'Locked',
    UnitState.inPreparation => 'In preparation',
  };

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    final dimmed =
        unit.state == UnitState.locked || unit.state == UnitState.inPreparation;
    return Semantics(
      button: true,
      label: '${unit.unit.title}. $_meta. $_stateLabel',
      excludeSemantics: true,
      child: SizedBox(
        width: 142,
        child: Material(
          color: tokens.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: tokens.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            key: ValueKey('learn-unit-${unit.unit.id}'),
            onTap: onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 11,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Opacity(
                        opacity: dimmed ? 0.55 : 1,
                        child: LearnImage(
                          networkUrl: unit.unit.imageUrl,
                          asset: unit.unit.assetImage,
                        ),
                      ),
                      Positioned(
                        top: 8,
                        right: 8,
                        child: _UnitStateBadge(state: unit.state),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  flex: 9,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  unit.unit.title,
                                  maxLines: 1,
                                  style: TextStyle(
                                    color: tokens.ink,
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                _meta,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: tokens.mutedInk,
                                  fontSize: 10,
                                  letterSpacing: 1.1,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: tokens.mutedInk,
                          size: 20,
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
    );
  }
}

class _UnitStateBadge extends StatelessWidget {
  const _UnitStateBadge({required this.state});

  final UnitState state;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (state) {
      UnitState.completed => (Icons.check_rounded, const Color(0xFFE2B85A)),
      UnitState.inProgress => (Icons.play_arrow_rounded, context.brand.nightAccent),
      UnitState.locked => (Icons.lock_rounded, Colors.white),
      UnitState.inPreparation => (Icons.schedule_rounded, Colors.white),
      UnitState.available => (null, null),
    };
    if (icon == null) return const SizedBox.shrink();
    return Container(
      width: 26,
      height: 26,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 16, color: color),
    );
  }
}

// ── Loading ─────────────────────────────────────────────────────────────────

/// Shapes where the dashboard's cards will be, while the first answer loads.
class LearnDashboardSkeleton extends StatefulWidget {
  const LearnDashboardSkeleton({super.key});

  @override
  State<LearnDashboardSkeleton> createState() => _LearnDashboardSkeletonState();
}

class _LearnDashboardSkeletonState extends State<LearnDashboardSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _pulse.stop();
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = LearnTokens.of(context);
    Widget block(double height, {double radius = 18}) => Container(
      height: height,
      decoration: BoxDecoration(
        color: tokens.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: tokens.border),
      ),
    );
    return Semantics(
      label: 'Loading your course',
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.45, end: 1).animate(_pulse),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              block(200, radius: 22),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: block(86, radius: 16)),
                  const SizedBox(width: 10),
                  Expanded(child: block(86, radius: 16)),
                  const SizedBox(width: 10),
                  Expanded(child: block(86, radius: 16)),
                ],
              ),
              const SizedBox(height: 12),
              block(92),
              const SizedBox(height: 12),
              block(104),
            ],
          ),
        ),
      ),
    );
  }
}

// ── The pattern ─────────────────────────────────────────────────────────────

/// Bands of triangles and lozenges in the manner of Kassena wall painting —
/// the geometric work women paint on compound walls in Tiébélé and across the
/// Kassena homeland. Drawn, not photographed: a texture in the house palette,
/// never a claim about any particular wall. Painted in the theme's own colour,
/// handed in by the widget because a painter has no context.
class KassenaPatternPainter extends CustomPainter {
  const KassenaPatternPainter({required this.tint, this.opacity = 0.1});

  final Color tint;
  final double opacity;

  @override
  void paint(Canvas canvas, Size size) {
    final ochre = Paint()
      ..color = tint.withValues(alpha: opacity);
    final cream = Paint()
      ..color = Colors.white.withValues(alpha: opacity * 0.8);
    final ink = Paint()
      ..color = const Color(0xFF000000).withValues(alpha: opacity * 0.9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    const band = 22.0;
    var row = 0;
    for (var top = 0.0; top < size.height; top += band, row++) {
      final step = band;
      for (var left = -step; left < size.width + step; left += step) {
        final offset = row.isOdd ? step / 2 : 0;
        final x = left + offset;
        if (row % 3 == 2) {
          final lozenge = Path()
            ..moveTo(x + step / 2, top + 3)
            ..lineTo(x + step - 3, top + band / 2)
            ..lineTo(x + step / 2, top + band - 3)
            ..lineTo(x + 3, top + band / 2)
            ..close();
          canvas
            ..drawPath(lozenge, cream)
            ..drawPath(lozenge, ink);
        } else {
          final triangle = Path()
            ..moveTo(x, top + band)
            ..lineTo(x + step / 2, top + 2)
            ..lineTo(x + step, top + band)
            ..close();
          canvas.drawPath(triangle, row.isEven ? ochre : cream);
        }
      }
      canvas.drawLine(Offset(0, top), Offset(size.width, top), ink);
    }
  }

  @override
  bool shouldRepaint(KassenaPatternPainter old) =>
      old.opacity != opacity || old.tint != tint;
}
