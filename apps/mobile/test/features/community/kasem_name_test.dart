// The kente ring, and the name that earns it.
//
// A handle is `[a-z0-9_]{3,20}`, so six letters of the alphabet Kasem is
// written in can never appear in one. The ring therefore cannot be awarded for
// spelling something in Kasem — nobody can — so it is awarded for carrying a
// real Kassena name, folded into the ASCII a handle can hold.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/kasem_name_panel.dart';

import 'community_test_harness.dart';

/// What the admin console has published, as far as these tests are concerned.
///
/// Nothing is bundled with the app: the offered list is the console's alone,
/// and it is empty until Firestore answers with one. So a test that needs names
/// has to publish its own, exactly as the console would.
const _published = <KasemName>[
  KasemName(name: 'Nyaaba', ascii: 'nyaaba'),
  KasemName(
    name: 'Paga',
    ascii: 'paga',
    kind: 'place',
    meaning: 'The town at the northern edge of Kassena country',
  ),
];

/// Puts [_published] in front of the widgets under [child].
///
/// `communityHarness` builds the root scope and takes no overrides beyond its
/// own, so this nests inside it. Both the panel and the avatar read these two
/// providers directly rather than through anything derived, which is what lets
/// a nested override reach them.
Widget _withPublishedNames(Widget child) => ProviderScope(
  overrides: [
    kasemNamesProvider.overrideWithValue(_published),
    kasemHandleSetProvider.overrideWithValue({
      for (final name in _published) name.ascii,
    }),
  ],
  child: child,
);

void main() {
  group('folding a name into a handle', () {
    test('turns the six letters a keyboard cannot type into ones it can', () {
      // ŋ becomes `ng` because that is how the sound is written when the letter
      // is unavailable; the rest fall back to their bare vowel.
      expect(foldKasemToAscii('Awɛlɩmwɛ'), 'awelimwe');
      expect(foldKasemToAscii('Bɔŋɔ'), 'bongo');
      expect(foldKasemToAscii('Kʋra'), 'kvra');
      expect(foldKasemToAscii('Nyaaba'), 'nyaaba');
    });

    test('drops tone, which a handle cannot carry either', () {
      expect(foldKasemToAscii('Bá'), 'ba');
      // The same word written with a combining acute rather than a precomposed
      // vowel — which is what the composer's tone keys produce.
      expect(foldKasemToAscii('Bá'), 'ba');
    });

    test('keeps only what a handle is allowed to be', () {
      expect(foldKasemToAscii('A-wine!'), 'awine');
      expect(foldKasemToAscii('  Paga  '), 'paga');
    });
  });

  group('whether a handle carries a name', () {
    final names = {for (final name in _published) name.ascii};

    test('the whole handle counts', () {
      expect(isKasemHandle('nyaaba', names), isTrue);
      expect(isKasemHandle('Nyaaba', names), isTrue);
    });

    test('and so does a part of it', () {
      // Somebody is not punished for adding a village or a number to a name
      // that was already taken.
      expect(isKasemHandle('nyaaba_paga', names), isTrue);
      expect(isKasemHandle('nyaaba7', names), isTrue);
      expect(isKasemHandle('paga_dancer', names), isTrue);
    });

    test('a name that is not on the list does not', () {
      expect(isKasemHandle('john_smith', names), isFalse);
      expect(isKasemHandle('nya', names), isFalse);
    });

    test('and nothing does when there is no list at all', () {
      // Which is the state of every device until Firestore answers. An empty
      // set must never quietly award the ring to everybody.
      expect(isKasemHandle('nyaaba', const <String>{}), isFalse);
    });
  });

  testWidgets('an avatar works out its own ring from the handle', (
    tester,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(),
        child: _withPublishedNames(
          const Scaffold(
            body: Column(
              children: [
                CommunityAvatar(initials: 'NA', username: 'nyaaba'),
                CommunityAvatar(initials: 'JS', username: 'john_smith'),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // The ring means something, so it is not left as a colour nobody can hear.
    expect(find.bySemanticsLabel('Carries a Kassena name'), findsOneWidget);
  });

  testWidgets('the panel offers names and hands back the folded form', (
    tester,
  ) async {
    final picked = <String>[];
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(),
        child: _withPublishedNames(
          Scaffold(
            body: SingleChildScrollView(
              child: KasemNamePanel(currentHandle: '', onPick: picked.add),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Take a Kassena name'), findsOneWidget);
    // Written properly on the chip; folded on the way into the field. That
    // difference is the whole reason the ring exists.
    expect(find.text('Nyaaba'), findsOneWidget);

    await tester.tap(find.text('Nyaaba'));
    await tester.pump();
    expect(picked, ['nyaaba']);
  });

  testWidgets('and offers nothing at all when nothing is published', (
    tester,
  ) async {
    // No override, so the list is what an un-seeded environment gives: empty.
    // The panel has to disappear rather than draw an empty rail, because the
    // server refuses every handle that is not on the published list and a name
    // offered here would be a name refused there.
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(),
        child: Scaffold(
          body: SingleChildScrollView(
            child: KasemNamePanel(currentHandle: '', onPick: (_) {}),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Take a Kassena name'), findsNothing);
    expect(find.text('Nyaaba'), findsNothing);
  });
}
