import 'dart:async';
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/device_integrity.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/billing_service.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/offer_pricing.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_repository.dart';
import 'package:indigen_world_mobile/features/subscriptions/widgets/membership_hero.dart';
import 'package:indigen_world_mobile/features/subscriptions/widgets/supporter_badge.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:intl/intl.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Membership: the plans, the member's own subscription, and the way to pay.
///
/// ── One screen, not two ───────────────────────────────────────────────────
/// There used to be a status screen with a "See the plans" button that pushed
/// the plans. That put the thing somebody came to the Membership tab for one
/// tap deeper than the tab, behind a card that mostly said "No subscription".
/// Now the tab *is* the plans. What the status screen was for — which plan is
/// running, when it renews, the way into Google Play to cancel — sits above
/// them as a single card, and only for somebody who has a subscription to
/// describe.
///
/// ── Every price on this screen comes from Google Play ─────────────────────
/// Not one is written down in this app. `ProductDetails.price` is already
/// formatted in the member's own currency, after Play's regional pricing and
/// whatever tax applies where they are — so the number beside the button is
/// the number that will be charged, in Ghana and everywhere else. The two
/// figures derived from it — the saving and the yearly plan's monthly
/// equivalent — are computed from Play's prices in `offer_pricing.dart`, and
/// are left off whenever that arithmetic would be a guess.
///
/// ── And nothing on this screen grants anything ────────────────────────────
/// Tapping pay opens Play's own sheet. What comes back goes to the backend,
/// which asks Google what it is worth and writes `entitlements/{uid}`. This
/// screen then redraws from that document like every other screen does. There
/// is no local "now they are subscribed" state anywhere in it, on purpose.
///
/// ── Cancelling is not a button here ───────────────────────────────────────
/// It is a link into Google Play, and that is not laziness. Play owns the
/// billing relationship: it holds the payment method, it issues the refunds, it
/// is where a cancellation actually takes effect, and Play's own policy
/// requires that somebody can get to it. An in-app "cancel" that only wrote a
/// flag in Firestore would be a button that appears to work and does not.
class MembershipScreen extends ConsumerStatefulWidget {
  const MembershipScreen({
    this.highlight,
    this.embedded = false,
    this.bottomPadding = 28,
    super.key,
  });

  /// The tier to open on, when somebody arrived from a locked feature.
  final SubscriptionTier? highlight;

  /// My Space owns the title bar and the bottom rail when this is its tab.
  final bool embedded;

  /// Space left under the last line — the rail's reserve, when embedded.
  final double bottomPadding;

  @override
  ConsumerState<MembershipScreen> createState() => _MembershipScreenState();
}

class _MembershipScreenState extends ConsumerState<MembershipScreen> {
  /// A little of each neighbour shows at the edges, which is what tells
  /// somebody the cards swipe before they have tried.
  static const _viewportFraction = 0.84;

  late final PageController _pages;
  late int _page;

  /// The billing period chosen, or null until somebody taps one — in which
  /// case it is the member's own plan's, or yearly. Yearly leads: it is the
  /// better deal and the one worth defaulting to, and monthly is one tap away.
  BillingPeriod? _period;

  /// Whether the member has moved the carousel themselves. Until they have,
  /// it follows their subscription when that arrives from Firestore.
  bool _touched = false;

  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    final entitlement =
        ref.read(entitlementProvider).asData?.value ?? Entitlement.none;
    _page = _indexOf(widget.highlight) ?? _currentTierIndex(entitlement) ?? 0;
    // `keepPage` off: the tab is rebuilt every time My Space switches back to
    // it, and a restored scroll position that disagreed with [_page] would
    // show one tier's card over another tier's prices.
    _pages = PageController(
      viewportFraction: _viewportFraction,
      initialPage: _page,
      keepPage: false,
    );
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  static int? _indexOf(SubscriptionTier? tier) {
    if (tier == null) return null;
    final index = subscriptionProducts.indexWhere((p) => p.tier == tier);
    return index == -1 ? null : index;
  }

