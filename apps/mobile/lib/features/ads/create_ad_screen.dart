import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/ad_creative_picker.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_repository.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The regions an advertiser can ask for. Kasena country first, then the rest
/// of Ghana, then everyone — the order somebody here would actually think in.
const _kRegions = [
  'Navrongo',
  'Paga',
  'Chiana',
  'Upper East',
  'Northern Ghana',
  'All of Ghana',
];

/// Build an advert, step by step.
///
/// Six short steps rather than one long form: every step asks one question,
/// and the member can see the price forming before they are asked to commit to
/// it. Nothing is charged here: the last step records what is owed and parks
/// the campaign as awaiting payment, and paying for it is a deliberate second
/// act on the campaign's own screen.
class CreateAdScreen extends ConsumerStatefulWidget {
  const CreateAdScreen({this.existing, super.key});

  /// When set, the flow edits this campaign instead of creating one.
  final AdCampaign? existing;

  @override
  ConsumerState<CreateAdScreen> createState() => _CreateAdScreenState();
}

class _CreateAdScreenState extends ConsumerState<CreateAdScreen> {
  final _controller = PageController();
  final _nameController = TextEditingController();
  final _headlineController = TextEditingController();
  final _bodyController = TextEditingController();
  final _ctaLabelController = TextEditingController();
  final _ctaUrlController = TextEditingController();

  var _step = 0;
  var _objective = AdObjective.awareness;
  final _placements = <AdPlacement>{AdPlacement.community};
  final _regions = <String>{'Upper East'};
  var _dailyBudgetPesewas = 20 * kPesewasPerCedi;
  var _durationDays = 7;

  PickedAdCreative? _picked;

  /// The creative already on the campaign being edited, kept until the member
  /// replaces it. Without this an edit that only changed the budget would drop
  /// the artwork.
  AdCreative? _existingCreative;

  var _submitting = false;
  double? _uploadProgress;
  String? _error;

