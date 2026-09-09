import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/part_of_speech_picker.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/sense_fields.dart';
import 'package:indigen_world_mobile/features/dictionary/data/dictionary_admin.dart';
import 'package:indigen_world_mobile/features/dictionary/kasem_key_bar.dart';
import 'package:indigen_world_mobile/features/dictionary/merge_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// A validator or admin corrects a published word, in place.
///
/// ── Why this screen exists ────────────────────────────────────────────────
/// The correction path that existed asked a validator who had spotted a typo
/// to contribute a fresh entry and wait for a second validator to approve it.
/// That produced a duplicate, needed two people for a one-character fix, and
/// left the wrong entry live in the meantime — so in practice nobody used it
/// and the archive kept its typos. A word already in the dictionary is edited
/// where it is.
///
/// ── The rule the whole screen is built around ─────────────────────────────
/// Only what somebody actually changed is sent. `EntryPatch.withField` compares
/// each box against the value it opened with and drops the ones that match, so
/// a validator who came to fix the gloss cannot blank the etymology by opening
/// the form. The backend reads an absent key as "leave it alone" and a test
/// holds it there.
///
/// The senses are the sharpest case. A sense may carry four example sentences
/// and this form shows one pair of boxes, so the senses are only ever included
/// in the patch when a reviewer actually typed in one of them — see
/// [_sensesTouched]. Sending them unconditionally would silently drop the
/// second, third and fourth sentence off every entry a reviewer merely opened.
class EntryEditorScreen extends ConsumerStatefulWidget {
  const EntryEditorScreen({required this.entry, super.key});

  final DictionaryEntry entry;

  @override
  ConsumerState<EntryEditorScreen> createState() => _EntryEditorScreenState();
}

class _EntryEditorScreenState extends ConsumerState<EntryEditorScreen> {
  late final _headword = TextEditingController(text: widget.entry.headword);
  // The stored summary line as it stands, not the re-joined list. They usually
  // read the same, and where they differ — a legacy gloss written "water / rain
  // water" — prefilling the re-joined form would make opening the editor and
  // saving rewrite the punctuation of an entry nobody meant to touch.
  late final _english = TextEditingController(text: widget.entry.translation);
  late final _renderings = TextEditingController(
    text: widget.entry.renderings.join(', '),
  );
  late final _ipa = TextEditingController(text: widget.entry.ipa);
  late final _pronunciation = TextEditingController(
    text: widget.entry.pronunciation,
  );
  late final _kasemDefinition = TextEditingController(
    text: widget.entry.kasemDefinition,
  );
  late final _etymology = TextEditingController(text: widget.entry.etymology);
  late final _kasemExample = TextEditingController(text: widget.entry.example);
  late final _englishExample = TextEditingController(
    text: widget.entry.exampleTranslation,
  );
  late final _dialect = TextEditingController(text: widget.entry.dialect);
  late final _culturalNote = TextEditingController(
    text: widget.entry.culturalNote ?? '',
  );
  late final _reason = TextEditingController();

  /// The eleven paradigm slots, keyed the way `forms` is stored.
  late final Map<String, TextEditingController> _forms = {
    'definite': TextEditingController(text: widget.entry.definiteForm),
    'plural': TextEditingController(text: widget.entry.pluralForm),
    'pluralDefinite': TextEditingController(
      text: widget.entry.pluralDefiniteForm,
    ),
    'counted': TextEditingController(text: widget.entry.countedForm),
    'pronoun': TextEditingController(text: widget.entry.pronounForm),
    'present': TextEditingController(text: widget.entry.presentForm),
    'past': TextEditingController(text: widget.entry.pastForm),
    'future': TextEditingController(text: widget.entry.futureForm),
    'pluralSubject': TextEditingController(text: widget.entry.pluralSubjectForm),
    'imperative': TextEditingController(text: widget.entry.imperativeForm),
    'agreeingOne': TextEditingController(text: widget.entry.agreeingOneForm),
    'agreeingTwo': TextEditingController(text: widget.entry.agreeingTwoForm),
  };

  final _senses = SensesController();

