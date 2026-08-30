import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/create_ad_screen.dart'
    show AdCreativePreview;
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/validate/data/ad_review_queue.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// One advert, in full, with the decisions a reviewer can take on it.
///
/// The point of this screen is that everything the community will see is on it
/// before anything is approved: the creative, the words, where it will show,
/// who it will reach, and what was actually paid. A reviewer approving on a
/// headline alone is a reviewer who has not reviewed it.
class AdReviewScreen extends ConsumerStatefulWidget {
  const AdReviewScreen({required this.campaign, super.key});

  final AdCampaign campaign;

  @override
  ConsumerState<AdReviewScreen> createState() => _AdReviewScreenState();
}

class _AdReviewScreenState extends ConsumerState<AdReviewScreen> {
  final _feedback = TextEditingController();
  var _submitting = false;
  String? _error;

  @override
  void dispose() {
    _feedback.dispose();
    super.dispose();
  }

  Future<void> _decide(AdReviewDecision decision) async {
    final repository = ref.read(adReviewRepositoryProvider);
    if (repository == null || _submitting) return;

    final feedback = _feedback.text.trim();
    if (decision.requiresFeedback && feedback.isEmpty) {
      setState(
        () => _error = 'Say why. An advertiser told "no" with no reason '
            'cannot do anything about it.',
      );
      return;
    }

    final confirmed = await showGlassConfirm(
      context: context,
      title: '${decision.label}?',
      message: switch (decision) {
        AdReviewDecision.approve =>
          'It starts running now, for its full ${widget.campaign.durationDays} '
              'days, and the advertiser is told.',
        AdReviewDecision.reject =>
          'It stops here and the advertiser is told why. This does not refund '
              'anything.',
        AdReviewDecision.pause => 'It stops showing until it is resumed.',
        AdReviewDecision.resume => 'It starts showing again.',
      },
      confirmLabel: decision.label,
      isDestructive: decision == AdReviewDecision.reject,
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await repository.decide(
        campaignId: widget.campaign.id,
        decision: decision,
        feedback: feedback,
      );
      if (!mounted) return;
      showGlassToast(context, '${decision.label} — the advertiser was told.');
      Navigator.of(context).pop(true);
    } on ReviewFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final campaign = widget.campaign;
    final decisions = AdReviewDecision.availableFor(campaign);

    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(title: const Text('Review advert')),
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 40),
          children: [
            AdCreativePreview(
              picked: null,
              existing: campaign.creative,
              height: 210,
            ),
            const SizedBox(height: 16),
            Text(campaign.name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 14),

            // ── What the community would see ────────────────────────────
            _ReviewBlock(
              heading: 'The advert itself',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    campaign.headline,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    campaign.body,
                    style: TextStyle(
                      color: context.brand.ink,
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                  if (campaign.ctaLabel.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _Field(label: 'Button', value: campaign.ctaLabel),
                  ],
                  if (campaign.ctaUrl.isNotEmpty)
                    _Field(label: 'Sends people to', value: campaign.ctaUrl),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ── Where and to whom ───────────────────────────────────────
            _ReviewBlock(
              heading: 'Where it would run',
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Tag(
                    icon: campaign.objective.icon,
                    label: campaign.objective.label,
                  ),
                  for (final placement in campaign.placements)
                    _Tag(icon: placement.icon, label: placement.label),
                  for (final region in campaign.regions)
                    _Tag(icon: Icons.place_rounded, label: region),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ── The money ───────────────────────────────────────────────
            //
            // Shown to a reviewer because approving is what puts a paid advert
            // in front of people: an unpaid campaign reaching ACTIVE would be
            // free advertising, and the callable refuses it for that reason.
            _ReviewBlock(
              heading: 'What was paid',
              child: Column(
                children: [
                  _Field(
                    label: 'Daily budget',
                    value: cedis(campaign.dailyBudgetPesewas),
                  ),
                  _Field(
                    label: 'Running for',
                    value: '${campaign.durationDays} days',
                  ),
                  _Field(
                    label: 'Total',
                    value: cedis(campaign.totalBudgetPesewas),
                  ),
                  _Field(
                    label: 'Payment',
                    value: switch (campaign.paymentStatus) {
                      'paid' => 'Paid in full',
                      'underpaid' => 'Short — not fully paid',
                      'pending' => 'Checkout opened, not settled',
                      _ => 'Unpaid',
                    },
                    tone: campaign.isPaid
                        ? context.brand.success
                        : context.brand.danger,
                  ),
                ],
              ),
            ),

            if (campaign.reviewFeedback.isNotEmpty) ...[
              const SizedBox(height: 12),
              _ReviewBlock(
                heading: 'Last decision',
                child: Text(
                  campaign.reviewFeedback,
                  style: TextStyle(color: context.brand.mutedInk, height: 1.45),
                ),
              ),
            ],

            const SizedBox(height: 20),

            if (decisions.isEmpty)
              GlassSurface(
                padding: const EdgeInsets.all(15),
                child: Row(
                  children: [
                    Icon(
                      Icons.lock_outline_rounded,
                      color: context.brand.mutedInk,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'This campaign is ${campaign.status.label.toLowerCase()}'
                        ' — there is nothing left to decide.',
                        style: TextStyle(
                          color: context.brand.mutedInk,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              TextField(
                controller: _feedback,
                minLines: 2,
                maxLines: 5,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Note to the advertiser',
                  helperText: 'Required when rejecting.',
                ),
              ),
              if (_error case final error?) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  style: TextStyle(
                    color: context.brand.danger,
                    fontSize: 12.5,
                    height: 1.4,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              for (final decision in decisions) ...[
                FilledButton.icon(
                  onPressed: _submitting ? null : () => _decide(decision),
                  style: FilledButton.styleFrom(
                    backgroundColor: decision.color(context.brand),
                    foregroundColor: Colors.white,
                  ),
                  icon: Icon(decision.icon),
                  label: Text(decision.label),
                ),
                const SizedBox(height: 9),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _ReviewBlock extends StatelessWidget {
  const _ReviewBlock({required this.heading, required this.child});

  final String heading;
  final Widget child;

  @override
  Widget build(BuildContext context) => GlassSurface(
    padding: const EdgeInsets.all(15),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          heading.toUpperCase(),
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 9.5,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 10),
        child,
      ],
    ),
  );
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value, this.tone});

  final String label;
  final String value;
  final Color? tone;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 108,
          child: Text(
            label,
            style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              color: tone ?? context.brand.ink,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: context.brand.surfaceMuted,
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: context.brand.border),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: context.brand.accent),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: context.brand.ink,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}