  static const _stepCount = 6;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing == null) return;
    _nameController.text = existing.name;
    _headlineController.text = existing.headline;
    _bodyController.text = existing.body;
    _ctaLabelController.text = existing.ctaLabel;
    _ctaUrlController.text = existing.ctaUrl;
    _objective = existing.objective;
    _placements
      ..clear()
      ..addAll(existing.placements);
    if (existing.regions.isNotEmpty) {
      _regions
        ..clear()
        ..addAll(existing.regions);
    }
    _dailyBudgetPesewas = existing.dailyBudgetPesewas;
    _durationDays = existing.durationDays;
    _existingCreative = existing.creative;
  }

  @override
  void dispose() {
    _controller.dispose();
    _nameController.dispose();
    _headlineController.dispose();
    _bodyController.dispose();
    _ctaLabelController.dispose();
    _ctaUrlController.dispose();
    super.dispose();
  }

  AdCostBreakdown get _cost => AdCostBreakdown(
    dailyBudgetPesewas: _dailyBudgetPesewas,
    durationDays: _durationDays,
  );

  bool get _hasCreative => _picked != null || _existingCreative != null;

  /// What is missing on the current step, or null when it is complete.
  ///
  /// Validated per step rather than at the end, so nobody fills in six screens
  /// and is then told the first one was wrong.
  String? get _blocker => switch (_step) {
    0 when _nameController.text.trim().length < 3 =>
      'Give the campaign a name so you can find it again.',
    1 when !_hasCreative => 'Add the image or video people will see.',
    2 when _headlineController.text.trim().length < 3 => 'Write a headline.',
    2 when _bodyController.text.trim().isEmpty =>
      'Write a line about what you are offering.',
    2
        when _objective.needsLink &&
            !_isValidLink(_ctaUrlController.text.trim()) =>
      'Add the web address people should land on.',
    3 when _placements.isEmpty => 'Choose at least one place to show it.',
    3 when _regions.isEmpty => 'Choose at least one area.',
    _ => null,
  };

  static bool _isValidLink(String value) {
    if (value.isEmpty) return false;
    final uri = Uri.tryParse(
      value.startsWith('http') ? value : 'https://$value',
    );
    return uri != null && uri.host.contains('.');
  }

  void _goTo(int step) {
    if (step < 0 || step >= _stepCount) return;
    setState(() {
      _step = step;
      _error = null;
    });
    _controller.animateToPage(
      step,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  void _next() {
    FocusScope.of(context).unfocus();
    final blocker = _blocker;
    if (blocker != null) {
      setState(() => _error = blocker);
      HapticFeedback.mediumImpact();
      return;
    }
    if (_step == _stepCount - 1) {
      _submit();
      return;
    }
    _goTo(_step + 1);
  }

  Future<void> _pickCreative() async {
    try {
      final picked = await pickAdCreative(context);
      if (picked == null || !mounted) return;
      setState(() {
        _picked = picked;
        _error = null;
      });
    } on ContributionUploadFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
  }

  AdCampaignDraft _draft(AdCreative? creative) {
    final url = _ctaUrlController.text.trim();
    return AdCampaignDraft(
      name: _nameController.text,
      objective: _objective,
      headline: _headlineController.text,
      body: _bodyController.text,
      placements: _placements.toList(growable: false),
      dailyBudgetPesewas: _dailyBudgetPesewas,
      durationDays: _durationDays,
      ctaLabel: _ctaLabelController.text,
      ctaUrl: _objective.needsLink
          ? (url.startsWith('http') ? url : 'https://$url')
          : '',
      regions: _regions.toList(growable: false),
      creative: creative,
    );
  }

  Future<void> _submit() async {
    var user = ref.read(firebaseAuthProvider)?.currentUser;
    if (user == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !mounted) return;
      user = ref.read(firebaseAuthProvider)?.currentUser;
    }
    final repository = ref.read(adRepositoryProvider);
    if (user == null || repository == null) {
      setState(() {
        _error = 'Advertising is not available right now. Try again shortly.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
      _uploadProgress = _picked == null ? null : 0;
    });

    try {
      // The creative goes to Storage first, into the member's own private
      // prefix, and the callable is handed the path. A 60-second clip has no
      // business travelling inside a function call.
      var creative = _existingCreative;
      final picked = _picked;
      if (picked != null) {
        final uploaded =
            await const ContributionUploader(
              campaignId: ContributionUploader.adCampaignId,
            ).upload(
              uid: user.uid,
              file: picked.asUpload,
              onProgress: (value) {
                if (mounted) setState(() => _uploadProgress = value);
              },
            );
        creative = AdCreative(
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          mediaType: picked.isVideo ? 'video' : 'image',
        );
      }

      final draft = _draft(creative);
      if (_isEditing) {
        await repository.update(widget.existing!.id, draft);
      } else {
        await repository.submit(draft);
      }
      ref.invalidate(myAdCampaignsProvider);
      if (!mounted) return;
      await showGlassPopup<void>(
        context: context,
        title: _isEditing ? 'Campaign updated' : 'Campaign created',
        builder: (popupContext) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              Icons.campaign_rounded,
              color: context.brand.success,
              size: 34,
            ),
            const SizedBox(height: 14),
            Text(
              _isEditing
                  ? 'Saved. The amount owed has been updated to '
                        '${cedis(_cost.totalPesewas)}.'
                  : 'Saved and waiting for payment. Nothing has been charged '
                        'yet — open the campaign to pay '
                        '${cedis(_cost.totalPesewas)} by card, bank or mobile '
                        'money.',
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
      if (mounted) Navigator.of(context).pop(true);
    } on ContributionUploadFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on AdCampaignFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
          _uploadProgress = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.brand.background,
    appBar: AppBar(
      title: Text(_isEditing ? 'Edit advert' : 'Create advert'),
      leading: IconButton(
        icon: const Icon(Icons.close_rounded),
        onPressed: () => Navigator.of(context).maybePop(),
      ),
    ),
    body: SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: Column(
            children: [
              _StepRail(step: _step, total: _stepCount),
              Expanded(
                child: PageView(
                  controller: _controller,
                  // Steps validate as they are left, so a swipe past an
                  // unfinished one would skip the check the button performs.
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    _stepScroll(
                      _GoalStep(
                        nameController: _nameController,
                        objective: _objective,
                        onObjective: (value) =>
                            setState(() => _objective = value),
                      ),
                    ),
                    _stepScroll(
                      _CreativeStep(
                        picked: _picked,
                        existing: _existingCreative,
                        onPick: _pickCreative,
                        onClear: () => setState(() {
                          _picked = null;
                          _existingCreative = null;
                        }),
                      ),
                    ),
                    _stepScroll(
                      _MessageStep(
                        objective: _objective,
                        headlineController: _headlineController,
                        bodyController: _bodyController,
                        ctaLabelController: _ctaLabelController,
                        ctaUrlController: _ctaUrlController,
                      ),
                    ),
                    _stepScroll(
                      _AudienceStep(
                        placements: _placements,
                        regions: _regions,
                        onTogglePlacement: (value) => setState(() {
                          _placements.contains(value)
                              ? _placements.remove(value)
                              : _placements.add(value);
                        }),
                        onToggleRegion: (value) => setState(() {
                          _regions.contains(value)
                              ? _regions.remove(value)
                              : _regions.add(value);
                        }),
                      ),
                    ),
                    _stepScroll(
                      _BudgetStep(
                        dailyBudgetPesewas: _dailyBudgetPesewas,
                        durationDays: _durationDays,
                        cost: _cost,
                        onBudget: (value) =>
                            setState(() => _dailyBudgetPesewas = value),
                        onDuration: (value) =>
                            setState(() => _durationDays = value),
                      ),
                    ),
                    _stepScroll(
                      _ReviewStep(
                        name: _nameController.text,
                        headline: _headlineController.text,
                        body: _bodyController.text,
                        objective: _objective,
                        placements: _placements,
                        regions: _regions,
                        cost: _cost,
                        picked: _picked,
                        existing: _existingCreative,
                      ),
                    ),
                  ],
                ),
              ),
              _Footer(
                step: _step,
                total: _stepCount,
                submitting: _submitting,
                uploadProgress: _uploadProgress,
                error: _error,
                isEditing: _isEditing,
                onBack: () => _goTo(_step - 1),
                onNext: _submitting ? null : _next,
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _stepScroll(Widget child) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
    child: child,
  );
}

// ── Chrome ──────────────────────────────────────────────────────────────────

class _StepRail extends StatelessWidget {
  const _StepRail({required this.step, required this.total});

  final int step;
  final int total;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(18, 6, 18, 14),
    child: Row(
      children: [
        for (var index = 0; index < total; index++) ...[
          Expanded(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 260),
              height: 4,
              decoration: BoxDecoration(
                color: index <= step
                    ? context.brand.accent
                    : context.brand.accent.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          if (index < total - 1) const SizedBox(width: 5),
        ],
      ],
    ),
  );
}

class _StepTitle extends StatelessWidget {
  const _StepTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Text(title, style: Theme.of(context).textTheme.headlineSmall),
  );
}

class _Footer extends StatelessWidget {
  const _Footer({
    required this.step,
    required this.total,
    required this.submitting,
    required this.uploadProgress,
    required this.error,
    required this.isEditing,
    required this.onBack,
    required this.onNext,
  });

  final int step;
  final int total;
  final bool submitting;
  final double? uploadProgress;
  final String? error;
  final bool isEditing;
  final VoidCallback onBack;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final isLast = step == total - 1;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (error != null) ...[
            GlassSurface(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline_rounded,
                    color: context.brand.terracotta,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      error!,
                      style: const TextStyle(fontSize: 13, height: 1.35),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
          if (uploadProgress != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: uploadProgress,
                minHeight: 6,
                backgroundColor: context.brand.divider,
              ),
            ),
            const SizedBox(height: 10),
          ],
          Row(
            children: [
              if (step > 0) ...[
                OutlinedButton(
                  onPressed: submitting ? null : onBack,
                  child: const Text('Back'),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: FilledButton.icon(
                  onPressed: onNext,
                  icon: submitting
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          isLast
                              ? Icons.lock_clock_rounded
                              : Icons.arrow_forward_rounded,
                        ),
                  label: Text(
                    submitting
                        ? 'Saving…'
                        : isLast
                        ? (isEditing ? 'Save changes' : 'Continue to payment')
                        : 'Next',
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Step 1: the goal ────────────────────────────────────────────────────────

class _GoalStep extends StatelessWidget {
  const _GoalStep({
    required this.nameController,
    required this.objective,
    required this.onObjective,
  });

  final TextEditingController nameController;
  final AdObjective objective;
  final ValueChanged<AdObjective> onObjective;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _StepTitle('What do you want from this?'),
      for (final option in AdObjective.values) ...[
        GlassCard(
          onTap: () => onObjective(option),
          accent: objective == option ? context.brand.gold : null,
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              GlassIconPlate(
                icon: option.icon,
                color: objective == option
                    ? context.brand.accent
                    : context.brand.mutedInk,
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Text(
                  option.label,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Icon(
                objective == option
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
                color: objective == option
                    ? context.brand.accent
                    : context.brand.divider,
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
      ],
      const SizedBox(height: 10),
      TextField(
        controller: nameController,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          labelText: 'Campaign name',
          hintText: 'Only you see this',
          prefixIcon: Icon(Icons.label_outline_rounded),
        ),
      ),
    ],
  );
}

// ── Step 2: the creative ────────────────────────────────────────────────────

class _CreativeStep extends StatelessWidget {
  const _CreativeStep({
    required this.picked,
    required this.existing,
    required this.onPick,
    required this.onClear,
  });

  final PickedAdCreative? picked;
  final AdCreative? existing;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _StepTitle('What will people see?'),
      AdCreativePreview(picked: picked, existing: existing, height: 240),
      const SizedBox(height: 14),
      Row(
        children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: onPick,
              icon: const Icon(Icons.add_photo_alternate_rounded),
              label: Text(
                picked == null && existing == null ? 'Add' : 'Replace',
              ),
            ),
          ),
          if (picked != null || existing != null) ...[
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: onClear,
              child: const Icon(Icons.delete_outline_rounded),
            ),
          ],
        ],
      ),
      if (picked != null) ...[
        const SizedBox(height: 12),
        Text(
          '${picked!.name} · ${picked!.sizeLabel}',
          textAlign: TextAlign.center,
          style: TextStyle(color: context.brand.mutedInk, fontSize: 12),
        ),
      ],
    ],
  );
}

/// The creative, however it currently exists: a file just chosen on the
/// device, one already uploaded, or neither.
class AdCreativePreview extends StatelessWidget {
  const AdCreativePreview({
    required this.picked,
    required this.existing,
    this.height = 200,
    super.key,
  });

  final PickedAdCreative? picked;
  final AdCreative? existing;
  final double height;

  @override
  Widget build(BuildContext context) {
    final picked = this.picked;
    final existing = this.existing;
    Widget body;
    if (picked != null) {
      body = picked.isVideo
          ? _VideoBadge(
              child: picked.posterPath == null
                  ? const _CreativePlaceholder(
                      icon: Icons.movie_creation_rounded,
                      label: 'Video ready',
                    )
                  : Image.file(File(picked.posterPath!), fit: BoxFit.cover),
            )
          : Image.file(File(picked.path), fit: BoxFit.cover);
    } else if (existing?.previewUrl case final url? when url.isNotEmpty) {
      body = existing!.isVideo
          ? _VideoBadge(child: VideoCover(videoUrl: url))
          : Image.network(
              url,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const _CreativePlaceholder(
                icon: Icons.image_not_supported_rounded,
                label: 'Preview unavailable',
              ),
            );
    } else if (existing != null) {
      body = _CreativePlaceholder(
        icon: existing.isVideo
            ? Icons.movie_creation_rounded
            : Icons.image_rounded,
        label: existing.isVideo ? 'Video attached' : 'Image attached',
      );
    } else {
      body = const _CreativePlaceholder(
        icon: Icons.add_photo_alternate_outlined,
        label: 'Nothing added yet',
      );
    }

    return GlassSurface(
      blur: false,
      padding: const EdgeInsets.all(6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(kGlassRadius - 7),
        child: SizedBox(height: height, width: double.infinity, child: body),
      ),
    );
  }
}

class _VideoBadge extends StatelessWidget {
  const _VideoBadge({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      child,
      const Center(
        child: Icon(
          Icons.play_circle_fill_rounded,
          color: Colors.white,
          size: 46,
          shadows: [Shadow(blurRadius: 16, color: Colors.black54)],
        ),
      ),
    ],
  );
}

class _CreativePlaceholder extends StatelessWidget {
  const _CreativePlaceholder({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: context.brand.accent.withValues(alpha: 0.05),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 40, color: context.brand.mutedInk),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}

// ── Step 3: the message ─────────────────────────────────────────────────────

class _MessageStep extends StatelessWidget {
  const _MessageStep({
    required this.objective,
    required this.headlineController,
    required this.bodyController,
    required this.ctaLabelController,
    required this.ctaUrlController,
  });

  final AdObjective objective;
  final TextEditingController headlineController;
  final TextEditingController bodyController;
  final TextEditingController ctaLabelController;
  final TextEditingController ctaUrlController;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _StepTitle('What does it say?'),
      TextField(
        controller: headlineController,
        maxLength: 60,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          labelText: 'Headline',
          prefixIcon: Icon(Icons.title_rounded),
        ),
      ),
      const SizedBox(height: 8),
      TextField(
        controller: bodyController,
        minLines: 3,
        maxLines: 5,
        maxLength: 240,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(
          labelText: 'Body',
          alignLabelWithHint: true,
          prefixIcon: Icon(Icons.notes_rounded),
        ),
      ),
      const SizedBox(height: 8),
      TextField(
        controller: ctaLabelController,
        maxLength: 24,
        textCapitalization: TextCapitalization.words,
        decoration: const InputDecoration(
          labelText: 'Button text',
          hintText: 'Shop now',
          prefixIcon: Icon(Icons.smart_button_rounded),
        ),
      ),
      if (objective.needsLink) ...[
        const SizedBox(height: 8),
        TextField(
          controller: ctaUrlController,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: 'Link',
            hintText: 'yourshop.com',
            prefixIcon: Icon(Icons.link_rounded),
          ),
        ),
      ],
    ],
  );
}

// ── Step 4: where and who ───────────────────────────────────────────────────

class _AudienceStep extends StatelessWidget {
  const _AudienceStep({
    required this.placements,
    required this.regions,
    required this.onTogglePlacement,
    required this.onToggleRegion,
  });

  final Set<AdPlacement> placements;
  final Set<String> regions;
  final ValueChanged<AdPlacement> onTogglePlacement;
  final ValueChanged<String> onToggleRegion;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _StepTitle('Where should it show?'),
      for (final placement in AdPlacement.values) ...[
        GlassCard(
          onTap: () => onTogglePlacement(placement),
          accent: placements.contains(placement) ? context.brand.gold : null,
          padding: const EdgeInsets.all(13),
          child: Row(
            children: [
              GlassIconPlate(icon: placement.icon, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  placement.label,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Icon(
                placements.contains(placement)
                    ? Icons.check_box_rounded
                    : Icons.check_box_outline_blank_rounded,
                color: placements.contains(placement)
                    ? context.brand.accent
                    : context.brand.divider,
              ),
            ],
          ),
        ),
        const SizedBox(height: 9),
      ],
      const SizedBox(height: 14),
      Text('Who should see it?', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final region in _kRegions)
            GlassPill(
              label: region,
              selected: regions.contains(region),
              onTap: () => onToggleRegion(region),
            ),
        ],
      ),
    ],
  );
}

