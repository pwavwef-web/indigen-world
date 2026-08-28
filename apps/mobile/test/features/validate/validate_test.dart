// The validation desk.
//
// Two things matter here and both are access control. The tab must appear only
// for an account the backend would actually accept as a reviewer — anybody
// else gets a screen made entirely of permission errors — and the decisions
// offered on an item must be the ones `decideSubmission` will not refuse.

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/validate_screen.dart';
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
    test('the reviewer roles match the ones the rules and functions accept', () {
      // Mirrors isValidator() in firestore.rules and requireRole(_, 'validator')
      // in services/functions/src/auth.ts. If these drift, the app shows a queue
      // the backend refuses to serve.
      expect(kReviewerRoles, {'validator', 'reviewer', 'admin', 'super_admin'});
      expect(kReviewerRoles.contains('creator'), isFalse);
      expect(kReviewerRoles.contains('contributor'), isFalse);
    });
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
        _item(status: 'APPROVED', publicationPermission: true).availableDecisions,
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
            theme: buildIndigenTheme(),
            home: const ValidateScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('The review desk.'), findsOneWidget);
      expect(find.text('VALIDATE · VALIDATOR'), findsOneWidget);
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
          child: MaterialApp(theme: buildIndigenTheme(), home: const AppShell()),
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

    testWidgets('an ordinary member never sees a Validate tab', (tester) async {
      expect(await railLabels(tester, null), [
        'Explore',
        'Learn',
        'Community',
        'Collection',
        'Contribute',
      ]);
    });

    testWidgets('a creator does not get one either', (tester) async {
      // Being able to contribute is not being able to judge contributions.
      expect(await railLabels(tester, 'creator'), isNot(contains('Validate')));
      expect(await railLabels(tester, 'contributor'), isNot(contains('Validate')));
    });

    testWidgets('a validator gets one, after the five content destinations', (
      tester,
    ) async {
      expect(await railLabels(tester, 'validator'), [
        'Explore',
        'Learn',
        'Community',
        'Collection',
        'Contribute',
        'Validate',
      ]);
    });

    testWidgets('so do reviewers and admins', (tester) async {
      for (final role in const ['reviewer', 'admin', 'super_admin']) {
        expect(await railLabels(tester, role), contains('Validate'), reason: role);
      }
    });
  });
}
