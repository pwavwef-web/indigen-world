import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_repository.dart';
import 'package:indigen_world_mobile/features/subscriptions/paywall_screen.dart';
import 'package:indigen_world_mobile/features/subscriptions/widgets/supporter_badge.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:intl/intl.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// The state of somebody's subscription, and the two things they can do to it.
///
/// ── Cancelling is not a button here ───────────────────────────────────────
/// It is a link into Google Play, and that is not laziness. Play owns the
/// billing relationship: it holds the payment method, it issues the refunds, it
/// is where a cancellation actually takes effect, and Play's own policy
/// requires that somebody can get to it. An in-app "cancel" that only wrote a
/// flag in Firestore would be a button that appears to work and does not.
class ManageSubscriptionScreen extends ConsumerStatefulWidget {
  const ManageSubscriptionScreen({super.key});

  @override
  ConsumerState<ManageSubscriptionScreen> createState() =>
      _ManageSubscriptionScreenState();
}

class _ManageSubscriptionScreenState
    extends ConsumerState<ManageSubscriptionScreen> {
  bool _busy = false;
  String? _message;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final entitlement =
        ref.watch(entitlementProvider).asData?.value ?? Entitlement.none;
    final benefits = ref.watch(tierBenefitsProvider);

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(title: const Text('Subscription')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
          children: [
            _StatusCard(entitlement: entitlement),
            const SizedBox(height: 14),
            if (entitlement.isActive) ...[
              _BenefitsCard(benefits: benefits),
              const SizedBox(height: 14),
            ],
            if (_message != null) ...[
              Text(
                _message!,
                style: TextStyle(color: brand.mutedInk, fontSize: 13),
              ),
              const SizedBox(height: 12),
            ],
            FilledButton.icon(
              onPressed: _busy ? null : _openPaywall,
              icon: Icon(
                entitlement.isActive
                    ? Icons.swap_horiz_rounded
                    : Icons.favorite_rounded,
              ),
              label: Text(
                entitlement.isActive ? 'Change plan' : 'See the plans',
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _openPlay(entitlement),
              icon: const Icon(Icons.open_in_new_rounded),
              label: Text(
                entitlement.isActive
                    ? 'Manage or cancel in Google Play'
                    : 'Open Google Play subscriptions',
              ),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _busy ? null : _refresh,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Restore purchases'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openPaywall() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const PaywallScreen()),
    );
  }

  /// Play's own subscription centre, deep-linked to this product where we know
  /// which one it is.
  Future<void> _openPlay(Entitlement entitlement) async {
    final info = await PackageInfo.fromPlatform();
    final query = <String, String>{
      if (entitlement.productId.isNotEmpty) 'sku': entitlement.productId,
      'package': info.packageName,
    };
    final uri = Uri.https(
      'play.google.com',
      '/store/account/subscriptions',
      query,
    );
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        setState(() => _message = 'Could not open Google Play on this device.');
      }
    }
  }

  Future<void> _refresh() async {
    final repository = ref.read(subscriptionRepositoryProvider);
    final billing = ref.read(billingServiceProvider);
    if (repository == null) return;

    setState(() {
      _busy = true;
      _message = null;
    });
    await billing?.restore();
    try {
      final entitlement = await repository.refresh();
      if (mounted) {
        setState(
          () => _message = entitlement.isActive
              ? 'Your subscription is up to date.'
              : 'Google Play has no active subscription for this account.',
        );
      }
    } on SubscriptionFailure catch (failure) {
      if (mounted) setState(() => _message = failure.message);
    }
    if (mounted) setState(() => _busy = false);
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.entitlement});

  final Entitlement entitlement;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final product = productForId(entitlement.productId);
    final mark = entitlement.benefits.supporterMark;
    final expiry = entitlement.expiresAt;
    final dates = DateFormat.yMMMMd();

    return GlassSurface(
      padding: const EdgeInsets.all(18),
      accent: entitlement.needsAttention ? brand.danger : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (mark != SupporterMark.none) ...[
                SupporterBadge(mark: mark, size: 20, explainOnTap: false),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  product?.name ?? 'No subscription',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            entitlement.status.description,
            style: TextStyle(color: brand.mutedInk, fontSize: 13, height: 1.45),
          ),
          if (expiry != null) ...[
            const SizedBox(height: 10),
            Text(
              entitlement.autoRenewing
                  ? 'Renews on ${dates.format(expiry)}'
                  : 'Runs until ${dates.format(expiry)}',
              style: TextStyle(
                color: brand.ink,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (entitlement.plan != null) ...[
            const SizedBox(height: 4),
            Text(
              entitlement.plan!.billingPeriod.cadence,
              style: TextStyle(color: brand.faintInk, fontSize: 12),
            ),
          ],
          if (entitlement.testPurchase) ...[
            const SizedBox(height: 10),
            // Said out loud rather than hidden. A licence tester who thinks
            // they have paid is a licence tester who will report the wrong bug.
            Text(
              'This is a Google Play test purchase. Nothing has been charged.',
              style: TextStyle(
                color: brand.gold,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BenefitsCard extends StatelessWidget {
  const _BenefitsCard({required this.benefits});

  final TierBenefits benefits;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What this includes',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 10),
          _Line(
            on: benefits.adFree,
            text: 'No adverts in Explore, Community or the Collection',
          ),
          _Line(
            on: true,
            text: '${benefits.kawuriDailyMessages} Kawuri questions a day',
          ),
          _Line(
            on: benefits.offlineDownloadLimit > 0,
            text: benefits.offlineDownloadLimit > 0
                ? '${benefits.offlineDownloadLimit} songs and chapters kept offline'
                : 'Offline listening',
          ),
          _Line(
            on: benefits.supporterMark != SupporterMark.none,
            text: benefits.supporterMark == SupporterMark.none
                ? 'A mark beside your name'
                : 'The ${benefits.supporterMark.label.toLowerCase()} mark beside your name',
          ),
          if (benefits.creatorTools)
            const _Line(on: true, text: 'Raised TribeStudio quotas'),
          const SizedBox(height: 8),
          Text(
            'The archive itself — the dictionary, the lessons, the community — '
            'is free and stays free.',
            style: TextStyle(color: brand.faintInk, fontSize: 12, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.on, required this.text});

  final bool on;
  final String text;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            on ? Icons.check_rounded : Icons.remove_rounded,
            size: 16,
            color: on ? brand.accent : brand.faintInk,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: on ? brand.ink : brand.faintInk,
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
