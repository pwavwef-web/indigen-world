import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:just_audio/just_audio.dart';

class EntryDetailScreen extends ConsumerWidget {
  const EntryDetailScreen({required this.entryId, this.entry, super.key});

  final String entryId;
  final DictionaryEntry? entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundledEntry =
        entry ?? ref.watch(dictionaryRepositoryProvider).findById(entryId);
    final liveEntry = bundledEntry == null
        ? ref.watch(publishedDictionaryEntryProvider(entryId))
        : const AsyncData<DictionaryEntry?>(null);
    final resolvedEntry = bundledEntry ?? liveEntry.asData?.value;
    if (resolvedEntry == null && liveEntry.isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Opening entry')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (resolvedEntry == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Entry unavailable')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'This published entry could not be loaded.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: () =>
                      ref.invalidate(publishedDictionaryEntryProvider(entryId)),
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final savedIds =
        ref.watch(savedEntryIdsProvider).asData?.value ?? const <String>{};
    final isSaved = savedIds.contains(resolvedEntry.id);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dictionary entry'),
        actions: [
          IconButton(
            tooltip: isSaved ? 'Remove from saved words' : 'Save word',
            onPressed: () async {
              final saved = await ref
                  .read(savedEntryRepositoryProvider)
                  .toggle(resolvedEntry.id);
              ref.invalidate(savedEntryIdsProvider);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      saved
                          ? 'Saved on this device.'
                          : 'Removed from saved words.',
                    ),
                  ),
                );
              }
            },
            icon: Icon(
              isSaved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
            ),
          ),
        ],
      ),
      body: ScreenContainer(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (resolvedEntry.isSynthetic) ...[
              const DemoDataNotice(),
              const SizedBox(height: 20),
            ],
            Row(
              children: [
                StatusPill(
                  icon: Icons.verified_outlined,
                  label: resolvedEntry.isSynthetic
                      ? 'DEMO PROJECTION'
                      : 'PUBLISHED ENTRY',
                  color: context.brand.success,
                ),
                const Spacer(),
                Text(
                  resolvedEntry.partOfSpeech,
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              resolvedEntry.headword,
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 8),
            Text(
              resolvedEntry.translation,
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(color: context.brand.terracotta),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  avatar: const Icon(Icons.location_on_outlined, size: 18),
                  label: Text(resolvedEntry.dialect),
                ),
                const Chip(
                  avatar: Icon(Icons.language_rounded, size: 18),
                  label: Text('Kasem'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _DetailCard(
              icon: Icons.volume_up_outlined,
              title: 'Pronunciation',
              body: resolvedEntry.pronunciation,
              trailing: PronunciationButton(audioUrl: resolvedEntry.audioUrl),
            ),
            const SizedBox(height: 12),
            _DetailCard(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Example',
              body:
                  '${resolvedEntry.example}\n${resolvedEntry.exampleTranslation}',
            ),
            if (resolvedEntry.culturalNote != null) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.auto_stories_outlined,
                title: 'Cultural context',
                body: resolvedEntry.culturalNote!,
              ),
            ],
            const SizedBox(height: 12),
            _DetailCard(
              icon: Icons.gavel_outlined,
              title: 'Source and rights',
              body: resolvedEntry.attribution,
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () => context.push(
                '/contribute?source=${Uri.encodeQueryComponent(resolvedEntry.translation)}&entryId=${resolvedEntry.id}',
              ),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Suggest a correction'),
            ),
          ],
        ),
      ),
    );
  }

}

/// The play button beside a word's pronunciation.
///
/// It has been a stub since the dictionary shipped — the entry carried no
/// recording, so the button apologised for itself. Entries can now be
/// contributed with the word actually said aloud, reviewed like everything
/// else, and published with a world-readable audio URL, so the button has
/// something to do.
///
/// An entry without one still shows a button rather than nothing at all: an
/// absence explained in a sentence tells somebody the entry is incomplete,
/// where a missing control just looks like a feature that is not there.
class PronunciationButton extends ConsumerStatefulWidget {
  const PronunciationButton({required this.audioUrl, super.key});

  final String audioUrl;

  @override
  ConsumerState<PronunciationButton> createState() =>
      _PronunciationButtonState();
}

class _PronunciationButtonState extends ConsumerState<PronunciationButton> {
  AudioPlayer? _player;
  var _loading = false;
  var _failed = false;

  /// The claim that quiets everything else while a word is said.
  ///
  /// A pronunciation is one or two seconds long, and it is the reason somebody
  /// opened this screen — so it takes the speakers outright rather than talking
  /// over whatever was playing. The music player pauses on the claim and comes
  /// back on its own afterwards; see `MusicDuckListener`.
  late final FullScreenMediaCount _audioFocus = ref.read(
    fullScreenMediaProvider.notifier,
  );
  var _claimed = false;
  StreamSubscription<PlayerState>? _watching;

  bool get _hasAudio => widget.audioUrl.isNotEmpty;

  void _claim() {
    if (_claimed) return;
    _claimed = true;
    _audioFocus.enter();
  }

  void _release() {
    if (!_claimed) return;
    _claimed = false;
    _audioFocus.leave();
  }

  @override
  void dispose() {
    // Leaving mid-clip must not hold the claim: the music would never return.
    _release();
    _watching?.cancel();
    _player?.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (!_hasAudio) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Nobody has recorded this word yet. Contribute one from '
            '"Suggest a correction".',
          ),
        ),
      );
      return;
    }
    final player = _player ??= AudioPlayer();
    // Watched once, so the claim is given back when the clip ends on its own
    // rather than only when somebody presses pause.
    _watching ??= player.playerStateStream.listen((state) {
      if (!state.playing ||
          state.processingState == ProcessingState.completed) {
        _release();
      }
    });
    if (player.playing) {
      await player.pause();
      _release();
      if (mounted) setState(() {});
      return;
    }
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      if (player.audioSource == null) await player.setUrl(widget.audioUrl);
      // A second tap on a finished clip plays it again, which is what somebody
      // learning a word is going to do several times over.
      if (player.processingState == ProcessingState.completed) {
        await player.seek(Duration.zero);
      }
      _claim();
      unawaited(player.play());
    } on Object {
      _release();
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final playing = _player?.playing ?? false;
    return IconButton.filledTonal(
      tooltip: _failed
          ? 'The recording could not be played'
          : !_hasAudio
          ? 'No recording yet'
          : playing
          ? 'Pause'
          : 'Hear it said',
      onPressed: _loading ? null : _toggle,
      style: _hasAudio
          ? null
          : IconButton.styleFrom(foregroundColor: context.brand.mutedInk),
      icon: _loading
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(
              _failed
                  ? Icons.error_outline_rounded
                  : playing
                  ? Icons.pause_rounded
                  : Icons.play_arrow_rounded,
            ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({
    required this.icon,
    required this.title,
    required this.body,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: context.brand.accent),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 7),
                Text(body),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    ),
  );
}
