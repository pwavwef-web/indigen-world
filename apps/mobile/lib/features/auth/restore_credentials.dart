import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/core/secure_storage.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';

/// Zero-Tap Sign-In: signing a member back in on their next Android phone.
///
/// ── What Play asks for ────────────────────────────────────────────────────
/// From April 2027, an app that supports sign-in has to restore the session
/// when somebody moves to a new device — without a tap, without a password,
/// without the account chooser. The mechanism is Android's Restore Credentials
/// API, and the shape of it is three moments:
///
///   1. A member signs in here. The system mints a *restore key* — a
///      public-key credential whose private half never leaves the device's
///      credential store — and the backup service carries it forward.
///   2. They set up a new phone and install the app. The key arrives with the
///      restore, and the first launch asserts it. The backend checks the
///      signature and hands back a session.
///   3. They sign out. Both halves of the key are forgotten.
///
/// ── Everything here is best-effort ────────────────────────────────────────
/// Restore Credentials needs Android 9, current Play services, and a member
/// with a screen lock and backup switched on. A great many devices will meet
/// none of that, and on every one of them the correct behaviour is the app as
/// it is today: the sign-in screen, and nobody told anything. So every failure
/// path here is a `debugPrint` and a return. Nothing in this file can make
/// signing in worse, only quieter.
///
/// The backend half is `services/functions/src/restore-credentials.ts`.
class RestoreCredentialPlatform {
  const RestoreCredentialPlatform();

  static const _channel = MethodChannel(
    'world.indigen.mobile/restore_credentials',
  );

  bool get isSupported => defaultTargetPlatform == TargetPlatform.android;

  /// Mints a restore key from the relying party's creation options.
  ///
  /// Returns the attestation JSON, or null when the device would not make one.
  Future<String?> create(String requestJson) async {
    if (!isSupported) return null;
    try {
      return await _channel.invokeMethod<String>('create', {
        'requestJson': requestJson,
        'cloudBackup': true,
      });
    } on Object catch (error) {
      debugPrint('Restore key could not be created: $error');
      return null;
    }
  }

  /// Asserts the restore key this device was given, if it was given one.
  Future<String?> assertKey(String requestJson) async {
    if (!isSupported) return null;
    try {
      return await _channel.invokeMethod<String>('get', {
        'requestJson': requestJson,
      });
    } on Object catch (error) {
      // The overwhelmingly common case, and not a fault: a device set up from
      // scratch has no key to assert.
      debugPrint('No restore key to assert: $error');
      return null;
    }
  }

  /// Forgets the key on this device.
  Future<void> clear() async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod<bool>('clear');
    } on Object catch (error) {
      debugPrint('Restore key could not be cleared: $error');
    }
  }
}

/// Drives the three moments described on [RestoreCredentialPlatform].
class RestoreCredentialService {
  RestoreCredentialService({
    required this.auth,
    required this.functions,
    required this.storage,
    this.platform = const RestoreCredentialPlatform(),
  });

  final FirebaseAuth auth;
  final FirebaseFunctions functions;
  final FlutterSecureStorage storage;
  final RestoreCredentialPlatform platform;

  static const _timeout = Duration(seconds: 25);

  /// Which account this install has already minted a key for.
  ///
  /// Deliberately in the secure store rather than in preferences, and the
  /// reason is the backup rules two directories away: preferences *are*
  /// restored to the new device, so a marker kept there would arrive saying
  /// "this install already has a key" on the one device that does not. The
  /// secure store is encrypted with keys that never leave the handset, so a
  /// restored copy is unreadable — which is exactly the semantics wanted here.
  static const _mintedForKey = 'restore_credential_uid';

  /// Whether a silent restore has already been tried this launch.
  ///
  /// Once, and only once. Trying again after a member signs out would sign
  /// them straight back in, which is not a convenience — it is a bug that
  /// looks like the sign-out button being broken.
  bool _restoreAttempted = false;

