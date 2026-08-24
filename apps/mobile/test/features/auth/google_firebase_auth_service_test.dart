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

  test('only an explicit Google cancellation is silent', () {
    final cancelled = googleSignInFailure(
      const GoogleSignInException(code: GoogleSignInExceptionCode.canceled),
    );
    final interrupted = googleSignInFailure(
      const GoogleSignInException(code: GoogleSignInExceptionCode.interrupted),
    );

    expect(cancelled.wasCancelled, isTrue);
    expect(interrupted.wasCancelled, isFalse);
    expect(interrupted.kind, AuthFailureKind.unavailable);
    expect(interrupted.message, contains('try again'));
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
