import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/entry_sense.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/part_of_speech_picker.dart';

/// The several things one word means, as a contributor enters them.
///
/// ── The bug this fixes, stated plainly ───────────────────────────────────
/// The contribution form asked "what does it mean in English" exactly once. A
/// member adding *toy* could record that it is a plaything, and had nowhere at
/// all to say that it is also a trinket, also a small breed of dog, and also a
/// verb — before the form even gets to word classes. The workaround everybody
/// used was to type all of them into the one box separated by commas, which
/// the archive then stored as one meaning whose text happened to contain
/// commas, with one example sentence attached to none of them.
///
/// ── Why the first meaning lives here too ─────────────────────────────────
/// The obvious cheaper design was to leave the existing "what it means" field
/// at the top of the form and offer a *second* section for extra meanings. It
/// was rejected: the first meaning would then be the only one that could not
/// carry a register, a subject field or its own example, so an entry's first
/// sense would be systematically poorer than its second. A member would have
/// to notice that and work around it by leaving the top box empty, which no
/// member is going to do.
///
/// So this section owns every meaning, and the form's `title` field — the one
/// the whole pipeline reads as the English side — is kept in step with the
/// first definition rather than typed separately. See
/// `_ContributionFormScreenState._syncTitleFromSenses`.
///
/// ── The rule every field here has to pass ────────────────────────────────
/// The same one `lexical_detail_fields.dart` sets: *the median word costs zero
/// extra taps.* One meaning, typed into the one box that is open when the
/// screen loads, and sent. Everything else — the second meaning, the register,
/// the subject field, the Kasem gloss, the usage note, the synonyms — is
/// behind a disclosure that starts closed.

/// One meaning, and every control that belongs to it.
///
/// A plain holder of controllers rather than a `ChangeNotifier`: the
/// controllers already notify, and the only state above them is which dropdown
/// is selected, which [SensesController] owns because it also decides what to
/// send.
class SenseDraft {
  SenseDraft();

  final definition = TextEditingController();
  final kasemDefinition = TextEditingController();
  final usageNote = TextEditingController();
  final kasemExample = TextEditingController();
  final englishExample = TextEditingController();
  final synonyms = TextEditingController();
  final antonyms = TextEditingController();

  /// The word class this meaning belongs to, where it differs from the entry's.
  ///
  /// Null means "the same as the word's own class", which is what almost every
  /// meaning says. It is offered because the case it exists for — a noun whose
  /// third meaning is a verb — is ordinary rather than exotic, and until this
  /// field existed the only way to record it was to submit a second entry for
  /// the same word, which is a homograph and means something else entirely.
  PartOfSpeech? partOfSpeech;

  String register = '';
  String domain = '';

  /// Whether the extra questions are open for this meaning.
  ///
  /// Per-meaning rather than a single flag for the section, so opening the
  /// detail on meaning 3 does not unfold two more screens of boxes above it.
  bool expanded = false;

  bool get isEmpty =>
      definition.text.trim().isEmpty &&
      kasemDefinition.text.trim().isEmpty &&
      usageNote.text.trim().isEmpty &&
      kasemExample.text.trim().isEmpty &&
      englishExample.text.trim().isEmpty &&
      synonyms.text.trim().isEmpty &&
      antonyms.text.trim().isEmpty &&
      register.isEmpty &&
      domain.isEmpty &&
      partOfSpeech == null;

  /// This meaning as the callable expects it, or null when there is nothing
  /// to send.
  ///
  /// Keys mirror `parseSenses` in `services/functions/src/lexical-senses.ts`.
  /// Empty values are omitted rather than sent blank, for the same reason the
  /// paradigm omits its unanswered slots: an absent key is "nobody said" and an
  /// empty string is "somebody said nothing", and the record turns on that
  /// difference.
  Map<String, Object?>? toPayload() {
    final text = definition.text.trim();
    if (text.isEmpty) return null;
    final kasem = kasemExample.text.trim();
    final english = englishExample.text.trim();
    return {
      'definition': text,
      if (partOfSpeech != null) 'partOfSpeech': partOfSpeech!.id,
      if (register.isNotEmpty) 'register': register,
      if (domain.isNotEmpty) 'domain': domain,
      if (kasemDefinition.text.trim().isNotEmpty)
        'kasemDefinition': kasemDefinition.text.trim(),
      if (usageNote.text.trim().isNotEmpty)
        'usageNote': usageNote.text.trim(),
      if (kasem.isNotEmpty || english.isNotEmpty)
        'examples': [
          {'kasem': kasem, 'english': english},
        ],
      if (synonyms.text.trim().isNotEmpty) 'synonyms': synonyms.text.trim(),
      if (antonyms.text.trim().isNotEmpty) 'antonyms': antonyms.text.trim(),
    };
  }

