import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_repository.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';

/// The one downloads repository. Local-only, so it exists in every environment
/// — including widget tests and a launch with no Firebase.
final downloadsRepositoryProvider = Provider<DownloadsRepository>((ref) {
  final repository = DownloadsRepository(ref.watch(appDatabaseProvider));
  ref.onDispose(repository.dispose);
  return repository;
});

/// Everything kept offline, newest first.
final downloadsProvider = StreamProvider<List<DownloadedTrackRecord>>(
  (ref) => ref.watch(downloadsRepositoryProvider).watch(),
);

/// The ids of everything downloaded, for a download button to read.
final downloadedIdsProvider = Provider<Set<String>>((ref) {
  final rows = ref.watch(downloadsProvider).asData?.value;
  return {
    for (final row in rows ?? const <DownloadedTrackRecord>[]) row.trackId,
  };
});

/// How the music queue asks what is available offline.
///
/// ── Why this is a function behind a provider, and empty by default ────────
/// The same reason `musicAudioHandlerProvider` is null by default. Reaching
/// the download index means opening the on-device database, which means a
/// platform channel — and every widget test in this suite builds a bare
/// `ProviderScope` with no overrides, where that channel does not exist.
/// A default that touched it would take hundreds of green tests down with it,
/// and it would do so from inside drift's lazy open, where no `try` in this
/// package can catch it.
///
/// So the default answers "nothing is downloaded", which is exactly true in a
/// test, and `main()` overrides it with the real lookup. The consequence to
/// remember: a queue built in an un-overridden scope streams everything.
final offlineTrackUrlsLookupProvider =
    Provider<Future<Map<String, String>> Function()>(
      (ref) =>
          () async => const <String, String>{},
    );

/// How many tracks this member may keep offline. Zero without a subscription.
final downloadLimitProvider = Provider<int>(
  (ref) => ref.watch(tierBenefitsProvider).offlineDownloadLimit,
);

/// Whether offline listening is available at all right now.
final downloadsAllowedProvider = Provider<bool>(
  (ref) => ref.watch(downloadLimitProvider) > 0,
);

/// Bytes on disk, for the line under the Downloads heading.
final downloadsSizeProvider = FutureProvider<int>((ref) async {
  ref.watch(downloadsProvider);
  return ref.watch(downloadsRepositoryProvider).bytesUsed();
});