  /// The scroll view, and the two boxes a refused save is about.
  ///
  /// A form this long can refuse for a reason that is off the screen. The
  /// delete path solved that by moving the demand into a dialog; save cannot,
  /// because saving is the form's own purpose — so instead the form takes the
  /// person to the box it is complaining about. See [_refuse].
  final _scroll = ScrollController();
  final _reasonKey = GlobalKey();
  final _reasonFocus = FocusNode();
  final _headwordKey = GlobalKey();

  /// The Kasem boxes, so the character bar knows which one to type into.
  ///
  /// Only the Kasem-language fields. Inserting `ɛ` into the English gloss is
  /// never what anybody meant, and offering it there would put the bar on the
  /// screen at moments it cannot help.
  late final Map<TextEditingController, FocusNode> _kasemFocus = {
    for (final controller in [
      _headword,
      _renderings,
      _kasemDefinition,
      _kasemExample,
      ..._forms.values,
    ])
      controller: FocusNode(),
  };

  PartOfSpeech? _partOfSpeech;
  late bool _published = widget.entry.isPublished;
  var _sensesTouched = false;
  var _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _partOfSpeech =
        partOfSpeechById(widget.entry.partOfSpeech.trim().toLowerCase()) ??
        partOfSpeechById(
          widget.entry.partOfSpeech.trim().toLowerCase().replaceAll(' ', '-'),
        );
    _senses
      ..loadFrom(widget.entry.displaySenses)
      ..addListener(_markSensesTouched);
  }

  /// The first edit inside the senses section is what opts the senses into the
  /// patch. See the class header: sending them regardless would drop the
  /// sentences this form has no boxes for.
  void _markSensesTouched() {
    if (!_sensesTouched) setState(() => _sensesTouched = true);
  }

  @override
  void dispose() {
    for (final controller in [
      _headword,
      _english,
      _renderings,
      _ipa,
      _pronunciation,
      _kasemDefinition,
      _etymology,
      _kasemExample,
      _englishExample,
      _dialect,
      _culturalNote,
      _reason,
      ..._forms.values,
    ]) {
      controller.dispose();
    }
    for (final node in _kasemFocus.values) {
      node.dispose();
    }
    _scroll.dispose();
    _reasonFocus.dispose();
    _senses
      ..removeListener(_markSensesTouched)
      ..dispose();
    super.dispose();
  }

  EntryPatch _buildPatch() {
    final entry = widget.entry;
    var patch = const EntryPatch.empty()
        .withField(
          'kasemText',
          _headword.text.trim(),
          original: entry.headword,
        )
        .withField(
          'englishText',
          _english.text.trim(),
          original: entry.translation,
        )
        .withField(
          'translations',
          _splitList(_renderings.text),
          original: entry.renderings,
        )
        .withField('ipa', _ipa.text.trim(), original: entry.ipa)
        .withField(
          'pronunciation',
          _pronunciation.text.trim(),
          original: entry.pronunciation,
        )
        .withField(
          'kasemDefinition',
          _kasemDefinition.text.trim(),
          original: entry.kasemDefinition,
        )
        .withField(
          'etymology',
          _etymology.text.trim(),
          original: entry.etymology,
        )
        .withField(
          'kasemExample',
          _kasemExample.text.trim(),
          original: entry.example,
        )
        .withField(
          'englishExample',
          _englishExample.text.trim(),
          original: entry.exampleTranslation,
        )
        .withField('dialect', _dialect.text.trim(), original: entry.dialect)
        .withField(
          'culturalNote',
          _culturalNote.text.trim(),
          original: entry.culturalNote ?? '',
        )
        .withField('isPublished', _published, original: entry.isPublished);

    if (_partOfSpeech != null && _partOfSpeech!.label != entry.partOfSpeech) {
      // The label, not the id: `partOfSpeech` has always been free text as the
      // contributor's own client sent it, and the backend derives the stable
      // `partOfSpeechId` beside it. Sending the id here would rewrite "Noun" to
      // "noun" on every entry a reviewer opened.
      patch = patch.withField('partOfSpeech', _partOfSpeech!.label);
    }

    final forms = <String, String>{
      for (final row in _forms.entries)
        if (row.value.text.trim().isNotEmpty) row.key: row.value.text.trim(),
    };
    final originalForms = <String, String>{
      for (final row in _forms.entries) row.key: '',
    }..addAll({
      'definite': entry.definiteForm,
      'plural': entry.pluralForm,
      'pluralDefinite': entry.pluralDefiniteForm,
      'counted': entry.countedForm,
      'pronoun': entry.pronounForm,
      'present': entry.presentForm,
      'past': entry.pastForm,
      'future': entry.futureForm,
      'pluralSubject': entry.pluralSubjectForm,
      'imperative': entry.imperativeForm,
      'agreeingOne': entry.agreeingOneForm,
      'agreeingTwo': entry.agreeingTwoForm,
    });
    originalForms.removeWhere((_, value) => value.isEmpty);
    patch = patch.withField('forms', forms, original: originalForms);

    if (_sensesTouched) {
      patch = patch.withField('senses', _senses.payload());
    }
    return patch;
  }

  /// Takes the reviewer to the box a refusal is about, and says why out loud.
  ///
  /// A refusal written into a line the form has scrolled past is a form that
  /// appears to do nothing when the button is pressed — which is exactly the
  /// bug the delete path had, and the same twelve boxes are between the save
  /// button and the headword.
  void _refuse(String message, {GlobalKey? at, FocusNode? focus}) {
    setState(() => _error = message);
    showGlassToast(context, message, icon: Icons.error_outline_rounded);
    final target = at?.currentContext;
    if (target != null) {
      Scrollable.ensureVisible(
        target,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        alignment: 0.2,
      );
    }
    focus?.requestFocus();
  }

  Future<void> _save() async {
    final repository = ref.read(dictionaryAdminRepositoryProvider);
    if (repository == null) return;
    final reason = _reason.text.trim();
    if (reason.length < 10) {
      _refuse(
        'Say what you changed and why — it is the only record of it.',
        at: _reasonKey,
        focus: _reasonFocus,
      );
      return;
    }
    if (_headword.text.trim().isEmpty) {
      _refuse(
        'A word needs its headword. Unpublish the entry instead of emptying it.',
        at: _headwordKey,
        focus: _kasemFocus[_headword],
      );
      return;
    }
    final patch = _buildPatch();
    if (patch.isEmpty) {
      _refuse('Nothing has changed yet.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final changed = await repository.edit(
        entryId: widget.entry.id,
        patch: patch,
        reason: reason,
      );
      // The stream the dictionary reads is a live Firestore snapshot, so it
      // updates itself — but the entry the caller handed this screen is a
      // value, and the screen underneath is still holding it.
      ref.invalidate(publishedDictionaryEntryProvider(widget.entry.id));
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showGlassToast(
        context,
        changed.isEmpty
            ? 'Nothing needed changing.'
            : 'Republished — ${changed.length} field${changed.length == 1 ? '' : 's'} changed.',
      );
    } on DictionaryAdminFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Deleting asks for its reason in the same breath as the confirmation.
  ///
  /// It used to ask for it in the box at the foot of the form — five hundred
  /// pixels below the bin icon that raised the demand, off-screen, and behind
  /// an error line nobody scrolled far enough to read. What that produced was
  /// somebody tapping every field on the screen looking for the place to write
  /// the reason they had just been told was required. A demand and the box that
  /// answers it belong in the same view.
  Future<void> _delete() async {
    final repository = ref.read(dictionaryAdminRepositoryProvider);
    if (repository == null) return;
    final reason = await showGlassPopup<String>(
      context: context,
      title: 'Delete “${widget.entry.headword}”?',
      maxWidth: 460,
      builder: (context) => DeleteReasonPrompt(initial: _reason.text.trim()),
    );
    if (reason == null || !mounted) return;
    // Kept on the form as well, so a delete that fails on the way out leaves
    // the words the reviewer wrote where they can be edited and tried again.
    _reason.text = reason;

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await repository.delete(entryId: widget.entry.id, reason: reason);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showGlassToast(context, 'Entry deleted.');
    } on DictionaryAdminFailure catch (failure) {
      if (!mounted) return;
      setState(() => _error = failure.message);
      // Said out loud as well as written into the form. The refusal belongs
      // where the person is looking, and after a tap on the bin in the app bar
      // that is the top of the screen, not the error line by the save button.
      showGlassToast(
        context,
        failure.message,
        icon: Icons.error_outline_rounded,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final duplicates = ref.watch(
      existingEntriesProvider(widget.entry.headword),
    );
    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(
        title: const Text('Edit entry'),
        actions: [
          if (ref.watch(canDeleteDictionaryProvider))
            IconButton(
              tooltip: 'Delete entry',
              onPressed: _saving ? null : _delete,
              icon: const Icon(Icons.delete_outline_rounded),
            ),
        ],
      ),
      // The character bar sits above the keyboard rather than in the form. 785
      // of the published headwords carry a letter no stock keyboard produces,
      // and a validator correcting a spelling is the person who needs those
      // letters most.
      bottomNavigationBar: KasemKeyBar(
        targets: _kasemFocus,
        onInserted: () => setState(() {}),
      ),
      body: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 40),
              children: [
                _Notice(
                  icon: Icons.edit_note_rounded,
                  colour: brand.accent,
                  title: 'This changes the published word',
                  body:
                      'What you save here is what every reader sees, straight '
                      'away. Only the boxes you actually change are sent — '
                      'anything you leave alone stays exactly as it is.',
                ),
                // ── What else is filed under this spelling ────────────────
                // Shown in the editor as well as at review, because the moment
                // a validator most often discovers a duplicate is while trying
                // to fix one of the pair.
                duplicates.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, _) => const SizedBox.shrink(),
                  data: (existing) => existing.matches
                          .where((row) => row.id != widget.entry.id)
                          .isEmpty
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: _DuplicateNotice(
                            existing: existing,
                            excludeId: widget.entry.id,
                            onMerge: (other) => _openMerge(other),
                          ),
                        ),
                ),
                const SizedBox(height: 16),
                _FieldGroup(
                  title: 'The word',
                  children: [
                    _Field(
                      key: _headwordKey,
                      controller: _headword,
                      focusNode: _kasemFocus[_headword],
                      label: 'Headword (Kasem)',
                      helper:
                          'Respelling moves the word to a different sense group '
                          'and it is given a new number there.',
                    ),
                    _Field(
                      controller: _renderings,
                      focusNode: _kasemFocus[_renderings],
                      label: 'Other Kasem spellings',
                      helper: 'Separated by commas. The first is the headword.',
                    ),
                    _Field(
                      controller: _english,
                      label: 'Meaning (English)',
                      helper:
                          'The summary line. Commas split it into the list every '
                          'reader shows.',
                    ),
                    PartOfSpeechField(
                      value: _partOfSpeech,
                      onChanged: (value) =>
                          setState(() => _partOfSpeech = value),
                      enabled: !_saving,
                    ),
                    _Field(controller: _dialect, label: 'Dialect'),
                  ],
                ),
                _FieldGroup(
                  title: 'How it is said',
                  children: [
                    _Field(
                      controller: _ipa,
                      label: 'IPA',
                      helper: 'Without the slashes — the entry adds them.',
                    ),
                    _Field(
                      controller: _pronunciation,
                      label: 'Written guide',
                    ),
                  ],
                ),
                _FieldGroup(
                  title: 'The meanings',
                  subtitle:
                      'Left alone unless you type in one of them, because a '
                      'meaning can carry more sentences than these boxes show.',
                  children: [
                    SensesSection(
                      controller: _senses,
                      declaredClass: _partOfSpeech?.id ?? '',
                      enabled: !_saving,
                    ),
                  ],
                ),
                _FieldGroup(
                  title: 'In Kasem, and where it comes from',
                  children: [
                    _Field(
                      controller: _kasemDefinition,
                      focusNode: _kasemFocus[_kasemDefinition],
                      label: 'What it means, in Kasem',
                      lines: 3,
                    ),
                    _Field(
                      controller: _etymology,
                      label: 'Where it comes from',
                      lines: 2,
                    ),
                    _Field(
                      controller: _culturalNote,
                      label: 'Cultural context',
                      lines: 2,
                    ),
                  ],
                ),
                _FieldGroup(
                  title: 'Example sentence',
                  subtitle:
                      'The entry-level pair, shown when no meaning carries one '
                      'of its own.',
                  children: [
                    _Field(
                      controller: _kasemExample,
                      focusNode: _kasemFocus[_kasemExample],
                      label: 'Kasem',
                      lines: 2,
                    ),
                    _Field(
                      controller: _englishExample,
                      label: 'English',
                      lines: 2,
                    ),
                  ],
                ),
                _FieldGroup(
                  title: 'The forms',
                  subtitle:
                      'An empty box means nobody has recorded it, which is the '
                      'honest answer for most of the archive. Leave it empty '
                      'rather than guessing.',
                  children: [
                    for (final row in _formRows)
                      _Field(
                        controller: _forms[row.slot]!,
                        focusNode: _kasemFocus[_forms[row.slot]],
                        label: row.label,
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: _published,
                  onChanged: _saving
                      ? null
                      : (value) => setState(() => _published = value),
                  title: const Text('Published'),
                  subtitle: Text(
                    _published
                        ? 'In the dictionary and searchable.'
                        : 'Out of the dictionary. Its sense number stays spent, '
                              'and nothing else is lost.',
                    style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  key: _reasonKey,
                  controller: _reason,
                  focusNode: _reasonFocus,
                  minLines: 2,
                  maxLines: 5,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'What you changed, and why',
                    hintText: 'Required. It is the only record of this edit.',
                    alignLabelWithHint: true,
                    prefixIcon: Icon(Icons.history_edu_outlined),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 4),
                  _Notice(
                    icon: Icons.error_outline_rounded,
                    colour: brand.terracotta,
                    title: 'Not saved',
                    body: _error!,
                  ),
                ],
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.publish_rounded),
                  label: const Text('Save and republish'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openMerge(ExistingEntry other) async {
    final merged = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => MergeEntriesScreen(
          keepId: widget.entry.id,
          keepHeadword: widget.entry.headword,
          duplicateId: other.id,
          duplicateHeadword: other.kasemText,
        ),
      ),
    );
    if (merged == true && mounted) Navigator.of(context).pop(true);
  }

  static const _formRows = <({String slot, String label})>[
    (slot: 'definite', label: 'The one'),
    (slot: 'plural', label: 'Many'),
    (slot: 'pluralDefinite', label: 'The many'),
    (slot: 'counted', label: 'Two'),
    (slot: 'pronoun', label: 'Stands for it'),
    (slot: 'present', label: 'Now'),
    (slot: 'past', label: 'Yesterday'),
    (slot: 'future', label: 'Tomorrow'),
    (slot: 'pluralSubject', label: 'Several doing it'),
    (slot: 'imperative', label: 'Telling somebody'),
    (slot: 'agreeingOne', label: 'Used with'),
    (slot: 'agreeingTwo', label: 'And with'),
  ];
}