  static int? _currentTierIndex(Entitlement entitlement) =>
      entitlement.isActive ? _indexOf(entitlement.tier) : null;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final signedIn = ref.watch(authStateProvider).asData?.value != null;
    final entitlement =
        ref.watch(entitlementProvider).asData?.value ?? Entitlement.none;
    final offerings = ref.watch(subscriptionOffersProvider);

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

    // A subscription that arrives after the screen opened — Firestore is not
    // instant — moves the carousel to it, unless the member is already
    // looking somewhere else on purpose.
    ref.listen(entitlementProvider, (previous, next) {
      final index = _currentTierIndex(next.asData?.value ?? Entitlement.none);
      if (index == null || _touched || widget.highlight != null) return;
      if (index != _page && _pages.hasClients) _pages.jumpToPage(index);
    });

    final product = subscriptionProducts[_page];
    final period =
        _period ?? entitlement.plan?.billingPeriod ?? BillingPeriod.yearly;

    final list = ListView(
      key: widget.embedded
          ? const PageStorageKey('profile-membership-scroll')
          : null,
      padding: EdgeInsets.only(bottom: widget.bottomPadding),
      children: [
        // Keyed, every one: the status card below appears once Firestore
        // answers, and an unkeyed insertion above the carousel would mount a
        // second PageView on the same controller for a frame.
        MembershipHero(
          key: const ValueKey('membership-hero'),
          title: entitlement.isActive
              ? 'You keep the archive alive'
              : 'Support the archive',
          subtitle: entitlement.isActive
              ? 'Thank you. Switch plans below, or manage yours in Google Play.'
              : 'Keep our stories alive for generations.',
          leading: widget.embedded
              ? null
              : IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close_rounded),
                ),
          trailing: TextButton(
            onPressed: _busy ? null : () => _restore(signedIn: signedIn),
            style: TextButton.styleFrom(
              foregroundColor: brand.accent,
              textStyle: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            child: const Text('Restore'),
          ),
        ),
        if (entitlement.tier != SubscriptionTier.none ||
            entitlement.status != EntitlementStatus.none)
          Padding(
            key: const ValueKey('membership-status'),
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
            child: _MemberStatus(
              entitlement: entitlement,
              onManage: _busy ? null : () => _openPlay(entitlement),
            ),
          ),
        const SizedBox(height: 22),
        _TierTabs(
          key: const ValueKey('membership-tabs'),
          products: subscriptionProducts,
          controller: _pages,
          page: _page,
          onTap: _goTo,
        ),
        const SizedBox(height: 18),
        _TierCarousel(
          key: const ValueKey('membership-carousel'),
          products: subscriptionProducts,
          controller: _pages,
          page: _page,
          entitlement: entitlement,
          onPageChanged: _onPageChanged,
        ),
        const SizedBox(height: 22),
        Padding(
          key: const ValueKey('membership-checkout'),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: offerings.when(
            loading: () => const _PlansLoading(),
            error: (error, _) =>
                _PlansUnavailable(message: '$error', onRetry: _retry),
            data: (loaded) {
              if (loaded.isEmpty) {
                return _PlansUnavailable(
                  offerings: loaded,
                  onRetry:
                      loaded.reason == SubscriptionUnavailableReason.notAndroid
                      ? null
                      : _retry,
                );
              }
              final offers = loaded.offers
                  .where((offer) => offer.product.tier == product.tier)
                  .toList(growable: false);
              return _Checkout(
                product: product,
                offers: offers,
                period: period,
                entitlement: entitlement,
                busy: _busy,
                error: _error,
                notice: _notice,
                onPeriod: (value) {
                  HapticFeedback.selectionClick();
                  setState(() {
                    _period = value;
                    _error = null;
                  });
                },
                onBuy: (offer) => _buy(offer, signedIn: signedIn),
              );
            },
          ),
        ),
        if (offerings.asData?.value.isEmpty ?? true)
          if (_error ?? _notice case final message?)
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 12, 28, 0),
              child: _Message(text: message, isError: _error != null),
            ),
        const SizedBox(height: 16),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: _SmallPrint(),
        ),
      ],
    );

    if (widget.embedded) return list;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: brandOverlayStyle(brand),
      child: Scaffold(
        backgroundColor: brand.background,
        body: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: list,
            ),
          ),
        ),
      ),
    );
  }

  void _onPageChanged(int index) {
    if (index == _page) return;
    HapticFeedback.selectionClick();
    setState(() {
      _touched = true;
      _page = index;
      _error = null;
    });
  }

  void _goTo(int index) {
    _touched = true;
    if (!_pages.hasClients || index == _page) return;
    unawaited(
      _pages.animateToPage(
        index,
        duration: MediaQuery.disableAnimationsOf(context)
            ? const Duration(milliseconds: 1)
            : const Duration(milliseconds: 380),
        curve: Curves.easeOutCubic,
      ),
    );
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
      _notice = null;
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
  /// Worth a button rather than an app restart: every reason the plans are
  /// missing except [SubscriptionUnavailableReason.notAndroid] can stop being
  /// true a moment later — the Play Store gets signed into, a backend comes
  /// back, a connection finishes — and the offerings are cached for the life
  /// of the launch otherwise.
  void _retry() {
    setState(() {
      _error = null;
      _notice = null;
    });
    ref.invalidate(subscriptionOffersProvider);
  }

  /// Recovers a subscription this account already has.
  ///
  /// Restoring through Play only redelivers purchases this device knows about.
  /// Asking the backend as well is what recovers a subscription on a phone that
  /// has never seen it — a reinstall, a new handset — and the backend needs to
  /// know whose account to look in, so a guest signs in first.
  Future<void> _restore({required bool signedIn}) async {
    final repository = ref.read(subscriptionRepositoryProvider);
    if (repository == null) {
      setState(() {
        _notice = null;
        _error = 'Subscriptions are not available on this device.';
      });
      return;
    }
    if (!signedIn) {
      final ok = await showSignInSheet(context);
      if (ok != true || !mounted) return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await ref.read(billingServiceProvider)?.restore();
      final restored = await repository.refresh();
      if (mounted) {
        setState(
          () => _notice = restored.isActive
              ? 'Your membership is up to date.'
              : 'Google Play has no active membership for this account.',
        );
      }
    } on SubscriptionFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) {
        setState(() => _error = 'Could not check with Google Play just now.');
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  /// Play's own subscription centre, deep-linked to this product where we know
  /// which one it is.
  Future<void> _openPlay(Entitlement entitlement) async {
    final info = await PackageInfo.fromPlatform();
    final uri = Uri.https('play.google.com', '/store/account/subscriptions', {
      if (entitlement.productId.isNotEmpty) 'sku': entitlement.productId,
      'package': info.packageName,
    });
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        setState(() => _error = 'Could not open Google Play on this device.');
      }
    }
  }
}

