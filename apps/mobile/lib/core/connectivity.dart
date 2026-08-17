import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final connectivityResultsProvider = StreamProvider<List<ConnectivityResult>>(
  (ref) => Connectivity().onConnectivityChanged,
);

final isOnlineProvider = Provider<bool>((ref) {
  final results = ref.watch(connectivityResultsProvider).value;
  return results == null || !results.contains(ConnectivityResult.none);
});
