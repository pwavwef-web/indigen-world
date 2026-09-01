import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_android/billing_client_wrappers.dart';
import 'package:in_app_purchase_android/in_app_purchase_android.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';

/// One buyable thing: a product, one of its base plans, and Play's own price.
///
/// A Play subscription product carries several base plans and each base plan
/// may carry several offers, and `queryProductDetails` flattens all of that
/// into one `ProductDetails` per offer — every one of them sharing the same
/// `id`. So the id alone cannot identify what somebody tapped, and this pairs
/// each `ProductDetails` back with the base plan it actually belongs to.
@immutable
class SubscriptionOffer {
  const SubscriptionOffer({
    required this.product,
    required this.plan,
    required this.details,
    required this.offerToken,
    this.offerId,
    this.introductoryPrice,
    this.freeTrialDays = 0,
  });

  final SubscriptionProduct product;
  final SubscriptionPlan plan;

  /// Play's own record, including the formatted price to show on screen.
  final ProductDetails details;

  /// What `launchBillingFlow` needs to buy this exact offer.
  final String offerToken;

  /// Set only for a discounted or trial offer on top of the base plan.
  final String? offerId;

  /// The formatted price of the first pricing phase when it differs from the
  /// recurring one — an introductory rate. Null on a plain base plan.
  final String? introductoryPrice;

  /// Days of free trial the offer opens with, or 0.
  final int freeTrialDays;

  /// What Play will charge on renewal, formatted in the member's currency.
  String get price => details.price;

  bool get hasTrial => freeTrialDays > 0;
}

/// Why a paywall has nothing to show.
///
/// ── Why this exists ───────────────────────────────────────────────────────
/// Because "no plans" has at least five unrelated causes and they are
/// indistinguishable from the outside: a build Play has never heard of, a
/// tester who is not on the track, products that have not propagated yet, base
/// plan ids that do not match the catalogue, and a device with no Play Store.
/// One friendly sentence covering all five is a sentence nobody can act on —
/// including whoever is trying to ship the thing.
enum SubscriptionUnavailableReason {
  /// There are offers. Nothing to explain.
  none,

  /// iOS, web, or a desktop build. Play Billing is Android only.
  notAndroid,

  /// Firebase is not up, so a purchase could not be settled even if it
  /// succeeded. The paywall refuses to open rather than take money it cannot
  /// honour.
  backendUnavailable,

  /// `BillingClient.isReady` came back false: no Play Store on the device, or
  /// a Play Services install too old to serve billing.
  billingUnavailable,

  /// Play answered and knew none of the product ids. Almost always one of:
  /// the running build's application id is not the one the products belong to
  /// (a `.dev` or `.staging` flavour), the account is not on a track that has
  /// the products, or they were created minutes ago and have not propagated.
  playReturnedNothing,

  /// Play returned the products, but not one of their base plans is named in
  /// the catalogue. A pure configuration mismatch, and the only one where the
  /// fix is a rename rather than a wait.
  basePlanMismatch,
}

/// What a paywall got back, and what to say when that is nothing.
@immutable
class SubscriptionOfferings {
  const SubscriptionOfferings({
    this.offers = const <SubscriptionOffer>[],
    this.reason = SubscriptionUnavailableReason.none,
    this.playProductIds = const <String>[],
    this.playBasePlanIds = const <String>[],
    this.queryError = '',
  });

  final List<SubscriptionOffer> offers;
  final SubscriptionUnavailableReason reason;

  /// The product ids Play actually recognised, whatever this build expected.
  final List<String> playProductIds;

  /// The base plan ids Play actually returned. The single most useful line in
  /// a mismatch: it can be compared against Play Console by eye.
  final List<String> playBasePlanIds;

  /// Play's own message when the query failed outright.
  final String queryError;

  bool get isEmpty => offers.isEmpty;
}

/// The result of asking somebody to buy something.
enum PurchaseOutcome {
  /// The sheet is open, or Play is processing. The purchase stream finishes it.
  started,

  /// Play is not available on this device or the products are not published.
  unavailable,

  /// The member closed the sheet.
  cancelled,
  failed,
}

/// Everything that talks to Google Play Billing.
///
/// ── What this class is careful not to do ──────────────────────────────────
/// It never grants anything. A purchase that arrives on the stream is handed to
/// [onPurchase], which takes the token to the backend; only what the backend
/// writes to `entitlements/{uid}` changes what a member can do. The local
/// `PurchaseDetails.status` is used for exactly one thing — knowing when to
/// call `completePurchase` — because a status a phone computed is not a fact
/// about money.
///
/// ── Why `completePurchase` is called on every delivered purchase ──────────
/// Because Play will refund and revoke an unacknowledged subscription after
/// three days. The server acknowledges through the Developer API as well; the
/// two are belt and braces on the one failure in this file that costs real
/// money.
class BillingService {
  BillingService(this._onPurchase, {InAppPurchase? plugin})
    : _plugin = plugin ?? InAppPurchase.instance;

  final InAppPurchase _plugin;

