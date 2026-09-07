import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_received_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/features/contribute/draft_assist.dart';
import 'package:indigen_world_mobile/features/contribute/pronunciation_recorder.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/lexical_detail_fields.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/part_of_speech_picker.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/sense_fields.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// One kind of contribution, and nothing else.
///
/// The form used to sit under a picker that could change its mind at any
/// moment: a member half way through describing a song could tap *Dictionary*
/// and watch every label, dropdown and pledge rewrite itself around the text
/// they had already typed. The kind is now settled before this screen opens —
/// by the chooser, or by whoever pushed it — so the questions here are fixed
/// for as long as the screen is up.
class ContributionFormScreen extends ConsumerStatefulWidget {
  const ContributionFormScreen({
    required this.kind,
    this.lexicalKind,
    this.initialSource = '',
    this.relatedEntryId,
    super.key,
  });

  final CollectionKind kind;

  /// Which lexical act this is, on the dictionary path. Null everywhere else.
  ///
  /// The chooser now offers the dictionary twice — a guided queue for single
  /// words, and this form for the sayings nobody could have prompted somebody
  /// for — so the form has to know which of the two brought a member here. It
  /// is only ever [LexicalKind.word] when something outside the chooser pushed
  /// this screen at a word: a correction to a published entry, or the
  /// dictionary's own "add this word" button.
  ///
  /// What it changes is the wording, and one question. A proverb is not "an
  /// English or source word" and asking for one under that label is how the
  /// old single form managed to be wrong for both halves of its own kind.
  final LexicalKind? lexicalKind;

  /// A word the member was already looking at when they decided to contribute.
  final String initialSource;

  /// The published entry this submission is a correction to, if any.
  final String? relatedEntryId;

  @override
  ConsumerState<ContributionFormScreen> createState() =>
      _ContributionFormScreenState();
}

