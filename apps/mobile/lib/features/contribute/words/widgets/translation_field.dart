import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/translation_parser.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The answer box, with the parse shown as it happens.
///
/// ── Why a preview at all ─────────────────────────────────────────────────
/// A Kasem word rarely maps to exactly one English word and the reverse is
/// just as true, so members have always answered this question with lists —
/// "greeting, hello", "water / rain water". The old form stored the string
/// whole, which gave the entry a headword that was literally
/// "water / rain water": no search will ever match it and no learner will ever
/// type it. The backend splits those lists now, and the moment it does, the
/// member is entitled to see what it decided. The chips are that: the exact
/// entries that will be stored, updating as they type.
///
/// The preview is computed locally by [parseTranslations], which mirrors the
/// server's rule character for character. Asking the server what it would do
/// and echoing the answer would be correct by construction and would put a
/// network round trip between a keystroke and its own preview — on the
/// connections this screen is built for, a preview that arrives four seconds
/// after the typing is worse than none.
class TranslationField extends StatelessWidget {
  const TranslationField({
    required this.controller,
    this.enabled = true,
    super.key,
  });

  final TextEditingController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      TextFormField(
        controller: controller,
        enabled: enabled,
        minLines: 1,
        maxLines: 3,
        textInputAction: TextInputAction.newline,
        keyboardType: TextInputType.multiline,
        decoration: const InputDecoration(
          labelText: 'The Kasem for it',
          hintText: 'kʋm, na-kʋm',
          alignLabelWithHint: true,
          prefixIcon: Icon(Icons.translate_rounded),
          helperText: 'More than one? Separate them with a comma or a slash.',
          helperMaxLines: 2,
        ),
        validator: (value) => hasUsableTranslation(value ?? '')
            ? null
            : 'Give at least one translation.',
      ),
      // Listens to the controller itself rather than making the screen rebuild
      // on every keystroke. The parent holds a form with six other fields in
      // it, and rebuilding all of them to redraw two chips is work done twenty
      // times a second for no reason.
      ValueListenableBuilder<TextEditingValue>(
        valueListenable: controller,
        builder: (context, value, _) => _ParsedChips(raw: value.text),
      ),
    ],
  );
}

class _ParsedChips extends StatelessWidget {
  const _ParsedChips({required this.raw});

  final String raw;

  @override
  Widget build(BuildContext context) {
    final parsed = parseTranslations(raw);
    if (parsed.isEmpty) return const SizedBox.shrink();
    final brand = context.brand;
    final distinct = distinctTranslationCount(raw);
    final dropped = distinct - parsed.length;
    return Padding(
      padding: const EdgeInsets.only(top: 11),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            parsed.length == 1
                ? 'We will store one entry'
                : 'We will store ${parsed.length} entries',
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 7),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final translation in parsed)
                GlassPill(label: translation, dense: true, selected: true),
            ],
          ),
          if (dropped > 0) ...[
            const SizedBox(height: 7),
            Text(
              // Said plainly. Silently dropping four of a member's twelve
              // answers is exactly the kind of thing that makes somebody stop
              // trusting a form.
              'That is the most one entry can hold, so the last $dropped '
              '${dropped == 1 ? 'is' : 'are'} not kept.',
              style: TextStyle(
                color: brand.terracotta,
                fontSize: 11,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
