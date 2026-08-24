import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart';
import 'package:indigen_world_mobile/features/auth/auth_failure.dart';

export 'package:indigen_world_mobile/features/auth/auth_failure.dart';

const googleOAuthServerClientId =
    '111428711822-9gtghardubtkrdpajum11g6muntgg2v1.apps.googleusercontent.com';

/// Google Sign-In, bridged onto Firebase Auth.
///
/// `google_sign_in` 7.x requires [GoogleSignIn.initialize] before any
/// `authenticate()` call, and needs the OAuth *server* client id to mint an id
/// token Firebase will accept. Skipping either step fails at the platform
/// channel with an opaque error that reads to a member as "something went
/// wrong / you seem offline", so initialisation is centralised here and every
/// Google sign-in in the app goes through this class.
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

      final credential = GoogleAuthProvider.credential(idToken: idToken);
      return await auth.signInWithCredential(credential);
    } on GoogleSignInException catch (error) {
      throw _googleFailure(error);
    } on FirebaseAuthException catch (error) {
      throw firebaseAuthFailure(error);
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
    if (!const {
      TargetPlatform.android,
      TargetPlatform.iOS,
    }.contains(defaultTargetPlatform)) {
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

  AuthFailure _googleFailure(GoogleSignInException error) {
    return switch (error.code) {
      GoogleSignInExceptionCode.canceled ||
      GoogleSignInExceptionCode.interrupted => const AuthFailure(
        AuthFailureKind.cancelled,
        'Google Sign-In was cancelled.',
      ),
      GoogleSignInExceptionCode.clientConfigurationError ||
      GoogleSignInExceptionCode.providerConfigurationError => const AuthFailure(
        AuthFailureKind.configuration,
        'Google Sign-In is not configured for this app build. Check its package ID and signing certificate.',
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
  }
}

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
