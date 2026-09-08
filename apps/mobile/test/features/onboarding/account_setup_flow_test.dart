// What happens after somebody signs in.
//
// Before this flow existed, signing in with Google closed a card and put the
// member back on the screen they came from with nothing to show for it: no
// handle, no name the community knew them by, no mark and an empty feed. These
// tests hold the five steps open, and pin the two decisions that make them
// bearable — that only the handle is compulsory, and that an account which
// already has a profile is never walked through any of it.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/onboarding/account_setup_flow.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

import '../community/community_test_harness.dart';

/// What the admin console has published, as far as these tests are concerned.
const _published = <KasemName>[
  KasemName(name: 'Nyaaba', ascii: 'nyaaba', meaning: 'Born on a market day'),
  KasemName(name: 'Awɛlɩmwɛ', ascii: 'awelimwe'),
];

/// Somebody already in the community, for the follow step to offer.
final _neighbour = fakeProfile(
  uid: 'awine-uid',
  username: 'awine',
  displayName: 'Awine Atulley',
);

Future<void> _pump(
  WidgetTester tester, {
  required FakeCommunityRepository repository,
  Widget? home,
  List<KasemName> published = const [],
  String? displayName = 'Ama Nsoh',
}) async {
  // These are long forms. The default 800x600 surface puts the button that
  // sends them below the bottom of a ListView, where it is never built.
  tester.view.physicalSize = const Size(1100, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        communityRepositoryProvider.overrideWithValue(repository),
        currentUidProvider.overrideWithValue('ama-uid'),
        currentDisplayNameProvider.overrideWithValue(displayName),
        currentPhotoUrlProvider.overrideWithValue(null),
        myCommunityProfileProvider.overrideWith(
          (ref) => Stream<CommunityProfile?>.value(null),
        ),
        kasemNamesProvider.overrideWithValue(published),
        kasemHandleSetProvider.overrideWithValue({
          for (final name in published) name.ascii,
        }),
        myKasemNameRequestsProvider.overrideWith(
          (ref) => Stream.value(const <KasemNameRequest>[]),
        ),
        kasemNameRequestsRepositoryProvider.overrideWithValue(null),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: home ?? const AccountSetupFlow(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Walks welcome -> Kassena name, taking [name] when one is given.
Future<void> _toProfileStep(WidgetTester tester, {String? name}) async {
  await tester.tap(find.byKey(const Key('setup-welcome-continue')));
  await tester.pumpAndSettle();
  if (name == null) {
    await tester.tap(find.byKey(const Key('setup-skip-name')));
  } else {
    await tester.tap(find.text(name));
  }
  await tester.pumpAndSettle();
}

void main() {
  group('the setup flow', () {
    testWidgets('opens by saying something happened, and by whose name', (
      tester,
    ) async {
      // The whole complaint: signing in looked identical to nothing happening.
      await _pump(tester, repository: FakeCommunityRepository());

      expect(find.text('Welcome, Ama'), findsOneWidget);
      expect(find.text('Take a Kassena name'), findsOneWidget);
      expect(find.text('Verify your number'), findsOneWidget);
      expect(find.text('Find people to follow'), findsOneWidget);
    });

    testWidgets('offers the published names, and nothing else', (tester) async {
      // The published collection is the only list there is. A name offered
      // from anywhere else is a name the callable then refuses.
      await _pump(
        tester,
        repository: FakeCommunityRepository(),
        published: _published,
      );
      await tester.tap(find.byKey(const Key('setup-welcome-continue')));
      await tester.pumpAndSettle();

      expect(find.text('Nyaaba'), findsOneWidget);
      expect(find.text('Awɛlɩmwɛ'), findsOneWidget);
      // The fold is drawn beside the name, because the handle a name earns is
      // its fold and the two are otherwise never on screen together.
      expect(find.textContaining('@awelimwe'), findsOneWidget);
    });

    testWidgets('a taken name arrives in the handle field already folded', (
      tester,
    ) async {
      final repository = FakeCommunityRepository();
      await _pump(tester, repository: repository, published: _published);
      await _toProfileStep(tester, name: 'Awɛlɩmwɛ');

      expect(find.text('You will appear as @awelimwe'), findsOneWidget);
      expect(find.textContaining('You took Awɛlɩmwɛ'), findsOneWidget);
    });

    testWidgets('the handle is the only step with no way past it', (
      tester,
    ) async {
      await _pump(tester, repository: FakeCommunityRepository());
      await _toProfileStep(tester);

      // Every other step says how to leave it. This one does not.
      expect(find.byKey(const Key('setup-skip-name')), findsNothing);
      expect(find.byKey(const Key('community-setup-submit')), findsOneWidget);
    });

    testWidgets('writes the profile and walks on to the number', (
      tester,
    ) async {
      final repository = FakeCommunityRepository();
      await _pump(tester, repository: repository, published: _published);
      await _toProfileStep(tester, name: 'Nyaaba');

      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();

      expect(repository.createdProfiles, hasLength(1));
      final created = repository.createdProfiles.single;
      expect(created.username, 'nyaaba');
      // The display name came from the signed-in Google account rather than
      // being asked for a second time.
      expect(created.displayName, 'Ama Nsoh');

      expect(find.text('Prove there is somebody here'), findsOneWidget);
    });

    testWidgets('the number can be skipped, and the people after it', (
      tester,
    ) async {
      final repository = FakeCommunityRepository(profiles: [_neighbour]);
      await _pump(tester, repository: repository);
      await _toProfileStep(tester);
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('setup-skip-phone')));
      await tester.pumpAndSettle();

      // The list is the point of the step: an empty feed on day one is what
      // sends somebody back to the store.
      expect(find.text('People to read'), findsOneWidget);
      expect(find.text('Awine Atulley'), findsOneWidget);

      await tester.tap(find.byKey(const Key('setup-follow-continue')));
      await tester.pumpAndSettle();

      // The end names the handle that was claimed, and says what was skipped
      // rather than congratulating in general.
      expect(find.text('You are in, @amansoh'), findsOneWidget);
      expect(
        find.text('Your number is still unverified'),
        findsOneWidget,
      );
    });

    testWidgets('never offers the member themselves to follow', (tester) async {
      // `suggestedProfiles` is newest-first, and the newest profile in the
      // community is the one written ninety seconds ago on the step before.
      final repository = FakeCommunityRepository();
      await _pump(tester, repository: repository);
      await _toProfileStep(tester);
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('setup-skip-phone')));
      await tester.pumpAndSettle();

      expect(find.text('You are early'), findsOneWidget);
      expect(find.text('Ama Nsoh'), findsNothing);
    });

    testWidgets('walking back before the handle is claimed, and not after', (
      tester,
    ) async {
      await _pump(tester, repository: FakeCommunityRepository());

      await tester.tap(find.byKey(const Key('setup-welcome-continue')));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Back'), findsOneWidget);

      await tester.tap(find.byKey(const Key('setup-skip-name')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();

      // A handle is claimed once and frozen, so a step offering to choose one
      // again would be offering something the registry refuses.
      expect(find.byTooltip('Back'), findsNothing);
    });
  });

  group('the movement between steps', () {
    testWidgets('is a transition, not a cut', (tester) async {
      // The steps are one thing with a length. A bar that jumps and a page that
      // snaps are five screens again, which is what this replaced.
      await _pump(tester, repository: FakeCommunityRepository());

      double progress() => tester
          .widget<LinearProgressIndicator>(
            find.byType(LinearProgressIndicator),
          )
          .value!;

      expect(progress(), 0);

      await tester.tap(find.byKey(const Key('setup-welcome-continue')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 120));

      // A fifth of the way along, and still moving: mid-flight rather than
      // already arrived.
      final midway = progress();
      expect(midway, greaterThan(0));
      expect(midway, lessThan(0.2));

      await tester.pumpAndSettle();
      expect(progress(), closeTo(0.2, 0.001));
    });
  });

  group('every step on a phone', () {
    // Dense forms on a 390x844 screen. An overflow anywhere in here throws,
    // and the test framework turns that into a failure -- which is the whole
    // point of walking the flow at the size it is actually read at.
    testWidgets('lays out with nothing running off the edge', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            communityRepositoryProvider.overrideWithValue(
              FakeCommunityRepository(profiles: [_neighbour]),
            ),
            currentUidProvider.overrideWithValue('ama-uid'),
            currentDisplayNameProvider.overrideWithValue('Ama Nsoh'),
            currentPhotoUrlProvider.overrideWithValue(null),
            myCommunityProfileProvider.overrideWith(
              (ref) => Stream<CommunityProfile?>.value(null),
            ),
            kasemNamesProvider.overrideWithValue(_published),
            kasemHandleSetProvider.overrideWithValue({
              for (final name in _published) name.ascii,
            }),
            myKasemNameRequestsProvider.overrideWith(
              (ref) => Stream.value(const <KasemNameRequest>[]),
            ),
            kasemNameRequestsRepositoryProvider.overrideWithValue(null),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: buildIndigenTheme(),
            home: const AccountSetupFlow(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('setup-welcome-continue')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nyaaba'));
      await tester.pumpAndSettle();
      // The profile form is longer than a phone screen, as forms are. The
      // panel of Kassena names inside it is a second scrollable, so the walk
      // has to say which list it means.
      await tester.scrollUntilVisible(
        find.byKey(const Key('community-setup-submit')),
        160,
        scrollable: find
            .descendant(
              of: find.byKey(const PageStorageKey('community-setup-scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.tap(find.byKey(const Key('community-setup-submit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('setup-skip-phone')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('setup-follow-continue')));
      await tester.pumpAndSettle();

      expect(find.text('You are in, @nyaaba'), findsOneWidget);
    });
  });

  group('the gate', () {
    testWidgets('runs for an account with no profile', (tester) async {
      await _pump(
        tester,
        repository: FakeCommunityRepository(),
        home: const _GateHost(),
      );

      await tester.tap(find.text('sign in'));
      await tester.pumpAndSettle();

      expect(find.text('Welcome, Ama'), findsOneWidget);
    });

    testWidgets('does nothing at all for one that already has one', (
      tester,
    ) async {
      // Signing back in on a new phone should land you where you were, not
      // walk you through choosing a handle you chose months ago.
      final mine = fakeProfile(uid: 'ama-uid', username: 'ama');
      await _pump(
        tester,
        repository: FakeCommunityRepository(profiles: [mine]),
        home: const _GateHost(),
      );

      await tester.tap(find.text('sign in'));
      await tester.pumpAndSettle();

      expect(find.text('Welcome, Ama'), findsNothing);
      expect(find.text('sign in'), findsOneWidget);
    });
  });
}

/// A screen with nothing on it but the hand-over the sign-in card makes.
class _GateHost extends StatelessWidget {
  const _GateHost();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: TextButton(
        onPressed: () => ensureAccountSetup(context),
        child: const Text('sign in'),
      ),
    ),
  );
}
