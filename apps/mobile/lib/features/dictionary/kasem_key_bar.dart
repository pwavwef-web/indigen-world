import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// The letters a phone keyboard does not have.
///
/// ── The number that makes this a feature rather than a nicety ─────────────
/// 785 of the published headwords carry at least one letter that does not exist
/// on a stock Android or iOS English keyboard: ɩ in 640, ʋ in 195, ə in 177,
/// ɔ in 156, ŋ in 115, ɛ in 9. A learner who has heard `dɩ` and cannot type ɩ
/// does the only thing available and types `di` — which is why
/// [foldForSearch] exists and why the search box works at all.
///
/// Folding rescues the *search*. It does nothing for the person writing. A
/// contributor filing a word, and a validator correcting a spelling, both have
/// to produce the real letter, and until this bar existed their only options
/// were a third-party keyboard or a spelling that is a different word.
///
/// This is the Kasem answer to Pleco's handwriting panel. Pleco spends that
/// screen space helping a user produce characters their keyboard cannot; so
/// does this. What differs is only which characters are missing.
///
/// ── Why it is a bar and not a keyboard ───────────────────────────────────
/// Because the system keyboard is already correct for the other twenty-six
/// letters, and replacing it would cost the user their own layout, their
/// autocorrect and their language. Seven keys above the keyboard is the whole
/// gap.
class KasemKeyBar extends StatefulWidget {
  const KasemKeyBar({required this.targets, this.onInserted, super.key});

  /// The fields this bar may type into, each with the node that tells it when
  /// that field has the cursor.
  ///
  /// Deliberately explicit rather than "whatever is focused". Inserting `ɛ`
  /// into the English gloss is never what anybody meant, and a bar that
  /// followed the global focus would offer Kasem letters at moments they
  /// cannot help — which teaches people to ignore it.
  final Map<TextEditingController, FocusNode> targets;

  /// Called after an insertion, for a caller that needs to rebuild — a form
  /// whose save button is enabled by the text having changed, for instance.
  final VoidCallback? onInserted;

  @override
  State<KasemKeyBar> createState() => _KasemKeyBarState();
}

class _KasemKeyBarState extends State<KasemKeyBar> {
  /// Whether the *next* letter this bar types is a capital.
  ///
  /// A shift, not a lock, and the difference is the whole of a bug this used to
  /// have: the key latched, so somebody who pressed it once — and a key
  /// labelled "AB" invites exactly one exploratory press — typed capitals from
  /// then on, with nothing but the row's own glyphs to say why. Kasem takes a
  /// capital at the start of a sentence and on a name, which is one letter at a
  /// time; nobody types a headword in capitals. So it disarms itself after the
  /// letter it was pressed for, the way the shift on the keyboard below it
  /// does.
  var _shift = false;

  @override
  void initState() {
    super.initState();
    for (final node in widget.targets.values) {
      node.addListener(_onFocusChanged);
    }
  }

  @override
  void dispose() {
    for (final node in widget.targets.values) {
      node.removeListener(_onFocusChanged);
    }
    super.dispose();
  }

  void _onFocusChanged() {
    if (!mounted) return;
    setState(() {
      // Leaving the Kasem boxes drops the shift with them. Arming it and then
      // tapping into another field is the one way a stale shift could still
      // outlive the letter it was meant for.
      if (_active == null) _shift = false;
    });
  }

  /// The field with the cursor in it, or null when none of ours has it.
  TextEditingController? get _active {
    for (final row in widget.targets.entries) {
      if (row.value.hasFocus) return row.key;
    }
    return null;
  }

  void _insert(String letter) {
    final controller = _active;
    if (controller == null) return;
    final value = controller.value;
    final selection = value.selection;
    // A selection that has never been placed reports offset -1, and splicing at
    // -1 throws. Appending is the right answer there: the field has the focus,
    // so the cursor is conceptually at the end of whatever is in it.
    final start = selection.isValid ? selection.start : value.text.length;
    final end = selection.isValid ? selection.end : value.text.length;
    final text = value.text.replaceRange(start, end, letter);
    controller.value = value.copyWith(
      text: text,
      selection: TextSelection.collapsed(offset: start + letter.length),
      composing: TextRange.empty,
    );
    HapticFeedback.selectionClick();
    if (_shift) setState(() => _shift = false);
    widget.onInserted?.call();
  }

