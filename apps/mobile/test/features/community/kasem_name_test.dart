// The kente ring, and the name that earns it.
//
// A handle is `[a-z0-9_]{3,20}`, so six letters of the alphabet Kasem is
// written in can never appear in one. The ring therefore cannot be awarded for
// spelling something in Kasem — nobody can — so it is awarded for carrying a
// real Kassena name, folded into the ASCII a handle can hold.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/kasem_name_panel.dart';

import 'community_test_harness.dart';

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
      expect(foldKasemToAscii('Bá'), 'ba');
    });

    test('keeps only what a handle is allowed to be', () {
      expect(foldKasemToAscii('A-wine!'), 'awine');
      expect(foldKasemToAscii('  Paga  '), 'paga');
    });
  });

  group('whether a handle carries a name', () {
    final names = {for (final name in bundledKasemNames) name.ascii};

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
      // A device that has never reached Firebase still has the bundled seed,
      // but an empty set must never quietly award the ring to everybody.
      expect(isKasemHandle('nyaaba', const <String>{}), isFalse);
    });
  });

  testWidgets('an avatar works out its own ring from the handle', (
    tester,
  ) async {
    await tester.pumpWidget(
      communityHarness(
        repository: FakeCommunityRepository(),
        child: const Scaffold(
          body: Column(
            children: [
              CommunityAvatar(initials: 'NA', username: 'nyaaba'),
              CommunityAvatar(initials: 'JS', username: 'john_smith'),
            ],
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
        child: Scaffold(
          body: SingleChildScrollView(
            child: KasemNamePanel(currentHandle: '', onPick: picked.add),
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
}
