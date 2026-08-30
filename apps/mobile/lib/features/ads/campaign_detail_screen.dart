import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart'
    show AdStatusPill;
import 'package:indigen_world_mobile/features/ads/create_ad_screen.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_repository.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:url_launcher/url_launcher.dart';

/// One campaign in full: the creative, the copy, what it costs, where it is.
class CampaignDetailScreen extends ConsumerWidget {
  const CampaignDetailScreen({required this.campaignId, super.key});

  final String campaignId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final campaign = ref.watch(adCampaignProvider(campaignId));
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: const Text('Campaign'),
        actions: [
          if (campaign.asData?.value case final value?
              when value.status.isCancellable)
            IconButton(
              tooltip: 'Cancel campaign',
              onPressed: () => _cancel(context, ref, value),
              icon: const Icon(Icons.cancel_outlined),
            ),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: campaign.when(
          loading: () => const Padding(
            padding: EdgeInsets.all(18),
            child: Column(
              children: [
                GlassSkeleton(height: 200),
                SizedBox(height: 12),
                GlassSkeleton(height: 140),
              ],
            ),
          ),
          error: (_, _) => GlassEmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'This campaign could not be loaded',
            color: context.brand.terracotta,
          ),
          data: (value) => value == null
              ? const GlassEmptyState(
                  icon: Icons.search_off_rounded,
                  title: 'This campaign is no longer here',
                )
              : _Detail(campaign: value),
        ),
      ),
    );
  }

  Future<void> _cancel(
    BuildContext context,
    WidgetRef ref,
    AdCampaign campaign,
  ) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Cancel this campaign?',
      message: campaign.isPaid
          ? 'It stops running. Anything already spent is not refunded here.'
          : 'Nothing has been charged, so nothing is refunded.',
      cancelLabel: 'Keep it',
      confirmLabel: 'Cancel campaign',
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;
    final repository = ref.read(adRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.cancel(campaign.id);
      ref.invalidate(myAdCampaignsProvider);
      if (context.mounted) showGlassToast(context, 'Campaign cancelled.');
    } on AdCampaignFailure catch (failure) {
      if (context.mounted) showGlassToast(context, failure.message);
    }
  }
}

class _Detail extends ConsumerWidget {
  const _Detail({required this.campaign});