  /// Sends a purchase to the backend. Returns whether it settled, which is what
  /// decides if the purchase is completed locally.
  final Future<bool> Function(PurchaseDetails purchase) _onPurchase;

  StreamSubscription<List<PurchaseDetails>>? _subscription;

  /// Purchases that arrived while the app was elsewhere, and everything that
  /// arrives from here on. Broadcast so the paywall and the manage screen can
  /// both listen without stealing events from each other.
  final _events = StreamController<PurchaseDetails>.broadcast();

  Stream<PurchaseDetails> get purchases => _events.stream;

  bool _available = false;
  bool get isAvailable => _available;

  /// The live subscription purchases Play has told this device about, keyed by
  /// product id.
  ///
  /// Needed for one thing only, and it is not access: `ChangeSubscriptionParam`
  /// wants the *purchase object* being replaced, and nothing else in the app
  /// holds one. Without it Play sells a second, parallel subscription instead
  /// of moving the existing one — two charges for one member.
  ///
  /// Populated from the same stream everything else is, so it fills in on
  /// launch (Play redelivers owned purchases) and again after [restore].
  final _owned = <String, GooglePlayPurchaseDetails>{};

  /// The subscription to replace when moving to [productId], or null.
  ///
  /// Excludes [productId] itself: replacing a plan with a different base plan
  /// of the same product is a plan change, not a replacement, and Play handles
  /// that through the offer token alone.
  GooglePlayPurchaseDetails? purchaseToReplace(String productId) {
    for (final entry in _owned.entries) {
      if (entry.key != productId) return entry.value;
    }
    return null;
  }

  /// Starts listening. Must run before any purchase is attempted, and is safe
  /// to call more than once.
  ///
  /// The stream is subscribed to *first* and the availability check second: a
  /// purchase that completed while the app was closed is delivered on this
  /// stream the moment it is listened to, and a listener attached later would
  /// miss it — which is a member who has paid and been given nothing.
  Future<void> start() async {
    if (_subscription != null) return;
    _subscription = _plugin.purchaseStream.listen(
      _handle,
      onError: (Object error) => debugPrint('Billing stream error: $error'),
    );
    try {
      _available = await _plugin.isAvailable();
    } on Object catch (error) {
      debugPrint('Billing availability unknown: $error');
      _available = false;
    }
  }

  Future<void> dispose() async {
    _owned.clear();
    await _subscription?.cancel();
    _subscription = null;
    await _events.close();
  }

