import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';

import 'community_test_harness.dart';

/// The feed has to be legible in both appearances, and — because a post row is
/// now a bare row on the page rather than a card — it has to stop painting a
/// pale surface of its own the moment the ground goes dark.
void main() {
  final amina = fakeProfile();

  Future<void> pumpFeed(WidgetTester tester, {required Brightness brightness}) {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [
        fakePost(id: 'post-1', text: 'De zaanem. Ko gara.'),
        fakePost(
          id: 'post-2',
          authorId: 'nyaaba-uid',
          authorName: 'Nyaaba Atanga',
          authorUsername: 'nyaaba',
          text: 'Amo wora a zamese Kasem mo.',
        ),
      ],
    );
    return tester
        .pumpWidget(
          communityHarness(
            repository: repository,
            profile: amina,
            theme: buildIndigenThemeFor(brightness),
            child: const CommunityScreen(),
          ),
        )
        .then((_) => tester.pump())
        .then((_) => tester.pump(const Duration(milliseconds: 300)));
  }

  /// Every colour a widget resolved, in paint order.
  BrandPalette paletteOf(WidgetTester tester) =>
      tester.element(find.byType(CommunityPostCard).first).brand;

  testWidgets('the feed reads in daylight', (tester) async {
    await pumpFeed(tester, brightness: Brightness.light);

    expect(find.byType(CommunityPostCard), findsNWidgets(2));
    final brand = paletteOf(tester);
    expect(brand.brightness, Brightness.light);

    // The author line is drawn in the palette's ink, not in a fixed near-black
    // that would vanish against a dark ground.
    final name = tester.widget<Text>(find.text('Amina Ayaribisa').first);
    expect(name.style?.color, brand.ink);
  });

  testWidgets('the feed reads at night', (tester) async {
    await pumpFeed(tester, brightness: Brightness.dark);

    expect(find.byType(CommunityPostCard), findsNWidgets(2));
    final brand = paletteOf(tester);
    expect(brand.brightness, Brightness.dark);

    final name = tester.widget<Text>(find.text('Amina Ayaribisa').first);
    expect(name.style?.color, brand.ink);
    // Near-white on charcoal, which is the whole point of the switch.
    expect(brand.ink.computeLuminance(), greaterThan(0.6));
    expect(brand.background.computeLuminance(), lessThan(0.05));
  });

  testWidgets('a post row carries no surface of its own', (tester) async {
    await pumpFeed(tester, brightness: Brightness.dark);

    // The row is a divider and padding over the page ground. A fill or a
    // gradient on the outermost box would light the whole dark feed up.
    final row = tester.widget<DecoratedBox>(
      find
          .descendant(
            of: find.byType(CommunityPostCard).first,
            matching: find.byType(DecoratedBox),
          )
          .first,
    );
    final decoration = row.decoration as BoxDecoration;
    expect(decoration.color, isNull);
    expect(decoration.gradient, isNull);
    expect(decoration.boxShadow, isNull);
    expect(decoration.border, isNotNull);
  });

  testWidgets('the palette carries both appearances and lerps between them', (
    tester,
  ) async {
    // Halfway through a theme change the palette is still a palette — every
    // token resolved, and the brightness already committed to the destination.
    final midway = BrandPalette.light.lerp(BrandPalette.dark, 0.75);
    expect(midway.brightness, Brightness.dark);
    expect(midway.ink, isNot(BrandPalette.light.ink));
    expect(midway.ink, isNot(BrandPalette.dark.ink));

    // And it is a value, so a CustomPainter keying `shouldRepaint` on it
    // repaints exactly when the theme moves.
    expect(BrandPalette.light.lerp(BrandPalette.dark, 1), BrandPalette.dark);
    expect(BrandPalette.light, isNot(BrandPalette.dark));
  });
}
