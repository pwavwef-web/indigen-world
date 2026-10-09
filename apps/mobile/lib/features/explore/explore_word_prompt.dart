import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/features/contribute/language_loop_analytics.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/queue_lookup.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Reels the member moves through before the first word prompt.
const int kPromptFirstAfterReels = 5;

/// Reels between one prompt and the next.
const int kPromptEveryReels = 14;

/// Prompts in one session of Explore, at most.
const int kPromptsPerSession = 3;

/// Reels a prompt stays for if it is neither answered nor dismissed.
const int kPromptLingerReels = 2;

/// When the next prompt may appear, given how far the member has scrolled.
///
/// Pure, so the rhythm is tested without a feed: never before
/// [kPromptFirstAfterReels] moves, never more than [kPromptsPerSession] times,
/// and never within [kPromptEveryReels] of the last one.
bool promptDue({
  required int moves,
  required int shown,
  required int? lastShownAt,
}) {
  if (moves < kPromptFirstAfterReels || shown >= kPromptsPerSession) {
    return false;
  }
  return lastShownAt == null || moves - lastShownAt >= kPromptEveryReels;
}

/// "Do you know this word in Kasem?" — now and then, over Explore.
///
/// A real open word from the queue, laid over the reel rather than dealt into
/// the feed: the feed pages by position and its order is frozen once the
/// member is past the first reel, so a row spliced into it would move every
/// reel after it. This sits on top, arrives occasionally, and goes on its own
/// if it is ignored for [kPromptLingerReels] reels. Answering opens that exact
/// word in Contribute; dismissing it means it is never offered again on this
/// phone.
class ExploreWordPrompt extends ConsumerStatefulWidget {
  const ExploreWordPrompt({
    required this.activeIndex,
    required this.active,
    required this.top,
    super.key,
  });

  /// The feed's current page. Every change is one move through the feed.
  final ValueListenable<int> activeIndex;

  /// False while Explore is hidden or covered; nothing is offered then.
  final bool active;

  /// Where the card sits: under the header, clear of the caption and rail.
  final double top;

  @override
  ConsumerState<ExploreWordPrompt> createState() => _ExploreWordPromptState();
}

class _ExploreWordPromptState extends ConsumerState<ExploreWordPrompt> {
  int _moves = 0;
  int? _lastIndex;
  int _shown = 0;
  int? _lastShownAt;
  QueueWord? _word;

  /// Words offered this session, answered or not: one offer each.
  final _offered = <String>{};

  @override
  void initState() {
    super.initState();
    _lastIndex = widget.activeIndex.value;
    widget.activeIndex.addListener(_onMove);
  }

