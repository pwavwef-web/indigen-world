import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart';
import 'package:indigen_world_mobile/features/auth/auth_failure.dart';

export 'package:indigen_world_mobile/features/auth/auth_failure.dart';

const googleOAuthServerClientId =
    '111428711822-9gtghardubtkrdpajum11g6muntgg2v1.apps.googleusercontent.com';

/// The platforms that ship a Google Sign-In implementation in this app.
bool get _supportsGoogleSignIn => const {
  TargetPlatform.android,
  TargetPlatform.iOS,
}.contains(defaultTargetPlatform);

/// Google Sign-In, bridged onto Firebase Auth.
///
/// `google_sign_in` 7.x requires [GoogleSignIn.initialize] before any
/// `authenticate()` call, and needs the OAuth *server* client id to mint an id
/// token Firebase will accept. Skipping either step fails at the platform
/// channel with an opaque error that reads to a member as "something went
/// wrong / you seem offline", so initialisation is centralised here and every
/// Google sign-in in the app goes through this class.
///
/// There are two routes to the same account and [signIn] tries both. The
/// native account sheet is the one members expect, but it is only available to
/// a build whose package id *and signing certificate* have a matching Android
/// OAuth client in the Firebase project — a condition a Play-signed release
/// can silently fail, and which Android then reports as an ordinary
/// cancellation. The Firebase-hosted browser flow has no such requirement, so
/// it stands behind the native one and keeps Google sign-in reachable even
/// when a certificate has not been registered.
class GoogleFirebaseAuthService {
  GoogleFirebaseAuthService({required this.firebaseAuth});

  final FirebaseAuth? firebaseAuth;
  final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

  /// `initialize()` is process-wide and must run exactly once; a failed attempt
  /// is cleared so the next sign-in retries rather than reusing a broken future
  /// for the rest of the session.
  static Future<void>? _googleInitialization;

  @visibleForTesting
  static void resetInitializationForTesting() => _googleInitialization = null;

  Future<UserCredential> signIn() async {
    final auth = firebaseAuth;
    if (auth == null) {
      throw const AuthFailure(
        AuthFailureKind.unavailable,
        'Sign-in is unavailable while Firebase is offline. Please try again.',
      );
    }
    if (!_supportsGoogleSignIn) {
      throw const AuthFailure(
        AuthFailureKind.unavailable,
        'Google Sign-In is available on Android and iOS builds.',
      );
    }

    // Two routes to the same account, tried in order. The native one is the
    // one members expect — the system account sheet, no browser — but it only
    // works when this exact build (package id + signing certificate) has a
    // matching Android OAuth client in the Firebase project. A Play-signed
    // release whose app-signing certificate was never registered fails there
    // and, on Android, fails as an indistinguishable "cancelled". So a failure
    // to obtain a Google identity falls through to the Firebase-hosted OAuth
    // flow, which authenticates against the project's web client and needs no
    // certificate registration at all.
    String? idToken;
    AuthFailure? providerFailure;
    try {
      idToken = await _nativeGoogleIdToken();
    } on AuthFailure catch (failure) {
      providerFailure = failure;
    }

    if (idToken != null) return _signInWithIdToken(auth, idToken);
    return _signInWithHostedFlow(auth, providerFailure!);
  }

