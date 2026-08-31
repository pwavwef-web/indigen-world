// The advertising surface: what it costs, what it says, and what it refuses
// to pretend.
//
// These tests began as the buying half alone — the arithmetic on the cost card,
// the statuses a campaign moves through, and the honesty of a flow whose "Pay"
// button was not wired to anything yet. Payment is wired now, and so is the
// other half: an advert bought here is actually shown to somebody.
//
// The serving tests below are all about the same worry. An advert is the one
// thing in this app nobody asked to see, so it has to be counted honestly,
// filtered honestly, and labelled honestly — shown only where it was bought,
// gone the moment its window closes, and never billed twice for one pair of
// eyes.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart';
import 'package:indigen_world_mobile/features/ads/create_ad_screen.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:visibility_detector/visibility_detector.dart';

Widget _host(Widget child) => ProviderScope(
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildIndigenTheme(),
    home: child,
  ),
);

/// One advert as the backend projects it into `adPlacements`.
///
/// Built through [ServedAd.fromData] rather than the constructor on purpose:
/// every one of these tests is really about the wire contract, and a fixture
/// that skipped the parser would keep passing after the parser stopped
/// understanding a field.
ServedAd _served(
  String id, {
  List<String> placements = const ['community'],
  String mediaType = 'image',
  String? ctaUrl,
  String? startsAt,
  String? endsAt,
}) => ServedAd.fromData(id, <String, dynamic>{
  'campaignId': id,
  'headline': 'Pure shea from Paga',
  'body': 'Sold by the tin at the Friday market.',
  'creativeUrl': 'https://example.test/$id.jpg',
  'mediaType': mediaType,
  'objective': 'visits',
  'ctaLabel': 'Visit the stall',
  'ctaUrl': ctaUrl ?? 'https://example.test/$id',
  'placements': placements,
  'regions': const ['Upper East'],
  'startsAt': startsAt,
  'endsAt': endsAt,
  'active': true,
});

ProviderContainer _serving(List<ServedAd> ads) {
  final container = ProviderContainer(
    overrides: [servedAdsProvider.overrideWith((ref) => Stream.value(ads))],
  );
  addTearDown(container.dispose);
  return container;
}

/// Subscribes, then lets the event loop turn until the stubbed stream has
/// reached the placement provider that reads it.
///
/// Reading `servedAdsProvider.future` instead would hang: nothing in a bare
/// container keeps a provider alive between reads, so the stream is disposed
/// mid-load and the future never completes. The same trap `explore_feed`'s
/// tests document.
Future<void> _settle(
  ProviderContainer container,
  Provider<List<ServedAd>> target,
) async {
  container.listen(target, (_, _) {});
  for (var turn = 0; turn < 4; turn++) {
    await Future<void>.delayed(Duration.zero);
  }
}

