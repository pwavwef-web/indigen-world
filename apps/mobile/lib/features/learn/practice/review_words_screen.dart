import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/learn/daily_word.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_decks.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_widgets.dart';

/// Spaced-repetition review of dictionary words.
///
/// Each card shows a Kasem word; the member says to themselves what it means,
/// reveals the published meaning, and marks whether they knew it. Knowing it
/// moves the word to a later box and it comes back in 1, 2, 4, 8 then 16 days;
/// not knowing it brings it back today. Every answer is saved to the member's
/// progress as it is given, so a review abandoned halfway still counts.
class ReviewWordsScreen extends ConsumerStatefulWidget {
  const ReviewWordsScreen({super.key});

  @override
  ConsumerState<ReviewWordsScreen> createState() => _ReviewWordsScreenState();
}

class _ReviewWordsScreenState extends ConsumerState<ReviewWordsScreen> {
  List<DictionaryEntry>? _deck;
  var _position = 0;
  var _revealed = false;
  var _knew = 0;
  final _requeued = <String>{};
  bool? _paid;

  void _build(List<DictionaryEntry> entries) {
    if (_deck != null) return;
    final progress =
        ref.read(learnProgressProvider).asData?.value ?? const LearnProgress();
    final saved =
        ref.read(savedDictionaryEntryIdsProvider).asData?.value ?? const {};
    _deck = buildReviewDeck(
      entries: entries,
      progress: progress,
      savedIds: saved,
      todayWordId: ref.read(dailyWordProvider)?.entry.id,
    );
  }

  Future<void> _answer({required bool knew}) async {
    final deck = _deck!;
    final entry = deck[_position];
    HapticFeedback.selectionClick();
    final saved = ref
        .read(learnProgressProvider.notifier)
        .reviewWord(entry.id, knew: knew);
    setState(() {
      if (knew) {
        _knew++;
      } else if (_requeued.add(entry.id)) {
        // Once more at the end of this session, and no more than once.
        _deck = [...deck, entry];
      }
      _position++;
      _revealed = false;
    });
    await saved;
    if (_position >= _deck!.length) {
      final paid = await ref
          .read(learnProgressProvider.notifier)
          .completePractice(PracticeKind.review);
      if (mounted) setState(() => _paid = paid);
    }
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(publishedDictionaryEntriesProvider);
    return PracticeScaffold(
      title: 'Review words',
      child: switch (entries) {
        AsyncValue(:final value?) => _body(value),
        AsyncValue(:final error?) => PracticeMessage(
          icon: Icons.cloud_off_rounded,
          title: 'Words could not be loaded',
          body: 'Check your connection and try again.',
          actionLabel: 'Try again',
          onAction: () => ref.invalidate(publishedDictionaryEntriesProvider),
          debugError: error,
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _body(List<DictionaryEntry> entries) {
    _build(entries);
    final deck = _deck!;
    if (deck.isEmpty) {
      return PracticeMessage(
        icon: Icons.menu_book_rounded,
        title: 'Nothing to review yet',
        body:
            'The dictionary has no published words to practise yet. New words appear here as they are approved.',
        actionLabel: 'Open the dictionary',
        onAction: () => Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => const DictionaryCollectionScreen(),
          ),
        ),
      );
    }
    if (_position >= deck.length) {
      final progress = ref.watch(learnProgressProvider).asData?.value;
      final due = progress?.dueReviewIds.length ?? 0;
      return PracticeSummary(
        title: 'Review complete',
        lines: [
          '$_knew of ${deck.length - _requeued.length} words known first time.',
          if (_paid == true) '+${LearnProgress.xpPerPracticeDay} XP for today’s review.',
          if (_paid == false) 'Today’s review XP was already earned.',
          due == 0
              ? 'Nothing else is due today.'
              : '$due more ${due == 1 ? 'word is' : 'words are'} due.',
        ],
        onDone: () => Navigator.of(context).pop(),
      );
    }
    final entry = deck[_position];
    final card =
        ref.watch(learnProgressProvider).asData?.value.reviewCards[entry.id];
    final brand = context.brand;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        PracticeProgressBar(done: _position, total: deck.length),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
          decoration: BoxDecoration(
            color: brand.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: brand.border),
          ),
          child: Column(
            children: [
              Text(
                card == null ? 'NEW WORD' : 'REVIEW',
                style: TextStyle(
                  color: brand.gold,
                  fontSize: 11,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                entry.headword,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              if (entry.dialect.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  entry.dialect,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: brand.mutedInk, fontSize: 12),
                ),
              ],
              const SizedBox(height: 14),
              PronunciationButton(
                audioUrl: entry.audioUrl,
                onUnavailable: () => showPronunciationUnavailable(
                  context,
                  entry: entry,
                ),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                child: !_revealed
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Column(
                          children: [
                            Divider(color: brand.divider),
                            const SizedBox(height: 10),
                            Text(
                              entry.translation,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: brand.ink,
                                fontSize: 19,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (entry.partOfSpeech.isNotEmpty)
                              Text(
                                entry.partOfSpeech,
                                style: TextStyle(
                                  color: brand.mutedInk,
                                  fontSize: 12.5,
                                ),
                              ),
                            if (entry.example.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Text(
                                entry.example,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: brand.ink,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                              if (entry.exampleTranslation.isNotEmpty)
                                Text(
                                  entry.exampleTranslation,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: brand.mutedInk,
                                    fontSize: 12.5,
                                  ),
                                ),
                            ],
                          ],
                        ),
                      ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (!_revealed)
          FilledButton(
            key: const Key('review-reveal'),
            onPressed: () => setState(() => _revealed = true),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
            child: const Text('Show meaning'),
          )
        else
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  key: const Key('review-still-learning'),
                  onPressed: () => _answer(knew: false),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 50),
                  ),
                  child: const Text('Still learning'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  key: const Key('review-knew-it'),
                  onPressed: () => _answer(knew: true),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 50),
                  ),
                  child: const Text('Knew it'),
                ),
              ),
            ],
          ),
        const SizedBox(height: 14),
        Text(
          'Words come from the published dictionary. Knowing a word brings it back later; not knowing it brings it back today.',
          textAlign: TextAlign.center,
          style: TextStyle(color: brand.faintInk, fontSize: 11.5),
        ),
      ],
    );
  }
}
