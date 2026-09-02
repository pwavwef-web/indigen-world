import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/sentence_credit.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The published dictionary, arranged so a single word can be found in it.
///
/// The project has two halves that never met: a dictionary somebody is
/// building, and a community writing Kasem in it every day. This is the join.
/// Every word in a post that the dictionary already knows becomes something a
/// learner can tap — which turns the timeline itself into reading practice,
/// and turns the dictionary from a place you have to go into something that
/// comes to you.
///
/// Keyed by [normaliseWord] so `Zaanem,` in a sentence finds `zaanem` in the
/// dictionary. A headword of several words is indexed whole *and* by each of
/// its parts, because a reader tapping one word of a phrase is asking about
/// the phrase.
final dictionaryIndexProvider = Provider<Map<String, DictionaryEntry>>((ref) {
  final entries =
      ref.watch(publishedDictionaryEntriesProvider).asData?.value ??
      const <DictionaryEntry>[];
  final index = <String, DictionaryEntry>{};
  for (final entry in entries) {
    final headword = normaliseWord(entry.headword);
    if (headword.isEmpty) continue;
    index[headword] = entry;
    if (!headword.contains(' ')) continue;
    for (final part in headword.split(' ')) {
      // Whole headwords win: a one-word entry must never be shadowed by a
      // fragment of a longer one.
      if (part.length > 1) index.putIfAbsent(part, () => entry);
    }
  }
  return Map.unmodifiable(index);
});

/// One entry, the same for everybody, for the whole of one day.
///
/// Chosen by the date rather than at random so that two members looking at the
/// app in the same room see the same word, and so that closing and reopening
/// the app does not reroll it. It walks the list as the days pass, which means
/// a growing dictionary is gradually shown in full rather than circling the
/// same handful of entries.
final wordOfTheDayProvider = Provider<DictionaryEntry?>((ref) {
  final entries =
      ref.watch(publishedDictionaryEntriesProvider).asData?.value ??
      const <DictionaryEntry>[];
  if (entries.isEmpty) return null;
  final today = DateTime.now();
  final day = DateTime(
    today.year,
    today.month,
    today.day,
  ).difference(DateTime(2020)).inDays;
  return entries[day.abs() % entries.length];
});

/// The comparable form of a word: no case, no punctuation hanging off either
/// end, no double spacing.
String normaliseWord(String raw) => raw
    .toLowerCase()
    .replaceAll(_edgePunctuation, '')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

final _edgePunctuation = RegExp(
  r'''^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$''',
  unicode: true,
);

/// Every run of letters in a piece of writing, with where it starts.
///
/// Marks are part of a word (`ɛ̀` is one letter with one accent on it), and so
/// is an apostrophe inside one. Everything else is a boundary.
final wordPattern = RegExp(r"[\p{L}\p{M}][\p{L}\p{M}'’-]*", unicode: true);

/// The word card: what it means, how it is said, and a way to hear it.
///
/// Deliberately a card rather than a page. Somebody who taps a word in the
/// middle of a post is still reading the post, and pushing a whole screen over
/// it costs them their place. Anyone who wants the full entry can say so.
Future<void> showWordLookup(BuildContext context, DictionaryEntry entry) =>
    showGlassPopup<void>(
      context: context,
      title: entry.headword,
      subtitle: [
        // Through the label helper, so a class the app does not recognise shows
        // as itself rather than being quietly dropped from the line.
        if (partOfSpeechLabel(entry.partOfSpeech).isNotEmpty)
          partOfSpeechLabel(entry.partOfSpeech),
        if (entry.dialect.isNotEmpty) entry.dialect,
      ].join(' · '),
      builder: (popupContext) => _WordLookupBody(entry: entry),
    );

class _WordLookupBody extends StatelessWidget {
  const _WordLookupBody({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // The card is deliberately small — somebody tapped a word in
                  // the middle of a post and is still reading it — but a word
                  // with three senses has three senses here too. Numbering them
                  // costs two lines and is the difference between a lookup that
                  // answers the question and one that answers a third of it.
                  TranslationList(entry: entry),
                  if (entry.pronunciation.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      entry.pronunciation,
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 13.5,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            PronunciationButton(audioUrl: entry.audioUrl),
          ],
        ),
        if (entry.example.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: brand.surfaceMuted,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: brand.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.example,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                  ),
                ),
                if (entry.exampleTranslation.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    entry.exampleTranslation,
                    style: TextStyle(color: brand.mutedInk, fontSize: 13),
                  ),
                ],
                // Inside the quotation box, under the sentence it credits.
                // Renders nothing where no credit is owed — see
                // [SentenceCredit], which treats that as the licence condition
                // it is rather than as an empty state.
                SentenceCredit(entry: entry),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () {
              // Taken before the card closes: the context that built the
              // button belongs to a route that is about to stop existing.
              final navigator = Navigator.of(context);
              navigator.pop();
              navigator.push(
                MaterialPageRoute<void>(
                  builder: (context) =>
                      EntryDetailScreen(entryId: entry.id, entry: entry),
                ),
              );
            },
            icon: const Icon(Icons.menu_book_rounded),
            label: const Text('Open the full entry'),
          ),
        ),
      ],
    );
  }
}
