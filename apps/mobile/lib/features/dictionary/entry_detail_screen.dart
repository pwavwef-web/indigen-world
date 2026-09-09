import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/data/dictionary_admin.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_editor_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/sense_list.dart';
import 'package:indigen_world_mobile/features/dictionary/sentence_credit.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:just_audio/just_audio.dart';

class EntryDetailScreen extends ConsumerWidget {
  const EntryDetailScreen({required this.entryId, this.entry, super.key});

  final String entryId;
  final DictionaryEntry? entry;

  /// The headword as it should be drawn and as it should be spoken.
  static HomographDisplay _headword(DictionaryEntry entry, int siblings) =>
      homographDisplay(
        entry.headword,
        homographIndex: entry.homographIndex,
        siblingCount: siblings,
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ── The live document always wins ────────────────────────────────
    // This used to consult a bundle of four synthetic demo entries FIRST and
    // only fall through to Firestore when that missed, so `/entry/demo-water`
    // resolved to invented vocabulary in preference to any real published
    // document. The demo bundle is gone; what remains is the ordering lesson.
    //
    // An entry handed in by a caller is a first paint, not an answer. Every
    // live caller already holds a row from the same stream, so passing it
    // avoids a spinner on a screen that is about to show the same thing — but
    // watching the document as well is what makes a word that has since been
    // corrected, gained a recording, or been unpublished stop rendering from
    // whatever the caller happened to be holding.
    final liveEntry = ref.watch(publishedDictionaryEntryProvider(entryId));
    final resolvedEntry = liveEntry.asData?.value ?? entry;
    if (resolvedEntry == null && liveEntry.isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Opening entry')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (resolvedEntry == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Entry unavailable')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'This published entry could not be loaded.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: () =>
                      ref.invalidate(publishedDictionaryEntryProvider(entryId)),
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // ── A word that was folded into another one ──────────────────────────
    // The document is still here precisely so this can happen: a saved word or
    // a shared link naming the duplicate leads to the word it became rather
    // than to a missing page. Drawn instead of the entry, not above it — the
    // content on a retired row is a copy of what is on the row it points at,
    // and showing both invites a reader to cite the one that is going away.
    if (resolvedEntry.mergedIntoId.isNotEmpty) {
      return _MergedAwayScreen(entry: resolvedEntry);
    }

    // How many published entries share this spelling. Decides whether the
    // sense number is drawn at all — see `kasem_homographs.dart`.
    final siblings = dictionarySiblingCount(ref, resolvedEntry.headword);
    final culturalNote = resolvedEntry.culturalNote;

    final savedIds =
        ref.watch(savedEntryIdsProvider).asData?.value ?? const <String>{};
    final isSaved = savedIds.contains(resolvedEntry.id);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dictionary entry'),
        actions: [
          // ── The correction path for somebody who may take it ────────────
          // Offered only to the roles the callable will accept. A pencil that
          // always ends in "validator access is required" teaches a member
          // that the app is broken rather than that the action is not theirs.
          if (ref.watch(canEditDictionaryProvider))
            IconButton(
              tooltip: 'Edit this entry',
              onPressed: () => Navigator.of(context).push<bool>(
                MaterialPageRoute(
                  builder: (_) => EntryEditorScreen(entry: resolvedEntry),
                ),
              ),
              icon: const Icon(Icons.edit_rounded),
            ),
          IconButton(
            tooltip: isSaved ? 'Remove from saved words' : 'Save word',
            onPressed: () async {
              final saved = await ref
                  .read(savedEntryRepositoryProvider)
                  .toggle(resolvedEntry.id);
              ref.invalidate(savedEntryIdsProvider);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      saved
                          ? 'Saved on this device.'
                          : 'Removed from saved words.',
                    ),
                  ),
                );
              }
            },
            icon: Icon(
              isSaved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
            ),
          ),
        ],
      ),
      body: ScreenContainer(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Row(
              children: [
                // Withdrawn entries reach this screen now, because staff read
                // the document directly and a validator has to be able to see
                // what they are putting back. Saying "PUBLISHED ENTRY" over one
                // would be the screen asserting the opposite of the truth.
                StatusPill(
                  icon: resolvedEntry.isPublished
                      ? Icons.verified_outlined
                      : Icons.visibility_off_outlined,
                  label: resolvedEntry.isPublished
                      ? 'PUBLISHED ENTRY'
                      : 'NOT PUBLISHED',
                  color: resolvedEntry.isPublished
                      ? context.brand.success
                      : context.brand.mutedInk,
                ),
                const SizedBox(width: 12),
                // Whatever the entry says its class is, rendered as itself when
                // this app has never heard of it. See [partOfSpeechLabel]; an
                // `ideophone` must not become a shrug on the way to the screen.
                //
                // Expanded rather than the Spacer that used to sit here: the
                // list this label is drawn from now runs to twenty-five entries
                // and "Auxiliary verb" beside a pill on a narrow phone was an
                // overflow waiting to be reported as a rendering bug.
                Expanded(
                  child: Text(
                    partOfSpeechLabel(resolvedEntry.partOfSpeech),
                    textAlign: TextAlign.end,
                    style: TextStyle(
                      color: context.brand.mutedInk,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            // ── The headword, with its sense number where one is owed ────
            // 478 of the 1200 published entries share a spelling with another
            // entry — eight are headed `ni`, eight `dɩ` — and until now this
            // line was the same string on every one of them. A learner who
            // arrived from a search, or from a link somebody sent them, had no
            // way to tell which of the eight they were reading.
            //
            // Selectable, because the one thing somebody reliably wants from a
            // dictionary entry is to copy the word, and every string on this
            // screen used to be an inert `Text`. The number is deliberately
            // outside the selection: `SelectableText` copies what it shows, and
            // `dɩ²` pasted into a message is not a word.
            Semantics(
              label: _headword(resolvedEntry, siblings).spoken,
              excludeSemantics: true,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Flexible(
                    child: SelectableText(
                      resolvedEntry.headword,
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                  ),
                  if (_headword(resolvedEntry, siblings).numbered)
                    Padding(
                      padding: const EdgeInsets.only(left: 2, top: 4),
                      child: Text(
                        superscript(resolvedEntry.homographIndex),
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(color: context.brand.accent),
                      ),
                    ),
                ],
              ),
            ),
            // Which of the several words under this spelling this one is, said
            // in words. The superscript alone is a convention a learner may
            // never have met, and a reader who does not know it reads a stray
            // digit rather than a signpost.
            if (_headword(resolvedEntry, siblings).numbered) ...[
              const SizedBox(height: 4),
              Text(
                'Sense ${resolvedEntry.homographIndex} of $siblings words '
                'written “${resolvedEntry.headword}”. They are different '
                'words, not different meanings of one word.',
                style: TextStyle(
                  color: context.brand.mutedInk,
                  fontSize: 12.5,
                  height: 1.4,
                ),
              ),
            ],
            // The other Kasem words a contributor gave for the same meaning.
            // The headword is one of several answers, not the only one, and a
            // learner who hears `nyu` and finds an entry filed under `nia`
            // needs to be told here that they are the same word — otherwise
            // the second and third answers somebody typed exist only in the
            // database.
            if (resolvedEntry.furtherRenderings.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Also: ${resolvedEntry.furtherRenderings.join(' · ')}',
                style: TextStyle(
                  color: context.brand.accent,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            const SizedBox(height: 8),
            // One meaning renders exactly the line it always rendered. Several
            // are numbered, in the order the contributor gave them, with the
            // first still set in the type the single one had — this is the
            // screen a member came to for the whole entry, so it is the one
            // place that shows all of it rather than a count.
            // The headline gloss. On an entry with structured senses this is
            // the summary line — every meaning in one place, which is what a
            // reader glancing at the top of the entry wants — and the numbered
            // senses below carry the detail.
            TranslationList(
              entry: resolvedEntry,
              primaryStyle: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(color: context.brand.terracotta),
            ),
            // -- The several things this word means ----------------------
            // Directly under the summary line and above everything else,
            // because it is the entry. The paradigm, the etymology and the
            // rights block are all facts ABOUT the word; this is what the word
            // means, and a reader who came to find that out should not have to
            // scroll past a conjugation table to reach it.
            //
            // Drawn only when a contributor actually separated the meanings.
            // A legacy entry with three comma-separated glosses is already
            // rendered above, and drawing it again as one numbered card would
            // print the same three words twice on one screen.
            if (resolvedEntry.hasStructuredSenses)
              SenseList(entry: resolvedEntry),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                // The dialect chip is drawn only when a dialect is actually
                // recorded. The reader's fallback for an entry with none used
                // to be the literal string 'Kasem', which put a pin icon
                // labelled Kasem directly beside a globe icon labelled Kasem
                // on every such entry.
                if (resolvedEntry.dialect.isNotEmpty &&
                    resolvedEntry.dialect.toLowerCase() != 'kasem')
                  Chip(
                    avatar: const Icon(Icons.location_on_outlined, size: 18),
                    label: Text(resolvedEntry.dialect),
                  ),
                const Chip(
                  avatar: Icon(Icons.language_rounded, size: 18),
                  label: Text('Kasem'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            // ── Cards appear when there is something in them ─────────────
            // Every one of these used to render unconditionally, because the
            // reader filled the empty fields with sentences describing their
            // own emptiness — 'No written guide yet', 'No example yet' — and
            // a non-empty string passes every guard. So an entry with no
            // recording and no sentence drew a card headed Pronunciation
            // containing an apology, and below it a card headed Example
            // containing two more.
            //
            // The fields are honestly empty now (see `collection_data.dart`),
            // which is what lets these guards mean something. An entry with
            // nothing recorded is shorter, rather than padded with prose about
            // what it does not have.
            // ── How it is said ───────────────────────────────────────────
            // The recording, the transcription and the written guide are one
            // card because they are one question. A learner wants to know how
            // to say the word; which of the three answers the entry happens to
            // carry is an accident of who contributed it.
            if (resolvedEntry.pronunciation.isNotEmpty ||
                resolvedEntry.audioUrl.isNotEmpty ||
                resolvedEntry.ipaDisplay != null)
              _PronunciationCard(entry: resolvedEntry),
            // ── What it means, in Kasem ──────────────────────────────────
            // Directly under the English, and deliberately not further down
            // among the notes. A dictionary that explains Kasem only in
            // English treats English as the language you think in; putting the
            // Kasem gloss below "Source and rights" would say the same thing
            // more quietly.
            // Suppressed once the senses carry their own Kasem gloss: on a
            // single-sense entry `displaySenses` lifts this very string into
            // the sense above, so drawing the card as well would print it
            // twice, six lines apart, under two different headings.
            if (resolvedEntry.kasemDefinition.isNotEmpty &&
                !resolvedEntry.hasStructuredSenses) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.translate_rounded,
                title: 'In Kasem',
                body: resolvedEntry.kasemDefinition,
              ),
            ],
            // ── The forms this word takes ────────────────────────────────
            // Grammar shown where a learner already is, rather than on a
            // grammar screen they would have to decide to visit. A word that
            // is both a noun and a verb draws both tables — which is the whole
            // reason the paradigm is one flat map rather than a noun object
            // beside a verb object.
            if (resolvedEntry.hasNounParadigm) ...[
              const SizedBox(height: 12),
              _ParadigmCard(
                icon: Icons.account_tree_outlined,
                title: 'As a thing',
                rows: resolvedEntry.nounForms,
                footer: _ConcordNote(entry: resolvedEntry),
              ),
            ],
            if (resolvedEntry.verbForms.isNotEmpty) ...[
              const SizedBox(height: 12),
              _ParadigmCard(
                icon: Icons.schedule_rounded,
                title: 'As an action',
                rows: resolvedEntry.verbForms,
              ),
            ],
            // ── The words that change with what they go with ─────────────
            // An adjective, a quantifier, a numeral, a determiner or a pronoun
            // takes its form from the noun beside it. Two recorded uses is
            // what a learner needs in order to see that happen — a single
            // example looks like a sentence rather than a pattern.
            if (resolvedEntry.agreementForms.isNotEmpty) ...[
              const SizedBox(height: 12),
              _ParadigmCard(
                icon: Icons.compare_arrows_rounded,
                title: 'Changes with the word it goes with',
                rows: resolvedEntry.agreementForms,
                footer: const _AgreementNote(),
              ),
            ],
            // ── The other lives this word leads ──────────────────────────
            // Said in a sentence rather than as a row of class names: "also
            // used as a verb" is a fact about the word, and `verb` on its own
            // in a chip is a label a learner has to decode.
            if (_alsoUsedAsLine(resolvedEntry) case final line?) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.alt_route_rounded,
                title: 'Also used as',
                body: line,
              ),
            ],
            if (resolvedEntry.etymology.isNotEmpty) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.history_edu_outlined,
                title: 'Where it comes from',
                body: resolvedEntry.etymology,
              ),
            ],
            // -- Only where the sentence has nowhere better to be ---------
            // A modern entry prints each sentence under the meaning it
            // illustrates, which is the whole point of attaching it to a
            // sense. Printing the first one again down here would leave a
            // reader working out which of four meanings it belonged to -- the
            // exact confusion senses were added to remove.
            //
            // The guard asks whether any SENSE carries an example rather than
            // whether the entry has structured senses at all, because a
            // contributor may well give three meanings and hang the one
            // sentence they have off the entry instead. That sentence still
            // deserves to be shown.
            if (resolvedEntry.example.isNotEmpty &&
                !resolvedEntry.hasSenseExamples) ...[
            const SizedBox(height: 12),
            _DetailCard(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Example',
              body: [
                resolvedEntry.example,
                resolvedEntry.exampleTranslation,
              ].where((line) => line.isNotEmpty).join('\n'),
              // Directly beneath the sentence, not in "Source and rights"
              // below. A CC BY credit belongs next to the thing it credits;
              // moving it to a rights block further down would be the same
              // information in the one place a reader has already decided not
              // to look. Renders nothing at all when no credit is owed.
              footer: SentenceCredit(entry: resolvedEntry),
            ),
            ],
            if (culturalNote != null) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.auto_stories_outlined,
                title: 'Cultural context',
                body: culturalNote,
              ),
            ],
            const SizedBox(height: 12),
            _DetailCard(
              icon: Icons.gavel_outlined,
              title: 'Source and rights',
              body: resolvedEntry.attribution,
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () => context.push(
                // `category` is named explicitly. Contribute now opens on a
                // hub unless a link says what it is for, and somebody who
                // pressed "suggest a correction" on a word has already said.
                //
                // The first meaning, not the whole list: the form's source box
                // holds one English word, and pre-filling it with "bottle,
                // flask" would have a member correcting the prompt before they
                // could answer it.
                '/contribute?category=dictionary'
                '&source=${Uri.encodeQueryComponent(resolvedEntry.primaryTranslation)}'
                '&entryId=${resolvedEntry.id}',
              ),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Suggest a correction'),
            ),
          ],
        ),
      ),
    );
  }

}

