import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';

/// What a member has paid for. Mirrors `entitlements/{uid}`.
///
/// Written only by `services/functions/src/subscriptions.ts`, from what Google
/// Play says about a purchase token. The Security Rules let the owner read
/// their own and let nobody write one, so what arrives here is the backend's
/// answer rather than anything a phone decided.
///
/// ── Why `expiresAt` is checked and not just `status` ──────────────────────
/// Because they can disagree. A renewal notification that never arrived leaves
/// a document saying `active` long after the subscription lapsed, and a client
/// that read only the word would hand out a free year. [isActive] therefore
/// requires both: a status that still carries benefits, and an expiry in the
/// future. The backend applies exactly the same rule, so the two agree.
@immutable
class Entitlement {
  const Entitlement({
    this.tier = SubscriptionTier.none,
    this.status = EntitlementStatus.none,
    this.productId = '',
    this.basePlanId = '',
    this.offerId = '',
    this.autoRenewing = false,
    this.startedAt,
    this.expiresAt,
    this.testPurchase = false,
    this.regionCode = '',
  });

  static const none = Entitlement();

  final SubscriptionTier tier;
  final EntitlementStatus status;

  final String productId;
  final String basePlanId;
  final String offerId;

  /// False once somebody has cancelled, while access continues to the expiry.
  final bool autoRenewing;

  final DateTime? startedAt;
  final DateTime? expiresAt;

  /// A Play sandbox purchase — a licence tester, or an internal build. Honoured
  /// exactly like a real one, and said out loud on the manage screen so nobody
  /// mistakes a test subscription for a paid one.
  final bool testPurchase;

  final String regionCode;

  /// Whether this is worth anything at the moment [now].
  bool isActiveAt(DateTime now) {
    if (tier == SubscriptionTier.none) return false;
    if (!status.carriesBenefits) return false;
    final expiry = expiresAt;
    return expiry != null && expiry.isAfter(now);
  }

  bool get isActive => isActiveAt(DateTime.now());

  /// The benefits in force — the free row whenever this is not active.
  TierBenefits get benefits =>
      tierBenefits[isActive ? tier : SubscriptionTier.none] ??
      TierBenefits.free;

  /// The base plan chosen, when it is one this build knows about.
  SubscriptionPlan? get plan => productForId(productId)?.planFor(basePlanId);

  /// Whether the member should be nudged: the payment failed and Play is
  /// retrying, or it has stopped retrying and access is already gone.
  bool get needsAttention =>
      status == EntitlementStatus.grace || status == EntitlementStatus.onHold;

  factory Entitlement.fromMap(Map<Object?, Object?>? raw) {
    if (raw == null) return none;
    return Entitlement(
      tier: SubscriptionTier.fromName(raw['tier']),
      status: EntitlementStatus.fromName(raw['status']),
      productId: raw['productId'] as String? ?? '',
      basePlanId: raw['basePlanId'] as String? ?? '',
      offerId: raw['offerId'] as String? ?? '',
      autoRenewing: raw['autoRenewing'] == true,
      startedAt: _asDate(raw['startedAt']),
      expiresAt: _asDate(raw['expiresAt']),
      testPurchase: raw['testPurchase'] == true,
      regionCode: raw['regionCode'] as String? ?? '',
    );
  }

  factory Entitlement.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      doc.exists ? Entitlement.fromMap(doc.data()) : none;
}

/// The lifecycle Play reports, narrowed to what this app draws.
enum EntitlementStatus {
  none,
  active,

  /// The renewal failed and Play is retrying. Access continues — deliberately.
  grace,

  /// Play gave up retrying. Access has stopped but the subscription can be
  /// recovered by fixing the payment method.
  onHold,
  paused,

  /// Cancelled, but paid up to the expiry. Still owed until then.
  canceled,
  expired,

  /// Bought but not yet paid for — a pending mobile money transaction. Ordinary
  /// in Ghana and not an error.
  pending;

  static EntitlementStatus fromName(Object? raw) => switch (raw) {
    'active' => EntitlementStatus.active,
    'grace' => EntitlementStatus.grace,
    'on_hold' => EntitlementStatus.onHold,
    'paused' => EntitlementStatus.paused,
    'canceled' => EntitlementStatus.canceled,
    'expired' => EntitlementStatus.expired,
    'pending' => EntitlementStatus.pending,
    _ => EntitlementStatus.none,
  };

  bool get carriesBenefits => switch (this) {
    EntitlementStatus.active ||
    EntitlementStatus.grace ||
    EntitlementStatus.canceled => true,
    _ => false,
  };

  /// One line for the manage screen. Says what is true, not what is cheerful.
  String get description => switch (this) {
    EntitlementStatus.active => 'Active',
    EntitlementStatus.grace =>
      'The last payment did not go through. Google Play is trying again — '
          'everything still works meanwhile.',
    EntitlementStatus.onHold =>
      'On hold. Google Play could not take the payment, so the extras have '
          'stopped. Fixing the payment method in Play brings them straight '
          'back.',
    EntitlementStatus.paused => 'Paused from Google Play.',
    EntitlementStatus.canceled =>
      'Cancelled. Everything keeps working until the date below.',
    EntitlementStatus.expired => 'Ended',
    EntitlementStatus.pending =>
      'Waiting for the payment to clear. This can take a few minutes with '
          'mobile money.',
    EntitlementStatus.none => 'No subscription',
  };
}

DateTime? _asDate(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}