Iterable<String> _idsIn(ProviderContainer container, AdPlacement placement) =>
    container.read(placedAdsProvider(placement)).map((ad) => ad.campaignId);

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

  group('serving', () {
    test('an advert reaches the placement it was bought for, and no other', () {
      final now = DateTime.utc(2026, 8, 30);
      final ads = [
        _served('shea', placements: const ['community']),
        _served('drums', placements: const ['explore']),
      ];
      Iterable<String> shownIn(AdPlacement placement) =>
          adsForPlacement(ads, placement, now: now).map((ad) => ad.campaignId);

      expect(shownIn(AdPlacement.community), ['shea']);
      expect(shownIn(AdPlacement.explore), ['drums']);
      // Nobody bought the Collection, so the Collection shows nothing.
      expect(shownIn(AdPlacement.collection), isEmpty);
    });

    test('the same rule holds through the placement providers', () async {
      final container = _serving([
        _served('shea', placements: const ['community']),
        _served('drums', placements: const ['explore']),
        _served('cloth', placements: const ['collection', 'community']),
      ]);
      await _settle(container, placedAdsProvider(AdPlacement.community));

      // A set, not a list: which of the two eligible adverts leads the feed is
      // the rotation's business and changes with the clock. What must not
      // change is *which two* are eligible at all.
      expect(_idsIn(container, AdPlacement.community).toSet(), {
        'shea',
        'cloth',
      });
      expect(_idsIn(container, AdPlacement.explore), ['drums']);
      expect(_idsIn(container, AdPlacement.collection), ['cloth']);
    });

    test('a placement nobody bought is a placement nobody gets', () {
      // Unlike `AdCampaign.fromData`, which falls back to the feed so an
      // advertiser can still find their own campaign in their own list.
      final unreadable = ServedAd.fromData('c1', const <String, dynamic>{
        'headline': 'Somewhere',
        'placements': ['nowhere-real'],
      });
      expect(unreadable.placements, isEmpty);
      for (final placement in AdPlacement.values) {
        expect(unreadable.servesIn(placement), isFalse, reason: placement.name);
      }
    });

    test('an advert whose window has closed is gone before the job runs', () {
      final now = DateTime.utc(2026, 8, 30, 12);
      final finished = _served(
        'finished',
        endsAt: now.subtract(const Duration(minutes: 1)).toIso8601String(),
      );
      final running = _served(
        'running',
        endsAt: now.add(const Duration(days: 3)).toIso8601String(),
      );
      final unstarted = _served(
        'unstarted',
        startsAt: now.add(const Duration(days: 1)).toIso8601String(),
      );

      // All three are still `active` — that is the whole point. The daily
      // expiry job has not run yet, and the reader's feed must not wait for it.
      expect(finished.active, isTrue);
      final shown = adsForPlacement(
        [finished, running, unstarted],
        AdPlacement.community,
        now: now,
      );
      expect(shown.map((ad) => ad.campaignId), ['running']);

      // Ends *at*, not after: a campaign bought until noon is finished at noon.
      final atTheBell = _served('bell', endsAt: now.toIso8601String());
      expect(atTheBell.isRunningAt(now), isFalse);
    });

    test('an expired advert never reaches a surface either', () async {
      final container = _serving([
        _served(
          'finished',
          endsAt: DateTime.now()
              .subtract(const Duration(days: 1))
              .toIso8601String(),
        ),
        _served('running'),
      ]);
      await _settle(container, placedAdsProvider(AdPlacement.community));

      expect(_idsIn(container, AdPlacement.community), ['running']);
    });

    test('adverts land at a cadence, and never two in a row', () {
      final posts = [for (var index = 0; index < 25; index += 1) 'post$index'];
      final rows = spliceSponsored<Object>(
        rows: posts,
        ads: [_served('shea'), _served('cloth')],
        cadence: 10,
        render: (ad) => ad,
      );

      final slots = [
        for (var index = 0; index < rows.length; index += 1)
          if (rows[index] is ServedAd) index,
      ];
      expect(slots, [10, 21]);
      // Taking turns, rather than the first campaign owning every slot.
      expect(
        slots.map((index) => (rows[index] as ServedAd).campaignId),
        ['shea', 'cloth'],
      );

      // A short feed carries none at all: an advert in front of a quarter of
      // what somebody came for is the worst ratio in the app.
      expect(
        spliceSponsored<Object>(
          rows: const ['only', 'four', 'posts', 'today'],
          ads: [_served('shea')],
          cadence: 10,
          render: (ad) => ad,
        ).whereType<ServedAd>(),
        isEmpty,
      );
    });
  });

  group('telemetry', () {
    test('an impression is counted once, and only once, per advert', () async {
      final sent = <(String, AdEventKind)>[];
      final telemetry = ServedAdTelemetry(
        (campaignId, kind) async => sent.add((campaignId, kind)),
      );

      await telemetry.recordImpression('shea');
      await telemetry.recordImpression('shea');
      await telemetry.recordImpression('shea');
      expect(sent, [('shea', AdEventKind.impression)]);

      // Keyed by campaign, not by widget: the same advert seen again in another
      // tab is still the one impression it was.
      await telemetry.recordImpression('cloth');
      expect(sent, [
        ('shea', AdEventKind.impression),
        ('cloth', AdEventKind.impression),
      ]);
    });

    test('a refused write is still counted, so it is never retried', () async {
      var attempts = 0;
      final telemetry = ServedAdTelemetry((_, _) async {
        attempts += 1;
        throw StateError('refused by the rules');
      });

      await expectLater(
        telemetry.recordImpression('shea'),
        throwsA(isA<StateError>()),
      );
      // A card drifting past the visibility threshold must not turn a
      // permanently refused write into an endless retry.
      await telemetry.recordImpression('shea');
      await telemetry.recordImpression('shea');
      expect(attempts, 1);
    });

    test('somebody who taps twice meant it twice', () async {
      final sent = <AdEventKind>[];
      final telemetry = ServedAdTelemetry((_, kind) async => sent.add(kind));

      await telemetry.recordClick('shea');
      await telemetry.recordClick('shea');
      expect(sent, [AdEventKind.click, AdEventKind.click]);
    });

    test('a click is recorded before the browser is opened', () async {
      final order = <String>[];
      final opener = SponsoredLinkOpener(
        ServedAdTelemetry((_, kind) async {
          // A turn of the event loop, so an unawaited record would lose this
          // race and the assertion below would catch it.
          await Future<void>.delayed(Duration.zero);
          order.add('recorded ${kind.name}');
        }),
        (url) async {
          order.add('opened $url');
          return true;
        },
      );

      expect(await opener.open(_served('shea')), isTrue);
      expect(order, ['recorded click', 'opened https://example.test/shea']);
    });

    test('an advert cannot name a scheme of its own', () async {
      var launched = false;
      final opener = SponsoredLinkOpener(
        ServedAdTelemetry((_, _) async {}),
        (url) async {
          launched = true;
          return true;
        },
      );

      expect(
        await opener.open(_served('shea', ctaUrl: 'tel:+233200000000')),
        isFalse,
      );
      expect(launched, isFalse);
    });
  });

  group('sponsored surfaces', () {
    setUp(() {
      // Fires the visibility callbacks inside the frame instead of on a
      // coalescing timer, which would still be pending when the test ends.
      VisibilityDetectorController.instance.updateInterval = Duration.zero;
    });

    tearDown(() {
      VisibilityDetectorController.instance.updateInterval = const Duration(
        milliseconds: 500,
      );
    });

    testWidgets('an advert says what it is before it says anything else', (
      tester,
    ) async {
      // A video creative, so the card draws its own plate and nothing here
      // reaches for the network.
      final ad = _served('shea', mediaType: 'video');
      await tester.pumpWidget(
        _host(
          Scaffold(body: ListView(children: [SponsoredCard(ad: ad, slot: 't')])),
        ),
      );
      await tester.pump();

      expect(find.text('Sponsored'), findsOneWidget);
      expect(find.text('Pure shea from Paga'), findsOneWidget);
      expect(find.text('Visit the stall'), findsOneWidget);
      // None of the chrome that would make it look like somebody's work.
      expect(find.byIcon(Icons.favorite_border_rounded), findsNothing);
      expect(find.byIcon(Icons.chat_bubble_outline_rounded), findsNothing);
    });
  });
}
