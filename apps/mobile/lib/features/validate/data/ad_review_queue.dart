import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';

/// The advert side of the review desk.
///
/// Adverts and contributions are reviewed by the same people against the same
/// claim, but they are not the same object and share no lifecycle: a campaign
/// has been paid for, runs for a stated number of days, and can be stopped
/// again after it starts. So it gets its own queue rather than being forced
/// through `decideSubmission`'s vocabulary.

/// What a reviewer can do to a campaign, matching `decideAdCampaign`.
enum AdReviewDecision {
  approve,
  reject,
  pause,
  resume;

  String get wire => switch (this) {
    AdReviewDecision.approve => 'APPROVE',
    AdReviewDecision.reject => 'REJECT',
    AdReviewDecision.pause => 'PAUSE',
    AdReviewDecision.resume => 'RESUME',
  };

  String get label => switch (this) {
    AdReviewDecision.approve => 'Approve and run',
    AdReviewDecision.reject => 'Reject',
    AdReviewDecision.pause => 'Pause',
    AdReviewDecision.resume => 'Resume',
  };

  IconData get icon => switch (this) {
    AdReviewDecision.approve => Icons.play_circle_fill_rounded,
    AdReviewDecision.reject => Icons.block_rounded,
    AdReviewDecision.pause => Icons.pause_circle_filled_rounded,
    AdReviewDecision.resume => Icons.play_arrow_rounded,
  };

  Color color(BrandPalette brand) => switch (this) {
    AdReviewDecision.approve => brand.success,
    AdReviewDecision.reject => brand.danger,
    AdReviewDecision.pause => brand.gold,
    AdReviewDecision.resume => brand.accent,
  };

  /// The backend refuses a rejection with no reason, and it is right to: an
  /// advertiser told "no" with no explanation cannot act on it.
  bool get requiresFeedback => this == AdReviewDecision.reject;

  /// Which decisions make sense from where a campaign currently is. Mirrors
  /// `AD_DECISION_PRECONDITIONS`, so a reviewer is never offered a button the
  /// callable is going to refuse.
  static List<AdReviewDecision> availableFor(AdCampaign campaign) =>
      switch (campaign.status) {
        AdCampaignStatus.inReview => const [
          AdReviewDecision.approve,
          AdReviewDecision.reject,
        ],
        AdCampaignStatus.active => const [
          AdReviewDecision.pause,
          AdReviewDecision.reject,
        ],
        AdCampaignStatus.paused => const [
          AdReviewDecision.resume,
          AdReviewDecision.reject,
        ],
        _ => const [],
      };
}

/// The queues a reviewer moves campaigns between.
const kAdReviewQueues = <(AdCampaignStatus, String, IconData)>[
  (AdCampaignStatus.inReview, 'Waiting', Icons.inbox_rounded),
  (AdCampaignStatus.active, 'Running', Icons.play_circle_fill_rounded),
  (AdCampaignStatus.paused, 'Paused', Icons.pause_circle_filled_rounded),
  (AdCampaignStatus.rejected, 'Rejected', Icons.block_rounded),
];

/// Reads the advert queue and records decisions.
///
/// Reads are direct: `adCampaigns` is readable by staff under the Security
/// Rules. Writes are not — every transition goes through `decideAdCampaign`,
/// because a status a phone could set is a status a phone could set to
/// `ACTIVE`.
class AdReviewRepository {
  const AdReviewRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const _timeout = Duration(seconds: 45);

  /// Campaigns in [status], newest first.
  ///
  /// Sorted on the device so the query stays a single-field equality and needs
  /// no composite index — the same trade every other queue in the app makes.
  Stream<List<AdCampaign>> watchQueue(AdCampaignStatus status) => _firestore
      .collection('adCampaigns')
      .where('status', isEqualTo: status.wire)
      .limit(60)
      .snapshots()
      .map((snapshot) {
        final rows = snapshot.docs.map(AdCampaign.fromDoc).toList(growable: true)
          ..sort((left, right) {
            final leftAt = left.createdAt ?? DateTime(1970);
            final rightAt = right.createdAt ?? DateTime(1970);
            return rightAt.compareTo(leftAt);
          });
        return List<AdCampaign>.unmodifiable(rows);
      });

  Future<void> decide({
    required String campaignId,
    required AdReviewDecision decision,
    required String feedback,
  }) async {
    try {
      final callable = _functions.httpsCallable(
        'decideAdCampaign',
        options: HttpsCallableOptions(timeout: _timeout),
      );
      await callable.call<Map<Object?, Object?>>({
        'campaignId': campaignId,
        'decision': decision.wire,
        'feedback': feedback.trim(),
      });
    } on FirebaseFunctionsException catch (error) {
      // The callable's own message names the precondition that failed, which
      // is exactly what a reviewer needs to know.
      throw ReviewFailure(
        error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That decision could not be recorded. Try again.',
      );
    } on Object {
      throw const ReviewFailure(
        'That decision could not be recorded. Try again.',
      );
    }
  }
}

final adReviewRepositoryProvider = Provider<AdReviewRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return AdReviewRepository(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

/// Which advert queue the desk is showing.
class AdReviewQueueStatus extends Notifier<AdCampaignStatus> {
  @override
  AdCampaignStatus build() => AdCampaignStatus.inReview;

  void select(AdCampaignStatus status) => state = status;
}

final adReviewQueueStatusProvider =
    NotifierProvider<AdReviewQueueStatus, AdCampaignStatus>(
      AdReviewQueueStatus.new,
    );

final adReviewQueueProvider = StreamProvider<List<AdCampaign>>((ref) {
  final repository = ref.watch(adReviewRepositoryProvider);
  final canReview = ref.watch(isReviewerProvider);
  if (repository == null || !canReview) {
    return Stream.value(const <AdCampaign>[]);
  }
  return repository.watchQueue(ref.watch(adReviewQueueStatusProvider));
});

/// How many campaigns are waiting, for the badge on the desk's Adverts tab.
///
/// Its own subscription rather than a read of the visible queue, so the count
/// is still right while a reviewer is looking at the Running list.
final adReviewWaitingCountProvider = StreamProvider<int>((ref) {
  final repository = ref.watch(adReviewRepositoryProvider);
  if (repository == null || !ref.watch(isReviewerProvider)) {
    return Stream.value(0);
  }
  return repository
      .watchQueue(AdCampaignStatus.inReview)
      .map((rows) => rows.length);
});
