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
                StatusPill(
                  icon: Icons.verified_outlined,
                  label: 'PUBLISHED ENTRY',
                  color: context.brand.success,
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
            TranslationList(
              entry: resolvedEntry,
              primaryStyle: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(color: context.brand.terracotta),
            ),
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
            if (resolvedEntry.pronunciation.isNotEmpty ||
                resolvedEntry.audioUrl.isNotEmpty)
              _DetailCard(
                icon: Icons.volume_up_outlined,
                title: 'Pronunciation',
                body: resolvedEntry.pronunciation.isEmpty
                    ? 'Recorded by a speaker. No written guide yet.'
                    : resolvedEntry.pronunciation,
                trailing: PronunciationButton(audioUrl: resolvedEntry.audioUrl),
              ),
            // ── The forms a noun takes ───────────────────────────────────
            // Grammar shown where a learner already is, rather than on a
            // grammar screen they would have to decide to visit. The plain
            // form is computed from the headword rather than stored, so this
            // card appears on every noun in the collection — including the
            // ones contributed years before anybody thought to ask for the
            // other two — and simply grows as members fill them in.
            if (_formsBody(resolvedEntry) case final body?) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.account_tree_outlined,
                title: 'Forms',
                body: body,
              ),
            ],
            if (resolvedEntry.example.isNotEmpty) ...[
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

/// The forms card's text, or null when there is nothing true to say.
///
/// ── Why the plain form is enough on its own ──────────────────────────────
/// A noun with no contributed morphology still gets this card, because the
/// indefinite is a rule rather than a record: it is the word and `mo`, always.
/// That single line is worth showing on its own — it is the answer to the
/// question the dictionary could never answer before, and the reason the queue
/// stopped asking members for the Kasem for "the".
///
/// Null for anything that is not a noun, so no screen has to re-test the word
/// class to decide whether to draw the card.
String? _formsBody(DictionaryEntry entry) {
  final plain = entry.indefinite;
  if (plain == null) return null;
  return [
    'Plain: $plain',
    if (entry.definiteForm.isNotEmpty) 'With “the”: ${entry.definiteForm}',
    if (entry.pluralForm.isNotEmpty) 'Many: ${entry.pluralForm}',
  ].join('\n');
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
    this.trailing,
    this.footer,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget? trailing;

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
          ?trailing,
        ],
      ),
    ),
  );
}