  void dispose() {
    definition.dispose();
    kasemDefinition.dispose();
    usageNote.dispose();
    kasemExample.dispose();
    englishExample.dispose();
    synonyms.dispose();
    antonyms.dispose();
  }
}

/// Every meaning on the form, and the operations the section offers.
class SensesController extends ChangeNotifier {
  SensesController() {
    // One meaning, open and empty, is what the screen starts as. A section
    // that starts with nothing in it would make the ordinary single-meaning
    // contribution begin with a button press.
    drafts.add(SenseDraft());
  }

  final List<SenseDraft> drafts = <SenseDraft>[];

  SenseDraft get first => drafts.first;

  bool get canAdd => drafts.length < kMaxSenses;

  void add() {
    if (!canAdd) return;
    drafts.add(SenseDraft()..expanded = true);
    notifyListeners();
  }

  /// Removes a meaning, never the last one.
  ///
  /// The first meaning is removable like any other once there are two: a
  /// member who typed the meanings in the wrong order should be able to delete
  /// the first rather than retype everything below it.
  void removeAt(int index) {
    if (drafts.length <= 1) return;
    drafts.removeAt(index).dispose();
    notifyListeners();
  }

  void moveUp(int index) {
    if (index <= 0) return;
    final draft = drafts.removeAt(index);
    drafts.insert(index - 1, draft);
    notifyListeners();
  }

  void moveDown(int index) {
    if (index >= drafts.length - 1) return;
    final draft = drafts.removeAt(index);
    drafts.insert(index + 1, draft);
    notifyListeners();
  }

  void toggleExpanded(int index) {
    drafts[index].expanded = !drafts[index].expanded;
    notifyListeners();
  }

  void setRegister(int index, String value) {
    drafts[index].register = value;
    notifyListeners();
  }

  void setDomain(int index, String value) {
    drafts[index].domain = value;
    notifyListeners();
  }

  void setPartOfSpeech(int index, PartOfSpeech? value) {
    drafts[index].partOfSpeech = value;
    notifyListeners();
  }

  /// Every meaning that has a definition, in order.
  List<Map<String, Object?>> payload() => [
    for (final draft in drafts) ?draft.toPayload(),
  ];

  /// The first meaning's text — what the pipeline stores as the English side.
  String get primaryDefinition => drafts.isEmpty
      ? ''
      : drafts.first.definition.text.trim();

  /// The first sentence anybody gave, for the two legacy example fields.
  ///
  /// ── Why the legacy fields are still filled ─────────────────────────────
  /// Because `kasemExample` and `englishExample` are read by the review desk,
  /// by every app build that predates senses, and by the published entry's own
  /// Example card. Leaving them empty on a contribution that plainly has an
  /// example would make a well-documented word look bare on three surfaces at
  /// once, to save writing one string twice. The entry detail screen suppresses
  /// the duplicate at render time instead — see `hasSenseExamples`.
  ///
  /// The first sentence of the first meaning that has one, rather than the
  /// first meaning's: an entry whose second sense is the illustrated one should
  /// still show a sentence to a reader who cannot see senses.
  ({String kasem, String english}) get legacyExample {
    for (final draft in drafts) {
      final kasem = draft.kasemExample.text.trim();
      final english = draft.englishExample.text.trim();
      if (kasem.isNotEmpty || english.isNotEmpty) {
        return (kasem: kasem, english: english);
      }
    }
    return (kasem: '', english: '');
  }

