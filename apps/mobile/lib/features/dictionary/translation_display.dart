/// How an entry's meanings and its word class are put on the screen.
///
/// Both live here rather than being written out at each of the five call sites
/// because both have exactly one rule that is easy to get wrong, and the wrong
/// version is silent: a meaning list that shows only its first element loses
/// data without looking like it lost anything, and a word class rendered
/// through a hard-coded `switch` drops every class the switch predates without
/// looking like it dropped anything.
library;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';

/// The word class as a person reads it — and as itself when it is unfamiliar.
///
/// Entries are starting to arrive with classes this app has never seen:
/// `ideophone`, `postposition`, `classifier`, `quantifier`. Kasem, like the Gur
/// languages generally, has a large and productive ideophone class, and the six
/// options the old contribution form offered were a description of a dropdown
/// somebody wrote in an afternoon rather than a description of the language.
///
/// So there is no `switch` here and no allow-list. A recognised id is given its
/// human label; anything else is handed back exactly as it arrived, trimmed and
/// nothing more. Never 'Not specified', never dropped, never bucketed into
/// "Other" — a word class this app has not heard of is still a word class
/// somebody deliberately chose, and the entry belongs to them, not to the
/// version of the app that happens to be reading it.
///
/// [kPartsOfSpeech] is imported from the contribution feature rather than
/// copied. That list already documents itself as one half of a pair that must
/// agree with `PARTS_OF_SPEECH` in `services/functions/src/lexical-kinds.ts`; a
/// third copy here would be a third thing to keep in step, and the one that
/// drifted would drift silently because nothing submits through it.
String partOfSpeechLabel(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return '';
  // Ids are stored lowercase and hyphenated, so "Proper noun" and "proper_noun"
  // both find `proper-noun` and come back with the canonical capitalisation.
  final id = value.toLowerCase().replaceAll(_wordBreak, '-');
  return partOfSpeechById(id)?.label ?? value;
}

final _wordBreak = RegExp(r'[\s_]+');

/// One line of meaning for a place that has room for one line.
///
/// The dictionary row sits between a 50px glyph and a chevron, and a Kasem word
/// with four English senses cannot have all four there without turning a list
/// into a wall. So the first meaning gets the space and the rest are counted:
/// "Bottle  +2 more". Wrapping them instead was tried on paper and rejected —
/// a list screen whose rows are three different heights is a list nobody can
/// scan, and the entry screen is one tap away and shows all of them.
///
/// An entry with a single meaning renders exactly the [Text] it rendered before
/// this widget existed, down to the maxLines: the common case is the whole
/// dictionary, and it must not pay for the exception.
class TranslationSummary extends StatelessWidget {
  const TranslationSummary({
    required this.entry,
    this.style,
    this.maxLines = 2,
    super.key,
  });

  final DictionaryEntry entry;
  final TextStyle? style;

  /// How many lines the meaning itself may take when it is the only one.
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final remaining = entry.furtherTranslations.length;
    if (remaining == 0) {
      return Text(
        entry.primaryTranslation,
        maxLines: maxLines,
        overflow: TextOverflow.ellipsis,
        style: style,
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Flexible, not Expanded: the count keeps its width and the meaning
        // gives up characters for it. The other way round — letting the meaning
        // take the row — ellipsises away the very thing that says there is more
        // to see, which is worse than showing no count at all because it looks
        // like the entry has one meaning.
        Flexible(
          child: Text(
            entry.primaryTranslation,
            // One line once there is a count beside it, so the two sit on the
            // same baseline instead of the count floating against a paragraph.
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: style,
          ),
        ),
        const SizedBox(width: 7),
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Text(
            '+$remaining more',
            style: TextStyle(
              color: context.brand.accent,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

/// Every meaning an entry carries, in the order the contributor gave them.
///
/// Numbered rather than bulleted, because the order is information: the first
/// is the sense the person who knows the word reached for first, and a bullet
/// list quietly claims they are interchangeable. The first keeps the type it
/// had when an entry could only have one, so a single-meaning entry — which is
/// most of the dictionary — is pixel-for-pixel what it was, with no number
/// beside it and no list wrapped around it.
class TranslationList extends StatelessWidget {
  const TranslationList({required this.entry, this.primaryStyle, super.key});

  final DictionaryEntry entry;

  /// The type the first meaning is set in. Defaults to the theme's
  /// `titleLarge`; callers pass their own when the surface has a colour for it.
  final TextStyle? primaryStyle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = primaryStyle ?? theme.textTheme.titleLarge;
    if (!entry.hasSeveralTranslations) {
      return Text(entry.primaryTranslation, style: primary);
    }

    final further = entry.furtherTranslations;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _TranslationRow(
          ordinal: 1,
          text: entry.primaryTranslation,
          style: primary,
          emphasised: true,
        ),
        for (var index = 0; index < further.length; index++) ...[
          const SizedBox(height: 8),
          _TranslationRow(
            ordinal: index + 2,
            text: further[index],
            style: theme.textTheme.titleMedium,
            emphasised: false,
          ),
        ],
      ],
    );
  }
}

class _TranslationRow extends StatelessWidget {
  const _TranslationRow({
    required this.ordinal,
    required this.text,
    required this.style,
    required this.emphasised,
  });

  final int ordinal;
  final String text;
  final TextStyle? style;
  final bool emphasised;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          // Sits on the first line of the meaning rather than the middle of a
          // wrapped block, so a two-line sense still reads as one numbered item.
          margin: const EdgeInsets.only(top: 2),
          decoration: BoxDecoration(
            color: emphasised
                ? brand.accent.withValues(alpha: 0.14)
                : brand.surfaceMuted,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text(
            '$ordinal',
            style: TextStyle(
              color: emphasised ? brand.accent : brand.mutedInk,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: style)),
      ],
    );
  }
}
