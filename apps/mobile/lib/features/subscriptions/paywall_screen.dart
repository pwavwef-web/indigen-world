import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/device_integrity.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/billing_service.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_repository.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Where somebody chooses a subscription.
///
/// ── Every price on this screen comes from Google Play ─────────────────────
/// Not one is written down in this app. `ProductDetails.price` is already
/// formatted in the member's own currency, after Play's regional pricing and
/// whatever tax applies where they are — so the number on the button is the
/// number that will be charged, in Ghana and everywhere else. A price string
/// composed here would be a promise this app is not in a position to keep.
///
/// ── And nothing on this screen grants anything ────────────────────────────
/// Tapping a plan opens Play's own sheet. What comes back goes to the backend,
/// which asks Google what it is worth and writes `entitlements/{uid}`. This
/// screen then redraws from that document like every other screen does. There
/// is no local "now they are subscribed" state anywhere in it, on purpose.
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({this.highlight, super.key});

  /// The tier to scroll to and open, when somebody arrived from a locked
  /// feature rather than from Settings.
  final SubscriptionTier? highlight;

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  bool _busy = false;
  String? _error;

  /// The plan each tier's card is showing. Yearly leads: it is the better deal
  /// and the one worth defaulting to, and the monthly price is one tap away.
  final _selected = <SubscriptionTier, BillingPeriod>{};

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final signedIn = ref.watch(authStateProvider).asData?.value != null;
    final entitlement =
        ref.watch(entitlementProvider).asData?.value ?? Entitlement.none;
    final offers = ref.watch(subscriptionOffersProvider);

    // Redraw when a purchase lands, including one that completed while the app
    // was closed. The entitlement stream is what actually changes the screen;
    // this only clears the spinner.
    ref.listen(purchaseEventsProvider, (previous, next) {
      final purchase = next.asData?.value;
      if (purchase == null || !mounted) return;
      if (purchase.status != PurchaseStatus.pending) {
        setState(() => _busy = false);
      }
      if (purchase.status == PurchaseStatus.error) {
        setState(
          () => _error = 'Google Play could not complete that purchase.',
        );
      }
    });

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(
        title: const Text('Support this work'),
        actions: [
          TextButton(
            onPressed: _busy ? null : _restore,
            child: const Text('Restore'),
          ),
        ],
      ),
      body: SafeArea(
        child: offers.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _Unavailable(message: '$error', onRetry: _retry),
          data: (loaded) {
            if (loaded.isEmpty) {
              return _Unavailable(
                offerings: loaded,
                onRetry:
                    loaded.reason == SubscriptionUnavailableReason.notAndroid
                    ? null
                    : _retry,
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
              children: [
                _Intro(entitlement: entitlement),
                const SizedBox(height: 18),
                for (final tier in _tiersIn(loaded.offers))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _TierCard(
                      tier: tier,
                      offers: loaded.offers
                          .where((offer) => offer.product.tier == tier)
                          .toList(growable: false),
                      selected: _selected[tier] ?? BillingPeriod.yearly,
                      current: entitlement.isActive && entitlement.tier == tier,
                      highlighted: widget.highlight == tier,
                      busy: _busy,
                      onPeriod: (period) =>
                          setState(() => _selected[tier] = period),
                      onBuy: (offer) => _buy(offer, signedIn: signedIn),
                    ),
                  ),
                if (_error != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    _error!,
                    style: TextStyle(color: brand.danger, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 10),
                const _SmallPrint(),
              ],
            );
          },
        ),
      ),
    );
  }

  /// Tiers Play actually returned, in catalogue order.
  List<SubscriptionTier> _tiersIn(List<SubscriptionOffer> offers) {
    final seen = <SubscriptionTier>{
      for (final offer in offers) offer.product.tier,
    };
    return [
      for (final product in subscriptionProducts)
        if (seen.contains(product.tier)) product.tier,
    ];
  }

  Future<void> _buy(SubscriptionOffer offer, {required bool signedIn}) async {
    if (!signedIn) {
      final ok = await showSignInSheet(context);
      if (ok != true || !mounted) return;
    }

    final repository = ref.read(subscriptionRepositoryProvider);
    final billing = ref.read(billingServiceProvider);
    if (repository == null || billing == null) {
      setState(
        () => _error = 'Subscriptions are not available on this device.',
      );
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      // The device check first, and its result is only *reported*: in monitor
      // mode a failing verdict changes nothing at all, and even in enforce mode
      // it is the backend that refuses in `preparePlayPurchase` — not this
      // screen. A phone must never be the thing that decides a phone is fine.
      final verdict = await ref.read(deviceIntegrityProvider.future);
      if (verdict.blocked && mounted) {
        setState(() {
          _busy = false;
          _error =
              'Google Play could not verify this device. Update the app from '
              'Play, restart your phone, and try again.';
        });
        return;
      }

      final accountId = await repository.prepare();
      final outcome = await billing.buy(
        offer: offer,
        obfuscatedAccountId: accountId,
        // The subscription being moved away from on an upgrade or downgrade.
        // Null on a first purchase, and null on a device Play has not
        // redelivered the existing purchase to — where Play's own "you already
        // subscribe" sheet takes over rather than charging twice.
        current: billing.purchaseToReplace(offer.product.productId),
      );

      if (!mounted) return;
      // `started` leaves the spinner up: the purchase finishes on the stream,
      // and the listener above is what takes it down.
      if (outcome != PurchaseOutcome.started) {
        setState(() {
          _busy = false;
          _error = switch (outcome) {
            PurchaseOutcome.unavailable =>
              'Google Play billing is not available on this device.',
            PurchaseOutcome.failed =>
              'Google Play could not open the purchase.',
            _ => null,
          };
        });
      }
    } on SubscriptionFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = failure.message;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'That did not go through. Try again in a moment.';
      });
    }
  }

  /// Asks Play for the plans again.
  ///
  /// Worth a button rather than an app restart: every reason a paywall is
  /// empty except [SubscriptionUnavailableReason.notAndroid] can stop being
  /// true a moment later — the Play Store gets signed into, a backend comes
  /// back, a connection finishes — and the offerings are cached for the life
  /// of the launch otherwise.
  void _retry() {
    setState(() => _error = null);
    ref.invalidate(subscriptionOffersProvider);
  }

  Future<void> _restore() async {
    final billing = ref.read(billingServiceProvider);
    final repository = ref.read(subscriptionRepositoryProvider);
    if (billing == null || repository == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    await billing.restore();
    // Restoring through Play only redelivers purchases this device knows
    // about. Asking the backend as well is what recovers a subscription on a
    // phone that has never seen it — a reinstall, a new handset.
    try {
      await repository.refresh();
    } on SubscriptionFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
    if (mounted) setState(() => _busy = false);
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.entitlement});

  final Entitlement entitlement;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          entitlement.isActive
              ? 'You already subscribe'
              : 'Keep Kasem where it belongs',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(
          entitlement.isActive
              ? 'Thank you. You can change plan below, or manage the '
                    'subscription from Google Play at any time.'
              : 'Everything in the archive stays free. A subscription pays for '
                    'the servers, the recordings and the review work behind it '
                    '— and takes the adverts away while it does.',
          style: TextStyle(color: brand.mutedInk, fontSize: 14, height: 1.45),
        ),
      ],
    );
  }
}

