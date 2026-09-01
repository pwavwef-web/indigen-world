import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/billing_service.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_repository.dart';

/// Null until Firebase is up, matching every other repository in the app.
final subscriptionRepositoryProvider = Provider<SubscriptionRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return SubscriptionRepository(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

/// What this member has paid for.
///
/// `Entitlement.none` for guests, for an un-bootstrapped Firebase and for
/// every widget test — which is exactly right in all three cases: nothing here
/// gates *access* to the archive, only extras somebody bought.
final entitlementProvider = StreamProvider<Entitlement>((ref) {
  final repository = ref.watch(subscriptionRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream.value(Entitlement.none);
  }
  return repository.watch(uid);
});

/// What the backend says this member's benefits are, or null.
///
/// Re-asked whenever the entitlement changes, because the entitlement is what
/// decides them. Null while it is loading, on a build with no Firebase, and on
/// any failure — [tierBenefitsProvider] falls back to the shipped table in all
/// three cases.
final serverBenefitsProvider = FutureProvider<TierBenefits?>((ref) async {
  final repository = ref.watch(subscriptionRepositoryProvider);
  if (repository == null) return null;
  ref.watch(entitlementProvider);
  return repository.benefitsInForce();
});

/// The benefits in force right now. The one provider features should watch.
///
/// The backend's answer when there is one, and the table this build shipped
/// with otherwise. That order is what lets a benefit be changed in a functions
/// deploy instead of an app rollout — and the fallback is what keeps a
/// subscriber's benefits working on a phone that is offline, where the
/// entitlement still arrives from the Firestore cache.
///
/// Note what this is *not*: it is not a permission check. Every paid capability
/// is also enforced server-side — Kawuri's daily allowance in `kawuri.ts`, the
/// entitlement document itself unwritable by any client. This exists so screens
/// draw the right thing, and a patched build that lies to it gains nothing but
/// a screen that disagrees with the server.
final tierBenefitsProvider = Provider<TierBenefits>((ref) {
  final server = ref.watch(serverBenefitsProvider).asData?.value;
  if (server != null) return server;
  final entitlement = ref.watch(entitlementProvider).asData?.value;
  return (entitlement ?? Entitlement.none).benefits;
});

/// Whether adverts should be served to this member at all.
final adsAllowedProvider = Provider<bool>(
  (ref) => !ref.watch(tierBenefitsProvider).adFree,
);

/// The mark beside this member's name, or none.
final supporterMarkProvider = Provider<SupporterMark>(
  (ref) => ref.watch(tierBenefitsProvider).supporterMark,
);

/// The live billing connection.
///
/// ── Why this is created once and kept ─────────────────────────────────────
/// Play delivers purchases that completed while the app was closed on the
/// purchase stream, the moment something listens. A service built per screen
/// would miss them on every launch where the member did not happen to open the
/// paywall — which is precisely the launch after a purchase that was
/// interrupted. So it is started at the root and outlives every screen.
///
/// Null on a build with no Firebase: settling a purchase needs a callable, and
/// opening a purchase sheet that cannot be settled would take somebody's money
/// for nothing.
final billingServiceProvider = Provider<BillingService?>((ref) {
  final repository = ref.watch(subscriptionRepositoryProvider);
  if (repository == null) return null;
  if (defaultTargetPlatform != TargetPlatform.android) return null;

  final service = BillingService((purchase) async {
    try {
      await repository.register(purchase);
      return true;
    } on Object catch (error) {
      // Not settled, so the purchase is deliberately *not* completed. Play
      // redelivers it on the next launch and the next start(), which is the
      // recovery path for a member whose network died mid-purchase.
      debugPrint('Could not settle a purchase yet: $error');
      return false;
    }
  });
  unawaited(service.start());
  ref.onDispose(service.dispose);
  return service;
});

/// Everything on sale, with Play's own prices — and why there is nothing when
/// there is nothing.
///
/// The two null cases are kept apart because they are different problems: a
/// non-Android build will never have Play Billing, while a build whose backend
/// is down could have it in a moment. Neither is "Play has no products".
final subscriptionOffersProvider = FutureProvider<SubscriptionOfferings>((
  ref,
) async {
  if (defaultTargetPlatform != TargetPlatform.android) {
    return const SubscriptionOfferings(
      reason: SubscriptionUnavailableReason.notAndroid,
    );
  }
  final service = ref.watch(billingServiceProvider);
  if (service == null) {
    return const SubscriptionOfferings(
      reason: SubscriptionUnavailableReason.backendUnavailable,
    );
  }
  await service.start();
  return service.loadOffers();
});

/// Purchases as they arrive, so an open paywall can react to one.
final purchaseEventsProvider = StreamProvider<PurchaseDetails>((ref) {
  final service = ref.watch(billingServiceProvider);
  if (service == null) return const Stream<PurchaseDetails>.empty();
  return service.purchases;
});
