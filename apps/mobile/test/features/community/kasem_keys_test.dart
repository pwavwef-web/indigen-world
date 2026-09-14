import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_toggle.dart';

import 'community_test_harness.dart';

void main() {
  testWidgets('composer replaces glyph buttons with keyboard setup', (
    tester,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(),
        profile: fakeProfile(),
        child: const ComposePostScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(KasemKeyboardToggle), findsOneWidget);
    expect(find.text('Use Kasem keyboard'), findsOneWidget);
    expect(find.byTooltip('High tone'), findsNothing);
    await tester.enterText(
      find.byKey(const Key('community-composer')),
      'How do I say hello?',
    );
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('community-composer')))
          .controller!
          .text,
      'How do I say hello?',
    );
  });
}
