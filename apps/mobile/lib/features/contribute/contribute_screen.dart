import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/features/contribute/pronunciation_recorder.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';
import 'package:indigen_world_mobile/features/validate/data/ad_review_queue.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/validate_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

class ContributeScreen extends ConsumerStatefulWidget {
  const ContributeScreen({
    this.initialSource = '',
    this.relatedEntryId,
    this.reserveTopRight = false,
    this.initialKind = CollectionKind.dictionary,
    this.standalone = false,
    super.key,
  });

  final String initialSource;
  final String? relatedEntryId;
  final bool reserveTopRight;
  final CollectionKind initialKind;
  final bool standalone;

  @override
  ConsumerState<ContributeScreen> createState() => _ContributeScreenState();
}

class _ContributeScreenState extends ConsumerState<ContributeScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _titleController;
  final _bodyController = TextEditingController();
  final _sourceController = TextEditingController();
  final _notesController = TextEditingController();
  final _kasemExampleController = TextEditingController();
  final _englishExampleController = TextEditingController();

  late CollectionKind _kind;
  String? _dialect;
  String? _format;
  bool _rightsConfirmed = false;
  bool _publicationPermission = false;
  bool _participantConsentConfirmed = false;
  bool? _usesThirdPartyMaterial;
  bool _saving = false;
  String? _submitError;

  /// The song, narration or manuscript itself, chosen but not yet uploaded.
  ///
  /// Staged rather than uploaded on selection so that backing out of the form
  /// never leaves a file nobody asked for sitting in Storage.
  PickedContributionFile? _file;
  double? _uploadProgress;

  @override
  void initState() {
    super.initState();
    _kind = widget.initialKind;
    _titleController = TextEditingController(text: widget.initialSource);
  }

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    _sourceController.dispose();
    _notesController.dispose();
    _kasemExampleController.dispose();
    _englishExampleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    appBar: widget.standalone ? AppBar(title: const Text('Contribute')) : null,
    floatingActionButton: const Padding(
      padding: EdgeInsets.only(bottom: kFrostedNavBarReservedSpace - 26),
      child: KawuriFab(),
    ),
    body: ScreenContainer(
      child: ListView(
        key: const PageStorageKey('contribute-scroll'),
        padding: const EdgeInsets.only(bottom: 132),
        children: [
          BrandHeader(
            reserveTopRight: widget.reserveTopRight,
            // No eyebrow over "Contribute": a label above a heading that says
            // the same word twice is decoration, not orientation.
            eyebrow: widget.relatedEntryId == null ? null : 'Contribute',
            title: widget.relatedEntryId == null
                ? 'Contribute'
                : 'Suggest a correction.',
          ),
          // Staff only, and deliberately at the top of *this* screen: the work
          // the desk reviews is the work this form sends, so the two belong
          // next to each other. It used to be a sixth tab on the shell rail,
          // which changed the shape of the one strip of the app everybody
          // shares depending on who was holding the phone.
          const _ReviewDeskCard(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'What are you contributing?',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                _KindSelector(
                  selected: _kind,
                  onSelected: (kind) => setState(() {
                    _kind = kind;
                    _format = null;
                    _file = null;
                    _submitError = null;
                  }),
                ),
                const SizedBox(height: 14),
                _ContributionFields(
                  key: ValueKey(_kind),
                  formKey: _formKey,
                  kind: _kind,
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
                  onRightsChanged: (value) =>
                      setState(() => _rightsConfirmed = value),
                  onPublicationChanged: (value) =>
                      setState(() => _publicationPermission = value),
                  onParticipantConsentChanged: (value) =>
                      setState(() => _participantConsentConfirmed = value),
                  onThirdPartyMaterialChanged: (value) =>
                      setState(() => _usesThirdPartyMaterial = value),
                ),
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
                const SizedBox(height: 28),
                const SectionTitle(title: 'Your submissions'),
                const SizedBox(height: 12),
                const _ContributionActivity(),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  /// Chooses the file behind this contribution, if the kind carries one.
  Future<void> _pickFile() async {
    final kind = _uploadKindFor(_kind);
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

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final isValid = _formKey.currentState?.validate() ?? false;
    final needsFile = _requiresUpload(_kind) && _file == null;
    if (!isValid ||
        !_rightsConfirmed ||
        !_participantConsentConfirmed ||
        needsFile) {
      setState(() {
        _submitError = needsFile
            ? 'Upload the ${_uploadKindFor(_kind)?.label ?? 'file'} before submitting.'
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

      await repository.submit(
        CollectionContributionDraft(
          kind: _kind,
          title: _titleController.text,
          body: _bodyController.text,
          format: _format ?? '',
          dialect: _dialect ?? '',
          source: _sourceController.text,
          media: uploaded,
          notes: _notesController.text,
          publicationPermission: _publicationPermission,
          // Only asked where a person is the subject of the work. Null means
          // the question was not put, which a reviewer can tell apart from a
          // declared "no".
          involvesMinors: null,
          usesThirdPartyMaterial: _usesThirdPartyMaterial ?? false,
          participantConsentConfirmed: _participantConsentConfirmed,
          kasemExample: _kasemExampleController.text,
          englishExample: _englishExampleController.text,
          relatedEntryId: widget.relatedEntryId,
        ),
      );
      ref.invalidate(myCollectionContributionsProvider);
      if (!mounted) return;
      _bodyController.clear();
      _sourceController.clear();
      _notesController.clear();
      _kasemExampleController.clear();
      _englishExampleController.clear();
      if (widget.initialSource.isEmpty) _titleController.clear();
      setState(() {
        _rightsConfirmed = false;
        _publicationPermission = false;
        _participantConsentConfirmed = false;
        _usesThirdPartyMaterial = null;
        _format = null;
        _dialect = null;
        _file = null;
        _uploadProgress = null;
      });
      submitted = true;
      await showGlassPopup<void>(
        context: context,
        title: 'Contribution received',
        builder: (popupContext) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              Icons.cloud_done_rounded,
              color: context.brand.success,
              size: 34,
            ),
            const SizedBox(height: 14),
            Text(
              'Your ${_kind.contributionLabel} is now in the review queue. You can follow its status below.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.brand.ink, height: 1.5),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(popupContext),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } on ContributionUploadFailure catch (failure) {
      if (mounted) setState(() => _submitError = failure.message);
    } on Object {
      if (mounted) {
        setState(() {
          _submitError = 'The contribution was not sent. Check your connection and try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          _uploadProgress = null;
        });
      }
    }

    // Outside the catch on purpose: anything that fails while asking for a
    // rating has nothing to do with whether the contribution went, and saying
    // "not sent" about one that was would have somebody submit it twice.
    //
    // Giving something to the language record is the moment somebody is most
    // glad they installed this. The receipt has already been dismissed, so the
    // ask lands on a clear screen — and is rationed inside, so most of the time
    // it does nothing.
    if (submitted && mounted) {
      await maybeRequestReview(
        online: ref.read(connectionBlockProvider) == null,
      );
    }
  }
}

/// The kind of file each contribution carries, or null where it carries none.
///
/// A song and a narration *are* recordings, so they cannot be described in
/// prose alone. A written work may arrive as a manuscript or as typed text,
/// so its upload is optional. A dictionary word is neither.
ContributionMediaKind? _uploadKindFor(CollectionKind kind) => switch (kind) {
  CollectionKind.music ||
  CollectionKind.audiobooks => ContributionMediaKind.audio,
  CollectionKind.literature => ContributionMediaKind.document,
  CollectionKind.video => ContributionMediaKind.video,
  CollectionKind.dictionary => null,
};

bool _requiresUpload(CollectionKind kind) =>
    kind == CollectionKind.music ||
    kind == CollectionKind.audiobooks ||
    kind == CollectionKind.video;

/// The way into the review desk, for the accounts that have one.
///
/// Renders nothing at all for everybody else — not a locked card, not a
/// greyed-out row. A door somebody can never open is worse than no door: it
/// invites the question and then refuses to answer it.
class _ReviewDeskCard extends ConsumerWidget {
  const _ReviewDeskCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(isReviewerProvider)) return const SizedBox.shrink();

    final waitingWork = ref.watch(reviewWaitingCountProvider).asData?.value ?? 0;
    final waitingAds =
        ref.watch(adReviewWaitingCountProvider).asData?.value ?? 0;
    final waiting = waitingWork + waitingAds;
    final brand = context.brand;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Semantics(
        button: true,
        label: waiting > 0
            ? 'Review desk, $waiting waiting'
            : 'Review desk, nothing waiting',
        excludeSemantics: true,
        child: Material(
          color: brand.accentSoft,
          borderRadius: BorderRadius.circular(22),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const ValidateScreen(),
              ),
            ),
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 15, 14, 15),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: brand.accent.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: brand.accent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.fact_check_rounded,
                      color: brand.onAccentFill,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'REVIEW DESK',
                          style: TextStyle(
                            color: brand.terracotta,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          waiting == 0
                              ? 'Nothing is waiting'
                              : '$waiting waiting on you',
                          style: TextStyle(
                            color: brand.ink,
                            fontSize: 15.5,
                            fontWeight: FontWeight.w800,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          // Named rather than summed into one word, because
                          // they are two different jobs with two different
                          // urgencies — an unpublished song and an advert
                          // somebody has already paid for.
                          waiting == 0
                              ? 'Contributions and adverts, when they arrive'
                              : '$waitingWork contribution'
                                    '${waitingWork == 1 ? '' : 's'} · '
                                    '$waitingAds advert'
                                    '${waitingAds == 1 ? '' : 's'}',
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (waiting > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: brand.terracotta,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        waiting > 99 ? '99+' : '$waiting',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    )
                  else
                    Icon(
                      Icons.chevron_right_rounded,
                      color: brand.mutedInk,
                      size: 22,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _KindSelector extends StatelessWidget {
  const _KindSelector({required this.selected, required this.onSelected});

  final CollectionKind selected;
  final ValueChanged<CollectionKind> onSelected;

  @override
  Widget build(BuildContext context) => GridView(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    padding: EdgeInsets.zero,
    // `mainAxisExtent` rather than `childAspectRatio`: the tile is as tall as
    // an icon and a word, on a narrow phone and on a tablet alike. A ratio
    // would grow it with the screen and leave the dead band underneath that
    // used to separate this picker from the first field.
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      mainAxisExtent: 54,
    ),
    children: [
      for (final kind in CollectionKind.values)
        _KindChoice(
          kind: kind,
          selected: selected == kind,
          onTap: () => onSelected(kind),
        ),
    ],
  );
}

class _KindChoice extends StatelessWidget {
  const _KindChoice({
    required this.kind,
    required this.selected,
    required this.onTap,
  });

  final CollectionKind kind;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final content = Row(
      children: [
        Icon(
          _kindIcon(kind),
          color: selected ? context.brand.gold : context.brand.terracotta,
          size: 20,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            kind.label,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: selected ? Colors.white : context.brand.ink,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ),
      ],
    );

    if (!selected) {
      return GlassCard(
        onTap: onTap,
        blur: false,
        radius: 17,
        lifted: false,
        padding: const EdgeInsets.symmetric(horizontal: 13),
        semanticLabel: kind.label,
        child: content,
      );
    }
    return Semantics(
      button: true,
      selected: true,
      label: kind.label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(17),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 13),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [BrandColors.heritageGreen, BrandColors.savannahGreen],
              ),
              borderRadius: BorderRadius.circular(17),
              boxShadow: [
                BoxShadow(
                  color: context.brand.gold.withValues(alpha: 0.3),
                  blurRadius: 16,
                  spreadRadius: -4,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}

/// The form for one kind of contribution.
///
/// There is no longer a single form with a couple of fields switched on and
/// off. A song, a word, a written work and a narration are four different
/// things to submit, and asking a member the same questions about all of them
/// produced some that made no sense — most obviously whether a child was
/// involved in *making a song*, which is what a consent pledge covers and a
/// disclosure question does not. Each kind now asks only what it needs, in the
/// order somebody would actually fill it in: what it is, the work itself, who
/// it came from, then the permissions.
class _ContributionFields extends StatelessWidget {
  const _ContributionFields({
    required this.formKey,
    required this.kind,
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
    required this.rightsConfirmed,
    required this.publicationPermission,
    required this.participantConsentConfirmed,
    required this.usesThirdPartyMaterial,
    required this.onDialectChanged,
    required this.onFormatChanged,
    required this.onPickFile,
    required this.onPronunciationRecorded,
    required this.onClearFile,
    required this.onRightsChanged,
    required this.onPublicationChanged,
    required this.onParticipantConsentChanged,
    required this.onThirdPartyMaterialChanged,
    super.key,
  });

  final GlobalKey<FormState> formKey;
  final CollectionKind kind;
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
  final bool rightsConfirmed;
  final bool publicationPermission;
  final bool participantConsentConfirmed;
  final bool? usesThirdPartyMaterial;
  final ValueChanged<String?> onDialectChanged;
  final ValueChanged<String?> onFormatChanged;
  final VoidCallback onPickFile;
  final ValueChanged<PickedContributionFile> onPronunciationRecorded;
  final VoidCallback onClearFile;
  final ValueChanged<bool> onRightsChanged;
  final ValueChanged<bool> onPublicationChanged;
  final ValueChanged<bool> onParticipantConsentChanged;
  final ValueChanged<bool?> onThirdPartyMaterialChanged;

  bool get _isDictionary => kind == CollectionKind.dictionary;

  @override
  Widget build(BuildContext context) => Form(
    key: formKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextFormField(
          controller: titleController,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: _titleLabel,
            hintText: _titleHint,
            prefixIcon: Icon(_kindIcon(kind)),
          ),
          validator: _required,
        ),
        const SizedBox(height: 13),
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
        if (_uploadKindFor(kind) case final uploadKind?) ...[
          const SizedBox(height: 13),
          _UploadField(
            uploadKind: uploadKind,
            required: _requiresUpload(kind),
            file: file,
            progress: uploadProgress,
            title: _uploadTitle,
            hint: _uploadHint,
            onPick: onPickFile,
            onClear: onClearFile,
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
          const SizedBox(height: 13),
          TextFormField(
            controller: kasemExampleController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Kasem example (optional)',
              hintText: 'Use the word naturally in a sentence',
              alignLabelWithHint: true,
              prefixIcon: Icon(Icons.chat_bubble_outline_rounded),
            ),
          ),
          const SizedBox(height: 13),
          TextFormField(
            controller: englishExampleController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'English example (optional)',
              hintText: 'Translate the example sentence',
              alignLabelWithHint: true,
              prefixIcon: Icon(Icons.translate_rounded),
            ),
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
        // question is only asked of the three kinds that can.
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

  String get _titleLabel => switch (kind) {
    CollectionKind.dictionary => 'English or source word',
    CollectionKind.music => 'Song or recording title',
    CollectionKind.literature => 'Work title',
    CollectionKind.audiobooks => 'Audiobook title',
    CollectionKind.video => 'Video title',
  };

  String get _titleHint => switch (kind) {
    CollectionKind.dictionary => 'For example: Bottle',
    CollectionKind.music => 'Name this piece',
    CollectionKind.literature => 'Name the story, poem, or work',
    CollectionKind.audiobooks => 'Name the narrated work',
    CollectionKind.video => 'Name this film or clip',
  };

  String get _bodyLabel => switch (kind) {
    CollectionKind.dictionary => 'Kasem word or phrase',
    CollectionKind.music => 'Description and cultural context',
    CollectionKind.literature => 'Text, excerpt, or synopsis',
    CollectionKind.audiobooks => 'Synopsis and narration details',
    CollectionKind.video => 'What is happening, and why it matters',
  };

  String get _bodyHint => switch (kind) {
    CollectionKind.dictionary => 'Preserve the spelling and diacritics',
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

  String get _formatLabel => switch (kind) {
    CollectionKind.dictionary => 'Part of speech',
    CollectionKind.music => 'Music type',
    CollectionKind.literature => 'Literature type',
    CollectionKind.audiobooks => 'Audio work type',
    CollectionKind.video => 'Video type',
  };

  List<String> get _formats => switch (kind) {
    CollectionKind.dictionary => const [
      'Noun',
      'Verb',
      'Adjective',
      'Expression',
      'Other',
      'Unknown',
    ],
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
    CollectionKind.dictionary => 'How do you know this word?',
    CollectionKind.music => 'Artist, performer, or source',
    CollectionKind.literature => 'Author, storyteller, or source',
    CollectionKind.audiobooks => 'Author and narrator',
    CollectionKind.video => 'Who filmed it, and who appears',
  };

  String get _sourceHint => switch (kind) {
    CollectionKind.dictionary => 'Your knowledge, an elder, a book, or school',
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
                'Uploading ${((progress ?? 0) * 100).round()}%',
                style: TextStyle(
                  color: context.brand.mutedInk,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _ContributionActivity extends ConsumerWidget {
  const _ContributionActivity();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(authStateProvider).asData?.value != null;
    if (!signedIn) {
      return const _ActivityEmpty(
        icon: Icons.lock_outline_rounded,
        message: 'Sign in to submit and follow your review status.',
      );
    }
    return ref
        .watch(myCollectionContributionsProvider)
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => const _ActivityEmpty(
            icon: Icons.cloud_off_rounded,
            message: 'Your submissions could not be refreshed.',
          ),
          data: (items) {
            if (items.isEmpty) {
              return const _ActivityEmpty(
                icon: Icons.inbox_outlined,
                message: 'No submissions yet. Your first one will appear here.',
              );
            }
            return Column(
              children: [
                for (final item in items.take(5)) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 2, 10, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 11,
                              vertical: 5,
                            ),
                            leading: CircleAvatar(
                              backgroundColor: context.brand.accentFill
                                  .withValues(alpha: 0.1),
                              foregroundColor: context.brand.accent,
                              child: Icon(_kindIcon(item.kind)),
                            ),
                            title: Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              '${item.kind.label} · ${_statusLabel(item.status)}',
                            ),
                            trailing: Icon(
                              item.status.toLowerCase() == 'published'
                                  ? Icons.public_rounded
                                  : Icons.schedule_rounded,
                              size: 19,
                            ),
                          ),
                          if (item.reviewFeedback.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 8, 8),
                              child: Text(
                                'Reviewer note: ${item.reviewFeedback}',
                                style: TextStyle(
                                  color: context.brand.mutedInk,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          if (_canWithdraw(item.status))
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton.icon(
                                onPressed: () => _withdraw(context, ref, item),
                                icon: const Icon(
                                  Icons.remove_circle_outline_rounded,
                                  size: 18,
                                ),
                                label: Text(
                                  item.status.toLowerCase() == 'published'
                                      ? 'Withdraw from public Collection'
                                      : 'Withdraw submission',
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 9),
                ],
              ],
            );
          },
        );
  }

  bool _canWithdraw(String status) => !const {
    'withdrawn',
    'rejected',
    'archived',
  }.contains(status.toLowerCase());

  Future<void> _withdraw(
    BuildContext context,
    WidgetRef ref,
    CollectionContributionRecord item,
  ) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Withdraw this contribution?',
      message: item.status.toLowerCase() == 'published'
          ? 'This will remove the work from the public Collection and revoke publication permission.'
          : 'This will remove the contribution from active review.',
      cancelLabel: 'Keep it',
      confirmLabel: 'Withdraw',
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;

    final repository = ref.read(collectionContributionRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.withdraw(item.id);
      ref.invalidate(myCollectionContributionsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Contribution withdrawn.')),
        );
      }
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not withdraw this contribution. Try again.'),
          ),
        );
      }
    }
  }
}

class _ActivityEmpty extends StatelessWidget {
  const _ActivityEmpty({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) => GlassCard(
    padding: const EdgeInsets.all(18),
    child: Row(
      children: [
        Icon(icon, color: context.brand.terracotta),
        const SizedBox(width: 12),
        Expanded(child: Text(message)),
      ],
    ),
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

IconData _kindIcon(CollectionKind kind) => switch (kind) {
  CollectionKind.music => Icons.music_note_rounded,
  CollectionKind.dictionary => Icons.translate_rounded,
  CollectionKind.literature => Icons.auto_stories_rounded,
  CollectionKind.audiobooks => Icons.headphones_rounded,
  CollectionKind.video => Icons.movie_creation_rounded,
};

String _statusLabel(String status) => switch (status.toLowerCase()) {
  'approved' => 'Approved',
  'needs_changes' || 'needs_revision' => 'Needs changes',
  'rejected' => 'Not approved',
  'published' => 'Published',
  'scheduled' => 'Scheduled',
  'under_review' => 'Under review',
  'withdrawn' => 'Withdrawn',
  'archived' => 'Approved privately',
  _ => 'Submitted for review',
};
