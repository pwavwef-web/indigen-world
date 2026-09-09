import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_search.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// One word in a list, answered as completely as a row can answer it.
///
/// ── Density is the point, and it is a specific claim ──────────────────────
/// The first of the three properties worth copying from Pleco is that the
/// answer is complete on first contact — headword, how to say it, what class it
/// is, and every meaning, without a navigation step. Most dictionary apps fail
/// at this by scattering the same information across taps, and the cost is paid
/// by the reader who has to open six entries to find the one they meant.
///
/// So this row carries: the headword with its sense number where one is owed,
/// the word class, whether there is a recording, and every meaning the entry
/// has rather than only the first. What it does not carry is anything the entry
/// does not hold — an absent recording draws no icon, an entry with one meaning
/// draws one meaning, and nothing anywhere says "no example yet".
///
/// ── The line about the plural ─────────────────────────────────────────────
/// [DictionaryHit.explanation] is drawn where the match was not the headword.
/// A learner who typed `biə` and is shown an entry headed `bu` has been given
/// the right answer and no way to see why, which is the moment a dictionary
/// either teaches the noun-class system or leaves it a mystery. One line does
/// it: *biə is the plural of bu*.
class DictionaryResultRow extends StatelessWidget {
  const DictionaryResultRow({
    required this.hit,
    required this.siblings,
    super.key,
  });

  final DictionaryHit hit;

  /// How many published entries share this spelling. Decides whether the sense
  /// number is drawn at all — a solitary `mo¹` promises a `mo²` that does not
  /// exist. See `kasem_homographs.dart`.
  final int siblings;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final entry = hit.entry;
    final headword = homographDisplay(
      entry.headword,
      homographIndex: entry.homographIndex,
      siblingCount: siblings,
    );
    final wordClass = partOfSpeechLabel(entry.partOfSpeech);
    final explanation = hit.explanation;

    return Semantics(
      button: true,
      label: '${headword.spoken}. ${entry.allTranslations}',
      excludeSemantics: true,
      child: GlassCard.listItem(
        onTap: () => openDictionaryEntry(context, entry),
        child: Padding(
          padding: const EdgeInsets.all(13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Flexible(
                    child: Text(
                      headword.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 17.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  if (entry.ipaDisplay case final ipa?) ...[
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        ipa,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                  ],
                  const Spacer(),
                  // A speaker rather than a play button. The row does not play
                  // anything — tapping it opens the entry, where the control
                  // that plays is the one a reader can also pause. What this
                  // says is "there is a voice on this word", which is the fact
                  // somebody scanning a list of results is choosing on.
                  if (entry.audioUrl.isNotEmpty)
                    Icon(
                      Icons.volume_up_rounded,
                      size: 17,
                      color: brand.accent,
                    ),
                ],
              ),
              if (wordClass.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  wordClass.toLowerCase(),
                  style: TextStyle(
                    color: brand.terracotta,
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(height: 5),
              // ── Every meaning, numbered where there is more than one ─────
              // The row used to show the first and a "+2 more", which is the
              // count of an answer rather than the answer. Three short glosses
              // fit on two lines and are what the reader came to compare.
              _Meanings(entry: entry),
              if (explanation != null) ...[
                const SizedBox(height: 6),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.subdirectory_arrow_right_rounded,
                      size: 14,
                      color: brand.accent,
                    ),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        explanation,
                        style: TextStyle(
                          color: brand.accent,
                          fontSize: 11.5,
                          height: 1.35,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              if (entry.dialect.isNotEmpty &&
                  entry.dialect.toLowerCase() != 'kasem') ...[
                const SizedBox(height: 6),
                Text(
                  entry.dialect,
                  style: TextStyle(color: brand.faintInk, fontSize: 11),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Every meaning the entry carries, on as few lines as they fit.
class _Meanings extends StatelessWidget {
  const _Meanings({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // The split list where there is one, and the raw gloss where there is not —
    // the same fallback `primaryTranslation` makes, so a legacy row whose
    // meanings were never split still shows what it says.
    final meanings = entry.translations.isEmpty
        ? <String>[entry.translation]
        : entry.translations;
    if (meanings.length <= 1) {
      return Text(
        meanings.isEmpty ? '' : meanings.first,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13.5, height: 1.35),
      );
    }
    return RichText(
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      text: TextSpan(
        style: DefaultTextStyle.of(
          context,
        ).style.copyWith(fontSize: 13.5, height: 1.4),
        children: [
          for (var index = 0; index < meanings.length; index++) ...[
            TextSpan(
              // The numbering every printed dictionary uses, because it is
              // what makes several meanings read as several meanings rather
              // than as one long comma-separated gloss.
              text: '${index + 1} ',
              style: TextStyle(
                color: brand.accent,
                fontWeight: FontWeight.w900,
                fontSize: 11,
              ),
            ),
            TextSpan(text: meanings[index]),
            if (index < meanings.length - 1) const TextSpan(text: '  '),
          ],
        ],
      ),
    );
  }
}
