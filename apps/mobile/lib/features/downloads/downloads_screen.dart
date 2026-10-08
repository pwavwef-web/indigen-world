import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:indigen_world_mobile/features/music/now_playing_screen.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/membership_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// What is kept on this device, and how much of it there is.
///
/// Files remain device-local after expiry. Managed offline playback and new
/// downloads require the current account's unexpired subscription benefits.
class DownloadsScreen extends ConsumerWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final downloads = ref.watch(downloadsProvider);
    final limit = ref.watch(downloadLimitProvider);
    final allowed = ref.watch(downloadsAllowedProvider);
    final playable = ref.watch(playableDownloadsProvider);
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
          error: (error, _) => const Padding(
            padding: EdgeInsets.all(24),
            child: GlassEmptyState(
              icon: Icons.error_outline_rounded,
              title: 'The offline list could not be read.',
            ),
          ),
          data: (loaded) => ListView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
            children: [
              _Summary(count: loaded.length, limit: limit, bytes: bytes),
              if (!allowed && loaded.isNotEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('Your files are kept on this device. Sign in with an active offline subscription to play them.')),
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
                    playable: playable.asData?.value.containsKey(row.trackId) ?? false,
                    allowed: allowed,
                    onPlay: () async {
                      await ref.read(musicControllerProvider.notifier).playDownloads(loaded, trackId: row.trackId);
                      if (!context.mounted) return;
                      final error = ref.read(musicControllerProvider).error;
                      if (error != null) { showGlassToast(context, error); return; }
                      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NowPlayingScreen()));
                    },
                    onRepair: () async {
                      final error = await ref.read(downloadsRepositoryProvider).download(MusicTrack(id: row.trackId, title: row.title, artist: row.artist, album: row.album, url: row.sourceUrl, artworkUrl: row.artworkUrl), kind: CollectionKind.values.firstWhere((kind) => kind.name == row.kind, orElse: () => CollectionKind.music), limit: allowed ? limit : 0);
                      ref.invalidate(playableDownloadsProvider);
                      if (context.mounted && error != null) showGlassToast(context, error);
                    },
                    onRemove: () => ref
                        .read(downloadsRepositoryProvider)
                        .remove(row.trackId),
                  ),
            ],
          ),
        ),
      ),
    );
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
    await ref.read(downloadsRepositoryProvider).removeAll();
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

class _DownloadRow extends StatefulWidget {
  const _DownloadRow({required this.row, required this.onRemove, required this.onPlay, required this.onRepair, required this.playable, required this.allowed});

  final DownloadedTrackRecord row;
  final VoidCallback onRemove;
  final Future<void> Function() onPlay, onRepair;
  final bool playable, allowed;

  @override
  State<_DownloadRow> createState() => _DownloadRowState();
}
class _DownloadRowState extends State<_DownloadRow> {
  bool _busy = false;
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try { await action(); } finally { if (mounted) setState(() => _busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassSurface(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            IconButton(tooltip: widget.playable ? 'Play downloaded track' : 'Download missing or incomplete file again', onPressed: widget.allowed && !_busy ? () => _run(widget.playable ? widget.onPlay : widget.onRepair) : null, icon: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(widget.playable ? Icons.play_circle_outline_rounded : Icons.download_rounded)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.row.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (widget.row.artist case final artist? when artist.isNotEmpty)
                        artist,
                      widget.row.album,
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: brand.mutedInk, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (widget.playable) IconButton(tooltip: 'Download again if playback fails', onPressed: widget.allowed && !_busy ? () => _run(widget.onRepair) : null, icon: const Icon(Icons.refresh)),
            IconButton(
              tooltip: 'Remove',
              onPressed: widget.onRemove,
              icon: Icon(Icons.delete_outline_rounded, color: brand.mutedInk),
            ),
          ],
        ),
      ),
    );
  }
}
