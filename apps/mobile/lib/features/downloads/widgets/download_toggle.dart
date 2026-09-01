import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/paywall_screen.dart';

/// Keep this track on the device, or stop keeping it.
///
/// Three states and they are deliberately different *shapes*, not three shades
/// of one icon: an arrow to save, a ring while it saves, a filled tick once it
/// is there. At the size an app bar gives it, shape is the only thing that
/// reads at a glance.
///
/// Without a subscription the button is still shown and still tappable — it
/// opens the paywall. A control that is simply absent teaches nobody that the
/// feature exists; one that is greyed out with no explanation is worse.
class DownloadToggle extends ConsumerStatefulWidget {
  const DownloadToggle({required this.item, this.kind, super.key});

  /// The queue entry to save. Everything needed comes off it, including the
  /// remote URL in its extras.
  final MediaItem item;

  /// Which collection it came from, for grouping on the Downloads screen.
  final CollectionKind? kind;

  @override
  ConsumerState<DownloadToggle> createState() => _DownloadToggleState();
}

class _DownloadToggleState extends ConsumerState<DownloadToggle> {
  double? _progress;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final downloaded = ref
        .watch(downloadedIdsProvider)
        .contains(widget.item.id);
    final limit = ref.watch(downloadLimitProvider);

    if (_progress != null) {
      return Padding(
        padding: const EdgeInsets.all(14),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            value: _progress! > 0 ? _progress : null,
            strokeWidth: 2.4,
            color: brand.accent,
          ),
        ),
      );
    }

    return IconButton(
      tooltip: downloaded ? 'Remove the download' : 'Keep this offline',
      icon: Icon(
        downloaded
            ? Icons.download_done_rounded
            : Icons.download_for_offline_outlined,
        color: downloaded ? brand.accent : null,
      ),
      onPressed: () => downloaded ? _remove() : _download(limit),
    );
  }

  Future<void> _remove() async {
    await ref.read(downloadsRepositoryProvider).remove(widget.item.id);
  }

  Future<void> _download(int limit) async {
    if (limit <= 0) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) =>
              const PaywallScreen(highlight: SubscriptionTier.plus),
        ),
      );
      return;
    }

    final url = musicTrackUrlOf(widget.item);
    if (url == null) return;
    final track = MusicTrack(
      id: widget.item.id,
      title: widget.item.title,
      url: url,
      album: widget.item.album ?? '',
      artist: widget.item.artist,
      artworkUrl: widget.item.artUri?.toString(),
    );

    setState(() => _progress = 0);
    final failure = await ref
        .read(downloadsRepositoryProvider)
        .download(
          track,
          kind: widget.kind ?? CollectionKind.music,
          limit: limit,
          onProgress: (value) {
            if (mounted) setState(() => _progress = value);
          },
        );
    if (!mounted) return;
    setState(() => _progress = null);
    if (failure != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(failure)));
    }
  }
}
