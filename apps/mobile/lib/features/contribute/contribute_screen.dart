import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

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
  final _mediaController = TextEditingController();
  final _notesController = TextEditingController();
  final _kasemExampleController = TextEditingController();
  final _englishExampleController = TextEditingController();

  late CollectionKind _kind;
  String? _dialect;
  String? _format;
  bool _rightsConfirmed = false;
  bool _publicationPermission = false;
  bool _participantConsentConfirmed = false;
  bool? _involvesMinors;
  bool? _usesThirdPartyMaterial;
  bool _saving = false;
  String? _submitError;

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
    _mediaController.dispose();
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
            eyebrow: 'Contribute',
            title: widget.relatedEntryId == null
                ? 'Add to the living collection.'
                : 'Suggest a correction.',
            subtitle: 'Choose where your knowledge belongs, then send it securely for community review.',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _ReviewPromise(),
                const SizedBox(height: 22),
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
                    _submitError = null;
                  }),
                ),
                const SizedBox(height: 22),
                _ContributionFields(
                  key: ValueKey(_kind),
                  formKey: _formKey,
                  kind: _kind,
                  titleController: _titleController,
                  bodyController: _bodyController,
                  sourceController: _sourceController,
                  mediaController: _mediaController,
                  notesController: _notesController,
                  kasemExampleController: _kasemExampleController,
                  englishExampleController: _englishExampleController,
                  dialect: _dialect,
                  format: _format,
                  rightsConfirmed: _rightsConfirmed,
                  publicationPermission: _publicationPermission,
                  participantConsentConfirmed: _participantConsentConfirmed,
                  involvesMinors: _involvesMinors,
                  usesThirdPartyMaterial: _usesThirdPartyMaterial,
                  onDialectChanged: (value) => setState(() => _dialect = value),
                  onFormatChanged: (value) => setState(() => _format = value),
                  onRightsChanged: (value) =>
                      setState(() => _rightsConfirmed = value),
                  onPublicationChanged: (value) =>
                      setState(() => _publicationPermission = value),
                  onParticipantConsentChanged: (value) =>
                      setState(() => _participantConsentConfirmed = value),
                  onInvolvesMinorsChanged: (value) =>
                      setState(() => _involvesMinors = value),
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
                const Text(
                  'Submitting does not publish immediately. Reviewers check rights, consent, accuracy, and cultural context first.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: BrandColors.mutedInk, fontSize: 10),
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

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final isValid = _formKey.currentState?.validate() ?? false;
    if (!isValid || !_rightsConfirmed || !_participantConsentConfirmed) {
      setState(() {
        _submitError = !_rightsConfirmed
            ? 'Confirm that you have permission to share this contribution.'
            : !_participantConsentConfirmed
            ? 'Confirm participant consent, or that there are no other participants.'
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
    });
    try {
      await repository.submit(
        CollectionContributionDraft(
          kind: _kind,
          title: _titleController.text,
          body: _bodyController.text,
          format: _format ?? '',
          dialect: _dialect ?? '',
          source: _sourceController.text,
          mediaUrl: _mediaController.text,
          notes: _notesController.text,
          publicationPermission: _publicationPermission,
          involvesMinors: _involvesMinors!,
          usesThirdPartyMaterial: _usesThirdPartyMaterial!,
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
      _mediaController.clear();
      _notesController.clear();
      _kasemExampleController.clear();
      _englishExampleController.clear();
      if (widget.initialSource.isEmpty) _titleController.clear();
      setState(() {
        _rightsConfirmed = false;
        _publicationPermission = false;
        _participantConsentConfirmed = false;
        _involvesMinors = null;
        _usesThirdPartyMaterial = null;
        _format = null;
        _dialect = null;
      });
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(
            Icons.cloud_done_rounded,
            color: BrandColors.savannahGreen,
          ),
          title: const Text('Contribution received'),
          content: Text(
            'Your ${_kind.contributionLabel} is now in the review queue. You can follow its status below.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } on Object {
      if (mounted) {
        setState(() {
          _submitError = 'The contribution was not sent. Check your connection and try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _KindSelector extends StatelessWidget {
  const _KindSelector({required this.selected, required this.onSelected});

  final CollectionKind selected;
  final ValueChanged<CollectionKind> onSelected;

  @override
  Widget build(BuildContext context) => GridView.count(
    crossAxisCount: 2,
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 10,
    crossAxisSpacing: 10,
    childAspectRatio: 2.25,
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
  Widget build(BuildContext context) => Material(
    color: selected
        ? BrandColors.heritageGreen
        : Colors.white.withValues(alpha: 0.7),
    borderRadius: BorderRadius.circular(17),
    child: InkWell(
      borderRadius: BorderRadius.circular(17),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(17),
          border: Border.all(
            color: selected ? BrandColors.kenteGold : BrandColors.divider,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              _kindIcon(kind),
              color: selected ? BrandColors.kenteGold : BrandColors.terracotta,
              size: 21,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                kind.label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected ? Colors.white : BrandColors.ink,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ContributionFields extends StatelessWidget {
  const _ContributionFields({
    required this.formKey,
    required this.kind,
    required this.titleController,
    required this.bodyController,
    required this.sourceController,
    required this.mediaController,
    required this.notesController,
    required this.kasemExampleController,
    required this.englishExampleController,
    required this.dialect,
    required this.format,
    required this.rightsConfirmed,
    required this.publicationPermission,
    required this.participantConsentConfirmed,
    required this.involvesMinors,
    required this.usesThirdPartyMaterial,
    required this.onDialectChanged,
    required this.onFormatChanged,
    required this.onRightsChanged,
    required this.onPublicationChanged,
    required this.onParticipantConsentChanged,
    required this.onInvolvesMinorsChanged,
    required this.onThirdPartyMaterialChanged,
    super.key,
  });

  final GlobalKey<FormState> formKey;
  final CollectionKind kind;
  final TextEditingController titleController;
  final TextEditingController bodyController;
  final TextEditingController sourceController;
  final TextEditingController mediaController;
  final TextEditingController notesController;
  final TextEditingController kasemExampleController;
  final TextEditingController englishExampleController;
  final String? dialect;
  final String? format;
  final bool rightsConfirmed;
  final bool publicationPermission;
  final bool participantConsentConfirmed;
  final bool? involvesMinors;
  final bool? usesThirdPartyMaterial;
  final ValueChanged<String?> onDialectChanged;
  final ValueChanged<String?> onFormatChanged;
  final ValueChanged<bool> onRightsChanged;
  final ValueChanged<bool> onPublicationChanged;
  final ValueChanged<bool> onParticipantConsentChanged;
  final ValueChanged<bool?> onInvolvesMinorsChanged;
  final ValueChanged<bool?> onThirdPartyMaterialChanged;

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
        if (kind == CollectionKind.dictionary) ...[
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
        if (kind == CollectionKind.music ||
            kind == CollectionKind.audiobooks) ...[
          const SizedBox(height: 13),
          TextFormField(
            controller: mediaController,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Recording link (optional)',
              hintText: 'https://…',
              prefixIcon: Icon(Icons.link_rounded),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return null;
              final uri = Uri.tryParse(text);
              return uri != null &&
                      (uri.scheme == 'https' || uri.scheme == 'http')
                  ? null
                  : 'Enter a complete web link.';
            },
          ),
        ],
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
        const SizedBox(height: 13),
        DropdownButtonFormField<bool>(
          key: ValueKey('minors-$involvesMinors'),
          initialValue: involvesMinors,
          decoration: const InputDecoration(
            labelText: 'Does this involve anyone under 18?',
            prefixIcon: Icon(Icons.family_restroom_rounded),
          ),
          items: const [
            DropdownMenuItem(value: false, child: Text('No')),
            DropdownMenuItem(value: true, child: Text('Yes')),
          ],
          onChanged: onInvolvesMinorsChanged,
          validator: (value) => value == null ? 'Choose Yes or No.' : null,
        ),
        const SizedBox(height: 13),
        DropdownButtonFormField<bool>(
          key: ValueKey('third-party-$usesThirdPartyMaterial'),
          initialValue: usesThirdPartyMaterial,
          decoration: const InputDecoration(
            labelText: 'Does this use someone else\'s material?',
            prefixIcon: Icon(Icons.copyright_rounded),
          ),
          items: const [
            DropdownMenuItem(value: false, child: Text('No')),
            DropdownMenuItem(value: true, child: Text('Yes, with permission')),
          ],
          onChanged: onThirdPartyMaterialChanged,
          validator: (value) => value == null ? 'Choose Yes or No.' : null,
        ),
        const SizedBox(height: 10),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: participantConsentConfirmed,
          onChanged: (value) => onParticipantConsentChanged(value ?? false),
          title: const Text(
            'People named, quoted, or recorded have agreed—or there are no other participants.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: const Text(
            'Consent must cover community review and any publication permission selected below.',
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
            'Do not submit private, sacred, disputed, copyrighted, or unapproved material.',
          ),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: publicationPermission,
          onChanged: (value) => onPublicationChanged(value ?? false),
          title: const Text(
            'If approved, Indigen World may publish this in the public Collection.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: const Text(
            'Optional. Review permission does not automatically grant publication permission.',
          ),
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
  };

  String get _titleHint => switch (kind) {
    CollectionKind.dictionary => 'For example: Bottle',
    CollectionKind.music => 'Name this piece',
    CollectionKind.literature => 'Name the story, poem, or work',
    CollectionKind.audiobooks => 'Name the narrated work',
  };

  String get _bodyLabel => switch (kind) {
    CollectionKind.dictionary => 'Kasem word or phrase',
    CollectionKind.music => 'Description and cultural context',
    CollectionKind.literature => 'Text, excerpt, or synopsis',
    CollectionKind.audiobooks => 'Synopsis and narration details',
  };

  String get _bodyHint => switch (kind) {
    CollectionKind.dictionary => 'Preserve the spelling and diacritics',
    CollectionKind.music => 'Describe the sound, occasion, and meaning',
    CollectionKind.literature =>
      'Enter the work or enough context to review it',
    CollectionKind.audiobooks =>
      'Describe the work and what the recording contains',
  };

  String get _formatLabel => switch (kind) {
    CollectionKind.dictionary => 'Part of speech',
    CollectionKind.music => 'Music type',
    CollectionKind.literature => 'Literature type',
    CollectionKind.audiobooks => 'Audio work type',
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
  };

  String get _sourceLabel => switch (kind) {
    CollectionKind.dictionary => 'How do you know this word?',
    CollectionKind.music => 'Artist, performer, or source',
    CollectionKind.literature => 'Author, storyteller, or source',
    CollectionKind.audiobooks => 'Author and narrator',
  };

  String get _sourceHint => switch (kind) {
    CollectionKind.dictionary => 'Your knowledge, an elder, a book, or school',
    CollectionKind.music => 'Name the rights holder and performers',
    CollectionKind.literature => 'Give clear authorship and attribution',
    CollectionKind.audiobooks => 'Name everyone whose permission is needed',
  };
}

class _ReviewPromise extends StatelessWidget {
  const _ReviewPromise();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: [
          BrandColors.heritageGreen.withValues(alpha: 0.1),
          BrandColors.kenteGold.withValues(alpha: 0.1),
        ],
      ),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(
        color: BrandColors.heritageGreen.withValues(alpha: 0.14),
      ),
    ),
    child: const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.shield_outlined, color: BrandColors.heritageGreen),
        SizedBox(width: 12),
        Expanded(
          child: Text(
            'Your submission is private to you and reviewers until it is approved and deliberately published.',
            style: TextStyle(fontWeight: FontWeight.w700, height: 1.4),
          ),
        ),
      ],
    ),
  );
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
                              backgroundColor: BrandColors.heritageGreen
                                  .withValues(alpha: 0.1),
                              foregroundColor: BrandColors.heritageGreen,
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
                                style: const TextStyle(
                                  color: BrandColors.mutedInk,
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Withdraw this contribution?'),
        content: Text(
          item.status.toLowerCase() == 'published'
              ? 'This will remove the work from the public Collection and revoke publication permission.'
              : 'This will remove the contribution from active review.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
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
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Icon(icon, color: BrandColors.terracotta),
          const SizedBox(width: 12),
          Expanded(child: Text(message)),
        ],
      ),
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
      color: BrandColors.terracotta.withValues(alpha: 0.09),
      borderRadius: BorderRadius.circular(15),
      border: Border.all(color: BrandColors.terracotta.withValues(alpha: 0.35)),
    ),
    child: Row(
      children: [
        const Icon(Icons.error_outline_rounded, color: BrandColors.terracotta),
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
