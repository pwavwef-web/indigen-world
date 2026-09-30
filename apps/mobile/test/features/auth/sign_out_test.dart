// Signing out takes this phone's push registration with it, first.
//
// The Community drawer once had a Sign out of its own that skipped the
// registration, so on a shared phone the next person could be woken by the
// previous account's alerts. There is one way out now, and the order matters:
// the registration can only be removed while its owner is still signed in.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_out.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notifications_repository.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';

class _Steps {
  final log = <String>[];
}

class _FakeNotifications implements NotificationsRepository {
  _FakeNotifications(this.steps);

  final _Steps steps;

  @override
  Future<void> unregisterDevice(String token) async =>
      steps.log.add('unregister $token');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuth implements AuthRepository {
  _FakeAuth(this.steps);

  final _Steps steps;

  @override
  Future<void> signOut() async => steps.log.add('sign out');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('drops the device registration, then signs out', (tester) async {
    final steps = _Steps();
    late WidgetRef captured;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationsRepositoryProvider.overrideWithValue(
            _FakeNotifications(steps),
          ),
          pushTokenReaderProvider.overrideWithValue(() async => 'token-1'),
          authRepositoryProvider.overrideWithValue(_FakeAuth(steps)),
        ],
        child: Consumer(
          builder: (context, ref, _) {
            captured = ref;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    await signOutOfApp(captured);

    expect(steps.log, ['unregister token-1', 'sign out']);
  });

  testWidgets('a failed clean-up never stops anybody signing out', (
    tester,
  ) async {
    final steps = _Steps();
    late WidgetRef captured;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationsRepositoryProvider.overrideWithValue(
            _FakeNotifications(steps),
          ),
          pushTokenReaderProvider.overrideWithValue(
            () async => throw StateError('no token service'),
          ),
          authRepositoryProvider.overrideWithValue(_FakeAuth(steps)),
        ],
        child: Consumer(
          builder: (context, ref, _) {
            captured = ref;
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    await signOutOfApp(captured);

    expect(steps.log, ['sign out']);
  });
}
