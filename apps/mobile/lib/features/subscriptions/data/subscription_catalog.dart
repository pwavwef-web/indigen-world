import 'package:flutter/foundation.dart';

/// What can be subscribed to, and what each tier is worth.
///
/// ── This file is a mirror ─────────────────────────────────────────────────
/// The authority is `services/functions/src/subscription-catalog.ts`. The two
/// carry the same product ids, the same base plan ids and the same benefit
/// numbers, and they have to be changed together — a phone that believes it has
/// unlimited downloads while the backend believes otherwise is a support
/// conversation nobody can win. `test/features/subscriptions/subscriptions_test.dart`
/// pins the values on this side; `firebase/tests/playBilling.test.mjs` pins
/// them on the other.
///
/// The app never *enforces* from this file. Every paid capability is also
/// checked server-side, because a number in a Dart file is a number somebody
/// can patch. What this is for is drawing the right screen.
///
/// ── There are no prices here ──────────────────────────────────────────────
/// On purpose, and it is not an omission to be fixed. Play knows the price, in
/// the member's own currency, after regional pricing and tax; the paywall reads
/// `ProductDetails.price` and shows exactly what Play will charge. A price
/// written down here would be wrong for somebody the first day the app is
/// opened outside Ghana.

/// The tiers, weakest first.
enum SubscriptionTier {
  none,
  plus,
  patron,
  creator;

  /// The wire value shared with the backend.
  static SubscriptionTier fromName(Object? raw) => switch (raw) {
    'plus' => SubscriptionTier.plus,
    'patron' => SubscriptionTier.patron,
    'creator' => SubscriptionTier.creator,
    _ => SubscriptionTier.none,
  };

  int get rank => switch (this) {
    SubscriptionTier.none => 0,
    SubscriptionTier.plus => 1,
    SubscriptionTier.patron => 2,
    SubscriptionTier.creator => 3,
  };
}

/// The mark a subscriber's name carries.
///
/// Its own axis, deliberately separate from `verifiedKind`. A verification mark
/// says something was *checked* — a phone number, a body of published work,
/// standing as a custodian of Kasem. A supporter mark says something was
/// *paid*. Folding the second into the first would quietly put a price on the
/// first, which is the one thing this project cannot sell.
enum SupporterMark {
  none,
  supporter,
  patron,
  studio;

  static SupporterMark fromName(Object? raw) => switch (raw) {
    'supporter' => SupporterMark.supporter,
    'patron' => SupporterMark.patron,
    'studio' => SupporterMark.studio,
    _ => SupporterMark.none,
  };

  String get wire => switch (this) {
    SupporterMark.supporter => 'supporter',
    SupporterMark.patron => 'patron',
    SupporterMark.studio => 'studio',
    SupporterMark.none => '',
  };

  /// Three words or fewer, the way [VerifiedBadge.label] is.
  String get label => switch (this) {
    SupporterMark.supporter => 'Supporter',
    SupporterMark.patron => 'Patron',
    SupporterMark.studio => 'Studio member',
    SupporterMark.none => '',
  };

  /// What it means, said plainly — including what it does not mean.
  String get meaning => switch (this) {
    SupporterMark.supporter =>
      'Subscribes to Indigen Plus, which pays for the servers, the recordings '
          'and the review work behind this archive. It is a thank-you, not a '
          'verification, and it says nothing about the language.',
    SupporterMark.patron =>
      'Subscribes at the Patron level and carries more of the cost of this '
          'work than most. Support, not standing: it grants no authority over '
          'anybody here and no say over what is published.',
    SupporterMark.studio =>
      'Subscribes to Indigen Creator for the TribeStudio tools. It marks '
          'somebody who pays for the making, not somebody whose work has been '
          'reviewed — the creator mark is the one that says that.',
    SupporterMark.none => '',
  };
}

/// One Play base plan inside a product.
@immutable
class SubscriptionPlan {
  const SubscriptionPlan({
    required this.basePlanId,
    required this.billingPeriod,
  });

  /// Must match Play Console character for character.
  final String basePlanId;

  final BillingPeriod billingPeriod;
}

enum BillingPeriod {
  monthly,
  yearly;

  String get label => this == BillingPeriod.monthly ? 'Monthly' : 'Yearly';

  /// The line under the price. Yearly plans are the ones worth explaining.
  String get cadence => this == BillingPeriod.monthly
      ? 'billed every month'
      : 'billed once a year';
}

/// One Play subscription product.
@immutable
class SubscriptionProduct {
  const SubscriptionProduct({
    required this.tier,
    required this.productId,
    required this.name,
    required this.tagline,
    required this.plans,
  });

  final SubscriptionTier tier;

  /// The Play subscription id.
  final String productId;

  final String name;

  /// One line, shown under the name on the paywall.
  final String tagline;

  final List<SubscriptionPlan> plans;

  SubscriptionPlan? planFor(String basePlanId) {
    for (final plan in plans) {
      if (plan.basePlanId == basePlanId) return plan;
    }
    return null;
  }
}

