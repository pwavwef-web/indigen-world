import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/app_signature.dart';
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
/// channel with an opaque error, so initialisation is centralised here and
/// every Google sign-in in the app goes through this class.
///
/// Three routes are tried, in the order a member would want them:
///
///   1. A silent resume, for somebody who has signed in on this device before.
///   2. The native account sheet — the one members expect.
///   3. Firebase's hosted flow in a browser tab, as a last resort.
///
/// Only route 3 is a fallback in the real sense. Routes 1 and 2 both depend on
/// this build's *package id and signing certificate* having a matching Android
/// OAuth client in the Firebase project; route 3 depends on the same pair
/// being registered as a certificate fingerprint, which is why it is not the
/// escape hatch it looks like — Firebase rejects an unregistered pair there
/// with `invalid-cert-hash`, the error that reads to a member as nonsense
/// about a package certificate. Both diagnoses are now spelled out, and the
/// pair the build actually presented travels with them.
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

    String? idToken;
    AuthFailure? providerFailure;
    try {
      idToken = await _nativeGoogleIdToken();
    } on AuthFailure catch (failure) {
      providerFailure = failure;
    }

    if (idToken != null) return _signInWithIdToken(auth, idToken);

    // Backing out of the account sheet is a decision, not a fault. Opening a
    // browser tab on top of it takes a member who closed one sheet and hands
    // them another, and if the hosted flow then fails on its own configuration
    // it replaces their deliberate cancellation with an error about
    // certificate hashes. So a dismissal still ends here.
    //
    // But only a *dismissal*. `GoogleSignInExceptionCode.canceled` is not one
    // thing: the Android plugin raises it for every
    // `GetCredentialCancellationException`, and Credential Manager reports one
    // both when somebody swipes the sheet away and, on some Play services
    // builds, when it declines to show a sheet at all. The second is a member
    // pressing a button that then does nothing, forever, on a device where the
    // browser flow would have worked — which is the more expensive mistake by
    // a long way, and is invisible in a bug report. So only a cancellation
    // that *says* it was the user ends the attempt; anything else falls
    // through. See [isUserDismissal].
    if (providerFailure!.wasCancelled &&
        isUserDismissal(providerFailure.detail)) {
      throw providerFailure;
    }

    return _signInWithHostedFlow(auth, providerFailure);
  }

  /// Google's own account sheet (Credential Manager on Android, the Google SDK
  /// on iOS). Returns the id token Firebase will exchange for a session.
  ///
  /// A silent resume is attempted first: somebody who has signed in on this
  /// device before should not have to choose their account again, and on a
  /// build with a configuration problem it is also the cheapest way to find
  /// out — it fails without ever showing a sheet.
  Future<String> _nativeGoogleIdToken() async {
    try {
      await _ensureGoogleInitialized();
      final resumed = await _googleSignIn.attemptLightweightAuthentication();
      final quiet = resumed?.authentication.idToken;
      if (quiet != null && quiet.isNotEmpty) return quiet;

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
      await _recordGoogleFailure(error, stackTrace, route: 'native-sheet');
      throw googleSignInFailure(error);
    } on AuthFailure {
      rethrow;
    } on Object catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace, route: 'native-sheet');
      throw AuthFailure(
        AuthFailureKind.unknown,
        'Google Sign-In did not finish. Please try again.',
        detail: error.runtimeType.toString(),
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
      await _recordGoogleFailure(error, stackTrace, route: 'firebase-exchange');
      throw firebaseAuthFailure(error).withDetail('firebase:${error.code}');
    } on AuthFailure {
      rethrow;
    } on Object catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace, route: 'firebase-exchange');
      throw AuthFailure(
        AuthFailureKind.unknown,
        'Google Sign-In did not finish. Please try again.',
        detail: error.runtimeType.toString(),
      );
    }
  }

  /// Firebase's own hosted Google flow, opened in a system browser tab.
  ///
  /// [providerFailure] is what the native attempt reported. When the hosted
  /// flow fails for a reason of its own that is *not* a configuration verdict,
  /// the native explanation is the more useful one and is what the member
  /// reads; a configuration verdict wins, because it names the actual defect.
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
      await _recordGoogleFailure(error, stackTrace, route: 'hosted-browser');
      final hosted = hostedGoogleFlowFailure(error).withDetail(
        // Both legs are named. A member reading this has just been through two
        // attempts, and "which one failed, and how" is the entire content of a
        // useful report — the sentence above can only describe one of them.
        'native ${providerFailure.detail ?? providerFailure.kind.name} '
        '/ hosted firebase:${error.code}',
      );
      throw hosted.kind == AuthFailureKind.configuration ||
              hosted.kind == AuthFailureKind.cancelled
          ? hosted
          : providerFailure.withDetail(
              '${providerFailure.detail ?? providerFailure.kind.name} '
              '/ hosted firebase:${error.code}',
            );
    } on AuthFailure {
      rethrow;
    } on Object catch (error, stackTrace) {
      await _recordGoogleFailure(error, stackTrace, route: 'hosted-browser');
      throw providerFailure.withDetail(
        '${providerFailure.detail ?? providerFailure.kind.name} '
        '/ hosted ${error.runtimeType}',
      );
    }
  }

  /// Keeps provider failures observable in release builds, together with the
  /// package id and certificate the build presented.
  ///
  /// Those two values are the whole diagnosis for every configuration failure
  /// in this file, and they are exactly what a crash report never used to
  /// carry — a Play-signed release runs under a certificate that exists in no
  /// keystore anybody here owns, so without them a report says only that
  /// something went wrong.
  /// [route] names which of the three legs failed — `native-sheet`,
  /// `firebase-exchange` or `hosted-browser`. Without it a report says only
  /// that Google Sign-In failed, and the three legs fail for entirely
  /// different reasons: the sheet on the device's Play services, the exchange
  /// on the Firebase project, the browser on the certificate registration.
  Future<void> _recordGoogleFailure(
    Object error,
    StackTrace stackTrace, {
    required String route,
  }) async {
    debugPrint('Google Sign-In failed at $route: $error');
    try {
      final signature = AppSignatureReader.cached;
      final crashlytics = FirebaseCrashlytics.instance;
      await crashlytics.setCustomKey('google_signin_route', route);
      if (error is GoogleSignInException) {
        await crashlytics.setCustomKey('google_signin_code', error.code.name);
        await crashlytics.setCustomKey(
          'google_signin_description',
          error.description ?? 'none',
        );
      } else if (error is FirebaseAuthException) {
        await crashlytics.setCustomKey('google_signin_code', error.code);
      }
      if (signature != null) {
        await crashlytics.setCustomKey('app_package', signature.packageName);
        await crashlytics.setCustomKey('app_sha1', signature.sha1 ?? 'unknown');
        await crashlytics.setCustomKey(
          'app_installer',
          signature.installer ?? 'sideloaded',
        );
      }
      await crashlytics.recordError(
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

/// The sentence shown when this build's package id and signing certificate
/// have no matching registration in the Firebase project.
///
/// It names the two values that identify the build, because they are what
/// somebody has to register to fix it and there is nowhere else to read them
/// from a Play-signed release. Written for a member first — the action that
/// gets them in is email — with the detail trailing for whoever they show it
/// to.
@visibleForTesting
String unregisteredBuildMessage() {
  final signature = AppSignatureReader.cached;
  final fingerprint = AppSignature.formatted(signature?.sha1);
  if (signature == null || fingerprint == null) {
    return 'Google Sign-In is not set up for this build of the app. '
        'Use your email and password, or update to the latest version.';
  }
  return 'Google Sign-In is not set up for this build of the app. '
      'Use your email and password to continue. '
      'If you are reporting this: ${signature.packageName} · $fingerprint';
}

/// Whether a `canceled` verdict really was somebody dismissing the sheet.
///
/// ── Why this is decided on a string ───────────────────────────────────────
/// Because the enum cannot decide it. Tracing the Android plugin
/// (`google_sign_in_android` 7.2.16, `GoogleSignInPlugin.java`), every
/// `GetCredentialCancellationException` becomes `GetCredentialFailureType
/// .CANCELED` becomes `GoogleSignInExceptionCode.canceled`, with the platform
/// exception's message carried through as [GoogleSignInException.description]
/// and nothing else to tell the cases apart. Credential Manager raises that
/// exception for a swipe-away — description "activity is cancelled by the
/// user." — and has also been observed raising it when it declines to present
/// a sheet at all.
///
/// The two mistakes are not equally bad. Falling through on a real dismissal
/// costs one unwanted browser tab, once. Stopping on a suppressed sheet is a
/// button that does nothing, on every attempt, on a device where the hosted
/// flow would have signed the member straight in — and it looks identical to
/// "the app is broken". So the burden of proof sits on the dismissal: an
/// absent, empty or unrecognised description is *not* one.
@visibleForTesting
bool isUserDismissal(String? description) {
  if (description == null) return false;
  final text = description.toLowerCase();
  return text.contains('cancelled by the user') ||
      text.contains('canceled by the user') ||
      text.contains('user cancelled') ||
      text.contains('user canceled');
}

/// The provider's verdict in one line, for [AuthFailure.detail].
String _providerDetail(GoogleSignInException error) {
  final code = error.code.name;
  final description = error.description?.trim() ?? '';
  return description.isEmpty ? code : '$code: $description';
}

/// Converts provider outcomes into UI-safe failures.
///
/// Only an explicit dismissal is silent. Android may report `interrupted`
/// after the account chooser when the activity is recreated or the provider
/// flow is disrupted; treating that as a cancellation previously made the
/// button appear to do nothing.
///
/// Every failure now carries the provider's own code and description as
/// [AuthFailure.detail], because the member-facing sentence deliberately does
/// not name them and they are the only thing that identifies which failure
/// this was. See [AuthFailure.detail].
@visibleForTesting
AuthFailure googleSignInFailure(GoogleSignInException error) {
  final failure = switch (error.code) {
    GoogleSignInExceptionCode.canceled => const AuthFailure(
      AuthFailureKind.cancelled,
      'Google Sign-In did not finish. Please try again.',
    ),
    GoogleSignInExceptionCode.interrupted => const AuthFailure(
      AuthFailureKind.unavailable,
      'Google Sign-In was interrupted. Please try again.',
    ),
    // Split apart, because they are two different people's problems and used
    // to produce one sentence blaming the build.
    //
    // `clientConfigurationError` is ours: the plugin raises it when the server
    // client id is missing, which is a thing this app passes in code.
    // `providerConfigurationError` is the device's: Credential Manager not
    // supported on this Android version, or Play services unable to serve a
    // provider. Telling somebody on an old handset that "this build of the app
    // is not registered" sends them to report a fault that does not exist —
    // and it is what they were told, because every registration was in place
    // the whole time.
    GoogleSignInExceptionCode.clientConfigurationError => AuthFailure(
      AuthFailureKind.configuration,
      unregisteredBuildMessage(),
    ),
    GoogleSignInExceptionCode.providerConfigurationError => const AuthFailure(
      AuthFailureKind.configuration,
      'This device cannot show the Google account sheet. '
          'Check Google Play services is up to date, or use your email and '
          'password.',
    ),
    GoogleSignInExceptionCode.uiUnavailable => const AuthFailure(
      AuthFailureKind.unavailable,
      'Google Sign-In cannot open right now. Return to the app and try again.',
    ),
    GoogleSignInExceptionCode.userMismatch => const AuthFailure(
      AuthFailureKind.accountConflict,
      'A different Google account is already active. Sign out and try again.',
    ),
    // Android reports "no Google account is available to offer you" through the
    // same channel as a genuine fault, so the description is the only thing that
    // separates "add an account to this phone" from "this build is not
    // registered". Keeping it is what makes the difference readable.
    GoogleSignInExceptionCode.unknownError => AuthFailure(
      AuthFailureKind.unknown,
      error.description ?? 'Google Sign-In failed. Please try again.',
    ),
  };
  return failure.withDetail(_providerDetail(error));
}

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
      // Both of these mean the same thing: this build's package id and signing
      // certificate are not registered in the Firebase project. Firebase's own
      // wording for the first — "there was an error while trying to get your
      // package certificate hash" — describes the SDK's internals rather than
      // anything a member can act on, and describes them misleadingly: the
      // hash was obtained perfectly well, it was the lookup that came back
      // empty.
      'invalid-cert-hash' || 'app-not-authorized' => AuthFailure(
        AuthFailureKind.configuration,
        unregisteredBuildMessage(),
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
