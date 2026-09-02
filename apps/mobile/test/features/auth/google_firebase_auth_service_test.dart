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

  group('a `canceled` verdict is not always a dismissal', () {
    // The Android plugin maps EVERY GetCredentialCancellationException onto
    // GoogleSignInExceptionCode.canceled, and Credential Manager raises one
    // both for a swipe-away and, on some Play services builds, when it will
    // not present a sheet at all. Only the description separates them, so the
    // burden of proof sits on the dismissal.
    test('recognises the messages a real dismissal carries', () {
      for (final description in const [
        'activity is cancelled by the user.',
        'Activity is canceled by the user',
        'User cancelled the flow',
      ]) {
        expect(isUserDismissal(description), isTrue, reason: description);
      }
    });

    test('anything else is not proof, so the browser flow still runs', () {
      for (final description in <String?>[
        null,
        '',
        'During begin sign in, failure response from one tap',
        'Cannot find a matching credential',
      ]) {
        expect(isUserDismissal(description), isFalse, reason: '$description');
      }
    });
  });

  test('every provider failure carries the code it came from', () {
    final failure = googleSignInFailure(
      const GoogleSignInException(
        code: GoogleSignInExceptionCode.canceled,
        description: 'activity is cancelled by the user.',
      ),
    );

    expect(failure.wasCancelled, isTrue);
    // The member reads a sentence; the report carries the verdict.
    expect(failure.message, isNot(contains('canceled')));
    expect(failure.detail, contains('canceled'));
    expect(failure.detail, contains('activity is cancelled by the user.'));
  });

  test('a bare code still produces a detail worth reporting', () {
    final failure = googleSignInFailure(
      const GoogleSignInException(code: GoogleSignInExceptionCode.interrupted),
    );

    expect(failure.detail, 'interrupted');
  });

  test("a device's Play services problem is not blamed on the build", () {
    // GetCredentialUnsupportedException and
    // GetCredentialProviderConfigurationException both arrive as
    // providerConfigurationError, and both are facts about the handset. Saying
    // "this build is not registered" sends somebody to report a fault that,
    // as of the certificate audit, does not exist.
    final device = googleSignInFailure(
      const GoogleSignInException(
        code: GoogleSignInExceptionCode.providerConfigurationError,
        description: 'Credential Manager not supported.',
      ),
    );
    final build = googleSignInFailure(
      const GoogleSignInException(
        code: GoogleSignInExceptionCode.clientConfigurationError,
      ),
    );

    expect(device.kind, AuthFailureKind.configuration);
    expect(device.message, contains('Google Play services'));
    expect(device.message, isNot(contains('build of the app')));
    expect(build.message, contains('build of the app'));
  });

  test('withDetail leaves a failure alone when there is nothing to add', () {
    const failure = AuthFailure(AuthFailureKind.network, 'Network error.');

    expect(failure.withDetail(null).detail, isNull);
    expect(failure.withDetail('').detail, isNull);
    expect(failure.withDetail('gsi:canceled').detail, 'gsi:canceled');
    expect(failure.withDetail('gsi:canceled').message, failure.message);
  });
}
