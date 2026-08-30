// The row of Kasem letters above the keyboard.
//
// Kasem is written with `ɛ`, `ɔ`, `ŋ`, `ə`, `ʋ` and `ɩ`, and tone is an accent
// over a vowel. No phone ships a keyboard that can type any of it, so a
// community asked to write in Kasem was writing `e` for `ɛ` and `n` for `ŋ` —
// words the dictionary cannot match, in an archive that is meant to be the
// language exactly.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/widgets/kasem_key_bar.dart';

import 'community_test_harness.dart';

void main() {
  final amina = fakeProfile();

  Future<void> pumpComposer(WidgetTester tester) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(),
        profile: amina,
        child: const ComposePostScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets('the composer offers every letter a keyboard cannot type', (
    tester,
  ) async {
    await pumpComposer(tester);

    expect(find.byType(KasemKeyBar), findsOneWidget);
    for (final letter in KasemKeyBar.letters) {
      expect(find.text(letter), findsOneWidget);
    }
    expect(find.byTooltip('High tone'), findsOneWidget);
    expect(find.byTooltip('Low tone'), findsOneWidget);
  });

  testWidgets('a letter lands at the caret rather than at the end', (
    tester,
  ) async {
    await pumpComposer(tester);

    final field = find.byKey(const Key('community-composer'));
    await tester.enterText(field, 'ba');
    await tester.pump();

    // Caret between the two letters, as if somebody had gone back to fix a word.
    final composer = tester.widget<TextField>(field).controller!;
    composer.selection = const TextSelection.collapsed(offset: 1);
    await tester.pump();

    await tester.tap(find.text('ɛ'));
    await tester.pump();

    expect(composer.text, 'bɛa');
    expect(composer.selection.baseOffset, 2);
    // And the counter that reads the field has been told.
    expect(find.text('3/${CommunityRepository.maxPostLength}'), findsOneWidget);
  });

  testWidgets('a tone mark settles on the vowel before it', (tester) async {
    await pumpComposer(tester);

    final field = find.byKey(const Key('community-composer'));
    await tester.enterText(field, 'ba');
    await tester.pump();
    await tester.tap(find.byTooltip('High tone'));
    await tester.pump();

    final composer = tester.widget<TextField>(field).controller!;
    // One combining acute after the vowel: `bá`, in the two code points the
    // orthography is actually written with.
    expect(composer.text, 'bá');
  });
}
