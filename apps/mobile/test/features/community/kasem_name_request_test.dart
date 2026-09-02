// Asking for a Kassena name the published list has never heard of.
//
// The list is curated, so it was always going to be missing somebody's
// grandmother. Before this existed, a member who typed a real name into the
// handle field was told "Not a Kassena name yet" and given nothing to do about
// it — a refusal that was true and useless at once. These tests hold the two
// ways out of that dead end open, and pin the one invisible step the whole
// feature turns on: the fold from the name as it is written to the ASCII a
// handle can hold.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/claim_kasem_name_screen.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/request_kasem_name_screen.dart';

import 'community_test_harness.dart';

/// What the admin console has published, as far as these tests are concerned.
const _published = <KasemName>[KasemName(name: 'Nyaaba', ascii: 'nyaaba')];

/// A request already in the queue, as the member's own stream reports it.
KasemNameRequest _pending(String ascii) => KasemNameRequest(
  id: 'req-1',
  uid: 'amina-uid',
  name: ascii,
  ascii: ascii,
  status: 'pending',
  note: 'My grandmother bears it.',
);

/// Records what was sent, and never reaches Firebase.
class _FakeRequests implements KasemNameRequestsRepository {
  _FakeRequests({this.failure});

  /// Thrown from [submit] when set — the callable's refusals reach the screen
  /// as one of these.
  final KasemNameRequestFailure? failure;

  final sent = <Map<String, String>>[];

  @override
  Stream<List<KasemNameRequest>> watchMine(String uid) =>
      Stream.value(const <KasemNameRequest>[]);

  @override
  Future<void> submit({
    required String name,
    required String meaning,
    required String kind,
    required String note,
    required String handle,
  }) async {
    final failure = this.failure;
    if (failure != null) throw failure;
    sent.add({
      'name': name,
      'meaning': meaning,
      'kind': kind,
      'note': note,
      'handle': handle,
    });
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
    '${invocation.memberName} is not faked in _FakeRequests',
  );
}

/// Mounts [child] with everything these screens read overridden at the root.
///
/// Overridden at the root rather than in a nested scope on purpose:
/// `pendingKasemNameAsciiProvider` is derived from
/// `myKasemNameRequestsProvider`, and a derived provider resolves its
/// dependencies in the container it was created in — so a nested override of
/// the source would be read by the screen and ignored by everything derived
/// from it.
///
/// The surface is made tall as well as wide. These are long forms, and the
/// default 800×600 test window puts the button that sends them below the
/// bottom of a `ListView`, where it is never built and cannot be tapped.
Future<void> _pump(
  WidgetTester tester, {
  required Widget child,
  List<KasemName> published = const [],
  List<KasemNameRequest> requests = const [],
  KasemNameRequestsRepository? repository,
}) async {
  tester.view.physicalSize = const Size(1000, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        kasemNamesProvider.overrideWithValue(published),
        kasemHandleSetProvider.overrideWithValue({
          for (final name in published) name.ascii,
        }),
        myKasemNameRequestsProvider.overrideWith(
          (ref) => Stream.value(requests),
        ),
        kasemNameRequestsRepositoryProvider.overrideWithValue(repository),
      ],
      child: MaterialApp(theme: buildIndigenTheme(), home: child),
    ),
  );
  await tester.pump();
}

Finder get _sendButton => find.byKey(const Key('request-name-action'));

bool _disabled(WidgetTester tester, Finder button) =>
    tester.widget<FilledButton>(button).onPressed == null;

/// Fills the request form, leaving the name to the caller.
Future<void> _writeNote(WidgetTester tester) async {
  await tester.enterText(
    find.byKey(const Key('request-note-field')),
    'My grandmother in Chiana bears this name.',
  );
  await tester.pump();
}

