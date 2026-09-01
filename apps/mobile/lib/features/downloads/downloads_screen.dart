import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/paywall_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// What is kept on this device, and how much of it there is.
///
/// ── Why downloads survive a lapsed subscription ───────────────────────────
/// Nothing here is deleted when somebody stops paying. The files are already on
/// their phone, they were downloaded while the subscription was live, and
/// reaching into a member's storage to take back songs they can still stream
/// for nothing would be a punishment with no purpose. What lapses is the
/// ability to add *more*: the limit drops to zero and the download button on a
/// new track starts opening the paywall instead.
class DownloadsScreen extends ConsumerWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final downloads = ref.watch(downloadsProvider);
    final limit = ref.watch(downloadLimitProvider);
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
          const PaywallScreen(highlight: SubscriptionTier.plus),
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

class _DownloadRow extends StatelessWidget {
  const _DownloadRow({required this.row, required this.onRemove});

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