/// The page the carousel is showing, fractional mid-swipe.
double _pageValue(PageController controller, int fallback) {
  // Exactly one client, not merely some: a controller is briefly shared while
  // a rebuilt carousel hands over, and `position` throws if asked then.
  if (controller.positions.length != 1 ||
      !controller.position.hasContentDimensions) {
    return fallback.toDouble();
  }
  return controller.page ?? fallback.toDouble();
}

/// The member's own subscription, when there is one to describe.
class _MemberStatus extends StatelessWidget {
  const _MemberStatus({required this.entitlement, required this.onManage});

  final Entitlement entitlement;
  final VoidCallback? onManage;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final product = productForId(entitlement.productId);
    final mark = entitlement.benefits.supporterMark;
    final expiry = entitlement.expiresAt;
    final dates = DateFormat.yMMMMd();
    final attention = entitlement.needsAttention;

    final line = switch (entitlement.status) {
      EntitlementStatus.active when expiry != null =>
        entitlement.autoRenewing
            ? 'Renews on ${dates.format(expiry)}'
            : 'Runs until ${dates.format(expiry)}',
      EntitlementStatus.canceled when expiry != null =>
        'Cancelled. Everything keeps working until ${dates.format(expiry)}.',
      _ => entitlement.status.description,
    };