/// Where a word went when two entries for it were folded into one.
///
/// ── Why this screen exists at all ─────────────────────────────────────────
/// Merging could have deleted the duplicate, and the archive would be tidier
/// for it. What that tidiness costs is every pointer at the id: a member's
/// saved word, a link somebody sent in a message, a Kawuri answer that cited
/// the entry, a note a learner wrote. None of those can be found and updated,
/// and all of them would lead to "this entry could not be loaded" — which
/// reads as *the dictionary lost this word*, not as *these were one word all
/// along*.
///
/// So the duplicate stays, unpublished, holding a forwarding address, and this
/// is the page at the end of the old link. It is short on purpose: the reader
/// asked for a word, and the answer is one tap away.
class _MergedAwayScreen extends ConsumerWidget {
  const _MergedAwayScreen({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final target = ref.watch(
      publishedDictionaryEntryProvider(entry.mergedIntoId),
    ).asData?.value;
    return Scaffold(
      appBar: AppBar(title: const Text('Dictionary entry')),
      body: ScreenContainer(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.merge_rounded,
                  size: 40,
                  color: context.brand.accent,
                ),
                const SizedBox(height: 14),
                Text(
                  '“${entry.headword}” is now part of another entry.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  'The dictionary held two entries for this word, and a '
                  'reviewer folded them together. Everything both of them said '
                  'is on the entry below.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontSize: 13,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () =>
                      context.push('/entry/${entry.mergedIntoId}'),
                  icon: const Icon(Icons.arrow_forward_rounded),
                  // The word it became, once it has loaded. Named rather than
                  // "Open the entry", because a reader following a link they
                  // half remember wants to see that it is the word they meant
                  // before they tap again.
                  label: Text(
                    target == null
                        ? 'Open the entry it became'
                        : 'Open “${target.headword}”',
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

/// "Also used as a verb", or null when the entry claims only one class.
///
/// Written as a sentence rather than a row of class ids. `verb` in a chip is a
/// label a learner has to decode; "This word is also used as a verb" is the
/// thing the chip was standing in for, and it costs one line.
String? _alsoUsedAsLine(DictionaryEntry entry) {
  final others = entry.alsoUsedAs
      .map(partOfSpeechLabel)
      .where((label) => label.trim().isNotEmpty)
      .map((label) => label.toLowerCase())
      .toList();
  if (others.isEmpty) return null;
  final list = others.length == 1
      ? others.single
      : '${others.sublist(0, others.length - 1).join(', ')} and ${others.last}';
  return 'This word is also used as ${_article(list)}$list. '
      'The forms above cover every way it is used.';
}

/// "a" or "an", picked on the sound the label starts with.
///
/// Only ever sees the two dozen class labels, all of which start with an
/// ordinary consonant or vowel, so the naive rule is exactly right here and
/// the general problem it fails at cannot arise.
String _article(String word) =>
    'aeiou'.contains(word.isEmpty ? 'x' : word[0]) ? 'an ' : 'a ';

/// How the word is said: the recording, the transcription, the written guide.
///
/// One card for all three because they are one question. Which of them an
/// entry carries is an accident of who contributed it, and three separate
/// cards would make a well-documented word look like three unrelated facts.
///
/// ── The transcription sits above the prose guide ─────────────────────────
/// A learner who reads IPA gets an exact answer from one line; a learner who
/// does not skips it and reads the sentence underneath. Putting the prose
/// first would make the reader who came for the transcription hunt for it.
class _PronunciationCard extends StatelessWidget {
  const _PronunciationCard({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final ipa = entry.ipaDisplay;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.volume_up_outlined, color: brand.accent),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'How it is said',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (ipa != null) ...[
                    const SizedBox(height: 7),
                    // Selectable for the same reason the headword is: somebody
                    // copying a transcription into their notes is the ordinary
                    // use of this line, and an inert `Text` refuses it.
                    SelectableText(
                      ipa,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 16,
                        color: brand.ink,
                        height: 1.3,
                      ),
                      // A screen reader saying "slash b a k e slash" helps
                      // nobody. It is told what the line is instead.
                      semanticsLabel: 'Written in the phonetic alphabet',
                    ),
                  ],
                  if (entry.pronunciation.isNotEmpty) ...[
                    const SizedBox(height: 7),
                    Text(entry.pronunciation),
                  ],
                  // Only when the card would otherwise be a heading with a
                  // play button and nothing between them.
                  if (ipa == null && entry.pronunciation.isEmpty) ...[
                    const SizedBox(height: 7),
                    Text(
                      'Recorded by a speaker. No written guide yet.',
                      style: TextStyle(color: brand.mutedInk),
                    ),
                  ],
                ],
              ),
            ),
            PronunciationButton(audioUrl: entry.audioUrl),
          ],
        ),
      ),
    );
  }
}

