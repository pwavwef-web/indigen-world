import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/community/data/community_links.dart';
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
    this.linksEnabled = true,
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

  /// Whether the links in this post may be tapped.
  ///
  /// ── False for a post by an account nobody has verified ───────────────
  /// Scams travel on links, and a link only works on somebody if it can be
  /// tapped. An unverified account may still write one — refusing the post
  /// would push the same scammer into spelling the address out in words, which
  /// is worse because nothing can see it — but it renders struck through,
  /// unlinked, with a line saying why. See `community_links.dart` for the full
  /// reasoning, and why the address is still shown rather than blanked.
  ///
  /// Decided from the *live* profile wherever the caller has one, exactly as
  /// the verification badge is: a stamp on the post is what the author's
  /// client wrote at the time, and a member who verified this morning should
  /// not have last week's posts still masked.
  final bool linksEnabled;

  /// Matches the handle shape the username registry enforces:
  /// `[a-z0-9_]{3,20}`, not preceded by a word character (so an email address
  /// is not read as a mention).
  static final mentionPattern = RegExp(r'(?<![\w@])@([a-zA-Z0-9_]{3,20})\b');

  /// Mentions and links in one pass, so a `@handle` inside a URL's path is not
  /// lifted out of the middle of the address.
  ///
  /// The link half is [communityLinkPattern] rather than a second, looser copy
  /// of it. They were separate — this one matched only `https?://` while the
  /// composer's gate matched bare hosts too — and the gap was exactly the
  /// scammer's move: post `wa.me/233…`, be gated by nothing because the
  /// composer never checked, and render as plain text that a reader retypes by
  /// hand. One pattern, consulted by the composer, the reader and the preview
  /// card, is what stops the three disagreeing.
  ///
  /// Group 1 is the handle and only the handle. Every alternative inside the
  /// link pattern is non-capturing for that reason — a capture group added
  /// there would silently shift the handle's index and turn every mention into
  /// a link.
  static final tokenPattern = RegExp(
    r'(?<![\w@])@([a-zA-Z0-9_]{3,20})\b|(?:' +
        communityLinkPattern.pattern +
        r')',
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
        : const <String, List<DictionaryEntry>>{};

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
    // ── A link that cannot be tapped has to *look* like one that cannot ──
    // Struck through and in the muted ink, so it reads as disabled rather than
    // as an ordinary link that happens not to respond — a control that looks
    // live and does nothing is read as a broken app, and the reader learns
    // nothing about why. The line underneath says the rest.
    final maskedLink = body.copyWith(
      color: context.brand.mutedInk,
      decoration: TextDecoration.lineThrough,
      decorationColor: context.brand.mutedInk,
    );
    final known = body.copyWith(
      decoration: TextDecoration.underline,
      decorationStyle: TextDecorationStyle.dotted,
      decorationColor: context.brand.gold.withValues(alpha: 0.75),
    );

    final spans = <InlineSpan>[];
    // Whether anything in this post was drawn dead, so the explanation is
    // rendered once at the bottom and only when there is something to explain.
    var maskedAny = false;
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
      final masked = handle == null && !widget.linksEnabled;
      if (masked) maskedAny = true;
      TapGestureRecognizer? recogniser;
      if (handle != null && open != null) {
        recogniser = _recogniser(() => open(handle));
      } else if (cleanLink != null && !masked && widget.onOpenLink != null) {
        recogniser = _recogniser(() => widget.onOpenLink!(cleanLink));
      }
      spans.add(
        TextSpan(
          text: matchedText,
          style: handle != null
              ? mention
              : masked
              ? maskedLink
              : link,
          recognizer: recogniser,
          // A struck-through run reads as struck-through to a sighted reader
          // and as nothing at all to a screen reader, which would leave the
          // one person who cannot see the styling with no idea the link is
          // dead. The label carries what the styling carries.
          semanticsLabel: masked ? '$matchedText, link disabled' : null,
        ),
      );
      cursor = match.end;
    }
    if (cursor < widget.text.length) {
      spans.addAll(
        _plain(widget.text.substring(cursor), body, known, dictionary),
      );
    }

    final rich = Text.rich(TextSpan(children: spans));
    if (!maskedAny) return rich;
    // Said once under the post rather than beside each link. Three masked
    // links in one post is one situation, and three copies of the same
    // sentence is the app shouting.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        rich,
        const SizedBox(height: 6),
        _MaskedLinkNotice(fontSize: widget.fontSize),
      ],
    );
  }

  /// Ordinary writing, with the words the dictionary knows lifted out of it.
  List<InlineSpan> _plain(
    String text,
    TextStyle body,
    TextStyle known,
    Map<String, List<DictionaryEntry>> dictionary,
  ) {
    if (dictionary.isEmpty) return [TextSpan(text: text, style: body)];

    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final match in wordPattern.allMatches(text)) {
      final senses = dictionary[normaliseWord(match[0]!)];
      if (senses == null || senses.isEmpty) continue;
      if (match.start > cursor) {
        spans.add(
          TextSpan(text: text.substring(cursor, match.start), style: body),
        );
      }
      spans.add(
        TextSpan(
          text: match[0],
          style: known,
          // Every sense, not the one an unstable index happened to keep.
          recognizer: _recogniser(() => showWordSenses(context, senses)),
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

/// The line under a post whose links were drawn dead.
///
/// ── Why it says what it says ─────────────────────────────────────────────
/// It explains the *rule*, not the person. "This account has not been
/// verified" reads as an accusation and is wrong as often as it is right — the
/// overwhelming majority of unverified accounts are ordinary members who never
/// got round to it. What a reader needs is the fact that decides what they do
/// next: nobody has attached a real number to this, so do not follow it on
/// trust.
class _MaskedLinkNotice extends StatelessWidget {
  const _MaskedLinkNotice({required this.fontSize});

  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.lock_outline_rounded, size: 13, color: brand.mutedInk),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            kMaskedLinkNotice,
            style: TextStyle(
              color: brand.mutedInk,
              // Below the body text, because it is a note about the post and
              // not part of it.
              fontSize: fontSize - 4.5,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}
