import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Choosing one of twenty-five word classes without scrolling past twenty-four.
///
/// ── Why not a dropdown ───────────────────────────────────────────────────
/// The old form offered six classes in a `DropdownButtonFormField` and the
/// list here is twenty-five, which is not the same control with more rows in
/// it. A Material dropdown of twenty-five items on a phone is a menu that
/// covers the form it belongs to, opens somewhere unpredictable relative to
/// the field, and has to be flicked through — and the item somebody wants is
/// very often one they could type in four letters. So: a field that opens a
/// glass card with a search box at the top and the list under it, filtered as
/// they type.
///
/// The search matches the id as well as the label and matches anywhere in
/// either, which is what makes it worth having: "noun" finds *Noun*, *Proper
/// noun* and *Pronoun*, and a linguist who already knows `auxiliary-verb` can
/// type the hyphen.
Future<PartOfSpeech?> showPartOfSpeechPicker(
  BuildContext context, {
  PartOfSpeech? selected,
}) => showGlassPopup<PartOfSpeech>(
  context: context,
  // Not simply "Word class", which is what the field it opens from is
  // labelled: two identical strings on screen at once is a hard thing to read
  // and a harder one to write a test against.
  title: 'Which word class?',
  subtitle: 'Type to narrow the list.',
  // The body manages its own scrolling: the search box has to stay put at the
  // top while the list under it moves, and a card that scrolled as one would
  // take the search box away the moment somebody looked at the results.
  scrollable: false,
  builder: (context) => _PartOfSpeechPickerBody(selected: selected),
);

class _PartOfSpeechPickerBody extends StatefulWidget {
  const _PartOfSpeechPickerBody({this.selected});

  final PartOfSpeech? selected;

  @override
  State<_PartOfSpeechPickerBody> createState() =>
      _PartOfSpeechPickerBodyState();
}

class _PartOfSpeechPickerBodyState extends State<_PartOfSpeechPickerBody> {
  final _search = TextEditingController();
  var _matches = kPartsOfSpeech;

  @override
  void initState() {
    super.initState();
    _search.addListener(_filter);
  }

  @override
  void dispose() {
    _search
      ..removeListener(_filter)
      ..dispose();
    super.dispose();
  }

  void _filter() {
    final next = filterPartsOfSpeech(_search.text);
    if (identical(next, _matches)) return;
    setState(() => _matches = next);
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // Tall enough to show seven or eight rows — enough that the list reads as
    // a list — and never more than a little under half the screen, so the card
    // still floats rather than becoming a page.
    final height = math.min(360.0, MediaQuery.sizeOf(context).height * 0.46);
    return SizedBox(
      height: height,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _search,
            // Not autofocused. The list is short enough to recognise a class
            // in, and throwing a keyboard over two thirds of it the instant
            // the card opens would hide the thing somebody came to look at.
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              isDense: true,
              hintText: 'noun, verb, ideophone…',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: _matches.isEmpty
                ? _NoMatches(query: _search.text)
                : ListView.builder(
                    padding: EdgeInsets.zero,
                    itemCount: _matches.length,
                    itemBuilder: (context, index) {
                      final entry = _matches[index];
                      final chosen = entry.id == widget.selected?.id;
                      return ListTile(
                        dense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 6,
                        ),
                        title: Text(
                          entry.label,
                          style: TextStyle(
                            fontWeight: chosen
                                ? FontWeight.w900
                                : FontWeight.w600,
                            color: chosen ? brand.accent : brand.ink,
                          ),
                        ),
                        trailing: chosen
                            ? Icon(
                                Icons.check_rounded,
                                size: 18,
                                color: brand.accent,
                              )
                            : null,
                        onTap: () => Navigator.of(context).pop(entry),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

/// What an empty filter says.
///
/// Names "Other" and "Not sure" rather than leaving somebody stuck: a member
/// who typed a class this list does not have needs to be told there is a
/// landing place for it, otherwise the next thing they do is abandon the word.
class _NoMatches extends StatelessWidget {
  const _NoMatches({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Text(
        'Nothing here matches “${query.trim()}”. '
        'Other and Not sure are both at the bottom of the list.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: context.brand.mutedInk,
          fontSize: 12.5,
          height: 1.5,
        ),
      ),
    ),
  );
}

/// The form field itself: reads like the dropdowns beside it, opens the picker.
class PartOfSpeechField extends StatelessWidget {
  const PartOfSpeechField({
    required this.value,
    required this.onChanged,
    this.enabled = true,
    super.key,
  });

  final PartOfSpeech? value;
  final ValueChanged<PartOfSpeech> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return FormField<PartOfSpeech>(
      // Keyed on the value so the enclosing [Form] cannot go on holding a
      // choice the caller has cleared. A `FormField` reads `initialValue`
      // once; the guided queue empties this between words, and without the
      // key the field would show nothing, validate as answered, and send the
      // last word's class with the next word's translation. Doing it here
      // rather than asking every caller for a key means no caller can forget.
      key: ValueKey('part-of-speech-${value?.id ?? ''}'),
      initialValue: value,
      validator: (chosen) => chosen == null ? 'Choose a word class.' : null,
      builder: (field) => InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: enabled
            ? () async {
                final chosen = await showPartOfSpeechPicker(
                  field.context,
                  selected: value,
                );
                if (chosen == null) return;
                // Both, and in this order: the form's own copy so validation
                // stops complaining the moment a choice is made, and the
                // caller's so the draft carries it.
                field.didChange(chosen);
                onChanged(chosen);
              }
            : null,
        child: InputDecorator(
          isEmpty: value == null,
          decoration: InputDecoration(
            labelText: 'Word class',
            errorText: field.errorText,
            prefixIcon: const Icon(Icons.category_outlined),
            suffixIcon: const Icon(Icons.expand_more_rounded),
          ),
          child: value == null
              ? null
              : Text(
                  value!.label,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
        ),
      ),
    );
  }
}