  Future<void> _handle(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      if (purchase.status == PurchaseStatus.pending) {
        _events.add(purchase);
        continue;
      }

      if (purchase.status == PurchaseStatus.purchased ||
          purchase.status == PurchaseStatus.restored) {
        // The backend decides whether this is worth anything. Only once it has
        // said so is the purchase completed — an early `completePurchase` on a
        // token the server never saw is a purchase nobody can recover.
        if (purchase is GooglePlayPurchaseDetails) {
          _owned[purchase.productID] = purchase;
        }
        final settled = await _onPurchase(purchase);
        if (settled && purchase.pendingCompletePurchase) {
          await _plugin.completePurchase(purchase);
        }
      } else if (purchase.status == PurchaseStatus.error &&
          purchase.pendingCompletePurchase) {
        // A failed purchase still has to be cleared out of Play's queue, or it
        // is redelivered on every launch forever.
        await _plugin.completePurchase(purchase);
      }

      _events.add(purchase);
    }
  }

  /// Everything on sale, in paywall order, and why there is nothing when there
  /// is nothing.
  ///
  /// Products Play does not know about are dropped rather than shown greyed
  /// out: a tier that has not been published yet is not a tier somebody should
  /// be looking at, and a "coming soon" row on a paywall is just a dead end.
  /// But every drop is *counted*, so an empty paywall can say which of the
  /// five reasons it is rather than shrugging.
  Future<SubscriptionOfferings> loadOffers() async {
    if (!_available) {
      return const SubscriptionOfferings(
        reason: SubscriptionUnavailableReason.billingUnavailable,
      );
    }

    final response = await _plugin.queryProductDetails(subscriptionProductIds);
    final queryError = response.error?.message ?? '';
    if (queryError.isNotEmpty) {
      debugPrint('Could not load products: $queryError');
    }

    // Everything Play actually said, kept whether or not it matched. This is
    // the evidence the diagnosis is built from.
    final playProductIds = <String>{};
    final playBasePlanIds = <String>{};

    final offers = <SubscriptionOffer>[];
    for (final details in response.productDetails) {
      playProductIds.add(details.id);
      final product = productForId(details.id);
      if (product == null) continue;

      final android = details is GooglePlayProductDetails ? details : null;
      final wrapper = android?.productDetails.subscriptionOfferDetails;
      final index = android?.subscriptionIndex;
      if (wrapper == null || index == null || index >= wrapper.length) {
        // Not Android, or a shape this build does not understand. Skipped
        // rather than guessed at — buying the wrong base plan is worse than
        // showing one fewer row.
        continue;
      }

      final offer = wrapper[index];
      playBasePlanIds.add(offer.basePlanId);
      final plan = product.planFor(offer.basePlanId);
      if (plan == null) {
        debugPrint(
          'Play offered base plan "${offer.basePlanId}" on ${details.id}, '
          'which is not in the catalogue.',
        );
        continue;
      }

      offers.add(
        SubscriptionOffer(
          product: product,
          plan: plan,
          details: details,
          offerToken: offer.offerIdToken,
          offerId: offer.offerId,
          introductoryPrice: _introductoryPrice(offer.pricingPhases),
          freeTrialDays: _freeTrialDays(offer.pricingPhases),
        ),
      );
    }

    offers.sort((a, b) {
      final byTier = a.product.tier.rank.compareTo(b.product.tier.rank);
      if (byTier != 0) return byTier;
      return a.plan.billingPeriod.index.compareTo(b.plan.billingPeriod.index);
    });

    return SubscriptionOfferings(
      offers: List.unmodifiable(offers),
      reason: switch ((offers.isNotEmpty, playProductIds.isEmpty)) {
        (true, _) => SubscriptionUnavailableReason.none,
        // Play knew nothing at all: wrong application id, wrong track, or the
        // products have not propagated yet.
        (false, true) => SubscriptionUnavailableReason.playReturnedNothing,
        // Play knew the products and this build knew none of their plans.
        (false, false) => SubscriptionUnavailableReason.basePlanMismatch,
      },
      playProductIds: List.unmodifiable(playProductIds.toList()..sort()),
      playBasePlanIds: List.unmodifiable(playBasePlanIds.toList()..sort()),
      queryError: queryError,
    );
  }

  /// Opens Play's purchase sheet.
  ///
  /// [obfuscatedAccountId] comes from `preparePlayPurchase` and is not optional
  /// in practice: it is what lets Play's own fraud, abuse and location-spoofing
  /// protections tie a purchase to an account, and it is the thread a renewal
  /// notification follows back to a member when the app never got to register
  /// the purchase itself.
  ///
  /// [current] is the purchase being replaced on an upgrade or downgrade.
  /// Without it Play would sell a second, parallel subscription rather than
  /// moving the existing one.
  Future<PurchaseOutcome> buy({
    required SubscriptionOffer offer,
    required String obfuscatedAccountId,
    GooglePlayPurchaseDetails? current,
  }) async {
    if (!_available) return PurchaseOutcome.unavailable;

    final param = GooglePlayPurchaseParam(
      productDetails: offer.details,
      applicationUserName: obfuscatedAccountId,
      offerToken: offer.offerToken,
      changeSubscriptionParam: current == null
          ? null
          : ChangeSubscriptionParam(
              oldPurchaseDetails: current,
              // Prorated and immediate: somebody moving up should get what
              // they paid for now, with the unused remainder credited, rather
              // than waiting out a month they have already left behind.
              replacementMode: ReplacementMode.withTimeProration,
            ),
    );

    try {
      final started = await _plugin.buyNonConsumable(purchaseParam: param);
      return started ? PurchaseOutcome.started : PurchaseOutcome.cancelled;
    } on Object catch (error) {
      debugPrint('Could not open the purchase sheet: $error');
      return PurchaseOutcome.failed;
    }
  }

  /// Asks Play to redeliver anything already owned.
  ///
  /// What "Restore purchases" runs. Everything it finds arrives on the same
  /// stream as a fresh purchase, so it settles through exactly the same path.
  Future<void> restore() async {
    if (!_available) return;
    try {
      await _plugin.restorePurchases();
    } on Object catch (error) {
      debugPrint('Restore failed: $error');
    }
  }

  /// The formatted price of an opening phase that differs from the recurring
  /// one, or null when every phase costs the same.
  static String? _introductoryPrice(List<PricingPhaseWrapper> phases) {
    if (phases.length < 2) return null;
    final first = phases.first;
    if (first.priceAmountMicros == 0) return null;
    if (first.priceAmountMicros == phases.last.priceAmountMicros) return null;
    return first.formattedPrice;
  }

  /// Days in a leading free phase. Play expresses the period as an ISO 8601
  /// duration — `P7D`, `P1W`, `P1M` — so all three shapes are read.
  static int _freeTrialDays(List<PricingPhaseWrapper> phases) {
    if (phases.isEmpty) return 0;
    final first = phases.first;
    if (first.priceAmountMicros != 0) return 0;
    return _daysInPeriod(first.billingPeriod);
  }

  static int _daysInPeriod(String period) {
    final match = RegExp(r'^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$')
        .firstMatch(period);
    if (match == null) return 0;
    final years = int.tryParse(match.group(1) ?? '') ?? 0;
    final months = int.tryParse(match.group(2) ?? '') ?? 0;
    final weeks = int.tryParse(match.group(3) ?? '') ?? 0;
    final days = int.tryParse(match.group(4) ?? '') ?? 0;
    return years * 365 + months * 30 + weeks * 7 + days;
  }
}
