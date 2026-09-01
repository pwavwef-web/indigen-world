import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// Google Play's opinion of the device this app is running on.
///
/// ── What this is for, and what it is not ──────────────────────────────────
/// Firebase App Check already runs the Play Integrity provider on every
/// Firestore read and every callable (see `firebase_bootstrap.dart`). That is
/// the protection. This is the *diagnosis*: Play Console lists seven integrity
/// services — licensing, app tampering, risky devices, Play Games for PC,
/// hyperactive devices, known malware, apps with risky permissions — and none
/// of them are readable from an App Check token. They come from an integrity
/// token requested directly, which is what this class does.
///
/// ── Nothing here decides anything ─────────────────────────────────────────
/// The token is opaque and is never opened on the device. It goes to
/// `verifyDeviceIntegrity`, which decodes it against Google and returns a
/// verdict. An app that judged its own integrity would be an app that a
/// tampered build could be told to judge differently, so the only thing this
/// code is trusted to do is carry bytes.
///
/// ── Failure is not a verdict ──────────────────────────────────────────────
/// Every failure path resolves to [DeviceIntegrityVerdict.unavailable]: no Play
/// Store on the device, no network, a Google outage, an emulator, an iOS build.
/// None of those are evidence about a member and none of them may stop
/// anything. The only value that ever blocks is one where the server explicitly
/// said `blocked`.
@immutable
class DeviceIntegrityVerdict {
  const DeviceIntegrityVerdict({
    required this.decision,
    required this.blocked,
    this.reasons = const <String>[],
    this.deviceTrust = '',
  });

  /// No check ran, or one ran and could not finish. Never blocks.
  static const unavailable = DeviceIntegrityVerdict(
    decision: 'unavailable',
    blocked: false,
  );

  /// `allow`, `flag`, `block` or `unavailable`.
  final String decision;

  /// Whether the *server* said to stop. False unless the backend is in
  /// `enforce` mode and this device genuinely failed.
  final bool blocked;

  /// Machine-readable causes: `device_untrusted`, `app_tampered`,
  /// `play_protect_risk`, `hyperactive_device`, and so on.
  final List<String> reasons;

  /// `strong`, `device`, `basic`, `virtual` or `none`.
  final String deviceTrust;

  bool get ran => decision != 'unavailable';
}

/// The Android side of the Play Integrity Standard API.
class PlayIntegrityChannel {
  const PlayIntegrityChannel();

  static const _channel = MethodChannel('world.indigen.mobile/play_integrity');

  bool get isSupported => defaultTargetPlatform == TargetPlatform.android;

  /// Prepares the token provider so the first real request is fast.
  ///
  /// Slow — it reaches Google — and worth doing off the critical path at
  /// start-up. Failure is swallowed: a warm-up is an optimisation, and a phone
  /// with no Play Store fails it every time by design.
  Future<void> warmUp() async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod<bool>('warmUp');
    } on Object catch (error) {
      debugPrint('Play Integrity warm-up skipped: $error');
    }
  }

  /// A token bound to [requestHash], or null when Play would not mint one.
  Future<String?> requestToken(String requestHash) async {
    if (!isSupported) return null;
    try {
      return await _channel.invokeMethod<String>('requestToken', {
        'requestHash': requestHash,
      });
    } on Object catch (error) {
      // `play_integrity_-9` is "no Play Store", `-8` is "too many requests".
      // Both are ordinary on real devices and neither is worth a report.
      debugPrint('Play Integrity token unavailable: $error');
      return null;
    }
  }
}

/// Runs a whole check: challenge, token, verdict.
class DeviceIntegrityService {
  DeviceIntegrityService(this._functions, {PlayIntegrityChannel? channel})
    : _channel = channel ?? const PlayIntegrityChannel();

  final FirebaseFunctions _functions;
  final PlayIntegrityChannel _channel;

  static const _timeout = Duration(seconds: 25);

  DeviceIntegrityVerdict _last = DeviceIntegrityVerdict.unavailable;

  /// The last verdict this launch. Never null, never stale enough to matter.
  DeviceIntegrityVerdict get last => _last;

  Future<void> warmUp() => _channel.warmUp();

  /// Checks the device, returning [DeviceIntegrityVerdict.unavailable] on any
  /// failure at all.
  ///
  /// The three steps have to be in this order and cannot be collapsed: the
  /// hash has to be issued by the server before the token is minted, or the
  /// token proves nothing about *this* request and could be one somebody
  /// captured from another device.
  Future<DeviceIntegrityVerdict> check() async {
    if (!_channel.isSupported) {
      return _last = DeviceIntegrityVerdict.unavailable;
    }

    try {
      final started = await _functions
          .httpsCallable(
            'startIntegrityCheck',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>();
      final challenge = started.data;
      if (challenge['enabled'] != true) {
        return _last = DeviceIntegrityVerdict.unavailable;
      }

      final requestHash = challenge['requestHash'] as String? ?? '';
      final challengeId = challenge['challengeId'] as String? ?? '';
      if (requestHash.isEmpty) {
        return _last = DeviceIntegrityVerdict.unavailable;
      }

      final token = await _channel.requestToken(requestHash);
      if (token == null || token.isEmpty) {
        return _last = DeviceIntegrityVerdict.unavailable;
      }

      final verified = await _functions
          .httpsCallable(
            'verifyDeviceIntegrity',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>({
            'token': token,
            'challengeId': challengeId,
          });
      final data = verified.data;
      if (data['enabled'] != true) {
        return _last = DeviceIntegrityVerdict.unavailable;
      }

      return _last = DeviceIntegrityVerdict(
        decision: data['decision'] as String? ?? 'allow',
        blocked: data['blocked'] == true,
        reasons: (data['reasons'] as List<Object?>? ?? const [])
            .whereType<String>()
            .toList(growable: false),
        deviceTrust: data['deviceTrust'] as String? ?? '',
      );
    } on Object catch (error) {
      debugPrint('Device integrity check did not complete: $error');
      return _last = DeviceIntegrityVerdict.unavailable;
    }
  }
}

/// Null until Firebase is up, exactly like every other callable-backed service.
final deviceIntegrityServiceProvider = Provider<DeviceIntegrityService?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return DeviceIntegrityService(FirebaseFunctions.instance);
});

/// Runs one check for this launch and caches the answer.
///
/// Deliberately a provider rather than something `main()` awaits. A check costs
/// a round trip to Google and back to our own backend, and nothing on the first
/// frame depends on the answer — so it happens when a screen that cares first
/// asks, and everything else launches at the speed it always did.
final deviceIntegrityProvider = FutureProvider<DeviceIntegrityVerdict>((
  ref,
) async {
  final service = ref.watch(deviceIntegrityServiceProvider);
  if (service == null) return DeviceIntegrityVerdict.unavailable;
  return service.check();
});