List<String> _splitList(String raw) => [
  for (final piece in raw.split(RegExp(r'[,/\n]')))
    if (piece.trim().isNotEmpty) piece.trim(),
];

/// What else the archive holds under this spelling, and the way out of it.
class _DuplicateNotice extends StatelessWidget {
  const _DuplicateNotice({
    required this.existing,
    required this.onMerge,
    this.excludeId = '',
  });

  final ExistingEntries existing;
  final String excludeId;
  final ValueChanged<ExistingEntry> onMerge;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final rows = existing.matches
        .where((row) => row.id != excludeId)
        .toList(growable: false);
    if (rows.isEmpty) return const SizedBox.shrink();
    final exact = rows.where((row) => row.exact).length;
    return GlassSurface(
      accent: brand.gold,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.content_copy_rounded, size: 18, color: brand.gold),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  exact > 0
                      ? 'This word is already in the dictionary'
                      : 'Something very like this is already here',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            // Prompt, never block. Two entries under one spelling is a
            // homograph — `mo¹` the particle beside `mo²` the focus marker —
            // and refusing the second would make the dictionary unable to hold
            // a distinction the language makes.
            exact > 0
                ? 'They may be the same word, or they may be different words '
                      'that share a spelling. If they are the same word, merge '
                      'them; if they are not, leave both.'
                : 'Close enough to be a retyping of the same word. Look before '
                      'you decide — a single letter is often a different word.',
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 12.5,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 12),
          for (final row in rows) ...[
            _ExistingRow(row: row, onMerge: () => onMerge(row)),
            if (row != rows.last) const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _ExistingRow extends StatelessWidget {
  const _ExistingRow({required this.row, required this.onMerge});

  final ExistingEntry row;
  final VoidCallback onMerge;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      blur: false,
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.kasemText,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 15.5,
                      ),
                    ),
                    if (row.englishText.isNotEmpty)
                      Text(
                        row.englishText,
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 12.5,
                        ),
                      ),
                  ],
                ),
              ),
              if (!row.exact)
                GlassPill(
                  label: '${(row.similarity * 100).round()}% alike',
                  icon: Icons.compare_arrows_rounded,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (row.partOfSpeech.isNotEmpty)
                GlassPill(label: row.partOfSpeech, icon: Icons.style_rounded),
              if (row.dialect.isNotEmpty)
                GlassPill(label: row.dialect, icon: Icons.place_rounded),
              if (row.homographIndex > 0)
                GlassPill(
                  label: 'Sense ${row.homographIndex}',
                  icon: Icons.numbers_rounded,
                ),
              if (row.hasAudio)
                const GlassPill(
                  label: 'Recorded',
                  icon: Icons.volume_up_rounded,
                ),
              if (!row.isPublished)
                const GlassPill(
                  label: 'Not published',
                  icon: Icons.visibility_off_rounded,
                ),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onMerge,
            icon: const Icon(Icons.merge_rounded, size: 18),
            label: const Text('Compare and merge'),
          ),
        ],
      ),
    );
  }
}