void main() {
  group('a handle that could be asked for', () {
    test('has to be shaped like a handle before it is offered', () {
      // A screen that offers to ask for `@7nyaaba` is a screen offering a
      // request the callable will refuse, with no way for the member to know
      // why.
      expect(isHandleShaped('awelimwe'), isTrue);
      expect(isHandleShaped('awelimwe_paga'), isTrue);
      expect(isHandleShaped('7awelimwe'), isFalse);
      expect(isHandleShaped('aw'), isFalse);
      expect(isHandleShaped(''), isFalse);
    });
  });

  group('asking for a name', () {
    testWidgets('shows what the name folds to as it is typed', (tester) async {
      // The whole feature turns on this one step, and it is otherwise
      // invisible: a member cannot tell that `Awɛlɩmwɛ` and `Awelimwe` end at
      // the same handle, or what they will end up being called.
      await _pump(
        tester,
        child: const RequestKasemNameScreen(),
        repository: _FakeRequests(),
      );

      await tester.enterText(
        find.byKey(const Key('request-name-field')),
        'Awɛlɩmwɛ',
      );
      await tester.pump();

      expect(
        tester.widget<Text>(find.byKey(const Key('request-fold-preview'))).data,
        'A handle could be @awelimwe',
      );
    });

    testWidgets('will not send a name too short to be a handle', (
      tester,
    ) async {
      await _pump(
        tester,
        child: const RequestKasemNameScreen(),
        repository: _FakeRequests(),
      );

      await tester.enterText(find.byKey(const Key('request-name-field')), 'Bá');
      await tester.pump();
      await _writeNote(tester);

      // Tone is dropped, which leaves two letters — and a handle needs three,
      // so approving it would publish a name nobody could ever take.
      expect(
        tester.widget<Text>(find.byKey(const Key('request-fold-preview'))).data,
        'That gives only "ba" — a handle needs three letters',
      );
      expect(_disabled(tester, _sendButton), isTrue);
    });

    testWidgets('sends what was typed and then stops', (tester) async {
      final repository = _FakeRequests();
      await _pump(
        tester,
        child: const RequestKasemNameScreen(),
        repository: repository,
      );

      await tester.enterText(
        find.byKey(const Key('request-name-field')),
        'Awɛlɩmwɛ',
      );
      await tester.pump();
      await _writeNote(tester);
      expect(_disabled(tester, _sendButton), isFalse);

      await tester.tap(_sendButton);
      await tester.pumpAndSettle();

      expect(repository.sent, hasLength(1));
      expect(repository.sent.single['name'], 'Awɛlɩmwɛ');
      // The kind defaults rather than being left empty, and no handle is
      // attached unless the member came from the claim screen.
      expect(repository.sent.single['kind'], 'given');
      expect(repository.sent.single['handle'], '');

      // Nothing happens next that the member can watch, so the screen says so
      // and ends rather than popping onto a screen that cannot show it.
      expect(find.text('Sent for review'), findsOneWidget);
    });

    testWidgets("says the callable's own words when it refuses", (
      tester,
    ) async {
      await _pump(
        tester,
        child: const RequestKasemNameScreen(),
        repository: _FakeRequests(
          failure: const KasemNameRequestFailure(
            'Nyaaba is already on the list — you can take it now, without '
            'asking.',
          ),
        ),
      );

      await tester.enterText(
        find.byKey(const Key('request-name-field')),
        'Nyaaba',
      );
      await tester.pump();
      await _writeNote(tester);

      await tester.tap(_sendButton);
      await tester.pumpAndSettle();

      expect(find.textContaining('already on the list'), findsOneWidget);
      expect(find.text('Sent for review'), findsNothing);
    });

    testWidgets('will not let somebody ask twice for the same name', (
      tester,
    ) async {
      await _pump(
        tester,
        child: const RequestKasemNameScreen(initialName: 'Awɛlɩmwɛ'),
        repository: _FakeRequests(),
        requests: [_pending('awelimwe')],
      );

      await _writeNote(tester);

      // Said here rather than discovered at the callable, which refuses a
      // second ask and would read as a bug.
      expect(find.textContaining('already asked for this one'), findsOneWidget);
      expect(_disabled(tester, _sendButton), isTrue);
    });

    testWidgets('says approval does both halves when a handle came with it', (
      tester,
    ) async {
      await _pump(
        tester,
        child: const RequestKasemNameScreen(
          initialName: 'awelimwe',
          handle: 'awelimwe',
        ),
        repository: _FakeRequests(),
      );

      expect(find.textContaining('gives you @awelimwe'), findsOneWidget);
    });
  });

  group('the claim screen', () {
    testWidgets('offers to ask even when nothing is published at all', (
      tester,
    ) async {
      // The empty list used to be the end of the screen. It is now the loudest
      // reason to ask.
      await _pump(
        tester,
        child: ClaimKasemNameScreen(profile: fakeProfile()),
        repository: _FakeRequests(),
      );

      expect(find.text("My name isn't here"), findsOneWidget);

      await tester.tap(find.text("My name isn't here"));
      await tester.pumpAndSettle();
      expect(find.text('Ask for a name'), findsOneWidget);
    });

    testWidgets('turns "not a Kassena name yet" into an offer', (tester) async {
      await _pump(
        tester,
        child: ClaimKasemNameScreen(profile: fakeProfile()),
        published: _published,
        repository: _FakeRequests(),
      );

      // The member's own handle carries no published name, which is precisely
      // the moment the whitelist request is worth offering.
      expect(find.text('Ask for @amina_paga to be recognised'), findsOneWidget);

      await tester.tap(find.text('Ask for @amina_paga to be recognised'));
      await tester.pumpAndSettle();
      expect(find.textContaining('gives you @amina_paga'), findsOneWidget);
    });

    testWidgets('says so instead when that request is already in the queue', (
      tester,
    ) async {
      await _pump(
        tester,
        child: ClaimKasemNameScreen(profile: fakeProfile()),
        published: _published,
        requests: [_pending('amina_paga')],
        repository: _FakeRequests(),
      );

      expect(find.text('You already asked for this'), findsOneWidget);
      expect(find.text('Ask for @amina_paga to be recognised'), findsNothing);
    });

    testWidgets('still spends the one change behind a confirmation', (
      tester,
    ) async {
      // The ordinary claim path is untouched by any of the above: it is still
      // one change, ever, and it still says so before it is spent.
      await _pump(
        tester,
        child: ClaimKasemNameScreen(profile: fakeProfile()),
        published: _published,
        repository: _FakeRequests(),
      );

      await tester.enterText(
        find.byKey(const Key('claim-handle-field')),
        'nyaaba',
      );
      await tester.pump();

      await tester.tap(find.byKey(const Key('claim-handle-action')));
      await tester.pumpAndSettle();

      expect(find.text('Become @nyaaba?'), findsOneWidget);
      expect(find.textContaining('cannot be changed again'), findsOneWidget);

      // Backing out spends nothing and reaches no callable.
      await tester.tap(find.text('Not yet'));
      await tester.pumpAndSettle();
      expect(find.text('Become @nyaaba?'), findsNothing);
    });
  });
}