  /// Fills the section from meanings that already exist.
  ///
  /// ── Why the contribution form and the editor share this controller ─────
  /// Because a validator correcting a published word is doing the same job a
  /// contributor did when they wrote it, on the same fields, and two sense
  /// editors would drift apart on the first day one of them gained a box. The
  /// contribution form starts empty and this starts from what was published;
  /// everything below that first difference is identical.
  ///
  /// An entry with no stored senses loads as one empty meaning rather than
  /// none, so a validator adding the first structured meaning to a legacy word
  /// starts in a box rather than at a button. `displaySenses` on the entry is
  /// what the caller should pass for that: it lifts a legacy gloss into a
  /// single sense on read, so the editor opens showing the meaning the reader
  /// sees rather than an empty form for a word that plainly has one.
  void loadFrom(Iterable<EntrySense> senses) {
    for (final draft in drafts) {
      draft.dispose();
    }
    drafts.clear();
    for (final sense in senses.take(kMaxSenses)) {
      final draft = SenseDraft()
        ..definition.text = sense.definition
        ..kasemDefinition.text = sense.kasemDefinition
        ..usageNote.text = sense.usageNote
        ..synonyms.text = sense.synonyms.join(', ')
        ..antonyms.text = sense.antonyms.join(', ')
        ..register = sense.register
        ..domain = sense.domain
        ..partOfSpeech = partOfSpeechById(sense.partOfSpeech)
        // Open where there is something to see. A meaning whose usage note and
        // register are folded away behind a closed disclosure is a meaning a
        // validator will not notice they are about to publish unchanged.
        ..expanded = sense.hasDetail;
      // The first example only. The form offers one pair of boxes per meaning
      // and a sense may carry up to four sentences, so loading them all would
      // need a second editor — and silently dropping the rest on save would
      // lose sentences somebody recorded. Preserved instead: see
      // `EntryEditorScreen`, which leaves the senses out of the patch entirely
      // when nobody touched them.
      final example = sense.examples.isEmpty ? null : sense.examples.first;
      if (example != null) {
        draft.kasemExample.text = example.kasem;
        draft.englishExample.text = example.english;
      }
      drafts.add(draft);
    }
    if (drafts.isEmpty) drafts.add(SenseDraft());
    notifyListeners();
  }

  /// Clears every meaning back to one empty box, after a successful send.
  void reset() {
    for (final draft in drafts) {
      draft.dispose();
    }
    drafts
      ..clear()
      ..add(SenseDraft());
    notifyListeners();
  }

  @override
  void dispose() {
    for (final draft in drafts) {
      draft.dispose();
    }
    drafts.clear();
    super.dispose();
  }
}

/// The meanings, as a contributor sees them.
class SensesSection extends StatelessWidget {
  const SensesSection({
    required this.controller,
    required this.declaredClass,
    this.enabled = true,
    this.isSaying = false,
    this.onChanged,
    super.key,
  });

  final SensesController controller;

  /// The word class chosen at the top of the form, so a meaning that shares it
  /// does not have to say so.
  final String declaredClass;

  final bool enabled;

  /// Whether this contribution is a proverb or an idiom rather than a word.
  ///
  /// A saying has a meaning rather than a translation, and it very rarely has
  /// several. The wording changes and the "add another meaning" button is not
  /// offered — a proverb with four numbered senses is almost always somebody
  /// misunderstanding the box.
  final bool isSaying;

  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final drafts = controller.drafts;
      final several = drafts.length > 1;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var index = 0; index < drafts.length; index++) ...[
            if (index > 0) const SizedBox(height: 14),
            _SenseEditor(
              controller: controller,
              draft: drafts[index],
              index: index,
              showNumber: several,
              declaredClass: declaredClass,
              enabled: enabled,
              isSaying: isSaying,
              onChanged: onChanged,
            ),
          ],
          if (!isSaying) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: enabled && controller.canAdd ? controller.add : null,
                icon: const Icon(Icons.add_rounded, size: 19),
                label: Text(
                  several ? 'Add another meaning' : 'This word means something else too',
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              controller.canAdd
                  // Said as an invitation rather than as an instruction. Most
                  // words have one meaning and their contributor should not
                  // feel they have skipped a step.
                  ? 'Many words mean several different things. Add each one '
                        'separately so its own example sentence goes with it.'
                  : 'That is as many meanings as one entry can hold.',
              style: TextStyle(
                color: context.brand.mutedInk,
                fontSize: 11.5,
                height: 1.35,
              ),
            ),
          ],
        ],
      );
    },
  );
}

class _SenseEditor extends StatelessWidget {
  const _SenseEditor({
    required this.controller,
    required this.draft,
    required this.index,
    required this.showNumber,
    required this.declaredClass,
    required this.enabled,
    required this.isSaying,
    this.onChanged,
  });

