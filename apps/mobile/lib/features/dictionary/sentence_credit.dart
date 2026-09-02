import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';

/// The credit under a published entry's example sentence.
///
/// ── This is a licence condition, not a footnote ───────────────────────────
/// The guided translation queue puts a Tatoeba sentence in front of a member so
/// that "light" has an answerable question attached to it, and the sentence
/// travels with their answer all the way to the published entry. Tatoeba's
/// sentences are CC BY 2.0 FR, which requires attribution wherever the sentence
/// is shown — and the dictionary is where it is shown to the most people, for
/// the longest time, to readers who never saw the queue.
///
/// This codebase treats attribution as a promise rather than a footnote, and
/// the promise has two halves that are equally binding:
///
///   * where a credit is owed it appears, quietly but unmistakably, beside the
///     sentence it credits rather than on a rights page nobody opens; and
///   * where none is owed **nothing at all** is rendered. Not a blank line, not
///     "Source unknown", not a plausible-looking id. Thousands of entries carry
///     example sentences a member wrote themselves, and crediting Tatoeba for
///     one of those would be a worse licensing failure than omitting a credit
///     that was never owed. [DictionaryEntry.exampleCredit] returns null in
///     that case and this widget collapses to nothing; a test holds it there.
///
/// The wording matches `QueueWordCard`'s credit exactly — "Tatoeba #1818 · CK ·
/// CC BY 2.0 FR" — because a member who answered a sentence in the queue and
/// later opens the entry it became must not be shown two different accounts of
/// where it came from.
class SentenceCredit extends StatelessWidget {
  const SentenceCredit({required this.entry, super.key});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) {
    final credit = entry.exampleCredit;
    if (credit == null) return const SizedBox.shrink();

    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 9),
      child: Semantics(
        // Spelled out, because a screen reader would otherwise read the middle
        // dots as punctuation and the hash as "number sign" — which turns a
        // credit into noise for exactly the readers least able to skip it.
        label:
            'Example sentence ${entry.tatoebaId} from Tatoeba'
            '${entry.tatoebaContributor.isEmpty ? '' : ', contributed by ${entry.tatoebaContributor}'}'
            '${entry.sentenceLicence.isEmpty ? '' : ', licensed ${entry.sentenceLicence}'}.',
        child: ExcludeSemantics(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 12, color: brand.faintInk),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  credit,
                  style: TextStyle(
                    color: brand.faintInk,
                    fontSize: 11,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
