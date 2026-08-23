import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/home/home_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class LearnScreen extends StatefulWidget {
  const LearnScreen({super.key});

  @override
  State<LearnScreen> createState() => _LearnScreenState();
}

class _LearnScreenState extends State<LearnScreen> {
  final _completedLessons = <int>{};
  var _streakClaimed = false;

  int get _xp => _completedLessons.length * 15 + (_streakClaimed ? 5 : 0);

  int get _nextLesson {
    for (var index = 0; index < _lessons.length; index++) {
      if (!_completedLessons.contains(index)) return index;
    }
    return _lessons.length - 1;
  }

  @override
  Widget build(BuildContext context) => ScreenContainer(
    child: CustomScrollView(
      key: const PageStorageKey('learn-path-scroll'),
      slivers: [
        SliverToBoxAdapter(
          child: _LearnHeader(
            xp: _xp,
            completed: _completedLessons.length,
            streakClaimed: _streakClaimed,
            onClaimStreak: _claimStreak,
            onOpenDictionary: _openDictionary,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 120),
          sliver: SliverList.list(
            children: [
              _DailyQuestCard(
                completed: _completedLessons.length,
                onTap: () => _openLesson(_nextLesson),
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
                  completed: _completedLessons.contains(index),
                  unlocked: index <= _nextLesson,
                  current: index == _nextLesson,
                  onTap: () => _openLesson(index),
                ),
                if (index != _lessons.length - 1)
                  _PathConnector(
                    alignRight: index.isEven,
                    active: index < _nextLesson,
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
    ),
  );

  void _claimStreak() {
    if (_streakClaimed) return;
    HapticFeedback.mediumImpact();
    setState(() => _streakClaimed = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Daily spark claimed · +5 XP')),
    );
  }

  void _openDictionary() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          appBar: AppBar(title: const Text('Kasem dictionary')),
          body: const HomeScreen(),
        ),
      ),
    );
  }

  Future<void> _openLesson(int index) async {
    if (index > _nextLesson) {
      HapticFeedback.lightImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Finish the lesson above to unlock this one.'),
        ),
      );
      return;
    }
    final completed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: BrandColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      builder: (context) => _LessonPlayer(lesson: _lessons[index]),
    );
    if (completed == true && mounted) {
      HapticFeedback.heavyImpact();
      setState(() => _completedLessons.add(index));
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
          width: 78,
          height: 72,
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

class _PathConnector extends StatelessWidget {
  const _PathConnector({required this.alignRight, required this.active});

  final bool alignRight;
  final bool active;

  @override
  Widget build(BuildContext context) => Align(
    alignment: alignRight
        ? const Alignment(0.38, 0)
        : const Alignment(-0.38, 0),
    child: Container(
      width: 4,
      height: 34,
      margin: const EdgeInsets.symmetric(vertical: 2),
      decoration: BoxDecoration(
        color: active ? BrandColors.kenteGold : BrandColors.divider,
        borderRadius: BorderRadius.circular(999),
      ),
    ),
  );
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

class _LessonPlayer extends StatefulWidget {
  const _LessonPlayer({required this.lesson});

  final _Lesson lesson;

  @override
  State<_LessonPlayer> createState() => _LessonPlayerState();
}

class _LessonPlayerState extends State<_LessonPlayer> {
  int? _selected;
  var _checked = false;

  bool get _correct => _selected == widget.lesson.correctAnswer;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      22,
      12,
      22,
      22 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.82,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: const LinearProgressIndicator(
                      value: 1,
                      minHeight: 9,
                      color: BrandColors.savannahGreen,
                      backgroundColor: BrandColors.divider,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                const Icon(Icons.favorite_rounded, color: Color(0xFFE75555)),
                const SizedBox(width: 4),
                const Text('5', style: TextStyle(fontWeight: FontWeight.w900)),
              ],
            ),
            const SizedBox(height: 26),
            Text(
              widget.lesson.prompt,
              style: Theme.of(context).textTheme.headlineMedium
                  ?.copyWith(height: 1.08),
            ),
            const SizedBox(height: 9),
            Text(
              widget.lesson.support,
              style: const TextStyle(color: BrandColors.mutedInk, fontSize: 15),
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
                  : Container(
                      key: ValueKey(_correct),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color:
                            (_correct
                                    ? BrandColors.savannahGreen
                                    : BrandColors.terracotta)
                                .withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: Text(
                        _correct
                            ? 'Beautiful! ${widget.lesson.explanation}'
                            : 'Almost. ${widget.lesson.explanation}',
                        style: TextStyle(
                          color: _correct
                              ? BrandColors.savannahGreen
                              : BrandColors.terracotta,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: _checked && _correct
                    ? BrandColors.savannahGreen
                    : BrandColors.heritageGreen,
              ),
              onPressed: _selected == null
                  ? null
                  : () {
                      if (!_checked) {
                        HapticFeedback.selectionClick();
                        setState(() => _checked = true);
                        return;
                      }
                      if (_correct) {
                        Navigator.pop(context, true);
                      } else {
                        setState(() {
                          _checked = false;
                          _selected = null;
                        });
                      }
                    },
              child: Text(
                !_checked
                    ? 'Check answer'
                    : _correct
                    ? 'Collect ${widget.lesson.xp} XP'
                    : 'Try again',
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Learning preview · phrases await community language validation.',
              textAlign: TextAlign.center,
              style: TextStyle(color: BrandColors.mutedInk, fontSize: 10),
            ),
          ],
        ),
      ),
    ),
  );
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