  /// Google's own account sheet (Credential Manager on Android, the Google
  /// SDK on iOS). Returns the id token Firebase will exchange for a session.
  Future<String> _nativeGoogleIdToken() async {
    try {
      await _ensureGoogleInitialized();
      final googleUser = await _googleSignIn.authenticate();
      final idToken = googleUser.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const AuthFailure(
          AuthFailureKind.configuration,
          'Google did not return a valid identity token. Please try again.',
        );
      }
      return idToken;
    } on GoogleSignInException catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace);
      throw googleSignInFailure(error);
    } on AuthFailure {
      rethrow;
    } on Object catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace);
      throw const AuthFailure(
        AuthFailureKind.unknown,
        'Google Sign-In did not finish. Please try again.',
      );
    }
  }

  Future<UserCredential> _signInWithIdToken(
    FirebaseAuth auth,
    String idToken,
  ) async {
    try {
      final result = await auth.signInWithCredential(
        GoogleAuthProvider.credential(idToken: idToken),
      );
      verifyFirebaseSession(
        credentialUid: result.user?.uid,
        currentUid: auth.currentUser?.uid,
      );
      return result;
    } on FirebaseAuthException catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace);
      throw firebaseAuthFailure(error);
    } on AuthFailure {
      rethrow;
    } on Object catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace);
      throw const AuthFailure(
        AuthFailureKind.unknown,
        'Google Sign-In did not finish. Please try again.',
      );
    }
  }

  /// Firebase's own hosted Google flow, opened in a system browser tab.
  ///
  /// This is the fallback, not the first choice: it costs the member an extra
  /// hop through the browser. It earns its place by depending only on the
  /// project's Google provider configuration, so it keeps working on a build
  /// whose signing certificate is missing from the Firebase project — the one
  /// failure the native sheet cannot report clearly and cannot recover from.
  ///
  /// [providerFailure] is what the native attempt reported. If the browser
  /// flow fails for its own opaque reason, that first explanation is the more
  /// useful one to show, so it is what the member reads.
  Future<UserCredential> _signInWithHostedFlow(
    FirebaseAuth auth,
    AuthFailure providerFailure,
  ) async {
    final provider = GoogleAuthProvider()
      ..addScope('email')
      ..setCustomParameters(const {'prompt': 'select_account'});
    try {
      final result = await auth.signInWithProvider(provider);
      verifyFirebaseSession(
        credentialUid: result.user?.uid,
        currentUid: auth.currentUser?.uid,
      );
      return result;
    } on FirebaseAuthException catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace);
      throw hostedGoogleFlowFailure(error);
    } on AuthFailure {
      rethrow;
    } on Object catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace);
      throw providerFailure;
    }
  }

  /// Keeps provider failures observable in release builds. In particular,
  /// Android Credential Manager can report a configuration failure as
  /// `canceled` after the member has already selected an account. The UI must
  /// surface that outcome, and Crashlytics must preserve the provider detail
  /// so it cannot look like an unexplained dismissal again.
  Future<void> _recordGoogleFailure(Object error, StackTrace stackTrace) async {
    debugPrint('Google Sign-In failed: $error');
    try {
      await FirebaseCrashlytics.instance.recordError(
        error,
        stackTrace,
        reason: 'Google Sign-In provider failure',
        fatal: false,
      );
    } on Object catch (reportingError) {
      debugPrint(
        'Google Sign-In failure could not be reported: $reportingError',
      );
    }
  }

  Future<void> signOut() async {
    final auth = firebaseAuth;
    // No Firebase means no session to end, on either side.
    if (auth == null) return;

    // Clearing the Google session too is what makes the next Google sign-in
    // re-prompt for an account rather than silently reusing the last one. It is
    // a courtesy, though, not the operation: if it fails the member is still
    // signed out, so it must never turn a successful sign-out into an error.
    try {
      await _ensureGoogleInitialized();
      await _googleSignIn.signOut();
    } on Object catch (error) {
      debugPrint('Google session could not be cleared (continuing): $error');
    }

    await auth.signOut();
  }

  Future<void> _ensureGoogleInitialized() {
    if (!_supportsGoogleSignIn) {
      throw const AuthFailure(
        AuthFailureKind.unavailable,
        'Google Sign-In is available on Android and iOS builds.',
      );
    }

    final firebaseOptions = firebaseOptionsFor(appEnvironment);
    final iosClientId = defaultTargetPlatform == TargetPlatform.iOS
        ? firebaseOptions.iosClientId
        : null;
    if (defaultTargetPlatform == TargetPlatform.iOS && iosClientId == null) {
      throw const AuthFailure(
        AuthFailureKind.configuration,
        'The iOS Google client ID is missing from Firebase configuration.',
      );
    }

    return _googleInitialization ??= _initializeOnce(iosClientId);
  }

  Future<void> _initializeOnce(String? iosClientId) async {
    try {
      await _googleSignIn.initialize(
        clientId: iosClientId,
        serverClientId: googleOAuthServerClientId,
      );
    } on Object {
      // Let the next attempt re-initialise instead of caching the failure.
      _googleInitialization = null;
      rethrow;
    }
  }
}

