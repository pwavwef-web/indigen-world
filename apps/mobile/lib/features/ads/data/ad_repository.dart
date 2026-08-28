import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';

/// A message worth showing somebody who has just tried to spend money.
class AdCampaignFailure implements Exception {
  const AdCampaignFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Reads and writes advertising campaigns.
///
/// Every write goes through a callable. Nothing about a campaign that costs
/// money — its status, whether it is paid, what it has been charged, how many
/// impressions it has had — may be settable from a phone, so the Security
/// Rules deny client writes outright and this class only ever reads.
class AdRepository {
  const AdRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const _timeout = Duration(seconds: 45);

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection('adCampaigns');

  /// Creates a campaign and parks it at `PENDING_PAYMENT`.
  ///
  /// Returns the new campaign id. Paystack is not wired yet; the callable
  /// records the amount owed and nothing is charged.
  Future<String> submit(AdCampaignDraft draft) async {
    final result = await _call('submitAdCampaign', draft.toPayload());
    final id = result['campaignId'];
    return id is String ? id : '';
  }

  /// Edits a campaign that has not started running.
  Future<void> update(String campaignId, AdCampaignDraft draft) => _call(
    'updateAdCampaign',
    {'campaignId': campaignId, ...draft.toPayload()},
  );

  Future<void> cancel(String campaignId) =>
      _call('cancelAdCampaign', {'campaignId': campaignId});

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> payload,
  ) async {
    try {
      final callable = _functions.httpsCallable(
        name,
        options: HttpsCallableOptions(timeout: _timeout),
      );
      final response = await callable.call<Map<Object?, Object?>>(payload);
      return {
        for (final entry in response.data.entries)
          entry.key.toString(): entry.value,
      };
    } on FirebaseFunctionsException catch (error) {
      // The callable's own message is the useful one — it names the field that
      // was wrong. A generic "something went wrong" here would send somebody
      // back through a six-step form with no idea which step to fix.
      throw AdCampaignFailure(
        error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That did not go through. Check your connection and try again.',
      );
    } on Object {
      throw const AdCampaignFailure(
        'That did not go through. Check your connection and try again.',
      );
    }
  }

  /// This member's campaigns, newest first.
  ///
  /// Sorted on the device so the query stays a single-field equality and needs
  /// no composite index — the same trade the Collection queue makes.
  Stream<List<AdCampaign>> watchMine(String uid) => _collection
      .where('ownerUid', isEqualTo: uid)
      .limit(60)
      .snapshots()
      .map((snapshot) {
        final rows =
            snapshot.docs.map(AdCampaign.fromDoc).toList(growable: true)
              ..sort((left, right) {
                final leftAt = left.createdAt ?? DateTime(1970);
                final rightAt = right.createdAt ?? DateTime(1970);
                return rightAt.compareTo(leftAt);
              });
        return List<AdCampaign>.unmodifiable(rows);
      });

  Stream<AdCampaign?> watchOne(String campaignId) =>
      _collection.doc(campaignId).snapshots().map((doc) {
        final data = doc.data();
        return data == null ? null : AdCampaign.fromData(doc.id, data);
      });
}

final adRepositoryProvider = Provider<AdRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return AdRepository(FirebaseFirestore.instance, FirebaseFunctions.instance);
});

final myAdCampaignsProvider = StreamProvider<List<AdCampaign>>((ref) {
  final uid = ref.watch(authStateProvider).asData?.value?.uid;
  final repository = ref.watch(adRepositoryProvider);
  if (uid == null || repository == null) {
    return Stream.value(const <AdCampaign>[]);
  }
  return repository.watchMine(uid);
});

final adCampaignProvider = StreamProvider.family<AdCampaign?, String>((
  ref,
  campaignId,
) {
  final repository = ref.watch(adRepositoryProvider);
  if (repository == null) return Stream.value(null);
  return repository.watchOne(campaignId);
});