  @override
  void didUpdateWidget(ExploreWordPrompt oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.activeIndex != widget.activeIndex) {
      oldWidget.activeIndex.removeListener(_onMove);
      widget.activeIndex.addListener(_onMove);
    }
  }

  @override
  void dispose() {
    widget.activeIndex.removeListener(_onMove);
    super.dispose();
  }

  void _onMove() {
    final index = widget.activeIndex.value;
    if (index == _lastIndex) return;
    _lastIndex = index;
    _moves++;
    if (_word != null) {
      // Ignored: it goes, and may be offered again another day.
      if (_moves - (_lastShownAt ?? _moves) >= kPromptLingerReels) {
        setState(() => _word = null);
      }
      return;
    }
    if (!widget.active ||
        !promptDue(moves: _moves, shown: _shown, lastShownAt: _lastShownAt)) {
      return;
    }
    unawaited(_offer());
  }

  Future<void> _offer() async {
    final List<QueueWord> words;
    final QueuePromptMemory memory;
    try {
      words = await ref.read(explorePromptWordsProvider.future);
      memory = await ref.read(queuePromptMemoryProvider.future);
    } on Object {
      return;
    }
    if (!mounted || _word != null || !widget.active) return;
    QueueWord? next;
    for (final word in words) {
      if (_offered.contains(word.id) || memory.isSettled(word.id)) continue;
      next = word;
      break;
    }
    // Nothing left to offer — all dismissed, answered or already shown. The
    // honest empty state for a prompt is not to appear.
    if (next == null) return;
    _offered.add(next.id);
    setState(() {
      _word = next;
      _shown++;
      _lastShownAt = _moves;
    });
    ref
        .read(loopAnalyticsProvider)
        .log(
          LoopEvent.promptImpression,
          parameters: loopParameters({
            'origin': 'explore',
            'word_id': next.id,
            'word': next.word,
          }),
        );
  }

  void _open(QueueWord word) {
    ref
        .read(loopAnalyticsProvider)
        .log(
          LoopEvent.promptOpen,
          parameters: loopParameters({
            'origin': 'explore',
            'word_id': word.id,
            'word': word.word,
          }),
        );
    setState(() => _word = null);
    unawaited(context.push('/contribute/word/${word.id}?origin=explore'));
  }

  Future<void> _dismiss(QueueWord word) async {
    setState(() => _word = null);
    ref
        .read(loopAnalyticsProvider)
        .log(
          LoopEvent.promptDismiss,
          parameters: loopParameters({'origin': 'explore', 'word_id': word.id}),
        );
    try {
      await (await ref.read(queuePromptMemoryProvider.future)).dismiss(word.id);
    } on Object {
      // Not remembered; at worst it is offered again another session.
    }
  }

  @override
  Widget build(BuildContext context) {
    final word = _word;
    return Positioned(
      top: widget.top,
      left: 12,
      right: 12,
      child: AnimatedSwitcher(
        duration: motionOr(context, AppMotion.standard),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position: Tween(
              begin: const Offset(0, -0.25),
              end: Offset.zero,
            ).animate(animation),
            child: child,
          ),
        ),
        child: word == null
            ? const SizedBox.shrink()
            : WordPromptCard(
                key: ValueKey(word.id),
                word: word,
                onAnswer: () => _open(word),
                onDismiss: () => _dismiss(word),
              ),
      ),
    );
  }
}

/// The card itself: the word, its sentence, and two ways out.
class WordPromptCard extends StatelessWidget {
  const WordPromptCard({
    required this.word,
    required this.onAnswer,
    required this.onDismiss,
    super.key,
  });

  final QueueWord word;
  final VoidCallback onAnswer;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final credit = word.attribution;
    return Semantics(
      container: true,
      label: 'Help the dictionary. Do you know ${word.word} in Kasem?',
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xE6101418),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0x33FFFFFF)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66000000),
              blurRadius: 24,
              offset: Offset(0, 10),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(15, 12, 6, 13),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'HELP THE DICTIONARY',
                      style: TextStyle(
                        color: Color(0xFFF2B75B),
                        fontSize: 10,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(text: 'Do you know '),
                          TextSpan(
                            text: '“${word.word}”',
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          const TextSpan(text: ' in Kasem?'),
                        ],
                      ),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        height: 1.3,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (word.sentence.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        word.sentence,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xCCFFFFFF),
                          fontSize: 12.5,
                          height: 1.35,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                      // Tatoeba's licence asks for credit wherever the
                      // sentence is shown, this card included.
                      if (credit != null)
                        Text(
                          'Sentence: Tatoeba #${credit.tatoebaId}'
                          '${credit.contributor.isEmpty ? '' : ' by ${credit.contributor}'}'
                          ' · ${credit.licence}',
                          style: const TextStyle(
                            color: Color(0x99FFFFFF),
                            fontSize: 9.5,
                          ),
                        ),
                    ],
                    const SizedBox(height: 9),
                    Row(
                      children: [
                        FilledButton(
                          onPressed: onAnswer,
                          style: FilledButton.styleFrom(
                            visualDensity: VisualDensity.compact,
                            backgroundColor: const Color(0xFFF2B75B),
                            foregroundColor: const Color(0xFF1B1206),
                          ),
                          child: const Text('Answer it'),
                        ),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'A reviewer checks every answer.',
                            style: TextStyle(
                              color: Color(0x99FFFFFF),
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Not now, and do not ask about this word again',
                onPressed: onDismiss,
                icon: const Icon(Icons.close_rounded, color: Color(0xB3FFFFFF)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
