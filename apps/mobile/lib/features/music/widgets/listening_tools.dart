import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/share_text.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_likes.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_sleep_timer.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// The four things to do with what is playing besides play it: keep it, slow
/// it down or speed it up, set it to stop, pass it on.
///
/// Pills under the transport rather than icons in the top bar, because two of
/// them carry a state worth reading at a glance — "1.5×", "12:05 left" — and a
/// state hidden behind an icon is a state somebody forgets they set.
class ListeningTools extends ConsumerWidget {
  const ListeningTools({required this.item, required this.kind, super.key});

  final MediaItem item;
  final CollectionKind? kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liked = ref.watch(isSongLikedProvider(item.id));
    final speed = ref.watch(
      musicPlaybackStateProvider.select(
        (state) => state.asData?.value.speed ?? 1.0,
      ),
    );
    final sleep = ref.watch(musicSleepTimerProvider);

    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 8,
      children: [
        _ToolPill(
          key: const Key('now-playing-like'),
          icon: liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          label: liked ? 'Liked' : 'Like',
          active: liked,
          onPressed: () async {
            final now = await toggleLikedSong(ref, item.id);
            if (context.mounted) {
              showGlassToast(
                context,
                now
                    ? 'Added to your liked songs.'
                    : 'Removed from liked songs.',
              );
            }
          },
        ),
        _ToolPill(
          key: const Key('now-playing-speed'),
          icon: Icons.speed_rounded,
          label: musicSpeedLabel(speed),
          active: speed != 1.0,
          onPressed: () => _chooseSpeed(context, ref, speed),
        ),
        _ToolPill(
          key: const Key('now-playing-sleep'),
          icon: Icons.bedtime_outlined,
          label: sleep == null ? 'Sleep' : null,
          trailing: sleep == null ? null : const _SleepCountdown(),
          active: sleep != null,
          onPressed: () => showSleepTimerSheet(context, ref, kind: kind),
        ),
        _ToolPill(
          key: const Key('now-playing-share'),
          icon: Icons.ios_share_rounded,
          label: 'Share',
          active: false,
          onPressed: () => shareText(
            context,
            collectionShareText(
              title: item.title,
              creator: item.artist ?? '',
              kind: kind ?? CollectionKind.music,
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _chooseSpeed(
    BuildContext context,
    WidgetRef ref,
    double current,
  ) => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: context.brand.surfaceElevated,
    sheetAnimationStyle: AnimationStyle(
      duration: motionOr(context, AppMotion.standard),
      reverseDuration: motionOr(context, AppMotion.quick),
    ),
    builder: (sheetContext) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _SheetTitle('Playback speed'),
            for (final speed in musicSpeeds)
              ListTile(
                key: Key('speed-${musicSpeedLabel(speed)}'),
                title: Text(
                  speed == 1 ? 'Normal (1×)' : musicSpeedLabel(speed),
                ),
                trailing: speed == current
                    ? Icon(Icons.check_rounded, color: context.brand.accent)
                    : null,
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  ref.read(musicControllerProvider.notifier).setSpeed(speed);
                },
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text(
                'Remembered separately for songs and for readings.',
                style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// The sleep timer's choices: a length of time, or the end of what is
/// playing — and, while one runs, the way to turn it off.
Future<void> showSleepTimerSheet(
  BuildContext context,
  WidgetRef ref, {
  CollectionKind? kind,
}) {
  final timer = ref.read(musicSleepTimerProvider.notifier);
  final running = ref.read(musicSleepTimerProvider) != null;
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: context.brand.surfaceElevated,
    sheetAnimationStyle: AnimationStyle(
      duration: motionOr(context, AppMotion.standard),
      reverseDuration: motionOr(context, AppMotion.quick),
    ),
    builder: (sheetContext) {
      void pick(VoidCallback action, String said) {
        Navigator.of(sheetContext).pop();
        action();
        showGlassToast(context, said);
      }

      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _SheetTitle('Sleep timer'),
              for (final after in musicSleepChoices)
                ListTile(
                  key: Key('sleep-${after.inMinutes}'),
                  leading: const Icon(Icons.timer_outlined),
                  title: Text(
                    after.inMinutes == 60
                        ? '1 hour'
                        : '${after.inMinutes} minutes',
                  ),
                  onTap: () => pick(
                    () => timer.start(after),
                    after.inMinutes == 60
                        ? 'Music stops in an hour.'
                        : 'Music stops in ${after.inMinutes} minutes.',
                  ),
                ),
              ListTile(
                key: const Key('sleep-end-of-track'),
                leading: const Icon(Icons.last_page_rounded),
                title: Text(
                  kind == CollectionKind.audiobooks
                      ? 'End of this reading'
                      : 'End of this song',
                ),
                onTap: () =>
                    pick(timer.startEndOfTrack, 'Stops when this one ends.'),
              ),
              if (running)
                ListTile(
                  key: const Key('sleep-off'),
                  leading: Icon(
                    Icons.close_rounded,
                    color: context.brand.danger,
                  ),
                  title: const Text('Turn off the timer'),
                  onTap: () => pick(timer.cancel, 'Sleep timer off.'),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Text(
                  'The music fades out over the last ten seconds.',
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _SheetTitle extends StatelessWidget {
  const _SheetTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
    child: Text(
      text,
      style: TextStyle(
        color: context.brand.ink,
        fontSize: 20,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

/// A translucent pill over the song's colour.
class _ToolPill extends StatelessWidget {
  const _ToolPill({
    required this.icon,
    required this.active,
    required this.onPressed,
    this.label,
    this.trailing,
    super.key,
  });

  final IconData icon;
  final String? label;
  final Widget? trailing;
  final bool active;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => PressScale(
    pressed: 0.94,
    child: Material(
      color: Colors.white.withValues(alpha: active ? 0.26 : 0.12),
      shape: const StadiumBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 6),
              if (label case final text?)
                Text(
                  text,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ?trailing,
            ],
          ),
        ),
      ),
    ),
  );
}

/// The time left on the sleep timer, redrawn once a second — on its own, so
/// the rest of the page is not rebuilt with it.
class _SleepCountdown extends ConsumerStatefulWidget {
  const _SleepCountdown();

  @override
  ConsumerState<_SleepCountdown> createState() => _SleepCountdownState();
}

class _SleepCountdownState extends ConsumerState<_SleepCountdown> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final timer = ref.watch(musicSleepTimerProvider);
    final left = ref.read(musicSleepTimerProvider.notifier).remaining();
    final text = switch ((timer, left)) {
      (null, _) => 'Sleep',
      (_, null) => 'End of track',
      (final running?, final time?) when running.atEndOfTrack =>
        'Ends in ${musicSleepLabel(time)}',
      (_, final time?) => '${musicSleepLabel(time)} left',
    };
    return Text(
      text,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 13,
        fontWeight: FontWeight.w800,
        fontFeatures: [FontFeature.tabularFigures()],
      ),
    );
  }
}