class _TierCard extends StatelessWidget {
  const _TierCard({
    required this.tier,
    required this.offers,
    required this.selected,
    required this.current,
    required this.highlighted,
    required this.busy,
    required this.onPeriod,
    required this.onBuy,
  });

  final SubscriptionTier tier;
  final List<SubscriptionOffer> offers;
  final BillingPeriod selected;
  final bool current;
  final bool highlighted;
  final bool busy;
  final ValueChanged<BillingPeriod> onPeriod;
  final ValueChanged<SubscriptionOffer> onBuy;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final product = productForTier(tier);
    if (product == null || offers.isEmpty) return const SizedBox.shrink();

    final chosen = offers.firstWhere(
      (offer) => offer.plan.billingPeriod == selected,
      orElse: () => offers.first,
    );

    return GlassSurface(
      padding: const EdgeInsets.all(18),
      accent: highlighted || current ? brand.accent : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  product.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (current)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: brand.accentSoft,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Your plan',
                    style: TextStyle(
                      color: brand.accent,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            product.tagline,
            style: TextStyle(color: brand.mutedInk, fontSize: 13, height: 1.4),
          ),
          const SizedBox(height: 14),
          if (offers.length > 1)
            _PeriodToggle(
              offers: offers,
              selected: chosen.plan.billingPeriod,
              onChanged: onPeriod,
            ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                // Play's own formatted string, never anything composed here.
                chosen.price,
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  chosen.plan.billingPeriod.cadence,
                  style: TextStyle(color: brand.mutedInk, fontSize: 12),
                ),
              ),
            ],
          ),
          if (chosen.hasTrial) ...[
            const SizedBox(height: 4),
            Text(
              '${chosen.freeTrialDays} days free first',
              style: TextStyle(
                color: brand.success,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ] else if (chosen.introductoryPrice != null) ...[
            const SizedBox(height: 4),
            Text(
              '${chosen.introductoryPrice} to start',
              style: TextStyle(
                color: brand.success,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 14),
          for (final line in benefitLinesFor(tier))
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.check_rounded, size: 16, color: brand.accent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      line,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 13,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: busy || current ? null : () => onBuy(chosen),
              child: Text(
                current
                    ? 'Subscribed'
                    : 'Choose ${product.name.replaceFirst('Indigen ', '')}',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodToggle extends StatelessWidget {
  const _PeriodToggle({
    required this.offers,
    required this.selected,
    required this.onChanged,
  });

  final List<SubscriptionOffer> offers;
  final BillingPeriod selected;
  final ValueChanged<BillingPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    final periods = <BillingPeriod>{
      for (final offer in offers) offer.plan.billingPeriod,
    }.toList()..sort((a, b) => a.index.compareTo(b.index));

    return SegmentedButton<BillingPeriod>(
      segments: [
        for (final period in periods)
          ButtonSegment(value: period, label: Text(period.label)),
      ],
      selected: {selected},
      showSelectedIcon: false,
      onSelectionChanged: (values) => onChanged(values.first),
    );
  }
}

class _SmallPrint extends StatelessWidget {
  const _SmallPrint();

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Text(
      'Subscriptions are billed by Google Play and renew until cancelled. '
      'Cancel any time from Play — everything you have paid for keeps working '
      'until the end of the period. Nothing in the archive is ever locked '
      'behind a subscription.',
      style: TextStyle(color: brand.faintInk, fontSize: 12, height: 1.45),
    );
  }
}

/// The empty paywall, and — behind one tap — why it is empty.
///
/// ── Why the detail is a tap away rather than on the screen ────────────────
/// Because the two audiences want opposite things. Somebody who just wanted to
/// subscribe needs one plain sentence and a way out. Whoever is configuring
/// Play Console needs base plan ids. Putting the second on screen makes the
/// first worse; hiding it entirely makes the second impossible, which is how
/// an afternoon disappears into guessing.
class _Unavailable extends StatelessWidget {
  const _Unavailable({this.message, this.offerings, this.onRetry});

  final String? message;
  final SubscriptionOfferings? offerings;

  /// Asks Play again. Worth offering for every reason but [notAndroid]: a
  /// backend that is down comes back, and so does a billing connection that
  /// had not finished the first time somebody looked.
  final VoidCallback? onRetry;

  /// One sentence, for somebody who only wanted to subscribe.
  String get _title => switch (offerings?.reason) {
    SubscriptionUnavailableReason.notAndroid =>
      'Subscriptions are only available in the Android app.',
    SubscriptionUnavailableReason.backendUnavailable =>
      'Could not reach Indigen World. Check your connection and try again.',
    SubscriptionUnavailableReason.billingUnavailable =>
      'Google Play is not available on this device, so nothing can be bought '
          'here.',
    _ when message != null => 'Google Play could not list the plans right now.',
    _ => 'Subscriptions are not available on this device yet.',
  };

  /// The same thing said to whoever has to fix it.
  List<String> get _detail {
    final offerings = this.offerings;
    if (offerings == null) return [?message];

    return switch (offerings.reason) {
      SubscriptionUnavailableReason.notAndroid => const [
        'Google Play Billing is Android only. This build is not Android.',
      ],
      SubscriptionUnavailableReason.backendUnavailable => const [
        'Firebase is not up on this launch, so a purchase could not be '
            'verified even if Play accepted it. The paywall stays shut rather '
            'than take money it cannot honour.',
      ],
      SubscriptionUnavailableReason.billingUnavailable => [
        'BillingClient reported not ready. Google Play refused to open a '
            'billing connection at all, which is a different thing from Play '
            'not knowing the products.',
        '',
        if (offerings.packageName.isNotEmpty) ...[
          'This build is running as ${offerings.packageName}.',
          '',
        ],
        'In order of how often it is the answer: the application id this '
            'build runs under is not one Play has ever seen — every .dev and '
            '.staging flavour has its own, and only the production flavour is '
            'com.indigenworld.indigen. Or the Play Store on this device is '
            'signed out, disabled, or signed in as an account that is not on '
            'a track carrying the app. Or there is genuinely no Play Store '
            'here — an emulator image without Google APIs, or a Play Services '
            'install too old to serve billing.',
      ],
      SubscriptionUnavailableReason.playReturnedNothing => [
        'Google Play recognised none of these product ids:',
        subscriptionProductIds.join(', '),
        '',
        'That is almost always one of three things. The application id '
            'this build runs under may not be the one the products were '
            'created under — '
            'a .dev or .staging flavour has its own id and Play sells nothing '
            'for it. Or this Google account is not on a track that carries '
            'them. Or they were published minutes ago and have not propagated '
            'yet, which can take a few hours.',
        if (offerings.packageName.isNotEmpty) '',
        if (offerings.packageName.isNotEmpty)
          'This build is running as ${offerings.packageName}.',
        if (offerings.queryError.isNotEmpty) '',
        if (offerings.queryError.isNotEmpty)
          'Play said: ${offerings.queryError}',
      ],
      SubscriptionUnavailableReason.basePlanMismatch => [
        'Google Play knows the products but none of their base plans match '
            'this build.',
        '',
        'Play returned these base plan ids:',
        offerings.playBasePlanIds.join(', '),
        '',
        'This build expects:',
        [
          for (final product in subscriptionProducts)
            for (final plan in product.plans) plan.basePlanId,
        ].join(', '),
        '',
        'They have to match character for character. Rename them in Play '
            'Console, or change subscription_catalog.dart and its backend '
            'mirror together.',
      ],
      SubscriptionUnavailableReason.none => const [],
    };
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: GlassEmptyState(
        icon: Icons.store_mall_directory_outlined,
        title: _title,
        action: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (onRetry != null)
              TextButton(onPressed: onRetry, child: const Text('Try again')),
            if (detail.isNotEmpty)
              TextButton(
                onPressed: () => showGlassPopup<void>(
                  context: context,
                  title: 'Why the plans are missing',
                  builder: (popupContext) => SelectableText(
                    detail.join('\n'),
                    style: TextStyle(
                      color: popupContext.brand.mutedInk,
                      fontSize: 13,
                      height: 1.5,
                    ),
                  ),
                ),
                child: const Text('Why?'),
              ),
          ],
        ),
      ),
    );
  }
}
