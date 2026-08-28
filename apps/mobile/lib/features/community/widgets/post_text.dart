import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// Post body text with `@handles` picked out and tappable.
///
/// Mentions notify the person named, so they have to look like they did
/// something — plain grey text gives a reader no reason to believe an `@name`
/// reached anybody. Tapping one opens that member's profile.
class PostText extends StatefulWidget {
  const PostText({
    required this.text,
    required this.onOpenHandle,
    this.onOpenLink,
    this.fontSize = 16.5,
    super.key,
  });

  final String text;
  final double fontSize;

  /// Called with the handle (no `@`) when a mention is tapped. When null the
  /// mention still stands out, it just is not a link.
  final ValueChanged<String>? onOpenHandle;
  final ValueChanged<String>? onOpenLink;

  /// Matches the handle shape the username registry enforces:
  /// `[a-z0-9_]{3,20}`, not preceded by a word character (so an email address
  /// is not read as a mention).
  static final mentionPattern = RegExp(r'(?<![\w@])@([a-zA-Z0-9_]{3,20})\b');
  static final tokenPattern = RegExp(
    r'(?<![\w@])@([a-zA-Z0-9_]{3,20})\b|https?://[^\s<>()]+',
    caseSensitive: false,
  );

  @override
  State<PostText> createState() => _PostTextState();
}

class _PostTextState extends State<PostText> {
  /// One recogniser per mention, kept for the widget's lifetime — a
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

  @override
  Widget build(BuildContext context) {
    for (final recogniser in _recognisers) {
      recogniser.dispose();
    }
    _recognisers.clear();

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

    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final match in PostText.tokenPattern.allMatches(widget.text)) {
      if (match.start > cursor) {
        spans.add(
          TextSpan(
            text: widget.text.substring(cursor, match.start),
            style: body,
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
        recogniser = TapGestureRecognizer()..onTap = () => open(handle);
        _recognisers.add(recogniser);
      } else if (cleanLink != null && widget.onOpenLink != null) {
        recogniser = TapGestureRecognizer()
          ..onTap = () => widget.onOpenLink!(cleanLink);
        _recognisers.add(recogniser);
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
      spans.add(TextSpan(text: widget.text.substring(cursor), style: body));
    }

    return Text.rich(TextSpan(children: spans));
  }
}