// ── Step 5: the money ───────────────────────────────────────────────────────

class _BudgetStep extends StatelessWidget {
  const _BudgetStep({
    required this.dailyBudgetPesewas,
    required this.durationDays,
    required this.cost,
    required this.onBudget,
    required this.onDuration,
  });

  final int dailyBudgetPesewas;
  final int durationDays;
  final AdCostBreakdown cost;
  final ValueChanged<int> onBudget;
  final ValueChanged<int> onDuration;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _StepTitle('How much, and for how long?'),
      GlassSurface(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A DAY',
              style: TextStyle(
                color: context.brand.terracotta,
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
            Text(
              cedis(dailyBudgetPesewas),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Slider(
              value: dailyBudgetPesewas.toDouble(),
              min: kMinDailyBudgetPesewas.toDouble(),
              max: kMaxDailyBudgetPesewas.toDouble(),
              divisions: 100,
              label: cedis(dailyBudgetPesewas),
              onChanged: (value) =>
                  onBudget((value / kPesewasPerCedi).round() * kPesewasPerCedi),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      GlassSurface(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'FOR',
              style: TextStyle(
                color: context.brand.terracotta,
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
              ),
            ),
            Text(
              '$durationDays ${durationDays == 1 ? 'day' : 'days'}',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Slider(
              value: durationDays.toDouble(),
              min: kMinCampaignDays.toDouble(),
              max: kMaxCampaignDays.toDouble(),
              divisions: kMaxCampaignDays - kMinCampaignDays,
              label: '$durationDays',
              onChanged: (value) => onDuration(value.round()),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      AdCostCard(cost: cost),
    ],
  );
}

/// The bill, itemised.
class AdCostCard extends StatelessWidget {
  const AdCostCard({required this.cost, super.key});

  final AdCostBreakdown cost;

  @override
  Widget build(BuildContext context) => GlassSurface(
    padding: const EdgeInsets.all(16),
    child: Column(
      children: [
        _CostRow(
          label:
              '${cedis(cost.dailyBudgetPesewas)} × ${cost.durationDays} '
              '${cost.durationDays == 1 ? 'day' : 'days'}',
          value: cedis(cost.subtotalPesewas),
        ),
        const SizedBox(height: 8),
        _CostRow(
          label: 'Tax and levies (${(AdCostBreakdown.taxRate * 100).round()}%)',
          value: cedis(cost.taxPesewas),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 11),
          child: Divider(height: 1),
        ),
        _CostRow(
          label: 'Total',
          value: cedis(cost.totalPesewas),
          emphasised: true,
        ),
        const SizedBox(height: 12),
        Text(
          'Roughly ${_compact(cost.estimatedImpressionsLow)}–'
          '${_compact(cost.estimatedImpressionsHigh)} views. An estimate, '
          'not a guarantee.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 11.5,
            height: 1.35,
          ),
        ),
      ],
    ),
  );

  static String _compact(int value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(1)}M';
    }
    if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
    return '$value';
  }
}