const subscriptionProducts = <SubscriptionProduct>[
  SubscriptionProduct(
    tier: SubscriptionTier.plus,
    productId: 'indigen_plus',
    name: 'Indigen Plus',
    tagline: 'No adverts, offline listening and a much bigger Kawuri.',
    plans: [
      SubscriptionPlan(
        basePlanId: 'plus-monthly',
        billingPeriod: BillingPeriod.monthly,
      ),
      SubscriptionPlan(
        basePlanId: 'plus-yearly',
        billingPeriod: BillingPeriod.yearly,
      ),
    ],
  ),
  SubscriptionProduct(
    tier: SubscriptionTier.patron,
    productId: 'indigen_patron',
    name: 'Indigen Patron',
    tagline:
        'Everything in Plus, and a larger share of what this costs to run.',
    plans: [
      SubscriptionPlan(
        basePlanId: 'patron-monthly',
        billingPeriod: BillingPeriod.monthly,
      ),
      SubscriptionPlan(
        basePlanId: 'patron-yearly',
        billingPeriod: BillingPeriod.yearly,
      ),
    ],
  ),
  SubscriptionProduct(
    tier: SubscriptionTier.creator,
    productId: 'indigen_creator',
    name: 'Indigen Creator',
    tagline: 'For people making the work: raised TribeStudio quotas and tools.',
    plans: [
      SubscriptionPlan(
        basePlanId: 'creator-monthly',
        billingPeriod: BillingPeriod.monthly,
      ),
      SubscriptionPlan(
        basePlanId: 'creator-yearly',
        billingPeriod: BillingPeriod.yearly,
      ),
    ],
  ),
];

/// Every Play product id, in paywall order.
final subscriptionProductIds = <String>{
  for (final product in subscriptionProducts) product.productId,
};

SubscriptionProduct? productForId(String productId) {
  for (final product in subscriptionProducts) {
    if (product.productId == productId) return product;
  }
  return null;
}

SubscriptionProduct? productForTier(SubscriptionTier tier) {
  for (final product in subscriptionProducts) {
    if (product.tier == tier) return product;
  }
  return null;
}

SubscriptionTier tierForProductId(String productId) =>
    productForId(productId)?.tier ?? SubscriptionTier.none;

/// What a tier is actually worth. Mirrors `TIER_BENEFITS` on the backend.
@immutable
class TierBenefits {
  const TierBenefits({
    required this.adFree,
    required this.kawuriDailyMessages,
    required this.offlineDownloadLimit,
    required this.supporterMark,
    required this.creatorTools,
  });

  final bool adFree;
  final int kawuriDailyMessages;

  /// How many collection tracks may be kept on the device at once. 0 disables.
  final int offlineDownloadLimit;

  final SupporterMark supporterMark;

  /// Raised TribeStudio quotas. Read by the Studio, not by this app.
  final bool creatorTools;

  /// The benefits the backend reported, falling back to [free] on anything
  /// unrecognised — a build that has not been updated must never invent a
  /// capability it does not have.
  factory TierBenefits.fromMap(Map<Object?, Object?>? raw) {
    if (raw == null) return free;
    return TierBenefits(
      adFree: raw['adFree'] == true,
      kawuriDailyMessages:
          (raw['kawuriDailyMessages'] as num?)?.toInt() ??
          free.kawuriDailyMessages,
      offlineDownloadLimit: (raw['offlineDownloadLimit'] as num?)?.toInt() ?? 0,
      supporterMark: SupporterMark.fromName(raw['supporterMark']),
      creatorTools: raw['creatorTools'] == true,
    );
  }

  static const free = TierBenefits(
    adFree: false,
    kawuriDailyMessages: 20,
    offlineDownloadLimit: 0,
    supporterMark: SupporterMark.none,
    creatorTools: false,
  );
}

/// The shipped table. Kept in step with `TIER_BENEFITS` on the backend.
const tierBenefits = <SubscriptionTier, TierBenefits>{
  SubscriptionTier.none: TierBenefits.free,
  SubscriptionTier.plus: TierBenefits(
    adFree: true,
    kawuriDailyMessages: 200,
    offlineDownloadLimit: 50,
    supporterMark: SupporterMark.supporter,
    creatorTools: false,
  ),
  SubscriptionTier.patron: TierBenefits(
    adFree: true,
    kawuriDailyMessages: 400,
    offlineDownloadLimit: 200,
    supporterMark: SupporterMark.patron,
    creatorTools: false,
  ),
  SubscriptionTier.creator: TierBenefits(
    adFree: true,
    kawuriDailyMessages: 600,
    offlineDownloadLimit: 500,
    supporterMark: SupporterMark.studio,
    creatorTools: true,
  ),
};

/// The benefit lines shown on the paywall for a tier, in reading order.
List<String> benefitLinesFor(SubscriptionTier tier) {
  final benefits = tierBenefits[tier] ?? TierBenefits.free;
  return <String>[
    if (benefits.adFree) 'No adverts anywhere in the app',
    'Up to ${benefits.kawuriDailyMessages} Kawuri questions a day',
    if (benefits.offlineDownloadLimit > 0)
      'Keep ${benefits.offlineDownloadLimit} songs and chapters offline',
    if (benefits.supporterMark != SupporterMark.none)
      'The ${benefits.supporterMark.label.toLowerCase()} mark beside your name',
    if (benefits.creatorTools) 'Raised TribeStudio quotas and creator tools',
  ];
}