class _ContributionFormScreenState
    extends ConsumerState<ContributionFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  final _bodyController = TextEditingController();
  final _sourceController = TextEditingController();
  final _notesController = TextEditingController();
  final _kasemExampleController = TextEditingController();
  final _englishExampleController = TextEditingController();

  String? _dialect;
  String? _format;

  /// The chosen word class on the dictionary path.
  ///
  /// Held alongside [_format] rather than instead of it because [_format] is
  /// what every other kind uses and what goes over the wire; this is the
  /// object the picker deals in. Setting the two together is one line and
  /// saves the submit path a lookup that could get out of step.
  PartOfSpeech? _partOfSpeech;

  /// The paradigm, and the three fields that turn a row into an entry.
  ///
  /// The same holder the guided queue uses, deliberately. The two paths reach
  /// the same review desk and produce the same published entry, so a word
  /// contributed through this form has to be able to carry everything a word
  /// answered in the queue carries — otherwise which fields an entry has
  /// depends on which door its contributor came through, and nobody would
  /// notice until they compared two entries side by side.
  ///
  /// Rendered only on the dictionary path. On a song these controllers exist
  /// and are never shown, which costs thirteen empty strings and saves a
  /// conditional around every reference to them.
  final _forms = LexicalFormsControllers();

  /// Every meaning this word carries.
  ///
  /// -- Why the form no longer has a single "what it means" box ----------
  /// Because a word does not have a single meaning. English *toy* is a
  /// plaything, a trinket and a small breed of dog before it is a verb, and
  /// the form used to ask for that once and store the comma-separated answer
  /// as one meaning -- with one example sentence attached to none of them.
  ///
  /// This owns every meaning including the first, which is why
  /// [_titleController] is now kept in step with it rather than typed into.
  /// The alternative -- keep the old box for meaning one and offer a section
  /// for the rest -- would have made an entry's FIRST sense the only one that
  /// could not carry a register, a subject field or its own sentence.
  ///
  /// Only rendered on the dictionary path. On a song these controllers exist
  /// and are never shown, which costs one empty draft and saves a conditional
  /// around every reference to them.
  final _senses = SensesController();

  /// The other classes the contributor said this word is also used as.
  var _alsoUsedAs = <String>{};

  bool _rightsConfirmed = false;
  bool _publicationPermission = false;
  bool _participantConsentConfirmed = false;
  bool? _usesThirdPartyMaterial;
  bool _saving = false;
  String? _submitError;

  /// What the backend noticed about this draft, or empty.
  ///
  /// Advice only — the send button below never consults it. See
  /// `draft_assist.dart` for why that boundary is not negotiable.
  List<AssistCheck> _assistChecks = const <AssistCheck>[];

  /// Guards against a slow reply overwriting a newer one. The two fields are
  /// checked on every keystroke and the replies can arrive out of order, so
  /// each request carries a sequence number and only the newest is drawn.
  int _assistSequence = 0;

  /// The song, narration or manuscript itself, chosen but not yet uploaded.
  ///
  /// Staged rather than uploaded on selection so that backing out of the form
  /// never leaves a file nobody asked for sitting in Storage.
  PickedContributionFile? _file;
  double? _uploadProgress;

  /// The song's cover, on the same terms. Optional everywhere, offered only
  /// where there is something for it to be the cover of.
  PickedContributionFile? _cover;
  double? _coverProgress;

  CollectionKind get _kind => widget.kind;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialSource);
    // The English side of the record is the first meaning, so the two are one
    // value with two readers rather than two fields somebody has to keep in
    // agreement. Everything downstream -- the draft check, the validator, the
    // callable, the review desk -- goes on reading `title` and never learns
    // that it is now typed into a different box.
    _senses.first.definition.text = widget.initialSource;
    _senses.first.definition.addListener(_syncTitleFromSenses);
  }

  /// Copies the first meaning into the field the pipeline reads as English.
  ///
  /// Deliberately not `setState`: nothing on screen renders [_titleController]
  /// on the dictionary path, so rebuilding the form on every keystroke of the
  /// meaning box would cost a frame to change nothing visible.
  void _syncTitleFromSenses() {
    if (_kind != CollectionKind.dictionary) return;
    _titleController.text = _senses.primaryDefinition;
  }

  /// Asks the backend what it notices, when there is enough to ask about.
  ///
  /// Fired from the two fields that matter rather than on a timer, and only on
  /// the dictionary path — a song has no headword to collide with. It is
  /// deliberately not debounced into invisibility: the callable is cheap, and
  /// advice that arrives after somebody has already pressed send is advice
  /// nobody reads.
  Future<void> _refreshAssist() async {
    if (_kind != CollectionKind.dictionary) return;
    final sequence = ++_assistSequence;
    final checks = await ref
        .read(draftAssistServiceProvider)
        .review(
          // Title is the English side and body is the Kasem, which is the
          // direction the whole pipeline reads them in — see
          // `buildCollectionContributionReceipt`.
          kasem: _bodyController.text,
          english: _titleController.text,
          partOfSpeech: _partOfSpeech?.id ?? _format ?? '',
        );
    if (!mounted || sequence != _assistSequence) return;
    setState(() => _assistChecks = checks);
  }

  @override
  void dispose() {
    _senses.first.definition.removeListener(_syncTitleFromSenses);
    _senses.dispose();
    _titleController.dispose();
    _bodyController.dispose();
    _sourceController.dispose();
    _notesController.dispose();
    _kasemExampleController.dispose();
    _englishExampleController.dispose();
    _forms.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.brand.background,
    appBar: AppBar(title: const Text('Contribute')),
    body: ScreenContainer(
      child: ListView(
        key: const PageStorageKey('contribution-form-scroll'),
        // The mini-player floats above the Navigator, so it covers a pushed
        // route too. Asked for rather than assumed: a member who has never
        // pressed play gets nothing reserved.
        padding: EdgeInsets.only(bottom: 40 + musicInset(context)),
        children: [
          BrandHeader(
            // No eyebrow over a heading that would only say the word again —
            // except on a correction, where "Contribute" is the orientation
            // the heading itself no longer gives.
            eyebrow: widget.relatedEntryId == null ? null : 'Contribute',
            title: widget.relatedEntryId == null
                ? _heading
                : 'Suggest a correction.',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ContributionFields(
                  formKey: _formKey,
                  kind: _kind,
                  onDraftChanged: _kind == CollectionKind.dictionary
                      ? _refreshAssist
                      : null,
                  lexicalKind: widget.lexicalKind,
                  partOfSpeech: _partOfSpeech,
                  onPartOfSpeechChanged: (value) => setState(() {
                    _partOfSpeech = value;
                    // The label, not the id: `format` is a free-text column
                    // shared with four other kinds, and the backend's
                    // `canonicalPartOfSpeech` resolves a label back to its id.
                    // Writing the id here would put "proper-noun" in a field
                    // the review desk prints verbatim.
                    _format = value.label;
                    // The offers are per class — "also an action" on a noun,
                    // "also a thing" on a verb — so a selection made under one
                    // class means nothing under another. Cleared rather than
                    // carried: a hidden chip that is still selected sends a
                    // claim nobody can see they made.
                    _alsoUsedAs = <String>{};
                  }),
                  forms: _forms,
                  senses: _senses,
                  alsoUsedAs: _alsoUsedAs,
                  onAlsoUsedAsChanged: (value) =>
                      setState(() => _alsoUsedAs = value),
                  titleController: _titleController,
                  bodyController: _bodyController,
                  sourceController: _sourceController,
                  notesController: _notesController,
                  kasemExampleController: _kasemExampleController,
                  englishExampleController: _englishExampleController,
                  dialect: _dialect,
                  format: _format,
                  file: _file,
                  uploadProgress: _uploadProgress,
                  cover: _cover,
                  coverProgress: _coverProgress,
                  rightsConfirmed: _rightsConfirmed,
                  publicationPermission: _publicationPermission,
                  participantConsentConfirmed: _participantConsentConfirmed,
                  usesThirdPartyMaterial: _usesThirdPartyMaterial,
                  onDialectChanged: (value) => setState(() => _dialect = value),
                  onFormatChanged: (value) => setState(() => _format = value),
                  onPickFile: _pickFile,
                  onPronunciationRecorded: (recording) => setState(() {
                    _file = recording;
                    _submitError = null;
                  }),
                  onClearFile: () => setState(() => _file = null),
                  onPickCover: _pickCover,
                  onClearCover: () => setState(() => _cover = null),
                  onRightsChanged: (value) =>
                      setState(() => _rightsConfirmed = value),
                  onPublicationChanged: (value) =>
                      setState(() => _publicationPermission = value),
                  onParticipantConsentChanged: (value) =>
                      setState(() => _participantConsentConfirmed = value),
                  onThirdPartyMaterialChanged: (value) =>
                      setState(() => _usesThirdPartyMaterial = value),
                ),
                if (_assistChecks.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  DraftAssistNotices(checks: _assistChecks),
                ],
                if (_submitError != null) ...[
                  const SizedBox(height: 14),
                  _SubmitError(message: _submitError!),
                ],
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: _saving ? null : _submit,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.cloud_upload_outlined),
                  label: Text(
                    _saving ? 'Sending securely…' : 'Submit for review',
                  ),
                ),
                const SizedBox(height: 9),
                Text(
                  'Reviewed before it is published.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.brand.mutedInk, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  /// The heading, which now has one kind to name rather than five.
  ///
  /// The dictionary has two headings because it has two offers behind it. A
  /// member who tapped "Add an idiom or proverb" and landed on *Add a word.*
  /// would reasonably wonder whether they had pressed the wrong card.
  String get _heading => switch (_kind) {
    CollectionKind.music => 'Add a song.',
    CollectionKind.dictionary => switch (widget.lexicalKind) {
      null || LexicalKind.word => 'Add a word.',
      LexicalKind.phrase => 'Add a phrase.',
      LexicalKind.idiom || LexicalKind.proverb => 'Add a saying.',
    },
    CollectionKind.literature => 'Add a written work.',
    CollectionKind.audiobooks => 'Add a narration.',
    CollectionKind.video => 'Add a film.',
  };

  /// Chooses the file behind this contribution, if the kind carries one.
  Future<void> _pickFile() async {
    final kind = contributionUploadKind(_kind);
    if (kind == null) return;
    try {
      final picked = await const ContributionUploader().pick(kind);
      if (picked == null || !mounted) return;
      setState(() {
        _file = picked;
        _submitError = null;
      });
    } on ContributionUploadFailure catch (failure) {
      if (mounted) setState(() => _submitError = failure.message);
    }
  }

  /// Chooses the artwork. Held to its own, much smaller ceiling.
  Future<void> _pickCover() async {
    try {
      final picked = await const ContributionUploader().pick(
        ContributionMediaKind.image,
        maxBytes: ContributionUploader.maxCoverBytes,
      );
      if (picked == null || !mounted) return;
      setState(() {
        _cover = picked;
        _submitError = null;
      });
    } on ContributionUploadFailure catch (failure) {
      if (mounted) setState(() => _submitError = failure.message);
    }
  }

  /// Every paradigm slot with something in it.
  ///
  /// Keyed by the slot names the server validates against `FORM_SLOTS` in
  /// `kasem-morphology.ts`. Empty slots are omitted rather than sent blank:
  /// eleven keys of which the median word fills none would put ten empty
  /// strings on every review document, and make an unanswered question
  /// indistinguishable from one answered with nothing.
  Map<String, String> _answeredForms() {
    final answered = <String, String>{
      'definite': _forms.definiteText,
      'plural': _forms.pluralText,
      'pluralDefinite': _forms.pluralDefiniteText,
      'counted': _forms.countedText,
      'pronoun': _forms.pronounText,
      'present': _forms.presentText,
      'past': _forms.pastText,
      'future': _forms.futureText,
      'pluralSubject': _forms.pluralSubjectText,
      'imperative': _forms.imperativeText,
      'agreeingOne': _forms.agreeingOneText,
      'agreeingTwo': _forms.agreeingTwoText,
    }..removeWhere((_, value) => value.isEmpty);
    return answered;
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final isValid = _formKey.currentState?.validate() ?? false;
    final needsFile = contributionRequiresUpload(_kind) && _file == null;
    if (!isValid ||
        !_rightsConfirmed ||
        !_participantConsentConfirmed ||
        needsFile) {
      setState(() {
        _submitError = needsFile
            ? 'Upload the ${contributionUploadKind(_kind)?.label ?? 'file'} before submitting.'
            : !_rightsConfirmed
            ? 'Confirm that you have permission to share this contribution.'
            : !_participantConsentConfirmed
            ? 'Confirm consent, or that there are no other participants.'
            : 'Please review the highlighted fields.';
      });
      return;
    }

    var user = ref.read(firebaseAuthProvider)?.currentUser;
    if (user == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !mounted) return;
      user = ref.read(firebaseAuthProvider)?.currentUser;
    }
    final repository = ref.read(collectionContributionRepositoryProvider);
    if (user == null || repository == null) {
      setState(() {
        _submitError = 'Submissions are not available right now. Check your connection and try again.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _submitError = null;
      _uploadProgress = _file == null ? null : 0;
      _coverProgress = _cover == null ? null : 0;
    });
    var submitted = false;
    try {
      // The file goes first and separately: it lands in the member's own
      // private prefix, and the callable is handed the path rather than the
      // bytes, so a 40 MB recording never has to fit through a function call.
      UploadedContributionFile? uploaded;
      final staged = _file;
      if (staged != null) {
        uploaded = await const ContributionUploader().upload(
          uid: user.uid,
          file: staged,
          onProgress: (value) {
            if (mounted) setState(() => _uploadProgress = value);
          },
        );
      }

      // Then the artwork, into the same prefix and reported on its own bar.
      // One combined percentage across two files of wildly different sizes
      // would sit at 99% for the whole of the small one.
      UploadedContributionFile? uploadedCover;
      final art = _cover;
      if (art != null) {
        uploadedCover = await const ContributionUploader().upload(
          uid: user.uid,
          file: art,
          onProgress: (value) {
            if (mounted) setState(() => _coverProgress = value);
          },
        );
      }

      await repository.submit(
        CollectionContributionDraft(
          kind: _kind,
          title: _titleController.text,
          body: _bodyController.text,
          format: _format ?? '',
          dialect: _dialect ?? '',
          source: _sourceController.text,
          media: uploaded,
          cover: uploadedCover,
          notes: _notesController.text,
          publicationPermission: _publicationPermission,
          // Only asked where a person is the subject of the work. Null means
          // the question was not put, which a reviewer can tell apart from a
          // declared "no".
          involvesMinors: null,
          usesThirdPartyMaterial: _usesThirdPartyMaterial ?? false,
          participantConsentConfirmed: _participantConsentConfirmed,
          // -- The two legacy example fields are still filled -----------
          // On the dictionary path the sentences now live on the meanings
          // they illustrate, and these two carry the first of them forward.
          // They are read by the review desk, by every app build that predates
          // senses, and by the published entry's own Example card; leaving
          // them empty on a contribution that plainly has an example would
          // make a well-documented word look bare on three surfaces at once.
          // The entry screen suppresses the duplicate at render time instead.
          kasemExample: _kind == CollectionKind.dictionary
              ? _senses.legacyExample.kasem
              : _kasemExampleController.text,
          englishExample: _kind == CollectionKind.dictionary
              ? _senses.legacyExample.english
              : _englishExampleController.text,
          senses: _kind == CollectionKind.dictionary
              ? _senses.payload()
              : const <Map<String, Object?>>[],
          relatedEntryId: widget.relatedEntryId,
          // Only on the dictionary path, and only the answered slots. On a
          // song these controllers were never rendered, so anything in them
          // would be state left over from a previous life of the screen rather
          // than something a member said.
          forms: _kind == CollectionKind.dictionary
              ? _answeredForms()
              : const <String, String>{},
          alsoUsedAs: _kind == CollectionKind.dictionary
              ? _alsoUsedAs.toList(growable: false)
              : const <String>[],
          ipa: _kind == CollectionKind.dictionary ? _forms.ipaText : '',
          kasemDefinition: _kind == CollectionKind.dictionary
              ? _forms.kasemDefinitionText
              : '',
          etymology:
              _kind == CollectionKind.dictionary ? _forms.etymologyText : '',
        ),
      );
      ref.invalidate(myCollectionContributionsProvider);
      if (!mounted) return;
      _bodyController.clear();
      _sourceController.clear();
      _notesController.clear();
      _kasemExampleController.clear();
      _englishExampleController.clear();
      // The listener is re-attached because `reset` replaces the first draft
      // with a new one; without this the title would silently stop tracking
      // the meaning box and the next contribution would submit with the
      // previous word's English side.
      _senses.first.definition.removeListener(_syncTitleFromSenses);
      _senses.reset();
      _senses.first.definition.addListener(_syncTitleFromSenses);
      if (widget.initialSource.isEmpty) _titleController.clear();
      setState(() {
        _rightsConfirmed = false;
        _publicationPermission = false;
        _participantConsentConfirmed = false;
        _usesThirdPartyMaterial = null;
        _format = null;
        _partOfSpeech = null;
        _dialect = null;
        _file = null;
        _cover = null;
      });
      submitted = true;
    } on ContributionUploadFailure catch (failure) {
      if (mounted) setState(() => _submitError = failure.message);
    } on Object {
      if (mounted) {
        setState(() {
          _submitError = 'The contribution was not sent. Check your connection and try again.';
        });
      }
    } finally {
      // Reset before the receipt rather than after it: the receipt is a route
      // of its own now, and leaving the button spinning underneath it would
      // greet anybody who came back to this form with a dead control.
      if (mounted) {
        setState(() {
          _saving = false;
          _uploadProgress = null;
          _coverProgress = null;
        });
      }
    }
    if (!submitted || !mounted) return;

    // Read while the widget is still alive: the receipt may take this route
    // off the stack, and a rating ask must not depend on a disposed ref.
    final online = ref.read(connectionBlockProvider) == null;
    final navigator = Navigator.of(context);
    final done = await navigator.push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => ContributionReceivedScreen(kind: _kind),
      ),
    );

    // True only from the receipt's own Done. "See my submissions" replaces the
    // receipt with the list and hands nothing back, and popping this form from
    // under it would take the list down with it.
    if (done == true && navigator.canPop()) {
      // The `true` is the chooser's cue that its question has been answered
      // and it may leave too, so Done lands on the hub rather than back on
      // "What are you contributing?".
      navigator.pop(true);
    }

    // Deliberately outside the catch: anything that fails while asking for a
    // rating has nothing to do with whether the contribution went, and saying
    // "not sent" about one that was would have somebody submit it twice.
    //
    // Giving something to the language record is the moment somebody is most
    // glad they installed this. The receipt has already been dismissed, so the
    // ask lands on a clear screen — and is rationed inside, so most of the time
    // it does nothing.
    await maybeRequestReview(online: online);
  }
}

/// The form for one kind of contribution.
///
/// There is no longer a single form with a couple of fields switched on and
/// off. A song, a word, a written work and a film are four different things to
/// submit, and asking a member the same questions about all of them produced
/// some that made no sense — most obviously whether a child was involved in
/// *making a song*, which is what a consent pledge covers and a disclosure
/// question does not. Each kind asks only what it needs, in the order somebody
/// would actually fill it in: what it is, the work itself, who it came from,
/// then the permissions.
class _ContributionFields extends StatelessWidget {
  const _ContributionFields({
    required this.formKey,
    required this.kind,
    required this.lexicalKind,
    required this.partOfSpeech,
    required this.onPartOfSpeechChanged,
    required this.forms,
    required this.senses,
    required this.alsoUsedAs,
    required this.onAlsoUsedAsChanged,
    required this.titleController,
    required this.bodyController,
    required this.sourceController,
    required this.notesController,
    required this.kasemExampleController,
    required this.englishExampleController,
    required this.dialect,
    required this.format,
    required this.file,
    required this.uploadProgress,
    required this.cover,
    required this.coverProgress,
    required this.rightsConfirmed,
    required this.publicationPermission,
    required this.participantConsentConfirmed,
    required this.usesThirdPartyMaterial,
    required this.onDialectChanged,
    required this.onFormatChanged,
    required this.onPickFile,
    required this.onPronunciationRecorded,
    required this.onClearFile,
    required this.onPickCover,
    required this.onClearCover,
    required this.onRightsChanged,
    required this.onPublicationChanged,
    this.onDraftChanged,
    required this.onParticipantConsentChanged,
    required this.onThirdPartyMaterialChanged,
  });

  final GlobalKey<FormState> formKey;
  final CollectionKind kind;
  final LexicalKind? lexicalKind;

  /// The paradigm and the advanced detail boxes, shared with the guided queue.
  final LexicalFormsControllers forms;

  /// Every meaning this word carries. Rendered only on the dictionary path.
  final SensesController senses;

  /// The other classes this word is also used as, and the way to change them.
  final Set<String> alsoUsedAs;
  final ValueChanged<Set<String>> onAlsoUsedAsChanged;
  final PartOfSpeech? partOfSpeech;
  final ValueChanged<PartOfSpeech> onPartOfSpeechChanged;
  final TextEditingController titleController;
  final TextEditingController bodyController;
  final TextEditingController sourceController;
  final TextEditingController notesController;
  final TextEditingController kasemExampleController;
  final TextEditingController englishExampleController;
  final String? dialect;
  final String? format;
  final PickedContributionFile? file;
  final double? uploadProgress;
  final PickedContributionFile? cover;
  final double? coverProgress;
  final bool rightsConfirmed;
  final bool publicationPermission;
  final bool participantConsentConfirmed;
  final bool? usesThirdPartyMaterial;
  final ValueChanged<String?> onDialectChanged;
  final ValueChanged<String?> onFormatChanged;
  final VoidCallback onPickFile;
  final ValueChanged<PickedContributionFile> onPronunciationRecorded;
  final VoidCallback onClearFile;
  final VoidCallback onPickCover;
  final VoidCallback onClearCover;
  final ValueChanged<bool> onRightsChanged;
  final ValueChanged<bool> onPublicationChanged;

  /// Fired when the two fields a draft check reads have changed. Null on every
  /// kind but the dictionary, which is the only one with a headword that can
  /// collide with anything.
  final VoidCallback? onDraftChanged;
  final ValueChanged<bool> onParticipantConsentChanged;
  final ValueChanged<bool?> onThirdPartyMaterialChanged;

  bool get _isDictionary => kind == CollectionKind.dictionary;

  /// Whether this is a saying rather than a headword.
  ///
  /// Null counts as a word: something outside the chooser — a correction, the
  /// dictionary's own "add this word" — pushed this form without an opinion,
  /// and a headword is what those always mean.
  bool get _isSaying =>
      _isDictionary &&
      lexicalKind != null &&
      lexicalKind != LexicalKind.word;

  @override
  Widget build(BuildContext context) => Form(
    key: formKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // -- The English side --------------------------------------------
        // On every kind but the dictionary this is one box: a song has one
        // title. A word has as many meanings as it has, so the dictionary path
        // gets the meanings section instead -- which owns the first meaning as
        // well as the rest, and keeps `titleController` in step with it.
        if (!_isDictionary)
          TextFormField(
            controller: titleController,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: _titleLabel,
              hintText: _titleHint,
              prefixIcon: Icon(contributionKindIcon(kind)),
            ),
            // Checked when the field is left rather than on every keystroke:
            // the question being asked is "does the archive already hold
            // this", and asking it of half a word answers about a word nobody
            // typed.
            onEditingComplete: onDraftChanged,
            onFieldSubmitted: (_) => onDraftChanged?.call(),
            validator: _required,
          ),
        if (!_isDictionary) const SizedBox(height: 13),
        // The dictionary gets the searchable word-class picker; everything
        // else keeps its short dropdown. The difference is the length of the
        // list: five music types fit in a menu, and twenty-five word classes
        // are a list somebody has to be able to type at. See the note on
        // [showPartOfSpeechPicker].
        if (_isDictionary) ...[
          PartOfSpeechField(
            value: partOfSpeech,
            onChanged: onPartOfSpeechChanged,
          ),
          const SizedBox(height: 16),
          // -- What the word means, however many things that is ----------
          // Directly under the word class and above the paradigm, because it
          // is the entry: a contributor who fills in this section and nothing
          // else has given the archive a usable word, and everything below is
          // detail on top of it.
          //
          // The class picker sits ABOVE rather than below so that a meaning
          // asked "is this one a verb instead?" has something to be compared
          // with. Asking for the exception before the rule reads as a trick
          // question.
          SensesSection(
            controller: senses,
            declaredClass: partOfSpeech?.id ?? '',
            enabled: uploadProgress == null,
            isSaying: _isSaying,
            onChanged: onDraftChanged,
          ),
          const SizedBox(height: 4),
          // The same paradigm the guided queue collects, on the same terms:
          // drawn only for the classes it belongs to, never required, and
          // deepening only once the shallower question has an answer. A word
          // contributed here must be able to carry everything a word answered
          // in the queue carries, or which fields an entry has would depend on
          // which door its contributor came through.
          LexicalFormsSection(
            controllers: forms,
            declaredClass: partOfSpeech?.id ?? '',
            alsoUsedAs: alsoUsedAs,
            enabled: uploadProgress == null,
            onAlsoUsedAsChanged: onAlsoUsedAsChanged,
          ),
        ] else
          DropdownButtonFormField<String>(
            key: ValueKey('format-${kind.name}'),
            initialValue: format,
            decoration: InputDecoration(
              labelText: _formatLabel,
              prefixIcon: const Icon(Icons.category_outlined),
            ),
            items: [
              for (final value in _formats)
                DropdownMenuItem(value: value, child: Text(value)),
            ],
            onChanged: onFormatChanged,
            validator: (value) => value == null ? 'Choose one option.' : null,
          ),

        // The work itself. For a recording that is the file; for everything
        // else it is what the member writes.
        if (contributionUploadKind(kind) case final uploadKind?) ...[
          const SizedBox(height: 13),
          _UploadField(
            uploadKind: uploadKind,
            required: contributionRequiresUpload(kind),
            file: file,
            progress: uploadProgress,
            title: _uploadTitle,
            hint: _uploadHint,
            onPick: onPickFile,
            onClear: onClearFile,
          ),
        ],

        // Directly under the recording, because it belongs to it: the artwork
        // is not a second attachment, it is what the song looks like.
        if (kind == CollectionKind.music) ...[
          const SizedBox(height: 13),
          _CoverField(
            cover: cover,
            progress: coverProgress,
            onPick: onPickCover,
            onClear: onClearCover,
          ),
        ],
        const SizedBox(height: 13),
        TextFormField(
          controller: bodyController,
          minLines: kind == CollectionKind.literature ? 6 : 3,
          maxLines: kind == CollectionKind.literature ? 12 : 7,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: _bodyLabel,
            hintText: _bodyHint,
            alignLabelWithHint: true,
            prefixIcon: const Icon(Icons.notes_rounded),
          ),
          onEditingComplete: onDraftChanged,
          validator: _required,
        ),
        if (_isDictionary) ...[
          const SizedBox(height: 13),
          // Directly under the word itself, and above the example sentence:
          // the order somebody would say it out loud.
          PronunciationRecorderField(
            file: file,
            progress: uploadProgress,
            // Nothing here moves while the take is on its way up.
            enabled: uploadProgress == null,
            onRecorded: onPronunciationRecorded,
            onCleared: onClearFile,
          ),
          // -- The example boxes moved, they did not disappear -----------
          // They are inside each meaning now, because that is the question
          // they were always trying to ask: not "give a sentence for this
          // word" but "give a sentence for THIS meaning of it". A single pair
          // of boxes at the bottom of the form could only ever illustrate one
          // of several meanings, and never said which.
          //
          // `kasemExampleController` and `englishExampleController` still
          // exist and are still sent -- see the submit path, which fills them
          // from the first meaning that has a sentence so no older reader
          // loses its example.
          const SizedBox(height: 6),
          // Collapsed, and last among the questions about the word itself.
          // Somebody who came here to add one proverb should not have to scroll
          // past three prose boxes to reach the rights pledge — but somebody
          // who has stopped on a word they care about now has somewhere to put
          // what they know, including the meaning stated in Kasem, which is the
          // single most valuable string this project can collect.
          AdvancedDetailSection(
            controllers: forms,
            enabled: uploadProgress == null,
          ),
        ],

        const SizedBox(height: 13),
        DropdownButtonFormField<String>(
          initialValue: dialect,
          decoration: const InputDecoration(
            labelText: 'Dialect or region',
            prefixIcon: Icon(Icons.location_on_outlined),
          ),
          items: [
            for (final value in const [
              'Navrongo',
              'Paga',
              'Chiana',
              'Other',
              'Not sure',
            ])
              DropdownMenuItem(value: value, child: Text(value)),
          ],
          onChanged: onDialectChanged,
          validator: (value) => value == null ? 'Choose a dialect.' : null,
        ),
        const SizedBox(height: 13),
        TextFormField(
          controller: sourceController,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: _sourceLabel,
            hintText: _sourceHint,
            prefixIcon: const Icon(Icons.person_pin_outlined),
          ),
          validator: _required,
        ),
        const SizedBox(height: 13),
        TextFormField(
          controller: notesController,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Context for reviewers (optional)',
            hintText: 'Usage, permissions, spelling notes, or attribution',
            alignLabelWithHint: true,
            prefixIcon: Icon(Icons.fact_check_outlined),
          ),
        ),

        // A word carries nobody else's work with it, so the borrowed-material
        // question is only asked of the kinds that can.
        if (!_isDictionary) ...[
          const SizedBox(height: 13),
          DropdownButtonFormField<bool>(
            key: ValueKey('third-party-$usesThirdPartyMaterial'),
            initialValue: usesThirdPartyMaterial,
            decoration: InputDecoration(
              labelText: _thirdPartyLabel,
              prefixIcon: const Icon(Icons.copyright_rounded),
            ),
            items: const [
              DropdownMenuItem(value: false, child: Text('No')),
              DropdownMenuItem(
                value: true,
                child: Text('Yes, with permission'),
              ),
            ],
            onChanged: onThirdPartyMaterialChanged,
            validator: (value) => value == null ? 'Choose Yes or No.' : null,
          ),
        ],
        const SizedBox(height: 10),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: participantConsentConfirmed,
          onChanged: (value) => onParticipantConsentChanged(value ?? false),
          title: Text(
            _consentTitle,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: const Text(
            'A parent or guardian consents for anyone under 18.',
            style: TextStyle(fontSize: 12),
          ),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: rightsConfirmed,
          onChanged: (value) => onRightsChanged(value ?? false),
          title: const Text(
            'I have permission to share this for community review.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: const Text(
            'Nothing private, sacred, disputed or copyrighted.',
            style: TextStyle(fontSize: 12),
          ),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: publicationPermission,
          onChanged: (value) => onPublicationChanged(value ?? false),
          title: const Text(
            'Indigen World may publish this if approved.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: const Text('Optional.', style: TextStyle(fontSize: 12)),
        ),
      ],
    ),
  );

  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'This field is required.' : null;

  /// The English side.
  ///
  /// A saying is asked for by its *meaning*, not by a word. "English or source
  /// word" over the box where somebody is trying to enter a proverb is the
  /// single clearest symptom of the form that used to serve both — it asks for
  /// a thing that does not exist, and the honest answers to it are all
  /// sentences.
  String get _titleLabel => switch (kind) {
    CollectionKind.dictionary =>
      _isSaying ? 'What it means in English' : 'English or source word',
    CollectionKind.music => 'Song or recording title',
    CollectionKind.literature => 'Work title',
    CollectionKind.audiobooks => 'Audiobook title',
    CollectionKind.video => 'Video title',
  };

  String get _titleHint => switch (kind) {
    CollectionKind.dictionary => _isSaying
        ? 'The sense of it, not word for word'
        : 'For example: Bottle',
    CollectionKind.music => 'Name this piece',
    CollectionKind.literature => 'Name the story, poem, or work',
    CollectionKind.audiobooks => 'Name the narrated work',
    CollectionKind.video => 'Name this film or clip',
  };

  String get _bodyLabel => switch (kind) {
    CollectionKind.dictionary =>
      _isSaying ? 'The saying, in Kasem' : 'Kasem word or phrase',
    CollectionKind.music => 'Description and cultural context',
    CollectionKind.literature => 'Text, excerpt, or synopsis',
    CollectionKind.audiobooks => 'Synopsis and narration details',
    CollectionKind.video => 'What is happening, and why it matters',
  };

  String get _bodyHint => switch (kind) {
    CollectionKind.dictionary => _isSaying
        ? 'Exactly as it is said, spelling and diacritics kept'
        : 'Preserve the spelling and diacritics',
    CollectionKind.music => 'Describe the sound, occasion, and meaning',
    CollectionKind.literature =>
      'Paste the work, or describe it if you attached the document',
    CollectionKind.audiobooks =>
      'Describe the work and what the recording contains',
    CollectionKind.video =>
      'Describe the occasion, the place, and who is in it',
  };

  String get _uploadTitle => switch (kind) {
    CollectionKind.music => 'The recording',
    CollectionKind.audiobooks => 'The narration',
    CollectionKind.video => 'The footage',
    _ => 'Manuscript (optional)',
  };

  String get _uploadHint => switch (kind) {
    CollectionKind.music => 'Choose the audio',
    CollectionKind.audiobooks => 'Choose the narration',
    CollectionKind.video => 'Choose the video',
    _ => 'Attach a document',
  };

  /// Only the non-dictionary kinds reach these two. The dictionary's word
  /// class comes from [PartOfSpeechField] and its twenty-five-item list; the
  /// six-item dropdown it used to have is gone, and with it the "Expression"
  /// bucket that everything from an ideophone to a proverb used to land in.
  String get _formatLabel => switch (kind) {
    CollectionKind.dictionary => 'Word class',
    CollectionKind.music => 'Music type',
    CollectionKind.literature => 'Literature type',
    CollectionKind.audiobooks => 'Audio work type',
    CollectionKind.video => 'Video type',
  };

  List<String> get _formats => switch (kind) {
    CollectionKind.dictionary => const <String>[],
    CollectionKind.music => const [
      'Song',
      'Instrumental',
      'Drumming',
      'Ceremonial',
      'Other',
    ],
    CollectionKind.literature => const [
      'Story',
      'Poetry',
      'Oral history',
      'Essay',
      'Other',
    ],
    CollectionKind.audiobooks => const [
      'Audiobook',
      'Oral reading',
      'Spoken word',
      'Serial narration',
      'Other',
    ],
    CollectionKind.video => const [
      'Documentary',
      'Performance',
      'Ceremony',
      'Interview',
      'Short film',
      'Other',
    ],
  };

  String get _thirdPartyLabel => switch (kind) {
    CollectionKind.music =>
      'Does this include someone else\'s song, sample, or performance?',
    CollectionKind.audiobooks => 'Is the text somebody else\'s work?',
    CollectionKind.video => 'Is any of this footage or music somebody else\'s?',
    _ => 'Does this use someone else\'s material?',
  };

  String get _consentTitle => switch (kind) {
    CollectionKind.music =>
      'Everyone heard on this recording has agreed to it being shared.',
    CollectionKind.audiobooks =>
      'The narrator and the author have agreed to this being shared.',
    CollectionKind.literature => 'Anyone named, quoted, or depicted has agreed—or there is nobody else in it.',
    CollectionKind.dictionary =>
      'Anyone whose knowledge this is has agreed to it being shared.',
    CollectionKind.video => 'Everyone filmed has agreed to this being shared.',
  };

  String get _sourceLabel => switch (kind) {
    CollectionKind.dictionary =>
      _isSaying ? 'Who says it, and where did you hear it?' : 'How do you know this word?',
    CollectionKind.music => 'Artist, performer, or source',
    CollectionKind.literature => 'Author, storyteller, or source',
    CollectionKind.audiobooks => 'Author and narrator',
    CollectionKind.video => 'Who filmed it, and who appears',
  };

  String get _sourceHint => switch (kind) {
    CollectionKind.dictionary => _isSaying
        ? 'An elder, a family, an occasion it belongs to'
        : 'Your knowledge, an elder, a book, or school',
    CollectionKind.music => 'Name the rights holder and performers',
    CollectionKind.literature => 'Give clear authorship and attribution',
    CollectionKind.audiobooks => 'Name everyone whose permission is needed',
    CollectionKind.video => 'Name everyone whose permission is needed',
  };
}

