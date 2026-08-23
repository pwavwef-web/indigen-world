import 'package:flutter_test/flutter_test.dart';
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
}
