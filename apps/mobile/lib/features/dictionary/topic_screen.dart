import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/entry_sense.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/language_loop_analytics.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/queue_lookup.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/help_add_word.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_search.dart';
import 'package:indigen_world_mobile/features/dictionary/result_row.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The dictionary by subject: Farming and land, Food and cooking, Family and
/// kinship and the rest of the closed list reviewers file senses under.
///
/// A topic page is two lists and a question. What the dictionary has verified
/// under the topic; the English words people have asked for under it and
/// nobody has answered yet; and "is a word missing?", which puts one on the
/// second list. Every word on the second list opens the same queue item a
/// search for it would — the queue id is the word's, not the page's.

/// The published entries with at least one sense filed under [topicId].
List<DictionaryEntry> entriesForTopic(
  List<DictionaryEntry> entries,
  String topicId,
) => [
  for (final entry in entries)
    if (entry.senses.any((sense) => sense.domain == topicId)) entry,
];

/// Open words people asked for under a topic.
final topicAskedWordsProvider = FutureProvider.autoDispose
    .family<List<QueueWord>, String>((ref, topicId) async {
      final lookup = ref.watch(queueLookupProvider);
      if (lookup == null) return const <QueueWord>[];
      return lookup.openForTopic(topicId);
    });

/// Every topic, as a strip of chips above the dictionary's alphabetical list.
class DictionaryTopicsStrip extends StatelessWidget {
  const DictionaryTopicsStrip({super.key});

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 44,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 4),
      itemCount: kSenseDomains.length,
      separatorBuilder: (_, _) => const SizedBox(width: 8),
      itemBuilder: (context, index) {
        final topic = kSenseDomains[index];
        return GlassPill(
          label: topic.label,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) => TopicScreen(topicId: topic.id),
            ),
          ),
        );
      },
    ),
  );
}

class TopicScreen extends ConsumerStatefulWidget {
  const TopicScreen({required this.topicId, super.key});

  final String topicId;

  @override
  ConsumerState<TopicScreen> createState() => _TopicScreenState();
}

class _TopicScreenState extends ConsumerState<TopicScreen> {
  final _missing = TextEditingController();

  @override
  void dispose() {
    _missing.dispose();
    super.dispose();
  }

  String get _label {
    final label = senseDomainLabel(widget.topicId);
    return label.isEmpty ? widget.topicId : label;
  }

  Future<void> _addMissing() async {
    final typed = _missing.text;
    if (!isQueueableEnglish(typed)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Type one English word, or a short phrase of up to three words.',
          ),
        ),
      );
      return;
    }
    final opened = await openHelpAddWord(
      context,
      ref,
      english: typed,
      source: HelpAddSource.topic,
      topic: widget.topicId,
    );
    if (opened && mounted) {
      _missing.clear();
      ref.invalidate(topicAskedWordsProvider(widget.topicId));
    }
  }

  void _openAsked(QueueWord word) {
    ref
        .read(loopAnalyticsProvider)
        .log(
          LoopEvent.promptOpen,
          parameters: loopParameters({
            'origin': 'topic',
            'word_id': word.id,
            'word': word.word,
            'topic': widget.topicId,
          }),
        );
    context.push('/contribute/word/${word.id}?origin=topic');
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final entries = ref.watch(publishedDictionaryEntriesProvider);
    final counts = ref.watch(dictionaryHeadwordCountsProvider);
    final asked = ref.watch(topicAskedWordsProvider(widget.topicId));
    final verified = entriesForTopic(
      entries.asData?.value ?? const <DictionaryEntry>[],
      widget.topicId,
    );

    Widget heading(String text) => Padding(
      padding: const EdgeInsets.fromLTRB(2, 22, 2, 10),
      child: Text(
        text,
        style: TextStyle(
          color: brand.terracotta,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.1,
        ),
      ),
    );
    Widget note(String text) => Text(
      text,
      style: TextStyle(color: brand.mutedInk, fontSize: 12.5, height: 1.45),
    );

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(title: Text(_label)),
      body: ScreenContainer(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 6, 18, 36),
          children: [
            note(
              'Words about ${_label.toLowerCase()} that the dictionary has '
              'verified, and the ones people are still asking for.',
            ),
            heading(
              verified.isEmpty
                  ? 'IN THE DICTIONARY'
                  : 'IN THE DICTIONARY · ${verified.length}',
            ),
            if (entries.isLoading && !entries.hasValue)
              const Center(child: CircularProgressIndicator())
            else if (verified.isEmpty)
              note(
                'No verified words are filed under this topic yet. Reviewers '
                'file each meaning of a word under a topic as they check it.',
              )
            else
              for (final entry in verified)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: DictionaryResultRow(
                    hit: DictionaryHit(entry: entry, rank: 0),
                    siblings: counts[headwordKey(entry.headword)] ?? 1,
                  ),
                ),
            heading('PEOPLE ARE ASKING FOR'),
            switch (asked) {
              AsyncData(:final value) when value.isEmpty => note(
                'Nobody has asked for a word under this topic yet.',
              ),
              AsyncData(:final value) => Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final word in value)
                    ActionChip(
                      avatar: const Icon(Icons.add_comment_outlined, size: 16),
                      label: Text(word.word),
                      tooltip: 'Answer “${word.word}”',
                      onPressed: () => _openAsked(word),
                    ),
                ],
              ),
              AsyncError() => note(
                'The words people asked for could not be loaded. Check your '
                'connection.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
            heading('IS A WORD MISSING?'),
            GlassSurface(
              blur: false,
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  note(
                    'Type the English word. It joins the queue under this '
                    'topic, and you can answer it straight away if you know it.',
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _missing,
                    textInputAction: TextInputAction.go,
                    onSubmitted: (_) => _addMissing(),
                    decoration: const InputDecoration(
                      labelText: 'English word',
                      hintText: 'For example: granary',
                      prefixIcon: Icon(Icons.edit_note_rounded),
                    ),
                  ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: _addMissing,
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Help add it'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
