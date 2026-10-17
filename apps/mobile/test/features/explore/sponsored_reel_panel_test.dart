import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/explore/sponsored_reel_panel.dart';

ServedAd _ad({String id = 'house-launch', String advertiser = ''}) => ServedAd(
  campaignId: id,
  headline: 'Read the updates blog',
  body: 'Release notes and stories, in the app.',
  creativeUrl: '',
  mediaType: 'video',
  advertiserName: advertiser,
  ctaLabel: 'Learn more',
  ctaUrl: 'https://updates.indigenworld.com/latest',
  placements: const [AdPlacement.explore],
);

Future<void> _pump(WidgetTester tester, ServedAd ad, {List<int>? mores}) =>
    tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildIndigenDarkTheme(),
          home: Scaffold(
            backgroundColor: Colors.black,
            body: Align(
              alignment: Alignment.bottomCenter,
              child: SponsoredReelPanel(
                ad: ad,
                muted: true,
                onToggleSound: () {},
                onMore: () => mores?.add(1),
              ),
            ),
          ),
        ),
      ),
    );

void main() {
  testWidgets('an Explore advert says Ad and offers one clear action', (
    tester,
  ) async {
    await _pump(tester, _ad());
    expect(find.text('Ad'), findsOneWidget);
    expect(find.text('Indigen World'), findsOneWidget);
    expect(find.text('updates.indigenworld.com'), findsOneWidget);
    expect(find.text('Learn more'), findsOneWidget);
    expect(find.byIcon(Icons.verified_rounded), findsOneWidget);
    // Adverts have no engagement of their own: no counts, no like or repost.
    expect(find.byIcon(Icons.favorite_border_rounded), findsNothing);
    expect(find.byIcon(Icons.repeat_rounded), findsNothing);
    expect(find.textContaining(RegExp(r'^\d+K?$')), findsNothing);
  });

  testWidgets('third-party advertisers keep their name and get no badge', (
    tester,
  ) async {
    await _pump(tester, _ad(id: 'camp-1', advertiser: 'Kasena Crafts'));
    expect(find.text('Kasena Crafts'), findsOneWidget);
    expect(find.text('Indigen World'), findsNothing);
    expect(find.byIcon(Icons.verified_rounded), findsNothing);
  });

  testWidgets('the More pill reaches the advert menu', (tester) async {
    final mores = <int>[];
    await _pump(tester, _ad(), mores: mores);
    await tester.tap(find.bySemanticsLabel('More options for this advert'));
    expect(mores, [1]);
  });

  testWidgets('large text still fits a small phone', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildIndigenDarkTheme(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.8)),
            child: child!,
          ),
          home: Scaffold(
            body: SingleChildScrollView(
              child: SponsoredReelPanel(
                ad: _ad(id: 'camp-2', advertiser: 'A long advertiser name'),
                muted: false,
                onToggleSound: () {},
                onMore: () {},
              ),
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
