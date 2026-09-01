import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';

/// A message worth showing somebody who has just tried to spend money.
class SubscriptionFailure implements Exception {
  const SubscriptionFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Reads entitlements and settles purchases through the backend.
///
/// Every write is a callable. `entitlements/{uid}` is read-only to its owner in
/// the Security Rules and unwritable by anybody, which is the whole design: a
/// subscription is what Google Play told our server, not what a phone put in a
/// document.
class SubscriptionRepository {
  const SubscriptionRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const _timeout = Duration(seconds: 30);

  /// What this member is owed, kept live.
  ///
  /// Firestore's local cache means a subscriber who opens the app offline still
  /// gets their tier — which is the right behaviour: they have paid, and a lost
  /// connection is not a reason to put adverts back in front of them.
  Stream<Entitlement> watch(String uid) => _firestore
      .collection('entitlements')
      .doc(uid)
      .snapshots()
      .map(Entitlement.fromDoc)
      .handleError((Object error) {
        debugPrint('Entitlement stream failed: $error');
      });

  /// The account id to attach to a purchase, minted and indexed by the server.
  ///
  /// Called immediately before the Play sheet opens. It has to be the server's
  /// value rather than something hashed here, because the server also writes
  /// the reverse map — and a purchase whose account id nothing can resolve is a
  /// purchase that cannot be recovered if this app never comes back.
  Future<String> prepare() async {
    try {
      final result = await _functions
          .httpsCallable(
            'preparePlayPurchase',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
      final id = result.data['obfuscatedAccountId'] as String? ?? '';
      if (id.isEmpty) {
        throw const SubscriptionFailure('Could not start the purchase.');
      }
      return id;
    } on FirebaseFunctionsException catch (error) {
      throw SubscriptionFailure(_messageFor(error));
    }
  }

  /// Hands a completed purchase to the backend to be verified with Google.
  ///
  /// Returns the settled entitlement. Throws only on a failure worth telling
  /// somebody about — a network problem is worth a retry, not a scary sentence.
  Future<Entitlement> register(PurchaseDetails purchase) async {
    // On Android this is the Play purchase token. It is the only field that
    // matters: everything else about the purchase is re-read from Google.
    final token = purchase.verificationData.serverVerificationData;
    if (token.isEmpty) {
      throw const SubscriptionFailure('That purchase carried no receipt.');
    }

    try {
      final result = await _functions
          .httpsCallable(
            'registerPlayPurchase',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>({'purchaseToken': token});
      return Entitlement.fromMap(
        result.data['entitlement'] as Map<Object?, Object?>?,
      );
    } on FirebaseFunctionsException catch (error) {
      throw SubscriptionFailure(_messageFor(error));
    }
  }

  /// The benefits the backend says are in force for this caller.
  ///
  /// ── Why ask, when the app ships the same table ────────────────────────
  /// Because the shipped table goes out of date the moment a benefit changes
  /// and cannot be updated without a release — and the members least likely to
  /// take an update are the ones on the slowest connections. Asking makes the
  /// backend's `TIER_BENEFITS` the authority, so the Kawuri allowance can be
  /// raised for everybody in a functions deploy rather than an app rollout.
  ///
  /// Returns null on any failure at all. The caller then falls back to the
  /// shipped table, which is what keeps a subscriber's benefits working on a
  /// phone with no connection.
  Future<TierBenefits?> benefitsInForce() async {
    try {
      final result = await _functions
          .httpsCallable(
            'getSubscriptionOptions',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
      final raw = result.data['benefitsInForce'];
      if (raw is! Map<Object?, Object?>) return null;
      return TierBenefits.fromMap(raw);
    } on Object catch (error) {
      debugPrint('Could not read the benefits in force: $error');
      return null;
    }
  }

  /// Re-reads the subscription from Google. What "Restore" and a stale
  /// entitlement both call.
  Future<Entitlement> refresh() async {
    try {
      final result = await _functions
          .httpsCallable(
            'refreshSubscription',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
      return Entitlement.fromMap(
        result.data['entitlement'] as Map<Object?, Object?>?,
      );
    } on FirebaseFunctionsException catch (error) {
      throw SubscriptionFailure(_messageFor(error));
    }
  }

  /// Turns a callable failure into a sentence somebody can act on.
  static String _messageFor(FirebaseFunctionsException error) =>
      switch (error.code) {
        'unauthenticated' => 'Sign in first, then try again.',
        'failed-precondition' =>
          error.message ?? 'Subscriptions are not available yet.',
        'permission-denied' =>
          'That subscription belongs to a different account.',
        'resource-exhausted' => 'Too many attempts. Wait a minute and retry.',
        'unavailable' || 'deadline-exceeded' =>
          'Could not reach Indigen World. Check your connection and try again.',
        _ => 'That did not go through. Try again in a moment.',
      };
}