    return GlassSurface(
      blur: false,
      lifted: false,
      radius: 20,
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
      accent: attention ? brand.danger : brand.accent,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: (attention ? brand.danger : brand.accent).withValues(
                alpha: 0.12,
              ),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: mark == SupporterMark.none
                  ? Icon(
                      attention
                          ? Icons.error_outline_rounded
                          : Icons.card_membership_rounded,
                      size: 20,
                      color: attention ? brand.danger : brand.accent,
                    )
                  : SupporterBadge(mark: mark, size: 20, explainOnTap: false),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product?.name ?? 'Your membership',
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    line,
                    if (entitlement.plan case final plan?)
                      '${plan.billingPeriod.cadence[0].toUpperCase()}'
                          '${plan.billingPeriod.cadence.substring(1)}',
                  ].join('\n'),
                  style: TextStyle(
                    color: attention ? brand.danger : brand.mutedInk,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
                if (entitlement.testPurchase) ...[
                  const SizedBox(height: 4),
                  // Said out loud rather than hidden. A licence tester who
                  // thinks they have paid is a licence tester who will report
                  // the wrong bug.
                  Text(
                    'Google Play test purchase — nothing has been charged.',
                    style: TextStyle(
                      color: brand.gold,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          TextButton(
            onPressed: onManage,
            style: TextButton.styleFrom(foregroundColor: brand.accent),
            child: const Text('Manage'),
          ),
        ],
      ),
    );
  }
}

/// Plus · Patron · Creator, with an underline that follows the carousel —
/// mid-swipe as well as after it.
class _TierTabs extends StatelessWidget {
  const _TierTabs({
    required this.products,
    required this.controller,
    required this.page,
    required this.onTap,
    super.key,
  });

  final List<SubscriptionProduct> products;
  final PageController controller;
  final int page;
  final ValueChanged<int> onTap;

