import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/contribution.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class ContributeScreen extends ConsumerStatefulWidget {
  const ContributeScreen({
    this.initialSource = '',
    this.relatedEntryId,
    this.reserveTopRight = false,
    super.key,
  });

  final String initialSource;
  final String? relatedEntryId;

  /// Set when hosted as a shell tab, so the heading clears the profile orb.
  final bool reserveTopRight;

  @override
  ConsumerState<ContributeScreen> createState() => _ContributeScreenState();
}

class _ContributeScreenState extends ConsumerState<ContributeScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _sourceController;
  final _targetController = TextEditingController();
  final _notesController = TextEditingController();
  String? _dialect;
  String? _knowledgeBasis;
  String? _partOfSpeech;
  bool _rightsConfirmed = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _sourceController = TextEditingController(text: widget.initialSource);
  }

  @override
  void dispose() {
    _sourceController.dispose();
    _targetController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ScreenContainer(
    child: ListView(
      key: const PageStorageKey('contribute-scroll'),
      padding: const EdgeInsets.only(bottom: 110),
      children: [
        BrandHeader(
          reserveTopRight: widget.reserveTopRight,
          eyebrow: 'Contribute',
          title: widget.relatedEntryId == null
              ? 'Share what you know.'
              : 'Suggest a correction.',
          subtitle:
              'Your draft stays on this phone until you choose to submit.',
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: BrandColors.terracotta.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.verified_user_outlined,
                      color: BrandColors.terracotta,
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Contributions are reviewed by appointed validators. Points are awarded only after approval.',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _sourceController,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'English or source text',
                        hintText: 'Enter the word or phrase',
                        prefixIcon: Icon(Icons.translate_rounded),
                      ),
                      validator: _requiredText,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _targetController,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Kasem text',
                        hintText: 'Preserve spelling and diacritics',
                        prefixIcon: Icon(Icons.abc_rounded),
                      ),
                      validator: _requiredText,
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _dialect,
                      decoration: const InputDecoration(
                        labelText: 'Dialect or region',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                      items:
                          const [
                                'Navrongo',
                                'Paga',
                                'Chiana',
                                'Other',
                                'Not sure',
                              ]
                              .map(
                                (value) => DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                              )
                              .toList(growable: false),
                      onChanged: (value) => setState(() => _dialect = value),
                      validator: (value) => value == null
                          ? 'Choose a dialect or Not sure.'
                          : null,
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _partOfSpeech,
                      decoration: const InputDecoration(
                        labelText: 'Part of speech',
                        prefixIcon: Icon(Icons.category_outlined),
                      ),
                      items:
                          const [
                                'Noun',
                                'Verb',
                                'Adjective',
                                'Expression',
                                'Other',
                                'Unknown',
                              ]
                              .map(
                                (value) => DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                              )
                              .toList(growable: false),
                      onChanged: (value) =>
                          setState(() => _partOfSpeech = value),
                      validator: (value) =>
                          value == null ? 'Choose a value or Unknown.' : null,
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(
                      initialValue: _knowledgeBasis,
                      decoration: const InputDecoration(
                        labelText: 'How do you know this?',
                        prefixIcon: Icon(Icons.source_outlined),
                      ),
                      items:
                          const [
                                'My own knowledge',
                                'An elder or community member',
                                'A publication',
                                'School material',
                                'Other',
                              ]
                              .map(
                                (value) => DropdownMenuItem(
                                  value: value,
                                  child: Text(value),
                                ),
                              )
                              .toList(growable: false),
                      onChanged: (value) =>
                          setState(() => _knowledgeBasis = value),
                      validator: (value) => value == null
                          ? 'Tell us the knowledge source.'
                          : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _notesController,
                      minLines: 3,
                      maxLines: 5,
                      decoration: const InputDecoration(
                        labelText: 'Context or example (optional)',
                        hintText: 'Add usage, attribution, or helpful context',
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _rightsConfirmed,
                      onChanged: (value) =>
                          setState(() => _rightsConfirmed = value ?? false),
                      title: const Text(
                        'I can share this for community review.',
                      ),
                      subtitle: const Text(
                        'Do not submit private, sacred, disputed, or unapproved material.',
                      ),
                    ),
                    if (!_rightsConfirmed)
                      const Padding(
                        padding: EdgeInsets.only(left: 12, bottom: 8),
                        child: Text(
                          'Confirmation is required before submission.',
                          style: TextStyle(
                            color: Color(0xFFA12A2A),
                            fontSize: 12,
                          ),
                        ),
                      ),
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      onPressed: _saving
                          ? null
                          : () => _save(ContributionStatus.queued),
                      icon: _saving
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.outbox_outlined),
                      label: const Text('Submit for review'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: _saving
                          ? null
                          : () => _save(ContributionStatus.draft),
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('Save draft on this phone'),
                    ),
                    const SizedBox(height: 24),
                    const SectionTitle(title: 'Your recent activity'),
                    const SizedBox(height: 12),
                    _ContributionActivity(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  String? _requiredText(String? value) =>
      value == null || value.trim().isEmpty ? 'This field is required.' : null;

  Future<void> _save(ContributionStatus status) async {
    final isDraft = status == ContributionStatus.draft;
    final hasDraftContent =
        _sourceController.text.trim().isNotEmpty ||
        _targetController.text.trim().isNotEmpty ||
        _notesController.text.trim().isNotEmpty;
    final valid = isDraft
        ? hasDraftContent
        : (_formKey.currentState?.validate() ?? false);
    if (!valid || (!isDraft && !_rightsConfirmed)) {
      setState(() {});
      if (isDraft && !hasDraftContent) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Add a word, phrase, or note before saving this draft.',
            ),
          ),
        );
      }
      return;
    }
    setState(() => _saving = true);
    final now = DateTime.now();
    final contribution = Contribution(
      id: 'mobile-${now.microsecondsSinceEpoch}',
      sourceText: _sourceController.text.trim(),
      targetText: _targetController.text.trim(),
      dialect: _dialect ?? 'Not selected',
      knowledgeBasis: _knowledgeBasis ?? 'Not selected',
      createdAt: now,
      status: status,
      partOfSpeech: _partOfSpeech ?? 'Not selected',
      notes: _notesController.text.trim(),
      relatedEntryId: widget.relatedEntryId,
      rightsConfirmed: _rightsConfirmed,
    );
    await ref.read(contributionRepositoryProvider).save(contribution);
    ref.invalidate(contributionsProvider);
    if (!mounted) return;
    setState(() => _saving = false);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: Icon(
          status == ContributionStatus.queued
              ? Icons.schedule_send_outlined
              : Icons.drafts_outlined,
          color: BrandColors.heritageGreen,
        ),
        title: Text(
          status == ContributionStatus.queued
              ? 'Saved on this phone'
              : 'Draft saved on this phone',
        ),
        content: Text(
          status == ContributionStatus.queued
              ? 'Your contribution is saved on this device. During the current test, '
                    'publishing goes through TribeStudio on the web — approved creators '
                    'post there and their work appears here in Explore. Nothing has been '
                    'uploaded from this phone yet.'
              : 'Nothing has been uploaded. You can continue editing when you return.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}

class _ContributionActivity extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contributions = ref.watch(contributionsProvider);
    return contributions.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stackTrace) =>
          const Text('Saved activity could not be opened.'),
      data: (items) {
        if (items.isEmpty) {
          return const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Text('No drafts yet. Your saved work will appear here.'),
            ),
          );
        }
        return Column(
          children: [
            for (final item in items.take(3)) ...[
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  leading: Icon(
                    item.status == ContributionStatus.draft
                        ? Icons.drafts_outlined
                        : Icons.schedule_send_outlined,
                    color: BrandColors.terracotta,
                  ),
                  title: Text('${item.sourceText} → ${item.targetText}'),
                  subtitle: Text(
                    '${item.dialect} · ${_statusLabel(item.status)}',
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
          ],
        );
      },
    );
  }

  String _statusLabel(ContributionStatus status) => switch (status) {
    ContributionStatus.draft => 'Saved on this phone',
    ContributionStatus.queued => 'Queued for submission',
    ContributionStatus.underReview => 'Under review',
    ContributionStatus.approved => 'Approved',
    ContributionStatus.rejected => 'Needs changes',
  };
}
