// The review desk.
//
// Two things matter here and both are access control. The way in must appear
// only for an account the backend would actually accept as a reviewer —
// anybody else gets a screen made entirely of permission errors — and the
// decisions offered on an item must be the ones `decideSubmission` will not
// refuse.
//
// The desk is no longer a tab. The rail carries five content destinations for
// everybody, and the desk is reached from a card on Contribute, which is where
// the work it reviews is sent from.

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/validate_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

ReviewItem _item({
  String status = 'SUBMITTED',
  String collectionKind = '',
  bool publicationPermission = false,
  bool participantsConsented = true,
  bool usesThirdPartyMaterial = false,
  bool? involvesMinors,
}) => ReviewItem(
  id: 'submission-1',
  title: 'Harvest drumming at Paga',
  status: status,
  collectionKind: collectionKind,
  format: 'Ceremonial',
  dialect: 'Paga',
  body: 'Recorded at the close of the harvest.',
  description: '',
  source: 'Ayaribisa family',
  notes: '',
  authorUid: 'member-1',
  publicationPermission: publicationPermission,
  participantsConsented: participantsConsented,
  usesThirdPartyMaterial: usesThirdPartyMaterial,
  involvesMinors: involvesMinors,
);

void main() {
  group('who may review', () {
    test(
      'the reviewer roles match the ones the rules and functions accept',
      () {
        // Mirrors isValidator() in firestore.rules and requireRole(_, 'validator')
        // in services/functions/src/auth.ts. If these drift, the app shows a queue
        // the backend refuses to serve.
        expect(kReviewerRoles, {
          'validator',
          'reviewer',
          'admin',
          'super_admin',
        });
        expect(kReviewerRoles.contains('creator'), isFalse);
        expect(kReviewerRoles.contains('contributor'), isFalse);
      },
    );
  });

  group('which decisions are offered', () {
    test('submitted work can be approved, rejected or escalated', () {
      expect(_item().availableDecisions, [
        ReviewDecision.approve,
        ReviewDecision.requestRevision,
        ReviewDecision.reject,
        ReviewDecision.escalateCultural,
      ]);
    });

    test('a Collection contribution is never offered a revision', () {
      // The backend refuses REQUEST_REVISION on one outright, so offering the
      // button would only ever produce an error.
      expect(
        _item(collectionKind: 'music').availableDecisions,
        isNot(contains(ReviewDecision.requestRevision)),
      );
    });

    test('publishing is offered only where permission was granted', () {
      expect(
        _item(
          status: 'APPROVED',
          publicationPermission: true,
        ).availableDecisions,
        contains(ReviewDecision.publish),
      );
      // Approved but not for publication: the contributor said no, and the
      // callable enforces it. The button does not appear.
      expect(
        _item(status: 'APPROVED').availableDecisions,
        isNot(contains(ReviewDecision.publish)),
      );
    });

    test('published work is settled', () {
      expect(_item(status: 'PUBLISHED').availableDecisions, isEmpty);
    });

    test('a negative decision has to carry a reason', () {
      expect(ReviewDecision.reject.requiresFeedback, isTrue);
      expect(ReviewDecision.requestRevision.requiresFeedback, isTrue);
      // Approving does not: the work speaks for itself.
      expect(ReviewDecision.approve.requiresFeedback, isFalse);
      expect(ReviewDecision.publish.requiresFeedback, isFalse);
    });
  });

  group('the queue', () {
    testWidgets('an account with no role is shown nothing to review', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [userRoleProvider.overrideWith((ref) async => null)],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,

            theme: buildIndigenTheme(),
            home: const ValidateScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('Nothing is waiting for review'), findsOneWidget);
      expect(find.byType(ReviewFlag), findsNothing);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('a validator gets the queue switcher and their role in view', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            userRoleProvider.overrideWith((ref) async => 'validator'),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,

            theme: buildIndigenTheme(),
            home: const ValidateScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 400));

      // Its own route now, so it carries its own title bar and its own way
      // back rather than borrowing the shell's.
      expect(find.text('Review desk'), findsOneWidget);
      expect(find.text('Waiting on you.'), findsOneWidget);
      expect(find.text('REVIEW · VALIDATOR'), findsOneWidget);

      // Two halves now: contributions and adverts are both reviewed here.
      expect(find.text('Contributions'), findsOneWidget);
      expect(find.text('Adverts'), findsOneWidget);

      for (final queue in const [
        'Waiting',
        'Approved',
        'Escalated',
        'Published',
      ]) {
        expect(find.text(queue), findsOneWidget);
      }
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('the advert half has its own queues', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            userRoleProvider.overrideWith((ref) async => 'validator'),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,

            theme: buildIndigenTheme(),
            home: const ValidateScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 400));

      await tester.tap(find.text('Adverts'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      // A campaign's life is not a submission's, so the pills are not either.
      for (final queue in const ['Waiting', 'Running', 'Paused', 'Rejected']) {
        expect(find.text(queue), findsOneWidget);
      }
      // The contribution queues are gone with the half they belong to.
      expect(find.text('Escalated'), findsNothing);
      expect(find.text('Published'), findsNothing);
      await tester.pump(const Duration(milliseconds: 400));
    });
  });

  group('the tab itself', () {
    late AppDatabase database;

    setUp(() => database = AppDatabase.forTesting(NativeDatabase.memory()));
    tearDown(() => database.close());

    Future<List<String>> railLabels(WidgetTester tester, String? role) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            userRoleProvider.overrideWith((ref) async => role),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: buildIndigenTheme(),
            home: const AppShell(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));
      final labels = tester
          .widget<FrostedNavBar>(find.byType(FrostedNavBar))
          .items
          .map((item) => item.label)
          .toList();
      await tester.pump(const Duration(milliseconds: 500));
      return labels;
    }

    const contentRail = [
      'Explore',
      'Learn',
      'Community',
      'Collection',
      'Contribute',
    ];

    testWidgets('the rail is the same five for everybody', (tester) async {
      // Whoever is holding the phone. A rail that grows a sixth item for staff
      // changes the shape of the one strip of the app everybody shares, and
      // moves every other destination under a different thumb position.
      for (final role in const [
        null,
        'contributor',
        'creator',
        'validator',
        'reviewer',
        'admin',
        'super_admin',
      ]) {
        expect(await railLabels(tester, role), contentRail, reason: '$role');
      }
    });
  });

  group('the way in', () {
    late AppDatabase database;

    setUp(() => database = AppDatabase.forTesting(NativeDatabase.memory()));
    tearDown(() => database.close());

    Future<void> pumpContribute(WidgetTester tester, String? role) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            userRoleProvider.overrideWith((ref) async => role),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,

            theme: buildIndigenTheme(),
            home: const ContributeScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));
    }

    testWidgets('a reviewer gets the desk card on Contribute', (tester) async {
      await pumpContribute(tester, 'validator');
      expect(find.text('REVIEW DESK'), findsOneWidget);
      // Nothing is in the queue in a test, and the card says so rather than
      // showing a badge over a nought.
      expect(find.text('Nothing is waiting'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('an ordinary member gets no card at all', (tester) async {
      // Not a locked one, not a greyed-out row. A door somebody can never open
      // is worse than no door: it invites the question and then refuses to
      // answer it.
      for (final role in const [null, 'contributor', 'creator']) {
        await pumpContribute(tester, role);
        expect(find.text('REVIEW DESK'), findsNothing, reason: '$role');
        await tester.pump(const Duration(milliseconds: 400));
      }
    });
  });
}
