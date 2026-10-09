import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:indigen_world_mobile/features/music/now_playing_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/audio_artwork.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/membership_screen.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// What is kept on this device, and how much of it there is.
///
/// Files remain device-local after expiry. Managed offline playback and new
/// downloads require the current account's unexpired subscription benefits.
class DownloadsScreen extends ConsumerStatefulWidget {
  const DownloadsScreen({super.key});

  @override
  ConsumerState<DownloadsScreen> createState() => _DownloadsScreenState();
}

class _DownloadsScreenState extends ConsumerState<DownloadsScreen>
    with WidgetsBindingObserver {
  final _retrying = <String>{};
  final _failedPlayback = <String>{};
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(playableDownloadsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final downloads = ref.watch(downloadsProvider);
    final playable = ref.watch(playableDownloadsProvider);
    final artwork =
        ref.watch(downloadedArtworkProvider).asData?.value ??
        const <String, String>{};
    final limit = ref.watch(downloadLimitProvider);
    final allowed = ref.watch(downloadsAllowedProvider);
    final bytes = ref.watch(downloadsSizeProvider).asData?.value ?? 0;
    final rows = downloads.asData?.value ?? const <DownloadedTrackRecord>[];

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(
        title: const Text('Downloads'),
        actions: [
          if (rows.isNotEmpty)
            TextButton(
              onPressed: () => _clearAll(context, ref),
              child: const Text('Clear all'),
            ),
        ],
      ),
      body: SafeArea(
        child: downloads.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: GlassEmptyState(
              icon: Icons.error_outline_rounded,
              title: 'The offline list could not be read.',
              action: TextButton(
                onPressed: () => ref.invalidate(downloadsProvider),
                child: const Text('Retry'),
              ),
            ),
          ),
          data: (loaded) => ListView(
            padding: EdgeInsets.fromLTRB(18, 12, 18, 32 + musicInset(context)),
            children: [
              _Summary(count: loaded.length, limit: limit, bytes: bytes),
              const SizedBox(height: 16),
              if (loaded.isEmpty)
                GlassEmptyState(
                  icon: Icons.download_for_offline_outlined,
                  padding: EdgeInsets.zero,
                  title: limit > 0
                      ? 'Nothing is saved yet. Open a song and tap the '
                            'download button to keep it here.'
                      : 'Offline listening comes with a subscription.',
                  action: limit > 0
                      ? null
                      : FilledButton(
                          onPressed: () => _openPaywall(context),
                          child: const Text('See the plans'),
                        ),
                )
              else
                for (final row in loaded)
                  _DownloadRow(
                    row: row,
                    artwork: artwork[row.trackId] ?? row.artworkUrl,
                    allowed: allowed,
                    playable:
                        (playable.asData?.value.containsKey(row.trackId) ??
                            false) &&
                        !_failedPlayback.contains(row.trackId),
                    checking:
                        playable.isLoading || _retrying.contains(row.trackId),
                    onPlay: () async {
                      try {
                        final controller = ref.read(
                          musicControllerProvider.notifier,
                        );
                        await controller.playDownloads(
                          loaded,
                          trackId: row.trackId,
                        );
                        ref.invalidate(playableDownloadsProvider);
                        if (!context.mounted) return;
                        final error = ref.read(musicControllerProvider).error;
                        if (error != null) {
                          setState(() => _failedPlayback.add(row.trackId));
                          showGlassToast(context, error);
                          return;
                        }
                        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NowPlayingScreen()));
                      } on Object {
                        if (context.mounted) {
                          setState(() => _failedPlayback.add(row.trackId));
                          showGlassToast(
                            context,
                            'Could not play this file. Try downloading it again.',
                          );
                        }
                      }
                    },
                    onRetry: () => _retry(context, ref, row),
                    onRemove: () => _remove(row.trackId),
                  ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _retry(
    BuildContext context,
    WidgetRef ref,
    DownloadedTrackRecord row,
  ) async {
    if (!_retrying.add(row.trackId)) return;
    setState(() {});
    try {
      final limit = ref.read(downloadLimitProvider);
      if (limit <= 0 || !ref.read(downloadsAllowedProvider)) {
        await _openPaywall(context);
        return;
      }
      final error = await ref
          .read(downloadsRepositoryProvider)
          .download(
            MusicTrack(
              id: row.trackId,
              title: row.title,
              url: row.sourceUrl,
              album: row.album,
              artist: row.artist,
              artworkUrl: row.artworkUrl,
            ),
            kind:
                CollectionKind.values
                    .where((kind) => kind.name == row.kind)
                    .firstOrNull ??
                CollectionKind.music,
            limit: limit,
            force: true,
          );
      ref.invalidate(playableDownloadsProvider);
      if (error == null && mounted) {
        setState(() => _failedPlayback.remove(row.trackId));
      }
      if (context.mounted) {
        showGlassToast(context, error ?? 'Downloaded. Ready to play.');
      }
    } on Object {
      if (context.mounted) {
        showGlassToast(
          context,
          'Could not save this file. Check free storage and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _retrying.remove(row.trackId));
    }
  }

  Future<void> _remove(String trackId) async {
    try {
      await ref.read(downloadsRepositoryProvider).remove(trackId);
      ref.invalidate(playableDownloadsProvider);
      ref.invalidate(downloadedArtworkProvider);
    } on Object {
      if (mounted) {
        showGlassToast(context, 'Could not remove this download. Try again.');
      }
    }
  }

  Future<void> _openPaywall(BuildContext context) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) =>
          const MembershipScreen(highlight: SubscriptionTier.plus),
    ),
  );

  Future<void> _clearAll(BuildContext context, WidgetRef ref) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Remove every download?',
      message:
          'The files come off this phone. Everything can be played again over '
          'a connection, and downloaded again afterwards.',
      confirmLabel: 'Remove all',
      isDestructive: true,
    );
    if (confirmed != true) return;
    try {
      await ref.read(downloadsRepositoryProvider).removeAll();
      ref.invalidate(playableDownloadsProvider);
      ref.invalidate(downloadedArtworkProvider);
    } on Object {
      if (context.mounted) {
        showGlassToast(context, 'Could not remove every download. Try again.');
      }
    }
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.count,
    required this.limit,
    required this.bytes,
  });

  final int count;
  final int limit;
  final int bytes;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Icon(Icons.sd_storage_outlined, color: brand.accent),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  limit > 0
                      ? '$count of $limit kept offline'
                      : '$count kept offline',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  '${_megabytes(bytes)} on this phone',
                  style: TextStyle(color: brand.mutedInk, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// One decimal place up to 10 MB and none above it: "0.4 MB" is useful and
  /// "412.7 MB" is noise.
  static String _megabytes(int bytes) {
    final megabytes = bytes / (1024 * 1024);
    if (megabytes < 0.05) return 'Under 0.1 MB';
    if (megabytes < 10) return '${megabytes.toStringAsFixed(1)} MB';
    return '${megabytes.round()} MB';
  }
}

