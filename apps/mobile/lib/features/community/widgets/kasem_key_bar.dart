import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// The row of Kasem letters that sits on top of the keyboard.
///
/// ── Why this exists ───────────────────────────────────────────────────────
/// Kasem is written in the African reference alphabet: `ɛ`, `ɔ`, `ŋ`, `ə`, `ʋ`
/// and `ɩ` are letters of it, and tone is written with an accent over a vowel.
/// No phone ships a Kasem keyboard, and installing one is a thing almost
/// nobody does — so a community asked to write *in Kasem* was being handed a
/// keyboard that cannot spell it. What people do instead is substitute: `e`
/// for `ɛ`, `n` for `ŋ`, no accents at all. Every one of those substitutions
/// is a word the dictionary will not match and an archive that is slightly
/// less the language than it should be.
///
/// Six letters and three tone marks fix that, and they cost one strip above
/// the keyboard.
///
/// ── Why the marks are combining ───────────────────────────────────────────
/// The accents are combining characters rather than a shelf of precomposed
/// vowels: `á à ā é è ē í ì ī ó ò ō ú ù ū` is fifteen keys before `ɛ` and `ɔ`
/// have theirs, and the row would be a keyboard of its own. Typing the vowel
/// and then tapping the accent puts the mark on it, which is exactly how tone
/// is taught to be written.
class KasemKeyBar extends StatelessWidget {
  const KasemKeyBar({required this.onInsert, super.key});

  final ValueChanged<String> onInsert;

  /// The letters of the alphabet an ordinary keyboard has no key for.
  static const letters = ['ɛ', 'ɔ', 'ŋ', 'ə', 'ʋ', 'ɩ'];

  /// Acute, grave and macron, drawn on a dotted circle the way a type
  /// specimen shows a floating accent.
  static const marks = ['́', '̀', '̄'];

  static const _markNames = {
    '́': 'High tone',
    '̀': 'Low tone',
    '̄': 'Mid tone',
  };

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return SafeArea(
      top: false,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: brand.bar,
          border: Border(top: BorderSide(color: brand.divider)),
        ),
        child: SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            children: [
              for (final letter in letters)
                _Key(
                  glyph: letter,
                  label: letter,
                  onTap: () => onInsert(letter),
                ),
              // A rule rather than a gap: the letters and the accents are two
              // different kinds of key, and a tap on the wrong one is a typo
              // somebody has to notice to fix.
              Container(
                width: 1,
                margin: const EdgeInsets.symmetric(horizontal: 7, vertical: 6),
                color: brand.border,
              ),
              for (final mark in marks)
                _Key(
                  // U+25CC, the dotted circle a floating accent is shown on.
                  glyph: '◌$mark',
                  label: _markNames[mark] ?? 'Tone mark',
                  onTap: () => onInsert(mark),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({required this.glyph, required this.label, required this.onTap});

  final String glyph;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: Tooltip(
          message: label,
          child: Material(
            color: brand.surfaceMuted,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: onTap,
              child: Container(
                width: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: brand.border),
                ),
                child: Text(
                  glyph,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    height: 1.1,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
