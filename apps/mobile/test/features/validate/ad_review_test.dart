import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/validate/data/ad_review_queue.dart';

AdCampaign _campaign({
  required AdCampaignStatus status,
  String paymentStatus = 'paid',
}) => AdCampaign(
  id: 'campaign-1',
  name: 'Navrongo weaving',
  objective: AdObjective.awareness,
  headline: 'Cloth woven in Navrongo',
  body: 'Made by hand, sold at the market.',
  status: status,
  placements: const [AdPlacement.community],
  dailyBudgetPesewas: 20 * kPesewasPerCedi,
  durationDays: 7,
  totalBudgetPesewas: 140 * kPesewasPerCedi,
  paymentStatus: paymentStatus,
);

void main() {
  group('AdReviewDecision.availableFor', () {
    test('a campaign in review can be approved or rejected', () {
      expect(
        AdReviewDecision.availableFor(
          _campaign(status: AdCampaignStatus.inReview),
        ),
        [AdReviewDecision.approve, AdReviewDecision.reject],
      );
    });

    test('a running campaign can be paused or pulled, never re-approved', () {
      final decisions = AdReviewDecision.availableFor(
        _campaign(status: AdCampaignStatus.active),
      );
      expect(decisions, contains(AdReviewDecision.pause));
      expect(decisions, contains(AdReviewDecision.reject));
      expect(decisions, isNot(contains(AdReviewDecision.approve)));
    });

    test('a paused campaign can be resumed', () {
      expect(
        AdReviewDecision.availableFor(
          _campaign(status: AdCampaignStatus.paused),
        ),
        contains(AdReviewDecision.resume),
      );
    });

    test('a finished campaign offers nothing', () {
      for (final status in const [
        AdCampaignStatus.completed,
        AdCampaignStatus.cancelled,
        AdCampaignStatus.rejected,
        AdCampaignStatus.draft,
        AdCampaignStatus.pendingPayment,
      ]) {
        expect(
          AdReviewDecision.availableFor(_campaign(status: status)),
          isEmpty,
          reason: '$status should offer no decision',
        );
      }
    });
  });

  group('AdReviewDecision', () {
    test('only a rejection demands a reason', () {
      expect(AdReviewDecision.reject.requiresFeedback, isTrue);
      for (final decision in const [
        AdReviewDecision.approve,
        AdReviewDecision.pause,
        AdReviewDecision.resume,
      ]) {
        expect(decision.requiresFeedback, isFalse);
      }
    });

    test('every decision carries the wire value the callable expects', () {
      expect(AdReviewDecision.approve.wire, 'APPROVE');
      expect(AdReviewDecision.reject.wire, 'REJECT');
      expect(AdReviewDecision.pause.wire, 'PAUSE');
      expect(AdReviewDecision.resume.wire, 'RESUME');
    });
  });

  group('AdCampaign payment state', () {
    test('reads the states the payment flow can leave behind', () {
      expect(_campaign(status: AdCampaignStatus.inReview).isPaid, isTrue);
      expect(
        _campaign(
          status: AdCampaignStatus.pendingPayment,
          paymentStatus: 'pending',
        ).hasOpenCheckout,
        isTrue,
      );
      expect(
        _campaign(
          status: AdCampaignStatus.pendingPayment,
          paymentStatus: 'underpaid',
        ).isUnderpaid,
        isTrue,
      );
    });

    test('a paid campaign is no longer asking for money', () {
      expect(
        _campaign(status: AdCampaignStatus.inReview).needsPayment,
        isFalse,
      );
      expect(
        _campaign(
          status: AdCampaignStatus.pendingPayment,
          paymentStatus: 'unpaid',
        ).needsPayment,
        isTrue,
      );
    });
  });
}
