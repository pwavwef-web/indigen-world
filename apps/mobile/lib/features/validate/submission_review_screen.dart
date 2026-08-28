import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/validate_screen.dart'
    show ReviewFlag;
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:just_audio/just_audio.dart';
import 'package:url_launcher/url_launcher.dart';

/// One submission, in full, with the decision at the bottom.
///
/// A reviewer needs three things a list cannot give them: the work itself, the
/// declarations made about it, and one place to record what they decided —
/// with the reason, which the backend requires for anything negative.
class SubmissionReviewScreen extends ConsumerStatefulWidget {
  const SubmissionReviewScreen({required this.item, super.key});

  final ReviewItem item;

  @override
  ConsumerState<SubmissionReviewScreen> createState() =>
      _SubmissionReviewScreenState();
}

class _SubmissionReviewScreenState
    extends ConsumerState<SubmissionReviewScreen> {
  final _feedbackController = TextEditingController();
  var _deciding = false;
  String? _error;

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  Future<void> _decide(ReviewDecision decision) async {
    final feedback = _feedbackController.text.trim();
    if (decision.requiresFeedback && feedback.length < 5) {
      setState(
        () => _error = 'Write the reason first — the contributor will see it.',
      );
      return;
    }
    final confirmed = await showGlassConfirm(
      context: context,
      title: '${decision.label}?',
      message: switch (decision) {
        ReviewDecision.publish =>
          'This makes the work public in the Collection.',
        ReviewDecision.reject => 'The contributor is told, with your reason.',
        ReviewDecision.escalateCultural =>
          'This hands the decision to an admin.',
        _ => 'This records your decision on the submission.',
      },
      confirmLabel: decision.label,
      isDestructive: decision == ReviewDecision.reject,
    );
    if (confirmed != true || !mounted) return;

    final repository = ref.read(reviewRepositoryProvider);
    if (repository == null) return;
    setState(() {
      _deciding = true;
      _error = null;
    });
    try {
      await repository.decide(
        submissionId: widget.item.id,
        decision: decision,
        feedback: feedback,
      );
      ref.invalidate(reviewQueueProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      showGlassToast(context, '${decision.label} recorded.');
    } on ReviewFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _deciding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final decisions = item.availableDecisions;
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(title: const Text('Review')),
      body: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 36),
              children: [
                Text(
                  item.title,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: [
                    ReviewFlag(
                      icon: Icons.tag_rounded,
                      label: item.status,
                      color: context.brand.accent,
                    ),
                    if (item.collectionKind.isNotEmpty)
                      ReviewFlag(
                        icon: Icons.category_rounded,
                        label: item.collectionKind,
                        color: context.brand.accent,
                      ),
                    if (item.format.isNotEmpty)
                      ReviewFlag(
                        icon: Icons.style_rounded,
                        label: item.format,
                        color: context.brand.mutedInk,
                      ),
                    if (item.dialect.isNotEmpty)
                      ReviewFlag(
                        icon: Icons.place_rounded,
                        label: item.dialect,
                        color: context.brand.mutedInk,
                      ),
                  ],
                ),
                if (item.hasMedia) ...[
                  const SizedBox(height: 16),
                  _MediaBlock(item: item),
                ],
                if (item.externalUrl?.isNotEmpty ?? false) ...[
                  const SizedBox(height: 12),
                  GlassRow(
                    icon: Icons.link_rounded,
                    title: 'External recording',
                    detail: item.externalUrl,
                    onTap: () => launchUrl(
                      Uri.parse(item.externalUrl!),
                      mode: LaunchMode.externalApplication,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                _DeclarationsCard(item: item),
                const SizedBox(height: 14),
                if (item.body.isNotEmpty)
                  _TextBlock(title: 'The work', body: item.body),
                if (item.description.isNotEmpty &&
                    item.description != item.body)
                  _TextBlock(title: 'Description', body: item.description),
                if (item.kasemExample.isNotEmpty)
                  _TextBlock(title: 'Kasem example', body: item.kasemExample),
                if (item.englishExample.isNotEmpty)
                  _TextBlock(
                    title: 'English example',
                    body: item.englishExample,
                  ),
                if (item.source.isNotEmpty)
                  _TextBlock(title: 'Source', body: item.source),
                if (item.notes.isNotEmpty)
                  _TextBlock(title: 'Notes for reviewers', body: item.notes),
                if (item.feedback.isNotEmpty)
                  _TextBlock(title: 'Previous decision', body: item.feedback),
                const SizedBox(height: 8),
                TextField(
                  controller: _feedbackController,
                  minLines: 3,
                  maxLines: 6,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Your reason',
                    hintText: 'Required to reject or ask for changes',
                    alignLabelWithHint: true,
                    prefixIcon: Icon(Icons.rate_review_outlined),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 6),
                  GlassSurface(
                    padding: const EdgeInsets.all(13),
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
                            _error!,
                            style: const TextStyle(fontSize: 13, height: 1.35),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                if (decisions.isEmpty)
                  GlassSurface(
                    padding: const EdgeInsets.all(15),
                    child: Row(
                      children: [
                        Icon(
                          Icons.check_circle_rounded,
                          color: context.brand.success,
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'This one is settled — nothing left to decide.',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      for (final decision in decisions)
                        FilledButton.icon(
                          onPressed: _deciding ? null : () => _decide(decision),
                          style: FilledButton.styleFrom(
                            backgroundColor: decision.color(context.brand),
                            foregroundColor: Colors.white,
                          ),
                          icon: Icon(decision.icon, size: 18),
                          label: Text(decision.label),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The declarations the contributor made, laid out so the awkward ones are
/// impossible to miss.
class _DeclarationsCard extends StatelessWidget {
  const _DeclarationsCard({required this.item});

  final ReviewItem item;

  @override
  Widget build(BuildContext context) => GlassSurface(
    accent: item.participantsConsented ? null : context.brand.terracotta,
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'DECLARATIONS',
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 9,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 10),
        _Declaration(
          label: 'Participants consented',
          ok: item.participantsConsented,
        ),
        _Declaration(
          label: 'Uses somebody else’s material',
          ok: !item.usesThirdPartyMaterial,
          okIsGood: true,
        ),
        _Declaration(
          label: 'Involves minors',
          ok: item.involvesMinors != true,
          // A question never put is not the same as one answered "no".
          unknown: item.involvesMinors == null,
        ),
        _Declaration(
          label: 'Publication permission granted',
          ok: item.publicationPermission,
          neutral: true,
        ),
      ],
    ),
  );
}

class _Declaration extends StatelessWidget {
  const _Declaration({
    required this.label,
    required this.ok,
    this.okIsGood = false,
    this.unknown = false,
    this.neutral = false,
  });

  final String label;
  final bool ok;
  final bool okIsGood;
  final bool unknown;

  /// True where "no" is a fact rather than a problem — publication permission
  /// is a choice the contributor made, not a failure of the submission.
  final bool neutral;

  @override
  Widget build(BuildContext context) {
    final colour = unknown
        ? context.brand.mutedInk
        : ok
        ? context.brand.success
        : neutral
        ? context.brand.mutedInk
        : context.brand.terracotta;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(
            unknown
                ? Icons.help_outline_rounded
                : ok
                ? Icons.check_circle_rounded
                : Icons.cancel_rounded,
            size: 18,
            color: colour,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Text(
            unknown ? 'Not asked' : (ok ? 'Yes' : 'No'),
            style: TextStyle(
              color: colour,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _TextBlock extends StatelessWidget {
  const _TextBlock({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: GlassSurface(
      blur: false,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              color: context.brand.terracotta,
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 7),
          SelectableText(body, style: const TextStyle(height: 1.45)),
        ],
      ),
    ),
  );
}

/// The submitted file itself.
///
/// Audio plays inline, because judging a song from its description is not
/// reviewing it. Anything else opens in the device's own viewer — a reviewer
/// on a phone should not be handed a half-working PDF renderer.
class _MediaBlock extends ConsumerStatefulWidget {
  const _MediaBlock({required this.item});

  final ReviewItem item;

  @override
  ConsumerState<_MediaBlock> createState() => _MediaBlockState();
}

class _MediaBlockState extends ConsumerState<_MediaBlock> {
  AudioPlayer? _player;
  String? _url;
  var _loading = false;
  String? _error;

  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  Future<String?> _resolve() async {
    if (_url != null) return _url;
    final repository = ref.read(reviewRepositoryProvider);
    final path = widget.item.mediaStoragePath;
    if (repository == null || path == null || path.isEmpty) return null;
    final url = await repository.mediaUrl(path);
    if (mounted) setState(() => _url = url);
    return url;
  }

  Future<void> _open() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final url = await _resolve();
      if (url == null) {
        setState(() => _error = 'The file could not be opened.');
        return;
      }
      if (widget.item.mediaType == 'audio') {
        final player = _player ??= AudioPlayer();
        if (player.playing) {
          await player.pause();
        } else {
          if (player.audioSource == null) await player.setUrl(url);
          await player.play();
        }
        if (mounted) setState(() {});
      } else {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } on Object {
      if (mounted) setState(() => _error = 'The file could not be opened.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAudio = widget.item.mediaType == 'audio';
    final playing = _player?.playing ?? false;
    return GlassSurface(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              GlassIconPlate(
                icon: switch (widget.item.mediaType) {
                  'audio' => Icons.audiotrack_rounded,
                  'video' => Icons.movie_creation_rounded,
                  'image' => Icons.image_rounded,
                  _ => Icons.description_rounded,
                },
                size: 46,
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Text(
                  'The submitted ${widget.item.mediaType ?? 'file'}',
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 13),
          FilledButton.icon(
            onPressed: _loading ? null : _open,
            icon: _loading
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(
                    isAudio
                        ? (playing
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded)
                        : Icons.open_in_new_rounded,
                  ),
            label: Text(isAudio ? (playing ? 'Pause' : 'Listen') : 'Open'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              style: TextStyle(
                color: context.brand.terracotta,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