  final SensesController controller;
  final SenseDraft draft;
  final int index;
  final bool showNumber;
  final String declaredClass;
  final bool enabled;
  final bool isSaying;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: showNumber
              ? brand.mutedInk.withValues(alpha: 0.22)
              : Colors.transparent,
        ),
        color: showNumber
            ? brand.mutedInk.withValues(alpha: 0.035)
            : Colors.transparent,
      ),
      padding: showNumber
          ? const EdgeInsets.fromLTRB(12, 10, 12, 13)
          : EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showNumber)
            Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: brand.accent.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Text(
                    '${index + 1}',
                    style: TextStyle(
                      color: brand.accent,
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                Text(
                  'Meaning ${index + 1}',
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                  ),
                ),
                const Spacer(),
                IconButton(
                  tooltip: 'Move up',
                  visualDensity: VisualDensity.compact,
                  onPressed: enabled && index > 0
                      ? () => controller.moveUp(index)
                      : null,
                  icon: const Icon(Icons.arrow_upward_rounded, size: 18),
                ),
                IconButton(
                  tooltip: 'Move down',
                  visualDensity: VisualDensity.compact,
                  onPressed: enabled && index < controller.drafts.length - 1
                      ? () => controller.moveDown(index)
                      : null,
                  icon: const Icon(Icons.arrow_downward_rounded, size: 18),
                ),
                IconButton(
                  tooltip: 'Remove this meaning',
                  visualDensity: VisualDensity.compact,
                  onPressed: enabled
                      ? () => _confirmRemove(context, controller, draft, index)
                      : null,
                  icon: const Icon(Icons.close_rounded, size: 18),
                ),
              ],
            ),
          if (showNumber) const SizedBox(height: 6),
          TextFormField(
            controller: draft.definition,
            enabled: enabled,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: index == 0
                  ? (isSaying
                        ? 'What it means in English'
                        : 'What it means in English')
                  : 'What else it means',
              hintText: isSaying
                  ? 'The sense of it, not word for word'
                  : index == 0
                  ? 'For example: Bottle'
                  : 'A different meaning of the same word',
              prefixIcon: const Icon(Icons.translate_rounded),
            ),
            onEditingComplete: onChanged,
            onFieldSubmitted: (_) => onChanged?.call(),
            // Only the first meaning is required, and it is required because
            // an entry with no meaning at all is not an entry. A blank second
            // box is somebody who pressed Add and changed their mind, and it is
            // dropped on send rather than blocking it.
            validator: index == 0
                ? (value) => value == null || value.trim().isEmpty
                      ? 'This field is required.'
                      : null
                : null,
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: draft.kasemExample,
            enabled: enabled,
            minLines: 1,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: showNumber
                  ? 'Kasem example for meaning ${index + 1} (optional)'
                  : 'Kasem example (optional)',
              hintText: isSaying
                  ? 'Show it being said, or the occasion for it'
                  : 'Use the word with THIS meaning in a sentence',
              alignLabelWithHint: true,
              prefixIcon: const Icon(Icons.chat_bubble_outline_rounded),
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: draft.englishExample,
            enabled: enabled,
            minLines: 1,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'English for that sentence (optional)',
              alignLabelWithHint: true,
              prefixIcon: Icon(Icons.subtitles_outlined),
            ),
          ),
          // ── Everything below is behind a disclosure ──────────────────
          // A member who types a meaning, a sentence and nothing else has seen
          // three boxes. The register, the subject field, the Kasem gloss, the
          // usage note and the cross-references are all real and all optional,
          // and putting them on screen unasked is how a two-minute
          // contribution becomes one nobody finishes.
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: enabled ? () => controller.toggleExpanded(index) : null,
              icon: Icon(
                draft.expanded
                    ? Icons.expand_less_rounded
                    : Icons.expand_more_rounded,
                size: 20,
              ),
              label: Text(
                draft.expanded
                    ? 'Fewer details'
                    : 'More about this meaning',
                style: const TextStyle(fontSize: 13),
              ),
            ),
          ),
          if (draft.expanded) ...[
            const SizedBox(height: 4),
            _SenseChoice(
              label: 'How is it said?',
              hint: 'Everyday, respectful, joking…',
              icon: Icons.record_voice_over_outlined,
              value: draft.register,
              options: [
                for (final register in kSenseRegisters)
                  (id: register.id, label: register.label),
              ],
              enabled: enabled,
              onChanged: (value) => controller.setRegister(index, value),
            ),
            const SizedBox(height: 10),
            _SenseChoice(
              label: 'What is it about?',
              hint: 'Farming, kinship, the market…',
              icon: Icons.category_outlined,
              value: draft.domain,
              options: [
                for (final domain in kSenseDomains)
                  (id: domain.id, label: domain.label),
              ],
              enabled: enabled,
              onChanged: (value) => controller.setDomain(index, value),
            ),
            // Only offered on meanings after the first. The first meaning is
            // what the word class at the top of the form was chosen for, and
            // asking again immediately underneath it invites a contradiction
            // nobody can resolve.
            if (index > 0) ...[
              const SizedBox(height: 10),
              PartOfSpeechField(
                value: draft.partOfSpeech,
                enabled: enabled,
                isRequired: false,
                labelText: 'Word class for this meaning (optional)',
                helperText: _sameClassHint(declaredClass),
                onChanged: (value) => controller.setPartOfSpeech(index, value),
              ),
            ],
            const SizedBox(height: 10),
            TextFormField(
              controller: draft.kasemDefinition,
              enabled: enabled,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'This meaning, said in Kasem (optional)',
                hintText: 'What you would say to a child who asked',
                alignLabelWithHint: true,
                prefixIcon: Icon(Icons.record_voice_over_rounded),
              ),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: draft.usageNote,
              enabled: enabled,
              minLines: 1,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'When is it used? (optional)',
                hintText: 'The occasion for it, or who says it',
                alignLabelWithHint: true,
                prefixIcon: Icon(Icons.info_outline_rounded),
              ),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: draft.synonyms,
              enabled: enabled,
              decoration: const InputDecoration(
                labelText: 'Kasem words that mean the same (optional)',
                hintText: 'Separate them with commas',
                prefixIcon: Icon(Icons.compare_arrows_rounded),
              ),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: draft.antonyms,
              enabled: enabled,
              decoration: const InputDecoration(
                labelText: 'Kasem words that mean the opposite (optional)',
                hintText: 'Separate them with commas',
                prefixIcon: Icon(Icons.swap_horiz_rounded),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// "Leave blank if this meaning is also a thing."
  ///
  /// Spelled out rather than left to the word "optional", because a blank
  /// dropdown beside a filled one reads as an unanswered question. The whole
  /// point of the field is that blank is the ordinary, correct answer.
  String _sameClassHint(String declared) {
    final label = partOfSpeechById(declared)?.label;
    if (label == null || label.isEmpty) {
      return 'Leave blank if it is the same as the word itself.';
    }
    return 'Leave blank if this meaning is also ${label.toLowerCase()}.';
  }

  /// Asks before throwing away typed text, and not otherwise.
  ///
  /// A confirmation on an empty box is a dialog about nothing, and it is the
  /// case that happens most — somebody presses Add, sees what it does, and
  /// presses the cross.
  void _confirmRemove(
    BuildContext context,
    SensesController controller,
    SenseDraft draft,
    int index,
  ) {
    if (draft.isEmpty) {
      controller.removeAt(index);
      return;
    }
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove meaning ${index + 1}?'),
        content: const Text(
          'What you typed for this meaning will be lost. The other meanings '
          'stay as they are.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () {
              controller.removeAt(index);
              Navigator.of(context).pop();
            },
            child: const Text('Remove'),
          ),
        ],
      ),
    );
  }
}

/// A closed-list picker rendered as a dropdown with a "not sure" escape.
///
/// ── Why the empty option is spelled out ──────────────────────────────────
/// A dropdown whose blank state is an unlabelled gap reads as broken, and a
/// contributor who is genuinely unsure needs somewhere to land that is not a
/// guess. "Not sure" is a real answer here and it stores nothing, which is
/// exactly right: the field is absent rather than wrong.
class _SenseChoice extends StatelessWidget {
  const _SenseChoice({
    required this.label,
    required this.hint,
    required this.icon,
    required this.value,
    required this.options,
    required this.enabled,
    required this.onChanged,
  });

  final String label;
  final String hint;
  final IconData icon;
  final String value;
  final List<({String id, String label})> options;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
    initialValue: value.isEmpty ? '' : value,
    isExpanded: true,
    decoration: InputDecoration(
      labelText: label,
      helperText: hint,
      prefixIcon: Icon(icon),
    ),
    items: [
      const DropdownMenuItem(value: '', child: Text('Not sure')),
      for (final option in options)
        DropdownMenuItem(value: option.id, child: Text(option.label)),
    ],
    onChanged: enabled ? (selected) => onChanged(selected ?? '') : null,
  );
}