class _DownloadRow extends StatelessWidget {
  const _DownloadRow({
    required this.row,
    this.artwork,
    required this.onRemove,
    required this.playable,
    required this.allowed,
    required this.checking,
    required this.onPlay,
    required this.onRetry,
  });
  final String? artwork;
  final bool playable;
  final bool allowed;
  final bool checking;
  final VoidCallback onPlay;
  final VoidCallback onRetry;

  final DownloadedTrackRecord row;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassSurface(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            IconButton(
              tooltip: playable ? 'Play downloaded track' : 'Download missing or incomplete file again',
              onPressed: checking || !allowed
                  ? null
                  : playable
                  ? onPlay
                  : onRetry,
              icon: Icon(
                checking
                    ? Icons.hourglass_empty
                    : playable
                    ? Icons.play_arrow_rounded
                    : Icons.refresh_rounded,
              ),
            ),
            if (artwork != null)
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: AudioArtwork(
                  imageUrl: artwork!,
                  width: 44,
                  height: 44,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) =>
                      const Icon(Icons.audio_file_outlined),
                ),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    row.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  if (!playable && !checking)
                    Text(
                      'File unavailable · Download again',
                      style: TextStyle(color: brand.danger, fontSize: 12),
                    ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (row.artist case final artist? when artist.isNotEmpty)
                        artist,
                      row.album,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: brand.mutedInk, fontSize: 12),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Remove',
              onPressed: onRemove,
              icon: Icon(Icons.delete_outline_rounded, color: brand.mutedInk),
            ),
          ],
        ),
      ),
    );
  }
}