  @override
  Widget build(BuildContext context) {
    // Nothing at all when no Kasem field has the cursor. A permanently visible
    // bar is a permanently stolen inch of a 720p screen.
    if (_active == null) return const SizedBox.shrink();
    final brand = context.brand;
    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: brand.surfaceElevated,
          border: Border(top: BorderSide(color: brand.border)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
        // The bar states its own height, and that is load-bearing rather than
        // tidy. A `Container` with an `alignment` grows to whatever height it
        // is offered, and what a bottom bar is offered is the whole screen —
        // so a row of unbounded keys laid itself out full-height, and the
        // Scaffold, unable to fit it above the keyboard, pinned it to the top
        // and painted it over the form. What the screen showed was seven
        // ceiling-to-floor lines with the letters stranded halfway down.
        child: SizedBox(
          height: _kKeyHeight,
          child: Row(
            children: [
              _Key(
                icon: Icons.arrow_upward_rounded,
                tooltip: _shift ? 'Next letter is a capital' : 'Capital letter',
                onTap: () => setState(() => _shift = !_shift),
                subdued: true,
                active: _shift,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final letter in kKasemLetters)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: _Key(
                            label: _shift ? letter.capital : letter.small,
                            tooltip: letter.name,
                            onTap: () =>
                                _insert(_shift ? letter.capital : letter.small),
                          ),
                        ),
                    ],
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

/// One key, and so the height of the bar. Sized for a thumb on the target
/// device — Android 8, 720p — rather than for the glyph.
const _kKeyHeight = 40.0;

/// One extended letter, in both cases, with the name a learner can read.
///
/// The names are the sounds rather than the Unicode names. "Latin small letter
/// iota" is correct and tells a Kasem speaker nothing; "ɩ — as in dɩ" is what
/// the tooltip is for.
@immutable
class KasemLetter {
  const KasemLetter(this.small, this.capital, this.name);

  final String small;
  final String capital;
  final String name;
}

/// The seven letters, in the order the Kasem alphabet files them.
///
/// Ordered by their place in the alphabet rather than by frequency, because the
/// bar is also how somebody learns where these letters sit — and a row sorted
/// by how often each is typed would teach the wrong thing while saving nobody
/// any time on a row of seven.
///
/// `ɣ` is included even though it appears in very few published headwords: it
/// is in the orthography, and a letter absent from the bar is a letter a
/// contributor concludes the app will not accept.
const kKasemLetters = <KasemLetter>[
  KasemLetter('ɛ', 'Ɛ', 'ɛ — open e'),
  KasemLetter('ə', 'Ə', 'ə — schwa'),
  KasemLetter('ɣ', 'Ɣ', 'ɣ — soft g'),
  KasemLetter('ɩ', 'Ɩ', 'ɩ — open i'),
  KasemLetter('ŋ', 'Ŋ', 'ŋ — ng'),
  KasemLetter('ɔ', 'Ɔ', 'ɔ — open o'),
  KasemLetter('ʋ', 'Ʋ', 'ʋ — open u'),
];

class _Key extends StatelessWidget {
  const _Key({
    required this.tooltip,
    required this.onTap,
    this.label,
    this.icon,
    this.subdued = false,
    this.active = false,
  });

  /// The glyph the key types. Exactly one of this and [icon] is given.
  final String? label;
  final IconData? icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool subdued;

  /// Held down: the shift, while it is armed. Filled rather than outlined,
  /// because the row of capitals beside it is easy to miss on a phone held at
  /// arm's length and the state has to be readable from the key itself.
  final bool active;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final ink = active
        ? brand.onAccentFill
        : (subdued ? brand.mutedInk : brand.ink);
    return Semantics(
      button: true,
      label: tooltip,
      excludeSemantics: true,
      child: Tooltip(
        message: tooltip,
        child: Material(
          color: active
              ? brand.accentFill
              : (subdued ? brand.surfaceMuted : brand.surface),
          borderRadius: BorderRadius.circular(9),
          child: InkWell(
            borderRadius: BorderRadius.circular(9),
            onTap: onTap,
            // Height stated here as well as on the bar: a `Container` with an
            // `alignment` fills the height it is offered, so a key left to its
            // own devices is as tall as whatever holds it.
            child: SizedBox(
              height: _kKeyHeight,
              child: Container(
                // Wide enough for a thumb on the target device — Android 8,
                // 720p — rather than sized to the glyph, which would make ɩ a
                // two-pixel target beside ŋ.
                constraints: const BoxConstraints(minWidth: 42),
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 6),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: active ? brand.accentFill : brand.border,
                  ),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: icon != null
                    ? Icon(icon, size: 18, color: ink)
                    : Text(
                        label!,
                        style: TextStyle(
                          fontSize: subdued ? 13 : 18,
                          fontWeight: FontWeight.w700,
                          color: ink,
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
