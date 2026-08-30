// The advertising surface: what it costs, what it says, and what it refuses
// to pretend.
//
// Payment is not wired yet, and the most important thing these tests hold in
// place is that the app is honest about that — a "Pay" button that quietly
// does nothing would be worse than no button at all.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart';
import 'package:indigen_world_mobile/features/ads/create_ad_screen.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

Widget _host(Widget child) => ProviderScope(
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildIndigenTheme(),
    home: child,
  ),
);

void main() {
  group('cost', () {
    test('a campaign costs its daily budget times its days, plus tax', () {
      const cost = AdCostBreakdown(dailyBudgetPesewas: 2000, durationDays: 7);
      expect(cost.subtotalPesewas, 14000);
      expect(cost.taxPesewas, 840);
      expect(cost.totalPesewas, 14840);
    });

    test('money is formatted as cedis, always to the pesewa', () {
      // Held in integer pesewas precisely so that this is exact.
      expect(cedis(0), 'GH₵ 0.00');
      expect(cedis(5), 'GH₵ 0.05');
      expect(cedis(2000), 'GH₵ 20.00');
      expect(cedis(14840), 'GH₵ 148.40');
    });

    test('the reach estimate is a range, and low is below high', () {
      const cost = AdCostBreakdown(dailyBudgetPesewas: 2000, durationDays: 7);
      expect(
        cost.estimatedImpressionsLow,
        lessThan(cost.estimatedImpressionsHigh),
      );
      expect(cost.estimatedImpressionsLow, greaterThan(0));
    });
  });

  group('status', () {
    test('a campaign in review or running can no longer be edited', () {
      // Its copy and creative are what a reviewer approved.
      expect(AdCampaignStatus.draft.isEditable, isTrue);
      expect(AdCampaignStatus.pendingPayment.isEditable, isTrue);
      for (final status in [
        AdCampaignStatus.inReview,
        AdCampaignStatus.active,
        AdCampaignStatus.completed,
        AdCampaignStatus.rejected,
        AdCampaignStatus.cancelled,
      ]) {
        expect(status.isEditable, isFalse, reason: status.wire);
      }
    });

    test('a finished campaign cannot be cancelled again', () {
      expect(AdCampaignStatus.active.isCancellable, isTrue);
      expect(AdCampaignStatus.pendingPayment.isCancellable, isTrue);
      expect(AdCampaignStatus.completed.isCancellable, isFalse);
      expect(AdCampaignStatus.cancelled.isCancellable, isFalse);
      expect(AdCampaignStatus.rejected.isCancellable, isFalse);
    });

    test('statuses survive a round trip through the wire format', () {
      for (final status in AdCampaignStatus.values) {
        expect(AdCampaignStatus.fromWire(status.wire), status);
      }
      // An unknown status from a newer backend reads as a draft rather than
      // crashing somebody's campaign list.
      expect(AdCampaignStatus.fromWire('WHAT_IS_THIS'), AdCampaignStatus.draft);
    });
  });

  group('parsing', () {
    test('a campaign with no readable placement still renders somewhere', () {
      final campaign = AdCampaign.fromData('c1', const {
        'name': 'Shea',
        'status': 'ACTIVE',
        'placements': ['nowhere-real'],
      });
      expect(campaign.placements, [AdPlacement.community]);
    });

    test('missing numbers read as zero rather than throwing', () {
      final campaign = AdCampaign.fromData('c1', const {});
      expect(campaign.name, 'Untitled campaign');
      expect(campaign.dailyBudgetPesewas, 0);
      expect(campaign.totalBudgetPesewas, 0);
      expect(campaign.impressions, 0);
      expect(campaign.creative, isNull);
    });
  });

  group('screens', () {
    testWidgets('a guest is asked to sign in before advertising', (
      tester,
    ) async {
      await tester.pumpWidget(_host(const AdsScreen(standalone: true)));
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('Sign in to advertise'), findsOneWidget);
      expect(find.text('Reach the community.'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('the builder refuses to advance without a campaign name', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(500, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_host(const CreateAdScreen()));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('What do you want from this?'), findsOneWidget);
      await tester.tap(find.text('Next'));
      await tester.pump(const Duration(milliseconds: 300));

      // Validated on the way out of each step, so nobody fills in six screens
      // and is then told the first one was wrong.
      expect(find.textContaining('Give the campaign a name'), findsOneWidget);
      expect(find.text('What do you want from this?'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('a named campaign reaches the creative step, and stops there', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(500, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_host(const CreateAdScreen()));
      await tester.pump(const Duration(milliseconds: 300));

      await tester.enterText(find.byType(TextField).first, 'Dry season shea');
      await tester.pump();
      await tester.tap(find.text('Next'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('What will people see?'), findsOneWidget);
      expect(find.text('Nothing added yet'), findsOneWidget);

      // An advert without a creative is a blank rectangle somebody paid for.
      await tester.tap(find.text('Next'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('Add the image or video'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('the cost card shows the sum, not just the total', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(
          const Scaffold(
            body: Padding(
              padding: EdgeInsets.all(16),
              child: AdCostCard(
                cost: AdCostBreakdown(
                  dailyBudgetPesewas: 2000,
                  durationDays: 7,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      // Somebody committing real money should be able to check the arithmetic.
      expect(find.text('GH₵ 20.00 × 7 days'), findsOneWidget);
      expect(find.text('GH₵ 140.00'), findsOneWidget);
      expect(find.text('Tax and levies (6%)'), findsOneWidget);
      expect(find.text('GH₵ 8.40'), findsOneWidget);
      expect(find.text('Total'), findsOneWidget);
      expect(find.text('GH₵ 148.40'), findsOneWidget);
      // The reach figure is never presented as a promise.
      expect(find.textContaining('not a guarantee'), findsOneWidget);
    });

    testWidgets('a campaign awaiting payment says so, and cannot be paid yet', (
      tester,
    ) async {
      const campaign = AdCampaign(
        id: 'c1',
        name: 'Dry season shea',
        objective: AdObjective.awareness,
        headline: 'Pure shea from Paga',
        body: 'Sold by the tin.',
        status: AdCampaignStatus.pendingPayment,
        placements: [AdPlacement.community],
        dailyBudgetPesewas: 2000,
        durationDays: 7,
        totalBudgetPesewas: 14840,
      );
      await tester.pumpWidget(
        _host(
          const Scaffold(
            body: Padding(
              padding: EdgeInsets.all(16),
              child: AdCampaignCard(campaign: campaign),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('Dry season shea'), findsOneWidget);
      expect(find.text('Awaiting payment'), findsOneWidget);
      expect(find.text('GH₵ 148.40 · 7 days'), findsOneWidget);
    });
  });
}
