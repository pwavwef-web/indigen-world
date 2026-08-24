import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/google_firebase_auth_service.dart';

export 'package:indigen_world_mobile/features/auth/auth_failure.dart';

/// Thin wrapper around [FirebaseAuth] that exposes the sign-in methods the app
/// offers — email/password, account creation, password reset and Google — and
/// maps platform exceptions to short, friendly messages.
class AuthRepository {
  AuthRepository(this._auth, this._google);

  final FirebaseAuth _auth;
  final GoogleFirebaseAuthService _google;

  User? get currentUser => _auth.currentUser;

  Future<UserCredential> signInWithEmail({
    required String email,
    required String password,
  }) => _guarded(
    () => _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password,
    ),
  );

  Future<UserCredential> registerWithEmail({
    required String email,
    required String password,
    String? displayName,
  }) => _guarded(() async {
    final credential = await _auth.createUserWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
    final name = displayName?.trim();
    if (name != null && name.isNotEmpty) {
      await credential.user?.updateDisplayName(name);
      await credential.user?.reload();
    }
    return credential;
  });

  Future<void> sendPasswordReset(String email) =>
      _guarded(() => _auth.sendPasswordResetEmail(email: email.trim()));

  /// Google sign-in, delegated to [GoogleFirebaseAuthService] so the required
  /// `GoogleSignIn.initialize()` (with the OAuth server client id) always runs
  /// first. Calling `authenticate()` without it fails at the platform channel
  /// with an opaque error, which is what made Google sign-in look like a
  /// connection problem.
  Future<UserCredential> signInWithGoogle() => _guarded(_google.signIn);

  Future<void> signOut() => _google.signOut();

  /// Runs [action], translating [FirebaseAuthException] and Google/Firebase
  /// errors into an [AuthFailure] with a message safe to show a member.
  Future<T> _guarded<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on AuthCancelled {
      rethrow;
    } on AuthFailure {
      // Already translated by GoogleFirebaseAuthService.
      rethrow;
    } on FirebaseAuthException catch (error) {
      throw firebaseAuthFailure(error);
    } on FirebaseException catch (error) {
      throw AuthFailure(
        AuthFailureKind.network,
        error.message ?? 'Could not reach Indigen World. Check your connection and try again.',
      );
    } on Object {
      throw const AuthFailure(
        AuthFailureKind.unknown,
        'Something went wrong. Check your connection and try again.',
      );
    }
  }
}

/// The [FirebaseAuth] instance, or `null` when Firebase is unusable.
///
/// Guarded twice on purpose: [firebaseReadyProvider] carries the bootstrap
/// result `main` installs, and `Firebase.apps` catches an environment (tests,
/// a forgotten override) where no app was ever initialised. Touching
/// `FirebaseAuth.instance` in that state throws, which is what turns a missing
/// override into a hard crash rather than a graceful guest mode.
final firebaseAuthProvider = Provider<FirebaseAuth?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  if (Firebase.apps.isEmpty) return null;
  return FirebaseAuth.instance;
});

final googleAuthServiceProvider = Provider<GoogleFirebaseAuthService>(
  (ref) =>
      GoogleFirebaseAuthService(firebaseAuth: ref.watch(firebaseAuthProvider)),
);

/// The auth repository, or `null` when Firebase is unavailable this launch.
final authRepositoryProvider = Provider<AuthRepository?>((ref) {
  final auth = ref.watch(firebaseAuthProvider);
  if (auth == null) return null;
  return AuthRepository(auth, ref.watch(googleAuthServiceProvider));
});

/// The current signed-in user, or `null` for guests / when Firebase is offline.
final authStateProvider = StreamProvider<User?>((ref) {
  final auth = ref.watch(firebaseAuthProvider);
  if (auth == null) return Stream<User?>.value(null);
  return auth.authStateChanges();
});

/// Whether somebody is signed in right now.
final isSignedInProvider = Provider<bool>(
  (ref) => ref.watch(authStateProvider).asData?.value != null,
);