/// The delete confirmation, with the reason it asks for inside it.
///
/// Pops the reason when the admin goes through with it and null when they do
/// not, so the caller reads one value and never has to ask twice.
class DeleteReasonPrompt extends StatefulWidget {
  const DeleteReasonPrompt({this.initial = '', super.key});

  /// Whatever is already in the form's own reason box. Usually empty; carried
  /// across so somebody who wrote their reason there first does not write it
  /// twice.
  final String initial;

  @override
  State<DeleteReasonPrompt> createState() => DeleteReasonPromptState();
}

class DeleteReasonPromptState extends State<DeleteReasonPrompt> {
  late final _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// The same floor the callable enforces. Checked here as well so the button
  /// is visibly unavailable rather than failing on the server with the entry
  /// still on screen.
  static const _minimum = 10;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final reason = _controller.text.trim();
    final ready = reason.length >= _minimum;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'The entry leaves the archive. Its sense number stays spent, and the '
          'whole document is kept in the audit log — but nothing in the app '
          'will point at it again. Unpublishing is the reversible answer.',
          style: TextStyle(color: brand.ink, fontSize: 15, height: 1.45),
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _controller,
          autofocus: true,
          minLines: 2,
          maxLines: 4,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Why is it being deleted?',
            hintText: 'Required. It is the only record of this deletion.',
            alignLabelWithHint: true,
            prefixIcon: Icon(Icons.history_edu_outlined),
          ),
        ),
        if (!ready)
          Text(
            reason.isEmpty
                ? 'A sentence is enough — but it has to say something.'
                : '${_minimum - reason.length} more character'
                      '${_minimum - reason.length == 1 ? '' : 's'}.',
            style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
          ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  minimumSize: const Size(0, 50),
                  foregroundColor: brand.mutedInk,
                ),
                child: const Text('Keep it', overflow: TextOverflow.ellipsis),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                onPressed: ready
                    ? () => Navigator.of(context).pop(reason)
                    : null,
                style: FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                  foregroundColor: Colors.white,
                ),
                child: const Text('Delete', overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _FieldGroup extends StatelessWidget {
  const _FieldGroup({
    required this.title,
    required this.children,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 12),
        Text(
          title.toUpperCase(),
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 9,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ],
        const SizedBox(height: 10),
        ...children,
      ],
    ),
  );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    this.focusNode,
    this.helper,
    this.lines = 1,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode? focusNode;
  final String label;
  final String? helper;
  final int lines;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      focusNode: focusNode,
      minLines: lines,
      maxLines: lines,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        helperMaxLines: 3,
      ),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice({
    required this.icon,
    required this.colour,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final Color colour;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => GlassSurface(
    accent: colour,
    padding: const EdgeInsets.all(15),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 19, color: colour),
        const SizedBox(width: 11),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                body,
                style: TextStyle(
                  color: context.brand.mutedInk,
                  fontSize: 12.5,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
