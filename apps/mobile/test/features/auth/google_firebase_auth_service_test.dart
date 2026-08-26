import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:indigen_world_mobile/features/auth/google_firebase_auth_service.dart';

void main() {
  test('reports a useful failure when Firebase is unavailable', () async {
    final service = GoogleFirebaseAuthService(firebaseAuth: null);

    await expectLater(
      service.signIn(),
      throwsA(
        isA<AuthFailure>()
            .having(
              (failure) => failure.kind,
              'kind',
              AuthFailureKind.unavailable,
            )
            .having(
              (failure) => failure.message,
              'message',
              contains('Firebase is offline'),
            ),
      ),
    );
  });

  test('sign-out is safe when Firebase never initialized', () async {
    final service = GoogleFirebaseAuthService(firebaseAuth: null);

    await expectLater(service.signOut(), completes);
  });

  test('distinguishes cancellation from interruption with retry text', () {
    final cancelled = googleSignInFailure(
      const GoogleSignInException(code: GoogleSignInExceptionCode.canceled),
    );
    final interrupted = googleSignInFailure(
      const GoogleSignInException(code: GoogleSignInExceptionCode.interrupted),
    );

    expect(cancelled.wasCancelled, isTrue);
    expect(cancelled.message, contains('try again'));
    expect(cancelled.message, isNot(contains('GSI-')));
    expect(interrupted.wasCancelled, isFalse);
    expect(interrupted.kind, AuthFailureKind.unavailable);
    expect(interrupted.message, contains('try again'));
  });

  test('treats a closed browser tab as a cancellation, not a fault', () {
    for (final code in ['web-context-canceled', 'user-cancelled', 'canceled']) {
      final failure = hostedGoogleFlowFailure(
        FirebaseAuthException(code: code),
      );
      expect(failure.wasCancelled, isTrue, reason: code);
      expect(failure.message, contains('try again'));
    }
  });

  test('a real browser-flow error keeps its own explanation', () {
    final failure = hostedGoogleFlowFailure(
      FirebaseAuthException(code: 'network-request-failed'),
    );

    expect(failure.kind, AuthFailureKind.network);
    expect(failure.wasCancelled, isFalse);
  });

  test('accepts a matching completed Firebase session', () {
    expect(
      () => verifyFirebaseSession(
        credentialUid: 'member-123',
        currentUid: 'member-123',
      ),
      returnsNormally,
    );
  });

  test('rejects a missing or mismatched Firebase session', () {
    for (final session in <({String? credentialUid, String? currentUid})>[
      (credentialUid: null, currentUid: null),
      (credentialUid: 'member-123', currentUid: null),
      (credentialUid: 'member-123', currentUid: 'different-member'),
    ]) {
      expect(
        () => verifyFirebaseSession(
          credentialUid: session.credentialUid,
          currentUid: session.currentUid,
        ),
        throwsA(
          isA<AuthFailure>()
              .having(
                (failure) => failure.kind,
                'kind',
                AuthFailureKind.unavailable,
              )
              .having(
                (failure) => failure.wasCancelled,
                'wasCancelled',
                isFalse,
              ),
        ),
      );
    }
  });
}