/// Confirms that the completed Firebase call also installed the same account
/// as the process-wide current user. The profile UI listens to `currentUser`,
/// so closing the sign-in sheet before this invariant holds would look exactly
/// like a successful account selection that immediately signed itself out.
@visibleForTesting
void verifyFirebaseSession({
  required String? credentialUid,
  required String? currentUid,
}) {
  if (credentialUid == null ||
      credentialUid.isEmpty ||
      currentUid == null ||
      currentUid.isEmpty ||
      credentialUid != currentUid) {
    throw const AuthFailure(
      AuthFailureKind.unavailable,
      'Google returned your account, but sign-in did not finish. Please try again.',
    );
  }
}

/// Converts provider outcomes into UI-safe failures.
///
/// Only an explicit dismissal is silent. Android may report `interrupted`
/// after the account chooser when the activity is recreated or the provider
/// flow is disrupted; treating that as a cancellation previously made the
/// button appear to do nothing.
@visibleForTesting
AuthFailure googleSignInFailure(
  GoogleSignInException error,
) => switch (error.code) {
  GoogleSignInExceptionCode.canceled => const AuthFailure(
    AuthFailureKind.cancelled,
    'Google Sign-In did not finish. Please try again.',
  ),
  GoogleSignInExceptionCode.interrupted => const AuthFailure(
    AuthFailureKind.unavailable,
    'Google Sign-In was interrupted. Please try again.',
  ),
  GoogleSignInExceptionCode.clientConfigurationError ||
  GoogleSignInExceptionCode.providerConfigurationError => const AuthFailure(
    AuthFailureKind.configuration,
    'Google Sign-In is unavailable in this app version. Please update the app or try another sign-in method.',
  ),
  GoogleSignInExceptionCode.uiUnavailable => const AuthFailure(
    AuthFailureKind.unavailable,
    'Google Sign-In cannot open right now. Return to the app and try again.',
  ),
  GoogleSignInExceptionCode.userMismatch => const AuthFailure(
    AuthFailureKind.accountConflict,
    'A different Google account is already active. Sign out and try again.',
  ),
  GoogleSignInExceptionCode.unknownError => AuthFailure(
    AuthFailureKind.unknown,
    error.description ?? 'Google Sign-In failed. Please try again.',
  ),
};

/// Maps a browser-flow outcome onto a member-facing failure.
///
/// Backing out of the tab is a decision, not a fault, and Firebase spells that
/// outcome differently on each platform — so all three spellings collapse to
/// one cancellation before the generic mapping runs.
@visibleForTesting
AuthFailure hostedGoogleFlowFailure(FirebaseAuthException error) =>
    const {'web-context-canceled', 'user-cancelled', 'canceled'}.contains(
      error.code,
    )
    ? const AuthFailure(
        AuthFailureKind.cancelled,
        'Google Sign-In did not finish. Please try again.',
      )
    : firebaseAuthFailure(error);

/// Maps a [FirebaseAuthException] to the sentence a member should read.
///
/// Shared by every sign-in path — email, registration, password reset and
/// Google — so the same code never produces two different explanations.
AuthFailure firebaseAuthFailure(FirebaseAuthException error) =>
    switch (error.code) {
      'invalid-email' => const AuthFailure(
        AuthFailureKind.credentials,
        'That email address does not look right.',
      ),
      'user-disabled' => const AuthFailure(
        AuthFailureKind.unavailable,
        'This account has been disabled. Contact the project team for help.',
      ),
      'user-not-found' ||
      'wrong-password' ||
      'invalid-credential' => const AuthFailure(
        AuthFailureKind.credentials,
        'Email or password is incorrect.',
      ),
      'email-already-in-use' => const AuthFailure(
        AuthFailureKind.accountConflict,
        'An account already exists for that email. Try signing in.',
      ),
      'account-exists-with-different-credential' => const AuthFailure(
        AuthFailureKind.accountConflict,
        'This email is already linked to a different sign-in method.',
      ),
      'weak-password' => const AuthFailure(
        AuthFailureKind.credentials,
        'Choose a stronger password (at least 6 characters).',
      ),
      'operation-not-allowed' => const AuthFailure(
        AuthFailureKind.configuration,
        'This sign-in method is not enabled yet. Please try another.',
      ),
      'network-request-failed' => const AuthFailure(
        AuthFailureKind.network,
        'Network error. Check your connection and try again.',
      ),
      'too-many-requests' => const AuthFailure(
        AuthFailureKind.rateLimited,
        'Too many attempts. Please wait a moment and try again.',
      ),
      _ => AuthFailure(
        AuthFailureKind.unknown,
        error.message ?? 'Authentication failed. Please try again.',
      ),
    };
