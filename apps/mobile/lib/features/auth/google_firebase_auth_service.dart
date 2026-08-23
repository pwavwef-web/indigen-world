import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart';

const googleOAuthServerClientId =
    '111428711822-9gtghardubtkrdpajum11g6muntgg2v1.apps.googleusercontent.com';

final firebaseAuthProvider = Provider<FirebaseAuth?>((ref) {
  if (Firebase.apps.isEmpty) return null;
  return FirebaseAuth.instance;
});

final authStateProvider = StreamProvider<User?>((ref) {
  final auth = ref.watch(firebaseAuthProvider);
  return auth?.authStateChanges() ?? Stream<User?>.value(null);
});

final googleFirebaseAuthServiceProvider = Provider<GoogleFirebaseAuthService>((
  ref,
) {
  return GoogleFirebaseAuthService(
    firebaseAuth: ref.watch(firebaseAuthProvider),
  );
});

enum AuthFailureKind {
  cancelled,
  configuration,
  network,
  accountConflict,
  unavailable,
  unknown,
}

class AuthFailure implements Exception {
  const AuthFailure(this.kind, this.message);

  final AuthFailureKind kind;
  final String message;

  bool get wasCancelled => kind == AuthFailureKind.cancelled;

  @override
  String toString() => message;
}

class GoogleFirebaseAuthService {
  GoogleFirebaseAuthService({required this.firebaseAuth});

  final FirebaseAuth? firebaseAuth;
  final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

  static Future<void>? _googleInitialization;

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
      throw _firebaseFailure(error);
    }
  }

  Future<void> signOut() async {
    final auth = firebaseAuth;
    if (auth == null) return;

    Object? firstError;
    StackTrace? firstStackTrace;
    try {
      await auth.signOut();
    } on Object catch (error, stackTrace) {
      firstError = error;
      firstStackTrace = stackTrace;
    }

    try {
      await _ensureGoogleInitialized();
      await _googleSignIn.signOut();
    } on Object catch (error, stackTrace) {
      firstError ??= error;
      firstStackTrace ??= stackTrace;
    }

    if (firstError != null) {
      Error.throwWithStackTrace(firstError, firstStackTrace!);
    }
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

    return _googleInitialization ??= _googleSignIn.initialize(
      clientId: iosClientId,
      serverClientId: googleOAuthServerClientId,
    );
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

  AuthFailure _firebaseFailure(FirebaseAuthException error) {
    return switch (error.code) {
      'operation-not-allowed' => const AuthFailure(
        AuthFailureKind.configuration,
        'Google Sign-In is not enabled for this Firebase project.',
      ),
      'account-exists-with-different-credential' => const AuthFailure(
        AuthFailureKind.accountConflict,
        'An account already exists with this email using another sign-in method.',
      ),
      'network-request-failed' => const AuthFailure(
        AuthFailureKind.network,
        'No connection to Firebase. Check your internet connection and try again.',
      ),
      'invalid-credential' => const AuthFailure(
        AuthFailureKind.configuration,
        'Firebase could not verify the Google account. Please try again.',
      ),
      'user-disabled' => const AuthFailure(
        AuthFailureKind.unavailable,
        'This account has been disabled. Contact support for help.',
      ),
      _ => AuthFailure(
        AuthFailureKind.unknown,
        error.message ?? 'Sign-in failed. Please try again.',
      ),
    };
  }
}