  /// Mints a restore key for [uid], unless this install already has one.
  ///
  /// Called after a sign-in and again on later launches while signed in, which
  /// is what the Restore Credentials guide asks for: the first attempt may
  /// have happened with backup switched off or no screen lock set, and a
  /// member who fixed that later should still end up with a key.
  Future<void> ensureKeyFor(String uid) async {
    if (!platform.isSupported) return;
    if (await _readMintedFor() == uid) return;

    try {
      final started = await functions
          .httpsCallable(
            'startRestoreKeyRegistration',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
      if (started.data['enabled'] != true) return;

      final requestJson = started.data['requestJson'] as String? ?? '';
      final challengeId = started.data['challengeId'] as String? ?? '';
      if (requestJson.isEmpty || challengeId.isEmpty) return;

      final responseJson = await platform.create(requestJson);
      if (responseJson == null || responseJson.isEmpty) return;

      final finished = await functions
          .httpsCallable(
            'finishRestoreKeyRegistration',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>({
            'challengeId': challengeId,
            'responseJson': responseJson,
          });
      if (finished.data['created'] == true) await _writeMintedFor(uid);
    } on Object catch (error) {
      debugPrint('Restore key registration skipped: $error');
    }
  }

  /// Tries to sign in with the restore key this device was given.
  ///
  /// Returns whether a session was established. False is the ordinary answer
  /// — most launches are on a device that was never restored — and it is not
  /// worth surfacing anywhere.
  Future<bool> restoreSession() async {
    if (!platform.isSupported) return false;
    if (_restoreAttempted) return false;
    _restoreAttempted = true;
    if (auth.currentUser != null) return false;

    try {
      final started = await functions
          .httpsCallable(
            'startRestoreSignIn',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
      if (started.data['enabled'] != true) return false;

      final requestJson = started.data['requestJson'] as String? ?? '';
      final challengeId = started.data['challengeId'] as String? ?? '';
      if (requestJson.isEmpty || challengeId.isEmpty) return false;

      final responseJson = await platform.assertKey(requestJson);
      if (responseJson == null || responseJson.isEmpty) return false;

      final finished = await functions
          .httpsCallable(
            'finishRestoreSignIn',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>({
            'challengeId': challengeId,
            'responseJson': responseJson,
          });
      final customToken = finished.data['customToken'] as String? ?? '';
      if (customToken.isEmpty) return false;

      await auth.signInWithCustomToken(customToken);
      // Not marked as minted. The key that just worked belongs to the previous
      // handset; this one should have its own, and `ensureKeyFor` will mint it
      // as soon as the auth state settles.
      return true;
    } on Object catch (error) {
      debugPrint('Zero-tap sign-in did not run: $error');
      return false;
    }
  }

  /// Forgets the key, on the device and on the server.
  ///
  /// Called from sign-out. Both halves, because either one left behind is a
  /// way back into an account somebody has just closed: the device half could
  /// still be asserted, and the server half would still resolve a credential
  /// id to their uid.
  Future<void> forget() async {
    // Signing out is a decision to stop being signed in. Whatever happens
    // below, this launch must not quietly restore the session it just ended.
    _restoreAttempted = true;
    await platform.clear();
    try {
      await _clearMintedFor();
    } on Object catch (error) {
      debugPrint('Restore key marker could not be cleared: $error');
    }
    try {
      await functions
          .httpsCallable(
            'forgetRestoreKey',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
    } on Object catch (error) {
      debugPrint('Restore key could not be forgotten server-side: $error');
    }
  }

  Future<String?> _readMintedFor() async {
    try {
      return await storage.read(key: _mintedForKey);
    } on Object catch (error) {
      // A restored install carries ciphertext this device cannot read. That
      // reads as "no key here yet", which is the truth.
      debugPrint('Restore key marker unreadable: $error');
      return null;
    }
  }

  Future<void> _writeMintedFor(String uid) async {
    try {
      await storage.write(key: _mintedForKey, value: uid);
    } on Object catch (error) {
      debugPrint('Restore key marker could not be stored: $error');
    }
  }

  Future<void> _clearMintedFor() => storage.delete(key: _mintedForKey);
}

/// The service, or null when Firebase is unusable this launch.
final restoreCredentialServiceProvider = Provider<RestoreCredentialService?>((
  ref,
) {
  final auth = ref.watch(firebaseAuthProvider);
  if (auth == null) return null;
  return RestoreCredentialService(
    auth: auth,
    functions: FirebaseFunctions.instance,
    storage: ref.watch(secureStorageProvider),
  );
});

/// Watched once by the shell, exactly like `pushRegistrationProvider`.
///
/// Two jobs, chosen by whether anybody is signed in:
///
///   * signed in  — make sure this install has a restore key for them.
///   * signed out — try, once per launch, to be handed a session by one.
///
/// Sign-out is deliberately *not* handled here. This provider cannot tell a
/// member who just signed out from one who was never signed in, and guessing
/// wrong in that direction is a sign-out button that appears to do nothing.
/// Forgetting the key belongs to the sign-out itself, in [AuthRepository].
final restoreCredentialProvider = Provider<void>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return;
  final service = ref.watch(restoreCredentialServiceProvider);
  if (service == null) return;

  // `hasValue`, not `asData?.value`, and the difference matters here more than
  // anywhere else in the app. `authStateChanges` has not emitted anything on
  // the first frame — Firebase Auth restores a persisted session
  // asynchronously — so an unresolved stream reads as "signed out" through
  // `asData?.value`. Acting on that would fire a restore attempt on every cold
  // launch of an already-signed-in member: harmless, since it would restore
  // the same account, but it is a round trip and a session churn for nothing.
  // Waiting costs one rebuild.
  final authState = ref.watch(authStateProvider);
  if (!authState.hasValue) return;

  final user = authState.value;
  if (user == null) {
    unawaited(service.restoreSession());
  } else {
    unawaited(service.ensureKeyFor(user.uid));
  }
});