/// The file attachment row: choose, review, replace, remove.
///
/// The file stays on the device until the form is submitted, which is why this
/// shows a name and a size rather than a spinner — nothing is being uploaded
/// yet, and pretending otherwise would make cancelling feel unsafe.
class _UploadField extends StatelessWidget {
  const _UploadField({
    required this.uploadKind,
    required this.required,
    required this.file,
    required this.progress,
    required this.title,
    required this.hint,
    required this.onPick,
    required this.onClear,
  });

  final ContributionMediaKind uploadKind;
  final bool required;
  final PickedContributionFile? file;
  final double? progress;
  final String title;
  final String hint;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final chosen = file;
    return GlassSurface(
      blur: false,
      radius: 18,
      lifted: false,
      accent: required && chosen == null ? context.brand.terracotta : null,
      padding: const EdgeInsets.fromLTRB(15, 14, 15, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                uploadKind == ContributionMediaKind.audio
                    ? Icons.audiotrack_rounded
                    : Icons.description_rounded,
                color: context.brand.accent,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              if (required)
                Text(
                  'REQUIRED',
                  style: TextStyle(
                    color: context.brand.terracotta,
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.8,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (chosen == null)
            OutlinedButton.icon(
              onPressed: onPick,
              icon: const Icon(Icons.upload_file_rounded),
              label: Text(hint),
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        chosen.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        chosen.sizeLabel,
                        style: TextStyle(
                          color: context.brand.mutedInk,
                          fontSize: 11.5,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Choose a different file',
                  onPressed: onPick,
                  icon: const Icon(Icons.swap_horiz_rounded),
                ),
                IconButton(
                  tooltip: 'Remove',
                  onPressed: onClear,
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            if (progress != null) ...[
              const SizedBox(height: 10),
              _UploadProgress(
                progress: progress!,
                label: 'Uploading ${(progress! * 100).round()}%',
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// The song's cover art: optional, square, and shown as itself.
///
/// A thumbnail rather than a filename, which is what [_UploadField] can offer
/// an audio file and no more. Artwork is the one attachment a member can
/// actually check at a glance — sideways, cropped, or the wrong picture
/// entirely are all obvious in a preview and invisible in `cover_final_2.jpg`.
class _CoverField extends StatelessWidget {
  const _CoverField({
    required this.cover,
    required this.progress,
    required this.onPick,
    required this.onClear,
  });

  final PickedContributionFile? cover;
  final double? progress;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final chosen = cover;
    return GlassSurface(
      blur: false,
      radius: 18,
      lifted: false,
      padding: const EdgeInsets.fromLTRB(15, 14, 15, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.image_outlined, color: brand.accent),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Cover art',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                'OPTIONAL',
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'This is the picture people see on the Now Playing screen and on '
            'their lock screen while the song is playing. A square photograph '
            'or artwork works best, under 8 MB.',
            style: TextStyle(color: brand.mutedInk, fontSize: 12, height: 1.45),
          ),
          const SizedBox(height: 12),
          if (chosen == null)
            OutlinedButton.icon(
              onPressed: onPick,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('Choose a picture'),
            )
          else ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(
                    File(chosen.path),
                    width: 72,
                    height: 72,
                    fit: BoxFit.cover,
                    // A picked file can still be unreadable by the time it is
                    // drawn — a cloud placeholder, a revoked permission — and
                    // a red exception box in the middle of a form is not the
                    // way to say so.
                    errorBuilder: (context, _, _) => Container(
                      width: 72,
                      height: 72,
                      color: brand.surfaceMuted,
                      child: Icon(
                        Icons.broken_image_outlined,
                        color: brand.mutedInk,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        chosen.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        chosen.sizeLabel,
                        style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          TextButton.icon(
                            onPressed: onPick,
                            icon: const Icon(
                              Icons.swap_horiz_rounded,
                              size: 18,
                            ),
                            label: const Text('Replace'),
                          ),
                          TextButton.icon(
                            onPressed: onClear,
                            icon: const Icon(Icons.close_rounded, size: 18),
                            label: const Text('Remove'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (progress != null) ...[
              const SizedBox(height: 10),
              _UploadProgress(
                progress: progress!,
                // Named, not a bare percentage: two files go up one after the
                // other, and a bar that does not say which one is moving reads
                // as a stall on the big one.
                label: 'Uploading artwork ${(progress! * 100).round()}%',
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// One bar and one honest sentence about what is going up.
class _UploadProgress extends StatelessWidget {
  const _UploadProgress({required this.progress, required this.label});

  final double progress;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: LinearProgressIndicator(
          value: progress,
          minHeight: 6,
          backgroundColor: context.brand.divider,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        label,
        style: TextStyle(
          color: context.brand.mutedInk,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  );
}

class _SubmitError extends StatelessWidget {
  const _SubmitError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: context.brand.terracotta.withValues(alpha: 0.09),
      borderRadius: BorderRadius.circular(15),
      border: Border.all(
        color: context.brand.terracotta.withValues(alpha: 0.35),
      ),
    ),
    child: Row(
      children: [
        Icon(Icons.error_outline_rounded, color: context.brand.terracotta),
        const SizedBox(width: 10),
        Expanded(child: Text(message)),
      ],
    ),
  );
}
