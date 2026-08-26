import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The package id and signing certificate this build actually runs as.
///
/// Google Sign-In is granted to a *pair* — package id plus signing certificate
/// — registered in the Firebase project, and neither Android nor Firebase will
/// tell a member which pair their build presented when the grant is missing.
/// Play App Signing widens the gap further: the certificate on the device is
/// minted by Google after upload, so it appears in no keystore anybody here
/// owns. Reading it off the running app turns "sign-in is broken" into a value
/// that can be pasted into `firebase apps:android:sha:create`.
@immutable
class AppSignature {
  const AppSignature({
    required this.packageName,
    this.sha1,
    this.sha256,
    this.certificateCount = 0,
    this.installer,
    this.androidSdk,
  });

  final String packageName;

  /// Lowercase hex, no separators — the form the Firebase console and CLI take.
  final String? sha1;
  final String? sha256;

  /// How many certificates the package carries. More than one means the
  /// signing key was rotated, which changes which hash Google compares.
  final int certificateCount;

  /// The store that installed this build. `com.android.vending` means Play
  /// re-signed it, so [sha1] is Google's app-signing key, not the upload key.
  final String? installer;

  final int? androidSdk;

  bool get isPlayInstall => installer == 'com.android.vending';

  /// The one-line form used in support messages and Crashlytics keys.
  String get summary =>
      '$packageName · SHA-1 ${sha1 ?? 'unavailable'}'
      '${isPlayInstall ? ' · Play-signed' : ''}';

  /// Groups of two hex characters, colon separated — how Play Console and the
  /// Firebase console both display a fingerprint, so a member comparing the
  /// two is comparing like with like.
  static String? formatted(String? hex) {
    if (hex == null || hex.isEmpty) return null;
    final pairs = <String>[];
    for (var index = 0; index + 1 < hex.length; index += 2) {
      pairs.add(hex.substring(index, index + 2).toUpperCase());
    }
    return pairs.join(':');
  }
}

/// Reads [AppSignature] from the host platform, once per launch.
///
/// Only Android publishes the channel; every other platform resolves to null
/// rather than throwing, because this is a diagnostic and must never be the
/// reason a screen fails to build.
class AppSignatureReader {
  const AppSignatureReader();

  static const _channel = MethodChannel('world.indigen.mobile/app_signature');

  static AppSignature? _cached;

  /// The last value read, for callers that cannot await — error reporting on
  /// a failed sign-in, for instance. Null until [read] has completed once.
  static AppSignature? get cached => _cached;

  Future<AppSignature?> read() async {
    if (_cached != null) return _cached;
    if (defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      final raw = await _channel.invokeMapMethod<String, Object?>('read');
      if (raw == null) return null;
      return _cached = AppSignature(
        packageName: raw['packageName'] as String? ?? '',
        sha1: raw['sha1'] as String?,
        sha256: raw['sha256'] as String?,
        certificateCount: raw['certificateCount'] as int? ?? 0,
        installer: raw['installer'] as String?,
        androidSdk: raw['androidSdk'] as int?,
      );
    } on Object catch (error) {
      debugPrint('App signature unavailable: $error');
      return null;
    }
  }
}

/// The running build's identity, or null where the platform has none to give.
final appSignatureProvider = FutureProvider<AppSignature?>(
  (ref) => const AppSignatureReader().read(),
);
