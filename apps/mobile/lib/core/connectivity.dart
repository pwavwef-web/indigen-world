import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// Live link-layer connectivity.
///
/// `onConnectivityChanged` only fires on a *change*, so a device that never
/// changes network after launch would otherwise sit on "no value" forever.
/// The stream is seeded with a one-shot [Connectivity.checkConnectivity] so the
/// first value arrives immediately.
final connectivityResultsProvider = StreamProvider<List<ConnectivityResult>>((
  ref,
) async* {
  final connectivity = Connectivity();
  try {
    yield await connectivity.checkConnectivity();
  } on Object {
    // The platform channel can fail on some OEM builds; treat that as unknown
    // rather than as "offline" and let the change stream correct us.
  }
  yield* connectivity.onConnectivityChanged;
});

/// Whether the device currently has a usable network link.
///
/// Unknown counts as online. A false negative here is far more damaging than a
/// false positive: it blocks sign-in and posting on a working connection,
/// whereas an optimistic guess simply surfaces the real network error.
final isOnlineProvider = Provider<bool>((ref) {
  final results = ref.watch(connectivityResultsProvider).value;
  if (results == null || results.isEmpty) return true;
  return !results.every((result) => result == ConnectivityResult.none);
});

/// Why a Firebase-backed action cannot run right now, or `null` when it can.
enum ConnectionBlock {
  /// The device has no network link at all.
  offline,

  /// Firebase failed to start this launch, so nothing server-side is reachable
  /// until the app is relaunched with a connection.
  firebaseUnavailable,
}

/// A single answer to "can this device talk to Indigen World right now?".
///
/// Every gate in the app reads this instead of testing connectivity and
/// Firebase readiness separately, so the message a member sees always matches
/// the actual reason.
final connectionBlockProvider = Provider<ConnectionBlock?>((ref) {
  if (!ref.watch(isOnlineProvider)) return ConnectionBlock.offline;
  if (!ref.watch(firebaseReadyProvider)) {
    return ConnectionBlock.firebaseUnavailable;
  }
  return null;
});

extension ConnectionBlockMessage on ConnectionBlock {
  /// Short, honest copy for a snackbar or banner.
  String get message => switch (this) {
    ConnectionBlock.offline =>
      'You are offline. Reconnect and this will go through.',
    ConnectionBlock.firebaseUnavailable =>
      'Indigen World could not be reached this launch. Close and reopen the '
          'app to try again.',
  };

  String get shortLabel => switch (this) {
    ConnectionBlock.offline => 'No connection',
    ConnectionBlock.firebaseUnavailable => 'Reconnecting to Indigen World',
  };
}
