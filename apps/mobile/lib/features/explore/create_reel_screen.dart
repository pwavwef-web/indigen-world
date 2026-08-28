import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// Record or choose a clip and put it into Explore.
///
/// Explore already merges whole community posts that carry a video (see
/// `explore_feed.dart`) — it just had no way in. Rather than invent a second
/// kind of video with its own storage, lifecycle, moderation and reporting,
/// this posts a normal community post. The clip therefore arrives in Explore
/// *and* in the feed, keeps the same likes and replies, is covered by the same
/// block/mute/report machinery, and can be deleted by its author the same way.
class CreateReelScreen extends ConsumerStatefulWidget {
  const CreateReelScreen({super.key});

  @override
  ConsumerState<CreateReelScreen> createState() => _CreateReelScreenState();
}

class _CreateReelScreenState extends ConsumerState<CreateReelScreen> {
  final _captionController = TextEditingController();
  final _picker = const CommunityMediaPicker();

  PendingUpload? _clip;
  var _publishing = false;
  double? _progress;
  String? _error;

  @override
  void dispose() {
    _captionController.dispose();
    super.dispose();
  }

  Future<void> _choose(ImageSource source) async {
    setState(() => _error = null);
    try {
      final picked = await _picker.pickVideo(source: source);
      if (picked == null || !mounted) return;
      setState(() => _clip = picked);
    } on Object {
      if (mounted) {
        setState(() => _error = 'That clip could not be read. Try another.');
      }
    }
  }

  Future<void> _publish() async {
    final clip = _clip;
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    final repository = ref.read(communityRepositoryProvider);
    if (clip == null) {
      setState(() => _error = 'Record or choose a clip first.');
      return;
    }
    if (profile == null || repository == null) {
      setState(
        () => _error = 'Set up your community profile before posting a reel.',
      );
      return;
    }

    setState(() {
      _publishing = true;
      _error = null;
      _progress = 0;
    });
    try {
      await repository.createPost(
        author: profile,
        text: _captionController.text,
        attachments: [clip],
        onUploadProgress: (value) {
          if (mounted) setState(() => _progress = value);
        },
      );
      ref
        ..invalidate(rawCommunityFeedProvider)
        ..invalidate(rawFollowingFeedProvider);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showCommunityMessage(context, 'Your reel is live.');
    } on CommunityFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) {
        setState(() => _error = 'The reel did not go up. Try again.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _publishing = false;
          _progress = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    final clip = _clip;
    return Scaffold(
      backgroundColor: BrandColors.nightInk,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        title: const Text(
          'New reel',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
        ),
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: BrandGradients.night),
        child: SafeArea(
          top: false,
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
                children: [
                  AspectRatio(
                    aspectRatio: 9 / 16,
                    child: GlassSurface(
                      onDark: true,
                      blur: false,
                      padding: const EdgeInsets.all(6),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(kGlassRadius - 7),
                        child: clip == null
                            ? const _ReelPlaceholder()
                            : _ClipPreview(clip: clip),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _publishing
                              ? null
                              : () => _choose(ImageSource.camera),
                          icon: const Icon(Icons.videocam_rounded),
                          label: const Text('Record'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _publishing
                              ? null
                              : () => _choose(ImageSource.gallery),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Colors.white38),
                          ),
                          icon: const Icon(Icons.video_library_rounded),
                          label: const Text('Choose'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _captionController,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 400,
                    textCapitalization: TextCapitalization.sentences,
                    style: const TextStyle(color: Colors.white),
                    cursorColor: context.brand.gold,
                    decoration: InputDecoration(
                      hintText: 'Say something about it (optional)',
                      hintStyle: const TextStyle(color: Colors.white38),
                      counterStyle: const TextStyle(color: Colors.white38),
                      filled: true,
                      fillColor: Colors.white.withValues(alpha: 0.07),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: Colors.white24),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide(
                          color: context.brand.gold,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    GlassSurface(
                      onDark: true,
                      padding: const EdgeInsets.all(13),
                      child: Row(
                        children: [
                          Icon(
                            Icons.error_outline_rounded,
                            color: context.brand.gold,
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _error!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_progress != null) ...[
                    const SizedBox(height: 14),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: _progress,
                        minHeight: 6,
                        backgroundColor: Colors.white24,
                        color: context.brand.gold,
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: _publishing || clip == null ? null : _publish,
                    style: FilledButton.styleFrom(
                      backgroundColor: context.brand.gold,
                      foregroundColor: context.brand.accent,
                    ),
                    icon: _publishing
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.publish_rounded),
                    label: Text(_publishing ? 'Posting…' : 'Post to Explore'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReelPlaceholder extends StatelessWidget {
  const _ReelPlaceholder();

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.white.withValues(alpha: 0.04),
    child: const Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.videocam_outlined, size: 46, color: Colors.white38),
        SizedBox(height: 10),
        Text(
          'Up to 3 minutes',
          style: TextStyle(
            color: Colors.white54,
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );
}

/// The chosen clip's own opening frame, written to a file when it was picked.
class _ClipPreview extends StatelessWidget {
  const _ClipPreview({required this.clip});

  final PendingUpload clip;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      if (clip.posterPath case final poster?)
        Image.file(File(poster), fit: BoxFit.cover)
      else
        const _ReelPlaceholder(),
      const Center(
        child: Icon(
          Icons.play_circle_fill_rounded,
          color: Colors.white,
          size: 54,
          shadows: [Shadow(blurRadius: 18, color: Colors.black87)],
        ),
      ),
      if (clip.durationSeconds case final seconds?)
        Positioned(
          right: 10,
          bottom: 10,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
    ],
  );
}