/// A paradigm, laid out as label-and-form rows.
///
/// ── Why a table and not the run-on line this replaced ────────────────────
/// The forms used to be joined with newlines into one string — "With “the”:
/// bukam\nMany: buga" — which is a table drawn with a colon. At three rows it
/// was tolerable; at six it is a paragraph a reader has to parse, and the one
/// thing somebody scanning a paradigm does is run their eye down the *forms*
/// column, which a run-on line does not have.
///
/// The forms are selectable and the labels are not. Copying "the boy" out of a
/// dictionary is an ordinary thing to want; copying the word "Many" is not.
class _ParadigmCard extends StatelessWidget {
  const _ParadigmCard({
    required this.icon,
    required this.title,
    required this.rows,
    this.footer,
  });

  final IconData icon;
  final String title;
  final List<({String label, String form})> rows;

  /// Sits under the table, inside the card. What the forms are evidence *of*
  /// belongs with them rather than in a card of its own — see [_ConcordNote].
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: brand.accent),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 9),
                  for (final row in rows) ...[
                    Semantics(
                      // One label per row, so a screen reader reads
                      // "The one, bukam" rather than two unrelated fragments
                      // it has to associate by position.
                      label: '${row.label}, ${row.form}',
                      excludeSemantics: true,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 108,
                              child: Text(
                                row.label,
                                style: TextStyle(
                                  color: brand.mutedInk,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  height: 1.45,
                                ),
                              ),
                            ),
                            Expanded(
                              child: SelectableText(
                                row.form,
                                style: TextStyle(
                                  color: brand.ink,
                                  fontSize: 15,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  ?footer,
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// What the recorded forms show about concord, stated as observation.
///
/// ── Read the wording before changing it ──────────────────────────────────
/// This says *"counted with `yalei`"*, not *"belongs to the ya class"*, and
/// the difference is the difference between a record and a claim. Six forms of
/// *two* are attested — balei, yalei, nlei, selei, telei, delei — and which
/// noun takes which is exactly what nobody has established. Harvesting a fully
/// glossed chapter of Genesis produced one noun observed with both an article
/// and a numeral in seventy clauses, which is why these forms are collected
/// from speakers directly and why the entry reports them rather than
/// concluding from them.
///
/// The correspondence between the article and the numeral prefix — `da yam`
/// "the days" beside `da yalei` "two days", the same `ya` twice — is a live
/// hypothesis with one direct observation behind it. It is falsifiable, and a
/// screen that quietly turned two forms into a class would be the thing that
/// stopped anybody being able to falsify it.
///
/// Renders nothing when neither form yielded a match, which is the common
/// case. Nothing, not a hedge: an entry that says "class not established" on
/// every row teaches a reader to stop reading the line.
class _ConcordNote extends StatelessWidget {
  const _ConcordNote({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) {
    final article = entry.article;
    final numeral = entry.numeral;
    if (article == null && numeral == null) return const SizedBox.shrink();

    final parts = <String>[
      if (article != null) 'takes “$article” for “the”',
      if (numeral != null) 'counts with “${numeral.form}”',
    ];
    // Said only when both halves are present and agree. One form alone is an
    // ending; two that carry the same marker are the pair this collection
    // exists to gather, and saying so is what tells a contributor their second
    // answer was worth typing.
    final agrees = article != null &&
        numeral != null &&
        numeral.prefix.isNotEmpty &&
        article.startsWith(numeral.prefix);

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        '${parts.join(' and ')}${agrees ? ' — the same marker both times' : ''}. '
        'Read from the forms above, as recorded.',
        style: TextStyle(
          color: context.brand.faintInk,
          fontSize: 11.5,
          height: 1.45,
        ),
      ),
    );
  }
}

/// What two recorded uses of an agreeing word do and do not show.
///
/// ── The wording is the whole point ───────────────────────────────────────
/// It says these are *uses somebody recorded*, not cells in a paradigm. Which
/// cells exist — how many forms this word has, what picks between them — is
/// exactly what nobody has established, and a card that quietly implied a
/// two-cell system would be inventing one. See `AGREEING_CLASSES` in
/// `kasem-morphology.ts`.
class _AgreementNote extends StatelessWidget {
  const _AgreementNote();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Text(
      'Two uses a speaker recorded. There may well be more forms than these '
      'two — which ones a word has, and what picks between them, has not been '
      'established for Kasem yet.',
      style: TextStyle(
        color: context.brand.faintInk,
        fontSize: 11.5,
        height: 1.45,
      ),
    ),
  );
}

/// The play button beside a word's pronunciation.
///
/// It has been a stub since the dictionary shipped — the entry carried no
/// recording, so the button apologised for itself. Entries can now be
/// contributed with the word actually said aloud, reviewed like everything
/// else, and published with a world-readable audio URL, so the button has
/// something to do.
///
/// An entry without one still shows a button rather than nothing at all: an
/// absence explained in a sentence tells somebody the entry is incomplete,
/// where a missing control just looks like a feature that is not there.
class PronunciationButton extends ConsumerStatefulWidget {
  const PronunciationButton({required this.audioUrl, super.key});

  final String audioUrl;

  @override
  ConsumerState<PronunciationButton> createState() =>
      _PronunciationButtonState();
}

class _PronunciationButtonState extends ConsumerState<PronunciationButton> {
  AudioPlayer? _player;
  var _loading = false;
  var _failed = false;

  /// The claim that quiets everything else while a word is said.
  ///
  /// A pronunciation is one or two seconds long, and it is the reason somebody
  /// opened this screen — so it takes the speakers outright rather than talking
  /// over whatever was playing. The music player pauses on the claim and comes
  /// back on its own afterwards; see `MusicDuckListener`.
  late final FullScreenMediaCount _audioFocus = ref.read(
    fullScreenMediaProvider.notifier,
  );
  var _claimed = false;
  StreamSubscription<PlayerState>? _watching;

  bool get _hasAudio => widget.audioUrl.isNotEmpty;

  void _claim() {
    if (_claimed) return;
    _claimed = true;
    _audioFocus.enter();
  }

  void _release() {
    if (!_claimed) return;
    _claimed = false;
    _audioFocus.leave();
  }

  @override
  void dispose() {
    // Leaving mid-clip must not hold the claim: the music would never return.
    _release();
    _watching?.cancel();
    _player?.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (!_hasAudio) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Nobody has recorded this word yet. Contribute one from '
            '"Suggest a correction".',
          ),
        ),
      );
      return;
    }
    final player = _player ??= AudioPlayer();
    // Watched once, so the claim is given back when the clip ends on its own
    // rather than only when somebody presses pause.
    _watching ??= player.playerStateStream.listen((state) {
      if (!state.playing ||
          state.processingState == ProcessingState.completed) {
        _release();
      }
    });
    if (player.playing) {
      await player.pause();
      _release();
      if (mounted) setState(() {});
      return;
    }
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      if (player.audioSource == null) await player.setUrl(widget.audioUrl);
      // A second tap on a finished clip plays it again, which is what somebody
      // learning a word is going to do several times over.
      if (player.processingState == ProcessingState.completed) {
        await player.seek(Duration.zero);
      }
      _claim();
      unawaited(player.play());
    } on Object {
      _release();
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final playing = _player?.playing ?? false;
    return IconButton.filledTonal(
      tooltip: _failed
          ? 'The recording could not be played'
          : !_hasAudio
          ? 'No recording yet'
          : playing
          ? 'Pause'
          : 'Hear it said',
      onPressed: _loading ? null : _toggle,
      style: _hasAudio
          ? null
          : IconButton.styleFrom(foregroundColor: context.brand.mutedInk),
      icon: _loading
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(
              _failed
                  ? Icons.error_outline_rounded
                  : playing
                  ? Icons.pause_rounded
                  : Icons.play_arrow_rounded,
            ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({
    required this.icon,
    required this.title,
    required this.body,
    this.footer,
  });

  final IconData icon;
  final String title;
  final String body;

  /// Sits under the body, inside the card. The example's licence credit is the
  /// only thing that uses it, and it belongs inside because a credit that has
  /// floated free of the card holding the sentence is a credit for nothing.
  final Widget? footer;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: context.brand.accent),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 7),
                Text(body),
                ?footer,
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
