// The face sits on the cover, not under it.
//
// Slivers paint in list order with the first one on top, so an avatar drawn in
// the header sliver and merely nudged upwards to overlap the cover above it was
// painted over by that cover — the top of everybody's photograph was sliced
// off. The avatar belongs to the app bar now, which is the layer doing the
// covering, and hangs off its bottom edge instead.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';

const _profile = CommunityProfile(
  uid: 'member-1',
  username: 'ayine',
  displayName: 'Ayine Atia',
  bio: 'Drummer from Paga.',
);

Future<void> _pumpProfile(WidgetTester tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        communityProfileProvider(
          _profile.uid,
        ).overrideWith((ref) => Stream.value(_profile)),
      ],
      child: MaterialApp(
        theme: buildIndigenTheme(),
        home: const CommunityProfileScreen(uid: 'member-1'),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('the avatar is drawn by the bar that holds the cover', (
    tester,
  ) async {
    await _pumpProfile(tester);

    // The whole fix in one assertion: whichever sliver draws the avatar is the
    // one that decides whether the cover can paint over it.
    expect(
      find.descendant(
        of: find.byType(SliverAppBar),
        matching: find.byType(CommunityAvatar),
      ),
      findsOneWidget,
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('and still overhangs it rather than sitting clear', (
    tester,
  ) async {
    await _pumpProfile(tester);

    final avatar = tester.getRect(find.byType(CommunityAvatar).first);
    // The cover's own box: a SliverAppBar is not a box, and the flexible space
    // is laid out to exactly the extent the bar currently has.
    final cover = tester.getRect(find.byType(FlexibleSpaceBar));

    // Part on the cover, most of it below: the overlap is the look, and losing
    // it while fixing the paint order would be trading one bug for another.
    expect(avatar.top, lessThan(cover.bottom));
    expect(avatar.bottom, greaterThan(cover.bottom));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
