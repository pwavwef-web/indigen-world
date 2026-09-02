import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The question: one English word, and the sentence that says which one.
///
/// ── The sentence is not decoration ───────────────────────────────────────
/// "Light" has no answer. "Light" in *Turn on the light* has one, and in *He
/// tried to light the fire* it has a different one, and a member handed the
/// bare word either freezes or guesses — and a guess is a wrong dictionary
/// entry that somebody has to find and undo later. So the sentence is on the
/// card at full size, immediately under the word, and the card is built so it
/// cannot be laid out without it.
///
/// ── And the credit under it is a licence condition ───────────────────────
/// The sentences are Tatoeba, CC BY 2.0 FR. Attribution is required wherever
/// the sentence is *shown*, which is here. It is set small and quiet because
/// it is not what the member is being asked about, and it is present because
/// quiet is the most it is allowed to be.
///
/// A row whose `sentenceSource` is `unattributed` carries no attribution and
/// renders NO credit — not a blank line, not a placeholder, not a guess. A
/// contributor invented for a sentence nobody contributed would be a worse
/// failure than a credit correctly omitted, and a test holds this.
class QueueWordCard extends StatelessWidget {
  const QueueWordCard({required this.word, super.key});

  final QueueWord word;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final attribution = word.attribution;
    return GlassSurface(
      blur: false,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      accent: brand.gold,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'IN KASEM, THIS IS…',
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 9.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
              const Spacer(),
              // Only when it is true, and only as a number of other people —
              // never as a discouragement. Somebody about to spend a minute on
              // a word deserves to know two others are already on it, and the
              // queue deliberately still offers such words rather than hiding
              // them, so this must not read as "do not bother".
              if (word.pendingCount > 0)
                Text(
                  word.pendingCount == 1
                      ? '1 answer in review'
                      : '${word.pendingCount} answers in review',
                  style: TextStyle(
                    color: brand.faintInk,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 9),
          Text(
            word.word,
            style: TextStyle(
              color: brand.ink,
              fontSize: 34,
              height: 1.1,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
            ),
          ),
          if (word.sentence.isNotEmpty) ...[
            const SizedBox(height: 13),
            _ExampleSentence(sentence: word.sentence, word: word.word),
          ],
          if (attribution != null) ...[
            const SizedBox(height: 11),
            _SentenceCredit(attribution: attribution),
          ],
        ],
      ),
    );
  }
}

/// The example sentence, with the queued word picked out of it.
///
/// The emphasis is worth the extra code: the sentences are ordinary English
/// and the word being asked about is often the least conspicuous thing in
/// them — *Give him an inch and he will take a yard* is a sentence about
/// yards, and the word on the card is "the". Bolding the occurrence turns a
/// second of scanning into none.
///
/// Whole-word, case-insensitive, and silently gives up when it finds nothing:
/// the queue holds base forms and the sentences hold inflections, so "take"
/// will not always be found in a sentence containing "took". A missed
/// highlight costs nothing; a wrong one — matching "the" inside "there" —
/// would make the sentence harder to read than leaving it plain, which is why
/// the boundaries are checked rather than a bare `indexOf`.
class _ExampleSentence extends StatelessWidget {
  const _ExampleSentence({required this.sentence, required this.word});

  final String sentence;
  final String word;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final base = TextStyle(color: brand.ink, fontSize: 16.5, height: 1.5);
    return Text.rich(
      TextSpan(children: _spans(base, brand.accent)),
      style: base,
    );
  }

  List<TextSpan> _spans(TextStyle base, Color accent) {
    final ranges = _matches(sentence, word);
    if (ranges.isEmpty) return [TextSpan(text: sentence)];
    final emphasis = base.copyWith(color: accent, fontWeight: FontWeight.w900);
    final spans = <TextSpan>[];
    var cursor = 0;
    for (final (start, end) in ranges) {
      if (start > cursor) {
        spans.add(TextSpan(text: sentence.substring(cursor, start)));
      }
      spans.add(
        TextSpan(text: sentence.substring(start, end), style: emphasis),
      );
      cursor = end;
    }
    if (cursor < sentence.length) {
      spans.add(TextSpan(text: sentence.substring(cursor)));
    }
    return spans;
  }

  /// Whole-word occurrences of [needle] in [haystack], as (start, end) pairs.
  ///
  /// Written by hand rather than with a `RegExp` built from the word, because
  /// the word comes from the queue and a queue that ever holds a bracket, a
  /// dot or a plus would turn an interpolated pattern into either the wrong
  /// match or a thrown `FormatException` on the one screen that must not
  /// throw.
  static List<(int, int)> _matches(String haystack, String needle) {
    if (needle.isEmpty) return const [];
    final lowerHay = haystack.toLowerCase();
    final lowerNeedle = needle.toLowerCase();
    final out = <(int, int)>[];
    var from = 0;
    while (from <= lowerHay.length - lowerNeedle.length) {
      final at = lowerHay.indexOf(lowerNeedle, from);
      if (at < 0) break;
      final end = at + lowerNeedle.length;
      if (!_isWordChar(lowerHay, at - 1) && !_isWordChar(lowerHay, end)) {
        out.add((at, end));
      }
      from = at + 1;
    }
    return out;
  }

  static bool _isWordChar(String value, int index) {
    if (index < 0 || index >= value.length) return false;
    final unit = value.codeUnitAt(index);
    // a-z, 0-9 and the apostrophe, so "can't" is one word and "the." is not
    // two. The haystack is already lowercased, so A-Z need not be checked.
    return (unit >= 0x61 && unit <= 0x7a) ||
        (unit >= 0x30 && unit <= 0x39) ||
        unit == 0x27;
  }
}

/// The Tatoeba credit: small, grey, and never absent when it is owed.
class _SentenceCredit extends StatelessWidget {
  const _SentenceCredit({required this.attribution});

  final QueueWordAttribution attribution;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      // Spelled out for a screen reader, which would otherwise read the
      // middle dots as punctuation and the hash as "number sign".
      label:
          'Example sentence ${attribution.tatoebaId} from Tatoeba'
          '${attribution.contributor.isEmpty ? '' : ', contributed by ${attribution.contributor}'}'
          '${attribution.licence.isEmpty ? '' : ', licensed ${attribution.licence}'}.',
      child: ExcludeSemantics(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline_rounded, size: 12, color: brand.faintInk),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                attribution.line,
                style: TextStyle(
                  color: brand.faintInk,
                  fontSize: 10.5,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
