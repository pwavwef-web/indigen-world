import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/entry_sense.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';

/// The several meanings of one word, laid out the way a dictionary lays them
/// out.
///
/// ── What this replaces ───────────────────────────────────────────────────
/// A single line reading "toy, plaything, small dog" with one example sentence
/// somewhere below it, belonging to none of the three. The sentence was the
/// part that suffered: a learner could see an example and had no way to know
/// which meaning it illustrated, which is most of what an example is for.
///
/// ── The layout, and why it is this one ───────────────────────────────────
/// Senses are numbered, and grouped by word class with the entry's own class
/// first. That is not decoration — it is the one convention every printed
/// dictionary shares, because it answers the question a reader actually has
/// ("is this the noun or the verb?") before they have to read a definition to
/// find out. A word with one class draws no class headings at all, so the
/// common entry is not made to look complicated to serve the rare one.
///
/// Each sense shows, in this order: its number and definition; the labels that
/// qualify it; the meaning said in Kasem; the note about when to say it; the
/// sentences; and the words it lives beside. Definition first and always,
/// because everything under it is a qualification of the definition, and a
/// reader who stops after the first line has still been told the thing they
/// came for.
class SenseList extends ConsumerWidget {
  const SenseList({required this.entry, super.key});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = entry.sensesByClass;
    if (groups.isEmpty) return const SizedBox.shrink();

    // Numbering runs across the whole entry rather than restarting inside each
    // class group. A learner citing "sense 3" means the third meaning of the
    // word, and a numbering that restarts at the verbs produces two senses
    // both called 1 on one screen.
    var number = 0;
    final showClassHeadings = groups.length > 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final group in groups) ...[
          if (showClassHeadings) ...[
            const SizedBox(height: 14),
            _ClassHeading(partOfSpeech: group.partOfSpeech),
          ],
          for (final sense in group.senses) ...[
            const SizedBox(height: 12),
            _SenseCard(
              entry: entry,
              sense: sense,
              number: ++number,
              // The number is drawn only when there is more than one meaning
              // to tell apart. A lone "1." above the only definition an entry
              // has is a list marker for a list of one.
              showNumber: entry.displaySenses.length > 1,
            ),
          ],
        ],
      ],
    );
  }
}

/// "As a thing", "As an action" — the word class heading over a group.
///
/// Said the way the paradigm cards say it rather than as a grammatical term.
/// The entry detail screen already heads its noun table "As a thing"; heading
/// the noun senses "Noun" two inches above it would be the same fact in two
/// vocabularies on one screen.
class _ClassHeading extends StatelessWidget {
  const _ClassHeading({required this.partOfSpeech});

  final String partOfSpeech;

  @override
  Widget build(BuildContext context) {
    final label = switch (partOfSpeech) {
      'noun' || 'proper-noun' => 'As a thing',
      'verb' || 'auxiliary-verb' => 'As an action',
      'adjective' => 'As a describing word',
      'adverb' => 'As a word about how',
      _ => partOfSpeechLabel(partOfSpeech),
    };
    if (label.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 2),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: context.brand.mutedInk,
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.9,
        ),
      ),
    );
  }
}

class _SenseCard extends ConsumerWidget {
  const _SenseCard({
    required this.entry,
    required this.sense,
    required this.number,
    required this.showNumber,
  });