  static String _shortName(SubscriptionProduct product) =>
      product.name.replaceFirst('Indigen ', '');

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final tabWidth = constraints.maxWidth / products.length;
          final indicatorWidth = tabWidth * 0.56;
          return AnimatedBuilder(
            animation: controller,
            builder: (context, _) {
              final value = _pageValue(controller, page);
              return SizedBox(
                height: 48,
                child: Stack(
                  children: [
                    Row(
                      children: [
                        for (var i = 0; i < products.length; i++)
                          Expanded(
                            child: Semantics(
                              button: true,
                              selected: i == page,
                              child: InkWell(
                                onTap: () => onTap(i),
                                borderRadius: BorderRadius.circular(12),
                                child: Center(
                                  child: Text(
                                    _shortName(products[i]),
                                    style: TextStyle(
                                      color: Color.lerp(
                                        brand.ink,
                                        brand.mutedInk,
                                        (value - i).abs().clamp(0.0, 1.0),
                                      ),
                                      fontSize: 16.5,
                                      fontWeight: (value - i).abs() < 0.5
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    Positioned(
                      left: value * tabWidth + (tabWidth - indicatorWidth) / 2,
                      bottom: 0,
                      child: Container(
                        width: indicatorWidth,
                        height: 3.5,
                        decoration: BoxDecoration(
                          color: brand.accent,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}

/// The tiers as cards to swipe between.
///
/// ── Why the cards are laid out twice ──────────────────────────────────────
/// A [PageView] has to be given its height, and no single number is right:
/// Creator has a line the other tiers do not, and every line can wrap at a
/// larger text size. A fixed guess clips a benefit off the bottom of a card;
/// the tallest card's height leaves Plus sitting on a slab of empty glass. So
/// every card is also laid out — never painted, never touchable — at the
/// width of a page, and the carousel is exactly as tall as the card on screen,
/// blending between two while a swipe is between them.
class _TierCarousel extends StatelessWidget {
  const _TierCarousel({
    required this.products,
    required this.controller,
    required this.page,
    required this.entitlement,
    required this.onPageChanged,
    super.key,
  });

  final List<SubscriptionProduct> products;
  final PageController controller;
  final int page;
  final Entitlement entitlement;
  final ValueChanged<int> onPageChanged;

  static const _gutter = 7.0;

  Widget _card(SubscriptionProduct product) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: _gutter),
    child: _TierCard(
      product: product,
      current: entitlement.isActive && entitlement.tier == product.tier,
    ),
  );

  @override
  Widget build(BuildContext context) => _PageHeight(
    controller: controller,
    page: page,
    children: [
      for (final product in products) _card(product),
      PageView.builder(
        controller: controller,
        itemCount: products.length,
        onPageChanged: onPageChanged,
        itemBuilder: (context, index) => AnimatedBuilder(
          animation: controller,
          builder: (context, child) {
            final distance = (_pageValue(controller, page) - index).abs().clamp(
              0.0,
              1.0,
            );
            return Transform.scale(
              scale: 1 - 0.05 * distance,
              child: Opacity(opacity: 1 - 0.45 * distance, child: child),
            );
          },
          // Top-aligned at its own height: mid-swipe the carousel is between
          // two cards' heights, and the taller one is briefly cropped rather
          // than squeezed.
          child: OverflowBox(
            alignment: Alignment.topCenter,
            minHeight: 0,
            maxHeight: double.infinity,
            child: _card(products[index]),
          ),
        ),
      ),
    ],
  );
}

/// Sizes the last child — the pager — to the height of the page on screen,
/// measured from the children before it, one per page.
///
/// The measuring children are laid out at a page's width and nothing else:
/// they are not painted, not hit-tested and not in the semantics tree.
class _PageHeight extends MultiChildRenderObjectWidget {
  const _PageHeight({
    required this.controller,
    required this.page,
    required super.children,
  });

  final PageController controller;

  /// The settled page, for before the pager has a position to ask.
  final int page;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderPageHeight(controller, page);

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderPageHeight renderObject,
  ) {
    renderObject
      ..controller = controller
      ..page = page;
  }
}

class _PageHeightParentData extends ContainerBoxParentData<RenderBox> {}

class _RenderPageHeight extends RenderBox
    with
        ContainerRenderObjectMixin<RenderBox, _PageHeightParentData>,
        RenderBoxContainerDefaultsMixin<RenderBox, _PageHeightParentData> {
  _RenderPageHeight(this._controller, this._page);

  PageController _controller;
  set controller(PageController value) {
    if (identical(value, _controller)) return;
    if (attached) {
      _controller.removeListener(_scrolled);
      value.addListener(_scrolled);
    }
    _controller = value;
    markNeedsLayout();
  }

  int _page;
  set page(int value) {
    if (value == _page) return;
    _page = value;
    markNeedsLayout();
  }

  void _scrolled() {
    // Scrolls arrive from gestures and tickers, both before layout. One that
    // lands while this frame is already laying out waits for the next.
    final scheduler = SchedulerBinding.instance;
    if (scheduler.schedulerPhase == SchedulerPhase.persistentCallbacks) {
      scheduler.addPostFrameCallback((_) {
        if (attached) markNeedsLayout();
      });
    } else {
      markNeedsLayout();
    }
  }

  @override
  void attach(PipelineOwner owner) {
    super.attach(owner);
    _controller.addListener(_scrolled);
  }

  @override
  void detach() {
    _controller.removeListener(_scrolled);
    super.detach();
  }

  @override
  void setupParentData(RenderBox child) {
    if (child.parentData is! _PageHeightParentData) {
      child.parentData = _PageHeightParentData();
    }
  }

  @override
  void performLayout() {
    final pager = lastChild;
    if (pager == null) {
      size = constraints.smallest;
      return;
    }
    final width = constraints.maxWidth;
    final heights = <double>[];
    var child = firstChild;
    while (child != null && child != pager) {
      child.layout(
        BoxConstraints.tightFor(width: width * _controller.viewportFraction),
        parentUsesSize: true,
      );
      heights.add(child.size.height);
      child = childAfter(child);
    }

    var height = 0.0;
    if (heights.isNotEmpty) {
      final value = _pageValue(
        _controller,
        _page,
      ).clamp(0.0, heights.length - 1.0);
      final lower = value.floor();
      height = lerpDouble(
        heights[lower],
        heights[value.ceil()],
        value - lower,
      )!;
    }
    pager.layout(BoxConstraints.tightFor(width: width, height: height));
    size = constraints.constrain(Size(width, height));
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    if (lastChild case final pager?) context.paintChild(pager, offset);
  }

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      lastChild?.hitTest(result, position: position) ?? false;

  @override
  void visitChildrenForSemantics(RenderObjectVisitor visitor) {
    if (lastChild case final pager?) visitor(pager);
  }
}

class _TierCard extends StatelessWidget {
  const _TierCard({required this.product, required this.current});

  final SubscriptionProduct product;
  final bool current;

  static IconData _glyph(BenefitKind kind, SubscriptionTier tier) =>
      switch (kind) {
        BenefitKind.adFree => Icons.block_rounded,
        BenefitKind.kawuri => Icons.mark_chat_unread_outlined,
        BenefitKind.offline => Icons.download_rounded,
        BenefitKind.supporterMark => SupporterBadge.glyph(
          (tierBenefits[tier] ?? TierBenefits.free).supporterMark,
        ),
        BenefitKind.creatorTools => Icons.movie_filter_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      blur: false,
      radius: 24,
      lifted: false,
      accent: current ? brand.accent : null,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  product.name,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    height: 1.2,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
              if (current)
                Container(
                  margin: const EdgeInsets.only(left: 8, top: 4),
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
          const SizedBox(height: 8),
          Text(
            product.tagline,
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 14.5,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 14),
          for (final (kind, line) in benefitRowsFor(product.tier))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  Icon(
                    _glyph(kind, product.tier),
                    size: 24,
                    color: brand.accent,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      line,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 14,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The period, the price and the button, for the tier on screen.
class _Checkout extends StatelessWidget {
  const _Checkout({
    required this.product,
    required this.offers,
    required this.period,
    required this.entitlement,
    required this.busy,
    required this.error,
    required this.notice,
    required this.onPeriod,
    required this.onBuy,
  });

  final SubscriptionProduct product;

  /// Play's offers for [product] alone.
  final List<SubscriptionOffer> offers;
  final BillingPeriod period;
  final Entitlement entitlement;
  final bool busy;
  final String? error;
  final String? notice;
  final ValueChanged<BillingPeriod> onPeriod;
  final ValueChanged<SubscriptionOffer> onBuy;

  @override
  Widget build(BuildContext context) {
    final periods = [
      for (final value in BillingPeriod.values)
        if (listedOffer(offers, value) != null) value,
    ];
    if (periods.isEmpty) {
      return Column(
        children: [
          _Message(
            text:
                'Google Play is not offering ${product.name} here yet. The '
                'other plans are a swipe away.',
            isError: false,
          ),
          if (error ?? notice case final message?) ...[
            const SizedBox(height: 12),
            _Message(text: message, isError: error != null),
          ],
        ],
      );
    }

    // A period this tier does not sell falls back to one it does, rather than
    // leaving nothing selected and a button with nothing to buy.
    final chosen = periods.contains(period) ? period : periods.first;
    final toBuy = purchaseOffer(offers, chosen)!;
    final saved = yearlySavingsPercent(offers);

    final isCurrentTier =
        entitlement.isActive && entitlement.tier == product.tier;
    final isCurrentPlan =
        isCurrentTier && entitlement.plan?.billingPeriod == chosen;

    final label = switch (null) {
      _ when isCurrentPlan => 'Your current plan',
      _ when isCurrentTier => 'Switch to ${chosen.label.toLowerCase()}',
      _ when entitlement.isActive =>
        product.tier.rank > entitlement.tier.rank
            ? 'Upgrade to ${_TierTabs._shortName(product)}'
            : 'Switch to ${_TierTabs._shortName(product)}',
      _ when toBuy.hasTrial => 'Start ${toBuy.freeTrialDays}-day free trial',
      _ => 'Subscribe & pay',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _PeriodPicker(
          offers: offers,
          periods: periods,
          selected: chosen,
          saved: saved,
          onChanged: onPeriod,
        ),
        if (error ?? notice case final message?) ...[
          const SizedBox(height: 12),
          _Message(text: message, isError: error != null),
        ],
        const SizedBox(height: 18),
        _PayButton(
          label: label,
          busy: busy,
          onPressed: busy || isCurrentPlan ? null : () => onBuy(toBuy),
        ),
      ],
    );
  }
}

/// Monthly beside yearly, as one control with the chosen half lit.
class _PeriodPicker extends StatelessWidget {
  const _PeriodPicker({
    required this.offers,
    required this.periods,
    required this.selected,
    required this.saved,
    required this.onChanged,
  });

  final List<SubscriptionOffer> offers;
  final List<BillingPeriod> periods;
  final BillingPeriod selected;
  final int? saved;
  final ValueChanged<BillingPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      decoration: BoxDecoration(
        color: brand.surface.withValues(alpha: brand.isDark ? 0.6 : 0.9),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: brand.border),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final period in periods)
              Expanded(
                child: _PeriodOption(
                  period: period,
                  listed: listedOffer(offers, period)!,
                  trial: purchaseOffer(offers, period),
                  saved: period == BillingPeriod.yearly ? saved : null,
                  selected: period == selected,
                  onTap: () => onChanged(period),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PeriodOption extends StatelessWidget {
  const _PeriodOption({
    required this.period,
    required this.listed,
    required this.trial,
    required this.saved,
    required this.selected,
    required this.onTap,
  });

  final BillingPeriod period;

  /// The base plan, whose price is the everyday one.
  final SubscriptionOffer listed;

  /// The offer that would actually be bought — a trial, when there is one.
  final SubscriptionOffer? trial;
  final int? saved;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final unit = period == BillingPeriod.monthly ? 'month' : 'year';
    final monthly = perMonthPrice(listed);
    final extra = switch (trial) {
      final offer? when offer.hasTrial => '${offer.freeTrialDays} days free',
      SubscriptionOffer(introductoryPrice: final intro?) => '$intro to start',
      _ => null,
    };

    return Semantics(
      button: true,
      selected: selected,
      label:
          '${period.label}, ${listed.price} a $unit'
          '${saved != null ? ', save $saved percent' : ''}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          decoration: BoxDecoration(
            color: selected
                ? brand.accent.withValues(alpha: brand.isDark ? 0.12 : 0.07)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(19),
            border: Border.all(
              color: selected ? brand.accent : Colors.transparent,
              width: 1.6,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // The label and the saving share a line while both fit, and the
              // saving drops beneath the label at a larger text size rather
              // than printing over it.
              SizedBox(
                width: double.infinity,
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    Text(
                      period.label,
                      style: TextStyle(color: brand.mutedInk, fontSize: 14),
                    ),
                    if (saved != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 9,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: brand.accent.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          'SAVE $saved%',
                          style: TextStyle(
                            color: brand.accent,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Text.rich(
                TextSpan(
                  children: [
                    // Play's own formatted string, never anything
                    // composed here.
                    TextSpan(
                      text: listed.price,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    TextSpan(
                      text: ' / $unit',
                      style: TextStyle(color: brand.mutedInk, fontSize: 13.5),
                    ),
                  ],
                ),
              ),
              if (monthly != null) ...[
                const SizedBox(height: 3),
                Text(
                  '$monthly / month',
                  style: TextStyle(color: brand.mutedInk, fontSize: 13.5),
                ),
              ],
              if (extra != null) ...[
                const SizedBox(height: 4),
                Text(
                  extra,
                  style: TextStyle(
                    color: brand.success,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PayButton extends StatelessWidget {
  const _PayButton({
    required this.label,
    required this.busy,
    required this.onPressed,
  });

  final String label;
  final bool busy;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // Lit green on charcoal, where the palette's deeper fill would sink; the
    // terracotta every other primary button uses by day.
    final fill = brand.pick(brand.accentFill, brand.accent);
    final ink = brand.pick(brand.onAccentFill, brand.background);
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        // A floor rather than a height, so a long label at a large text size
        // grows the button instead of being cut in half by it.
        minimumSize: const Size.fromHeight(54),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        backgroundColor: fill,
        foregroundColor: ink,
        disabledBackgroundColor: fill.withValues(alpha: busy ? 0.7 : 0.28),
        disabledForegroundColor: busy ? ink : brand.ink.withValues(alpha: 0.6),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
      ),
      child: busy
          ? SizedBox.square(
              dimension: 22,
              child: CircularProgressIndicator(strokeWidth: 2.4, color: ink),
            )
          : Text(label, textAlign: TextAlign.center),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, required this.isError});

  final String text;
  final bool isError;

  @override
  Widget build(BuildContext context) => Text(
    text,
    textAlign: TextAlign.center,
    style: TextStyle(
      color: isError ? context.brand.danger : context.brand.mutedInk,
      fontSize: 13.5,
      height: 1.4,
    ),
  );
}

/// The shape of the checkout, while Play is being asked for prices.
class _PlansLoading extends StatelessWidget {
  const _PlansLoading();

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    Widget bar(double width, double height) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: brand.ink.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(6),
      ),
    );
    return Semantics(
      label: 'Loading the plans from Google Play',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 104,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: brand.surface.withValues(alpha: brand.isDark ? 0.6 : 0.9),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: brand.border),
            ),
            child: Row(
              children: [
                for (var i = 0; i < 2; i++)
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        bar(64, 12),
                        const SizedBox(height: 12),
                        bar(120, 18),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const _PayButton(
            label: 'Loading plans…',
            busy: false,
            onPressed: null,
          ),
        ],
      ),
    );
  }
}

class _SmallPrint extends StatelessWidget {
  const _SmallPrint();

  @override
  Widget build(BuildContext context) => Text(
    'Subscription renews automatically until cancelled.\n'
    'Manage or cancel through Google Play.\n'
    'The archive itself stays free for everyone.',
    textAlign: TextAlign.center,
    style: TextStyle(
      color: context.brand.faintInk,
      fontSize: 12.5,
      height: 1.5,
    ),
  );
}

/// Where the checkout would be, when there are no plans — and, behind one tap,
/// why.
///
/// ── Why the detail is a tap away rather than on the screen ────────────────
/// Because the two audiences want opposite things. Somebody who just wanted to
/// subscribe needs one plain sentence and a way out. Whoever is configuring
/// Play Console needs base plan ids. Putting the second on screen makes the
/// first worse; hiding it entirely makes the second impossible, which is how
/// an afternoon disappears into guessing.
///
/// The tier cards above stay up either way. What each membership includes is
/// true whether or not this phone can buy one, and it is what somebody came to
/// the tab to read.
class _PlansUnavailable extends StatelessWidget {
  const _PlansUnavailable({this.message, this.offerings, this.onRetry});

  final String? message;
  final SubscriptionOfferings? offerings;

  /// Asks Play again. Worth offering for every reason but not-Android: a
  /// backend that is down comes back, and so does a billing connection that
  /// had not finished the first time somebody looked.
  final VoidCallback? onRetry;

  /// One sentence, for somebody who only wanted to subscribe.
  String get _title => switch (offerings?.reason) {
    SubscriptionUnavailableReason.notAndroid =>
      'Memberships can be bought in the Android app.',
    SubscriptionUnavailableReason.backendUnavailable =>
      'Could not reach Indigen World. Check your connection and try again.',
    SubscriptionUnavailableReason.billingUnavailable =>
      'Google Play is not available on this device, so nothing can be bought '
          'here.',
    _ when message != null =>
      'Google Play could not list the prices right now.',
    _ => 'Memberships are not available on this device yet.',
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
            'verified even if Play accepted it. The checkout stays shut rather '
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
    final brand = context.brand;
    final detail = _detail;
    return GlassSurface(
      blur: false,
      lifted: false,
      radius: 20,
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
      child: Column(
        children: [
          Row(
            children: [
              Icon(Icons.storefront_outlined, color: brand.mutedInk, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _title,
                  style: TextStyle(color: brand.ink, fontSize: 14, height: 1.4),
                ),
              ),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (detail.isNotEmpty)
                TextButton(
                  onPressed: () => showGlassPopup<void>(
                    context: context,
                    title: 'Why the prices are missing',
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
              if (onRetry != null)
                TextButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ],
      ),
    );
  }
}
