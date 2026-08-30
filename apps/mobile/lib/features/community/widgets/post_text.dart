import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/dictionary/word_lookup.dart';

/// Post body text, with the three things in it that are more than words picked
/// out: `@handles`, links, and any Kasem word the dictionary already knows.
///
/// Mentions notify the person named, so they have to look like they did
/// something — plain grey text gives a reader no reason to believe an `@name`
/// reached anybody. Tapping one opens that member's profile.
///
/// ── Words the dictionary knows ────────────────────────────────────────────
/// A community writing in Kasem and a dictionary of Kasem were two halves of
/// this project that never met. Any word in a post with a published entry now
/// carries a faint dotted rule, and tapping it opens what it means and a
/// recording of it being said — so the timeline teaches while it is being
/// read, and a learner never has to leave a sentence to understand it.
///
/// The mark is deliberately quiet. A coloured, underlined word is a *link*,
/// and a page of Kasem where most words were links would be unreadable; a
/// hairline of dots under the word says "there is more here" without competing
/// with the writing.
class PostText extends ConsumerStatefulWidget {
  const PostText({
    required this.text,
    required this.onOpenHandle,
    this.onOpenLink,
    this.fontSize = 16.5,
    this.lookUpWords = true,
    super.key,
  });

  final String text;
  final double fontSize;

  /// Called with the handle (no `@`) when a mention is tapped. When null the
  /// mention still stands out, it just is not a link.
  final ValueChanged<String>? onOpenHandle;
  final ValueChanged<String>? onOpenLink;

  /// Off where a post is quoted inside another one: a preview is a glimpse of
  /// something else, not a place to study it.
  final bool lookUpWords;

  /// Matches the handle shape the username registry enforces:
  /// `[a-z0-9_]{3,20}`, not preceded by a word character (so an email address
  /// is not read as a mention).
  static final mentionPattern = RegExp(r'(?<![\w@])@([a-zA-Z0-9_]{3,20})\b');
  static final tokenPattern = RegExp(
    r'(?<![\w@])@([a-zA-Z0-9_]{3,20})\b|https?://[^\s<>()]+',
    caseSensitive: false,
  );

  @override
  ConsumerState<PostText> createState() => _PostTextState();
}

class _PostTextState extends ConsumerState<PostText> {
  /// One recogniser per tappable run, kept for the widget's lifetime — a
  /// TapGestureRecognizer created during build and never disposed is a leak
  /// that fires on every rebuild.
  final _recognisers = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final recogniser in _recognisers) {
      recogniser.dispose();
    }
    super.dispose();
  }

  TapGestureRecognizer _recogniser(VoidCallback onTap) {
    final recogniser = TapGestureRecognizer()..onTap = onTap;
    _recognisers.add(recogniser);
    return recogniser;
  }

  @override
  Widget build(BuildContext context) {
    for (final recogniser in _recognisers) {
      recogniser.dispose();
    }
    _recognisers.clear();

    final dictionary = widget.lookUpWords
        ? ref.watch(dictionaryIndexProvider)
        : const <String, DictionaryEntry>{};

    final body = TextStyle(
      fontSize: widget.fontSize,
      height: 1.45,
      color: context.brand.ink,
    );
    final open = widget.onOpenHandle;
    final mention = body.copyWith(
      color: context.brand.success,
      fontWeight: FontWeight.w800,
    );
    final link = body.copyWith(
      color: context.brand.success,
      decoration: TextDecoration.underline,
      decorationColor: context.brand.success,
      fontWeight: FontWeight.w700,
    );
    final known = body.copyWith(
      decoration: TextDecoration.underline,
      decorationStyle: TextDecorationStyle.dotted,
      decorationColor: context.brand.gold.withValues(alpha: 0.75),
    );

    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final match in PostText.tokenPattern.allMatches(widget.text)) {
      if (match.start > cursor) {
        spans.addAll(
          _plain(
            widget.text.substring(cursor, match.start),
            body,
            known,
            dictionary,
          ),
        );
      }
      final handle = match.group(1)?.toLowerCase();
      final matchedText = widget.text.substring(match.start, match.end);
      final cleanLink = handle == null
          ? matchedText.replaceFirst(RegExp(r'[.,!?;:]+$'), '')
          : null;
      TapGestureRecognizer? recogniser;
      if (handle != null && open != null) {
        recogniser = _recogniser(() => open(handle));
      } else if (cleanLink != null && widget.onOpenLink != null) {
        recogniser = _recogniser(() => widget.onOpenLink!(cleanLink));
      }
      spans.add(
        TextSpan(
          text: matchedText,
          style: handle == null ? link : mention,
          recognizer: recogniser,
        ),
      );
      cursor = match.end;
    }
    if (cursor < widget.text.length) {
      spans.addAll(
        _plain(widget.text.substring(cursor), body, known, dictionary),
      );
    }

    return Text.rich(TextSpan(children: spans));
  }

  /// Ordinary writing, with the words the dictionary knows lifted out of it.
  List<InlineSpan> _plain(
    String text,
    TextStyle body,
    TextStyle known,
    Map<String, DictionaryEntry> dictionary,
  ) {
    if (dictionary.isEmpty) return [TextSpan(text: text, style: body)];

    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final match in wordPattern.allMatches(text)) {
      final entry = dictionary[normaliseWord(match[0]!)];
      if (entry == null) continue;
      if (match.start > cursor) {
        spans.add(
          TextSpan(text: text.substring(cursor, match.start), style: body),
        );
      }
      spans.add(
        TextSpan(
          text: match[0],
          style: known,
          recognizer: _recogniser(() => showWordLookup(context, entry)),
        ),
      );
      cursor = match.end;
    }
    if (cursor < text.length) {
      spans.add(TextSpan(text: text.substring(cursor), style: body));
    }
    return spans;
  }
}