  final DictionaryEntry entry;
  final EntrySense sense;
  final int number;
  final bool showNumber;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showNumber) ...[
                  // Excluded from semantics: a screen reader announcing
                  // "1 water 2 rain" runs the number into the meaning. The
                  // Semantics wrapper below says "Meaning 1 of 3" instead,
                  // which is the sentence a listener needs.
                  ExcludeSemantics(
                    child: Container(
                      margin: const EdgeInsets.only(right: 11, top: 2),
                      width: 22,
                      height: 22,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: brand.accent.withValues(alpha: 0.13),
                        borderRadius: BorderRadius.circular(7),
                      ),
                      child: Text(
                        '$number',
                        style: TextStyle(
                          color: brand.accent,
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                  ),
                ],
                Expanded(
                  child: Semantics(
                    label: showNumber
                        ? 'Meaning $number of ${entry.displaySenses.length}. '
                              '${sense.definition}'
                        : sense.definition,
                    excludeSemantics: true,
                    // Selectable for the same reason the headword is: copying a
                    // definition into a message is the ordinary use of it.
                    child: SelectableText(
                      sense.definition,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: brand.ink,
                        height: 1.32,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            // ── The labels that qualify the meaning ──────────────────────
            // Register and subject field, small and directly under the line
            // they qualify. "Not said in front of elders" is a fact about a
            // meaning rather than about a word, and putting it anywhere else
            // on the screen would attach it to the wrong one.
            if (sense.registerLabel.isNotEmpty || sense.domainLabel.isNotEmpty)
              Padding(
                padding: EdgeInsets.only(left: showNumber ? 33 : 0, top: 7),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (sense.registerLabel.isNotEmpty)
                      _SenseTag(
                        icon: Icons.record_voice_over_outlined,
                        label: sense.registerLabel,
                      ),
                    if (sense.domainLabel.isNotEmpty)
                      _SenseTag(
                        icon: Icons.category_outlined,
                        label: sense.domainLabel,
                      ),
                  ],
                ),
              ),
            Padding(
              padding: EdgeInsets.only(left: showNumber ? 33 : 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (sense.kasemDefinition.isNotEmpty)
                    _SenseNote(
                      icon: Icons.translate_rounded,
                      // Labelled rather than left bare, because a line of
                      // Kasem under a line of English is otherwise indistinguishable
                      // from an example sentence.
                      label: 'In Kasem',
                      body: sense.kasemDefinition,
                    ),
                  if (sense.usageNote.isNotEmpty)
                    _SenseNote(
                      icon: Icons.info_outline_rounded,
                      label: 'When it is used',
                      body: sense.usageNote,
                    ),
                  for (final example in sense.examples)
                    if (example.isNotEmpty) _SenseExampleLine(example: example),
                  if (sense.synonyms.isNotEmpty)
                    _CrossReferences(
                      label: 'Words that mean the same',
                      words: sense.synonyms,
                    ),
                  if (sense.antonyms.isNotEmpty)
                    _CrossReferences(
                      label: 'The opposite',
                      words: sense.antonyms,
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

/// A small qualifier chip — register, subject field.
class _SenseTag extends StatelessWidget {
  const _SenseTag({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 10, 4),
      decoration: BoxDecoration(
        color: brand.mutedInk.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: brand.mutedInk),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// A labelled line inside a sense — the Kasem gloss, the usage note.
class _SenseNote extends StatelessWidget {
  const _SenseNote({
    required this.icon,
    required this.label,
    required this.body,
  });

  final IconData icon;
  final String label;
  final String body;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2, right: 8),
            child: Icon(icon, size: 15, color: brand.mutedInk),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                SelectableText(
                  body,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 14,
                    height: 1.4,
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

/// One example sentence, under the meaning it illustrates.
///
/// The Kasem is set in the accent colour and the English under it in muted
/// ink, which is the same treatment the entry-level Example card gives them —
/// a sentence must not look like a different kind of thing depending on
/// whether the contributor attached it to a sense or to the entry.
///
/// A sentence with only one half renders that half alone. That is the ordinary
/// state of a contribution a reviewer has not finished with, and drawing an
/// empty second line for it would suggest something is missing from the data
/// rather than from the translation.
class _SenseExampleLine extends StatelessWidget {
  const _SenseExampleLine({required this.example});

  final SenseExample example;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(11, 9, 11, 10),
        decoration: BoxDecoration(
          color: brand.accent.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border(
            left: BorderSide(
              color: brand.accent.withValues(alpha: 0.45),
              width: 2.5,
            ),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (example.kasem.isNotEmpty)
              SelectableText(
                example.kasem,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 14.5,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
            if (example.english.isNotEmpty) ...[
              if (example.kasem.isNotEmpty) const SizedBox(height: 3),
              Text(
                example.english,
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 13.5,
                  height: 1.35,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Synonyms or opposites, as chips that open the entry where there is one.
///
/// ── Why some are tappable and some are not ──────────────────────────────
/// Because a cross-reference is recorded as a word rather than as an entry id
/// — see [dictionaryEntryIdsByHeadwordProvider] for why — and most of the
/// words a speaker offers as synonyms have no entry yet. A chip that opens
/// nothing is worse than plain text, so the resolved ones become buttons and
/// the rest stay text. The difference is visible: an outline and a chevron on
/// the ones that go somewhere.
class _CrossReferences extends ConsumerWidget {
  const _CrossReferences({required this.label, required this.words});

  final String label;
  final List<String> words;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final ids = ref.watch(dictionaryEntryIdsByHeadwordProvider);
    return Padding(
      padding: const EdgeInsets.only(top: 11),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              for (final word in words)
                _CrossReferenceChip(
                  word: word,
                  entryId: ids[headwordKey(word)],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CrossReferenceChip extends StatelessWidget {
  const _CrossReferenceChip({required this.word, required this.entryId});

  final String word;
  final String? entryId;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final resolved = entryId != null;
    final chip = Container(
      padding: EdgeInsets.fromLTRB(10, 5, resolved ? 6 : 10, 5),
      decoration: BoxDecoration(
        color: resolved
            ? brand.accent.withValues(alpha: 0.08)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: resolved
              ? brand.accent.withValues(alpha: 0.4)
              : brand.mutedInk.withValues(alpha: 0.22),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            word,
            style: TextStyle(
              color: resolved ? brand.accent : brand.mutedInk,
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (resolved)
            Icon(Icons.chevron_right_rounded, size: 16, color: brand.accent),
        ],
      ),
    );
    if (!resolved) {
      return Semantics(
        label: '$word. Not yet in the dictionary.',
        excludeSemantics: true,
        child: chip,
      );
    }
    return Semantics(
      button: true,
      label: 'Open the entry for $word',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => context.push('/entry/$entryId'),
        child: chip,
      ),
    );
  }
}