  final AdCampaign campaign;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cost = AdCostBreakdown(
      dailyBudgetPesewas: campaign.dailyBudgetPesewas,
      durationDays: campaign.durationDays,
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 40),
      children: [
        AdCreativePreview(
          picked: null,
          existing: campaign.creative,
          height: 200,
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Text(
                campaign.name,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            const SizedBox(width: 10),
            AdStatusPill(status: campaign.status),
          ],
        ),
        if (campaign.reviewFeedback.isNotEmpty) ...[
          const SizedBox(height: 12),
          GlassSurface(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(
                  Icons.rate_review_rounded,
                  color: context.brand.terracotta,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    campaign.reviewFeedback,
                    style: const TextStyle(height: 1.35, fontSize: 13.5),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        GlassSurface(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                campaign.headline,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (campaign.body.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(campaign.body, style: const TextStyle(height: 1.45)),
              ],
              if (campaign.ctaLabel.isNotEmpty ||
                  campaign.ctaUrl.isNotEmpty) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(
                      Icons.smart_button_rounded,
                      size: 17,
                      color: context.brand.accent,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        [
                          if (campaign.ctaLabel.isNotEmpty) campaign.ctaLabel,
                          if (campaign.ctaUrl.isNotEmpty) campaign.ctaUrl,
                        ].join(' → '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: context.brand.mutedInk,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (campaign.status == AdCampaignStatus.active ||
            campaign.impressions > 0) ...[
          Row(
            children: [
              Expanded(
                child: _Metric(
                  icon: Icons.visibility_rounded,
                  value: '${campaign.impressions}',
                  label: 'Views',
                  color: context.brand.success,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Metric(
                  icon: Icons.touch_app_rounded,
                  value: '${campaign.clicks}',
                  label: 'Taps',
                  color: context.brand.terracotta,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
        ],
        AdCostCard(cost: cost),
        const SizedBox(height: 14),
        GlassSurface(
          padding: const EdgeInsets.all(16),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Chip(
                icon: campaign.objective.icon,
                label: campaign.objective.label,
              ),
              for (final placement in campaign.placements)
                _Chip(icon: placement.icon, label: placement.label),
              for (final region in campaign.regions)
                _Chip(icon: Icons.place_rounded, label: region),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (campaign.needsPayment) ...[
          AdPaymentPanel(campaign: campaign),
          const SizedBox(height: 10),
        ],
        if (campaign.status.isEditable)
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<bool>(
                builder: (context) => CreateAdScreen(existing: campaign),
              ),
            ),
            icon: const Icon(Icons.edit_rounded),
            label: const Text('Edit campaign'),
          ),
      ],
    );
  }
}

/// Paying for a campaign.
///
/// The checkout itself is Paystack's own hosted page, opened in the browser:
/// no card number, no mobile-money PIN and no OTP is ever typed into this app,
/// which is the only version of this screen worth shipping.
///
/// Coming back is the interesting part. The member leaves for the browser and
/// returns whenever they are done — possibly minutes later, possibly after the
/// app was evicted — so the panel re-checks on every resume rather than relying
/// on them to tell it. The server's webhook settles the campaign independently
/// either way; this is the fast path, not the only one.
class AdPaymentPanel extends ConsumerStatefulWidget {
  const AdPaymentPanel({required this.campaign, super.key});

  final AdCampaign campaign;

  @override
  ConsumerState<AdPaymentPanel> createState() => _AdPaymentPanelState();
}

class _AdPaymentPanelState extends ConsumerState<AdPaymentPanel>
    with WidgetsBindingObserver {
  var _busy = false;
  var _checking = false;

  /// Set once a checkout has been opened from this screen, so the resume check
  /// only runs for somebody who actually went to pay.
  var _awaitingReturn = false;

  String? _error;
  String? _note;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || !_awaitingReturn) return;
    unawaited(_check(quiet: true));
  }

  Future<void> _pay() async {
    final repository = ref.read(adRepositoryProvider);
    if (repository == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _note = null;
    });
    try {
      final checkout = await repository.startPayment(widget.campaign.id);
      final opened = await launchUrl(
        Uri.parse(checkout.authorizationUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      if (!opened) {
        setState(
          () => _error = 'No browser could open the payment page.',
        );
        return;
      }
      setState(() {
        _awaitingReturn = true;
        _note = checkout.testMode
            ? 'Test mode — use a Paystack test card. No real money moves.'
            : null;
      });
    } on AdCampaignFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Asks the server what became of the checkout.
  ///
  /// [quiet] is the automatic check on resume: somebody who came back without
  /// paying should not be met with an error about it.
  Future<void> _check({bool quiet = false}) async {
    final repository = ref.read(adRepositoryProvider);
    if (repository == null || _checking) return;
    setState(() {
      _checking = true;
      if (!quiet) {
        _error = null;
        _note = null;
      }
    });
    try {
      final outcome = await repository.confirmPayment(widget.campaign.id);
      if (!mounted) return;
      ref.invalidate(myAdCampaignsProvider);
      if (outcome.paid) {
        setState(() {
          _awaitingReturn = false;
          _note = 'Payment received. Your campaign is with our reviewers.';
        });
        return;
      }
      if (quiet) return;
      setState(
        () => _note = switch (outcome.providerStatus) {
          'abandoned' => 'That checkout was not completed.',
          'failed' => 'The payment did not go through. Nothing was charged.',
          _ => 'Nothing has come through yet. Check again in a moment.',
        },
      );
    } on AdCampaignFailure catch (failure) {
      if (mounted && !quiet) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final campaign = widget.campaign;
    final busy = _busy || _checking;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassSurface(
          padding: const EdgeInsets.all(15),
          child: Row(
            children: [
              Icon(
                campaign.isUnderpaid
                    ? Icons.error_outline_rounded
                    : Icons.payments_rounded,
                color: campaign.isUnderpaid
                    ? context.brand.danger
                    : context.brand.accent,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      campaign.isUnderpaid
                          ? 'Part of the amount came through'
                          : '${cedis(campaign.totalBudgetPesewas)} to pay',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      campaign.isUnderpaid
                          ? 'Pay the rest and the campaign goes to review.'
                          : 'Card, bank or mobile money, on Paystack’s own '
                                'page. Your details never touch this app.',
                      style: TextStyle(
                        color: context.brand.mutedInk,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (_note case final note?) ...[
          const SizedBox(height: 10),
          _PaymentMessage(text: note, tone: context.brand.accent),
        ],
        if (_error case final error?) ...[
          const SizedBox(height: 10),
          _PaymentMessage(text: error, tone: context.brand.danger),
        ],
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: busy ? null : _pay,
          icon: _busy
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.payments_rounded),
          label: Text(
            _busy
                ? 'Opening Paystack…'
                : campaign.hasOpenCheckout
                ? 'Pay again'
                : 'Pay ${cedis(campaign.totalBudgetPesewas)}',
          ),
        ),
        // Offered as soon as there is a checkout to ask about, whether it was
        // opened on this screen or on a phone the member has since closed.
        if (campaign.hasOpenCheckout || _awaitingReturn) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: busy ? null : () => _check(),
            icon: _checking
                ? const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh_rounded),
            label: Text(_checking ? 'Checking…' : 'I have paid — check now'),
          ),
        ],
      ],
    );
  }
}

class _PaymentMessage extends StatelessWidget {
  const _PaymentMessage({required this.text, required this.tone});

  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
    decoration: BoxDecoration(
      color: tone.withValues(alpha: 0.10),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: tone.withValues(alpha: 0.35)),
    ),
    child: Text(
      text,
      style: TextStyle(color: context.brand.ink, fontSize: 12.5, height: 1.4),
    ),
  );
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => GlassSurface(
    accent: color,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    child: Column(
      children: [
        GlassIconPlate(icon: icon, color: color, size: 34),
        const SizedBox(height: 8),
        Text(value, style: Theme.of(context).textTheme.titleLarge),
        Text(
          label,
          style: TextStyle(color: context.brand.mutedInk, fontSize: 10),
        ),
      ],
    ),
  );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label});

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