class _CostRow extends StatelessWidget {
  const _CostRow({
    required this.label,
    required this.value,
    this.emphasised = false,
  });

  final String label;
  final String value;
  final bool emphasised;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          label,
          style: TextStyle(
            fontSize: emphasised ? 15 : 13,
            fontWeight: emphasised ? FontWeight.w900 : FontWeight.w600,
            color: emphasised ? context.brand.ink : context.brand.mutedInk,
          ),
        ),
      ),
      Text(
        value,
        style: TextStyle(
          fontSize: emphasised ? 18 : 13.5,
          fontWeight: FontWeight.w900,
          color: emphasised ? context.brand.accent : context.brand.ink,
        ),
      ),
    ],
  );
}

// ── Step 6: review ──────────────────────────────────────────────────────────

class _ReviewStep extends StatelessWidget {
  const _ReviewStep({
    required this.name,
    required this.headline,
    required this.body,
    required this.objective,
    required this.placements,
    required this.regions,
    required this.cost,
    required this.picked,
    required this.existing,
  });

  final String name;
  final String headline;
  final String body;
  final AdObjective objective;
  final Set<AdPlacement> placements;
  final Set<String> regions;
  final AdCostBreakdown cost;
  final PickedAdCreative? picked;
  final AdCreative? existing;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const _StepTitle('Check it over'),
      AdCreativePreview(picked: picked, existing: existing, height: 180),
      const SizedBox(height: 12),
      GlassSurface(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              headline.trim(),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(body.trim(), style: const TextStyle(height: 1.4)),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _Tag(icon: objective.icon, label: objective.label),
                for (final placement in placements)
                  _Tag(icon: placement.icon, label: placement.label),
                for (final region in regions)
                  _Tag(icon: Icons.place_rounded, label: region),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      AdCostCard(cost: cost),
      const SizedBox(height: 12),
      GlassSurface(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(Icons.lock_clock_rounded, color: context.brand.accent),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Payment is not live yet. Nothing will be charged — the '
                'campaign waits until you can pay for it.',
                style: TextStyle(fontWeight: FontWeight.w700, height: 1.35),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: context.brand.accent.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: context.brand.accent),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
        ),
      ],
    ),
  );
}
