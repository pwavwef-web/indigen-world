import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// Raised when a sign-in flow is dismissed by the user (for example closing the
/// Google account chooser). Callers treat this as a silent no-op, not an error.
class AuthCancelled implements Exception {
  const AuthCancelled();
}

/// A human-readable authentication failure surfaced in the UI.
class AuthFailure implements Exception {
  const AuthFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Thin wrapper around [FirebaseAuth] that exposes the sign-in methods the app
/// offers — email/password, account creation, password reset and Google — and
/// maps platform exceptions to short, friendly messages.
class AuthRepository {
  AuthRepository(this._auth, this._googleSignIn);

  final FirebaseAuth _auth;
  final GoogleSignIn _googleSignIn;

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

  Future<UserCredential> signInWithGoogle() => _guarded(() async {
    final GoogleSignInAccount account = await _googleSignIn.authenticate();
    final String? idToken = account.authentication.idToken;
    final credential = GoogleAuthProvider.credential(idToken: idToken);
    return _auth.signInWithCredential(credential);
  });

  Future<void> signOut() async {
    // Sign out of Google too so the next Google sign-in re-prompts for an
    // account rather than silently reusing the last one.
    try {
      await _googleSignIn.signOut();
    } on Object {
      // Google session may not exist (email/password user); ignore.
    }
    await _auth.signOut();
  }

  /// Runs [action], translating [FirebaseAuthException] and Google/Firebase
  /// errors into an [AuthFailure] with a message safe to show a user.
  Future<T> _guarded<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on AuthCancelled {
      rethrow;
    } on FirebaseAuthException catch (error) {
      throw AuthFailure(_messageFor(error));
    } on Object {
      throw const AuthFailure(
        'Something went wrong. Check your connection and try again.',
      );
    }
  }

  String _messageFor(FirebaseAuthException error) => switch (error.code) {
    'invalid-email' => 'That email address does not look right.',
    'user-disabled' => 'This account has been disabled.',
    'user-not-found' ||
    'wrong-password' ||
    'invalid-credential' => 'Email or password is incorrect.',
    'email-already-in-use' =>
      'An account already exists for that email. Try signing in.',
    'weak-password' => 'Choose a stronger password (at least 6 characters).',
    'operation-not-allowed' =>
      'This sign-in method is not enabled yet. Please try another.',
    'account-exists-with-different-credential' =>
      'This email is already linked to a different sign-in method.',
    'network-request-failed' =>
      'Network error. Check your connection and try again.',
    'too-many-requests' =>
      'Too many attempts. Please wait a moment and try again.',
    _ => error.message ?? 'Authentication failed. Please try again.',
  };
}

/// The [FirebaseAuth] instance, or `null` when Firebase failed to initialise.
final firebaseAuthProvider = Provider<FirebaseAuth?>(
  (ref) => ref.watch(firebaseReadyProvider) ? FirebaseAuth.instance : null,
);

final googleSignInProvider = Provider<GoogleSignIn>(
  (ref) => GoogleSignIn.instance,
);

/// The auth repository, or `null` when Firebase is unavailable this launch.
final authRepositoryProvider = Provider<AuthRepository?>((ref) {
  final auth = ref.watch(firebaseAuthProvider);
  if (auth == null) return null;
  return AuthRepository(auth, ref.watch(googleSignInProvider));
});

/// The current signed-in user, or `null` for guests / when Firebase is offline.
final authStateProvider = StreamProvider<User?>((ref) {
  final auth = ref.watch(firebaseAuthProvider);
  if (auth == null) return Stream<User?>.value(null);
  return auth.authStateChanges();
});
