import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_keeps.dart';
import 'package:video_player/video_player.dart';

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  var _activeIndex = 0;
  var _playing = true;

  @override
  Widget build(BuildContext context) {
    final publishedReels = ref.watch(publishedReelsProvider).asData?.value;
    // Show real, published TribeStudio content when any exists; otherwise fall
    // back to the curated preview so the feed is never empty.
    final live = publishedReels != null && publishedReels.isNotEmpty;
    final reels = live
        ? publishedReels.map(_reelFromPublished).toList(growable: false)
        : _previewReels;
    // Keep the active index valid if the live feed shrinks between builds.
    final activeIndex = _activeIndex.clamp(0, reels.length - 1);
    // Saves and appreciations live on the device, so they survive a restart
    // instead of evaporating with the widget.
    final saved =
        ref.watch(savedReelIdsProvider).asData?.value ?? const <String>{};
    final appreciated =
        ref.watch(appreciatedReelIdsProvider).asData?.value ?? const <String>{};

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: ColoredBox(
        color: const Color(0xFF070A09),
        child: Stack(
          fit: StackFit.expand,
          children: [
            PageView.builder(
              key: PageStorageKey('explore-reels-${live ? 'live' : 'preview'}'),
              scrollDirection: Axis.vertical,
              itemCount: reels.length,
              onPageChanged: (index) => setState(() {
                _activeIndex = index;
                _playing = true;
              }),
              itemBuilder: (context, index) {
                final reel = reels[index];
                return _ReelCard(
                  reel: reel,
                  isActive: index == activeIndex,
                  isPlaying: index == activeIndex && _playing,
                  liked: appreciated.contains(reel.id),
                  saved: saved.contains(reel.id),
                  onTogglePlayback: () => setState(() => _playing = !_playing),
                  onLike: () => _toggleAppreciation(reel),
                  onSave: () => _toggleSave(reel),
                  onComments: () => _openComments(context, reel),
                  onContext: () => _openContext(context, reel),
                );
              },
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(bottom: false, child: _ExploreHeader(live: live)),
            ),
            Positioned(
              left: 18,
              right: 18,
              bottom: 10,
              child: IgnorePointer(
                child: Row(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: (activeIndex + 1) / reels.length,
                          minHeight: 2,
                          backgroundColor: Colors.white24,
                          color: BrandColors.kenteGold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      '${activeIndex + 1}/${reels.length}',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleSave(_Reel reel) async {
    HapticFeedback.selectionClick();
    final nowSaved = await ref.read(reelKeepsProvider).toggleSaved(reel.id);
    ref.invalidate(savedEntryIdsProvider);
    if (!mounted) return;
    // Deliberately does not promise a list: saves are remembered on this
    // device and shown by the reel's own state when you come back to it, and
    // there is no saved-reels screen to send anyone to yet.
    _showMessage(
      context,
      nowSaved ? 'Saved on this device.' : 'Removed from your saves.',
    );
  }

  Future<void> _toggleAppreciation(_Reel reel) async {
    HapticFeedback.lightImpact();
    await ref.read(reelKeepsProvider).toggleAppreciated(reel.id);
    ref.invalidate(savedEntryIdsProvider);
  }

  /// The context sheet: the English summary, cultural notes, where the piece
  /// comes from and how it is licensed.
  ///
  /// This is the point of the whole feed. A reel without its context is just a
  /// clip, and the licence line is what tells a viewer what they may do with
  /// somebody else's cultural work.
  Future<void> _openContext(BuildContext context, _Reel reel) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: BrandColors.surface,
      builder: (sheetContext) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.75,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(reel.label, style: _sheetEyebrow),
                const SizedBox(height: 8),
                Text(
                  reel.title,
                  style: Theme.of(sheetContext).textTheme.headlineMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  reel.creator,
                  style: const TextStyle(
                    color: BrandColors.mutedInk,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (reel.caption.trim().isNotEmpty) ...[
                  const SizedBox(height: 18),
                  _ContextBlock(heading: 'About this', body: reel.caption),
                ],
                if (reel.englishSummary.trim().isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _ContextBlock(
                    heading: 'In English',
                    body: reel.englishSummary,
                  ),
                ],
                if (reel.culturalNotes.trim().isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _ContextBlock(
                    heading: 'Cultural context',
                    body: reel.culturalNotes,
                  ),
                ],
                const SizedBox(height: 20),
                const Divider(color: BrandColors.divider),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.copyright_rounded,
                      size: 17,
                      color: BrandColors.mutedInk,
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        reel.credit,
                        style: const TextStyle(
                          color: BrandColors.mutedInk,
                          fontSize: 12,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  _Reel _reelFromPublished(PublishedReel p) {
    final caption = p.description.trim().isNotEmpty
        ? p.description.trim()
        : p.englishSummary.trim();
    final where = [
      p.dialect,
      p.language,
    ].where((value) => value.trim().isNotEmpty).join(' · ');
    final label = p.category.trim().isNotEmpty
        ? '${p.category.trim().toUpperCase()}${where.isNotEmpty ? ' · $where' : ''}'
        : (where.isNotEmpty
              ? where.toUpperCase()
              : 'PUBLISHED ON INDIGEN WORLD');
    return _Reel(
      id: p.id,
      imageUrl: p.posterUrl ?? '',
      videoUrl: p.videoUrl,
      avatarUrl: p.creatorAvatarUrl,
      isLive: true,
      englishSummary: p.englishSummary,
      culturalNotes: p.culturalNotes,
      label: label,
      title: p.title,
      creator: p.creatorName,
      initials: _initialsFor(p.creatorName),
      caption: caption,
      sound: p.category.trim().isNotEmpty ? p.category.trim() : 'Cultural reel',
      credit: p.licenceDisplay.trim().isNotEmpty
          ? p.licenceDisplay.trim()
          : 'Published with permission · Indigen World',
      likes: 0,
      comments: 0,
    );
  }

  static String _initialsFor(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'IW';
    if (parts.length == 1) {
      return parts.first.characters.take(2).toString().toUpperCase();
    }
    return (parts.first.characters.first + parts[1].characters.first)
        .toUpperCase();
  }

  /// The reply sheet.
  ///
  /// Published reels have no comment thread of their own yet, so rather than
  /// showing an empty one — or a promise that something will arrive later —
  /// this hands the viewer straight to the Community tab with the reel already
  /// quoted. The conversation happens where conversations already work.
  Future<void> _openComments(BuildContext context, _Reel reel) async {
    if (!reel.isLive) {
      await _openPreviewComments(context, reel);
      return;
    }

    final start = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      backgroundColor: BrandColors.surface,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Say something about this',
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
              const SizedBox(height: 6),
              const Text(
                'Reels do not carry their own comment thread. Post about it in '
                'the Community feed instead — that room stays in Kasem, and the '
                'creator will see it.',
                style: TextStyle(color: BrandColors.mutedInk, height: 1.45),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: () => Navigator.pop(sheetContext, true),
                icon: const Icon(Icons.forum_rounded),
                label: const Text('Post in Community'),
              ),
            ],
          ),
        ),
      ),
    );
    if (start != true || !context.mounted) return;

    await CommunityActions(ref)
        .compose(context, initialText: '${reel.title} — ${reel.creator}\n\n');
  }

  /// The curated preview keeps its illustrative sample thread, clearly labelled
  /// as sample copy.
  Future<void> _openPreviewComments(BuildContext context, _Reel reel) async {
    final replyController = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: BrandColors.surface,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          18 + MediaQuery.viewInsetsOf(sheetContext).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${reel.comments} community replies',
              style: Theme.of(sheetContext).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            const Text(
              'Kasem-only conversation preview · sample copy is not validated guidance.',
              style: TextStyle(color: BrandColors.mutedInk, fontSize: 12),
            ),
            const SizedBox(height: 18),
            const _Comment(author: 'Amina', text: 'Ko gara.'),
            const _Comment(author: 'Nyaaba', text: 'De N lei.'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: replyController,
                    decoration: const InputDecoration(
                      hintText: 'Reply in Kasem…',
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  tooltip: 'Add reply',
                  onPressed: () {
                    if (replyController.text.trim().isEmpty) return;
                    Navigator.pop(sheetContext);
                    _showMessage(
                      context,
                      'Your local Kasem reply was added to this preview.',
                    );
                  },
                  icon: const Icon(Icons.arrow_upward_rounded),
                ),
              ],
            ),
          ],
        ),
      ),
    );
    replyController.dispose();
  }

  void _showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _ExploreHeader extends StatelessWidget {
  const _ExploreHeader({required this.live});

  /// True when the feed is showing real published work rather than the curated
  /// preview. Saying which one a viewer is looking at is the honest thing to
  /// do — the preview is illustrative, not community content.
  final bool live;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 10, 58, 0),
    child: Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white24),
          ),
          child: const Icon(
            Icons.public_rounded,
            color: BrandColors.kenteGold,
            size: 20,
          ),
        ),
        const SizedBox(width: 9),
        const Text(
          'INDIGEN WORLD',
          style: TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.5,
            shadows: [Shadow(blurRadius: 14, color: Colors.black)],
          ),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.fromLTRB(10, 5, 12, 5),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.34),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white24),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: live ? BrandColors.kenteGold : Colors.white54,
                  shape: BoxShape.circle,
                ),
                child: const SizedBox(width: 6, height: 6),
              ),
              const SizedBox(width: 7),
              Text(
                live ? 'PUBLISHED' : 'PREVIEW',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

const _sheetEyebrow = TextStyle(
  color: BrandColors.terracotta,
  fontSize: 10,
  fontWeight: FontWeight.w900,
  letterSpacing: 1.2,
);

/// One labelled paragraph in the context sheet.
class _ContextBlock extends StatelessWidget {
  const _ContextBlock({required this.heading, required this.body});

  final String heading;
  final String body;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        heading.toUpperCase(),
        style: const TextStyle(
          color: BrandColors.heritageGreen,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.1,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        body.trim(),
        style: const TextStyle(
          color: BrandColors.ink,
          fontSize: 14.5,
          height: 1.5,
        ),
      ),
    ],
  );
}

class _ReelCard extends StatelessWidget {
  const _ReelCard({
    required this.reel,
    required this.isActive,
    required this.isPlaying,
    required this.liked,
    required this.saved,
    required this.onTogglePlayback,
    required this.onLike,
    required this.onSave,
    required this.onComments,
    required this.onContext,
  });

  final _Reel reel;
  final bool isActive;
  final bool isPlaying;
  final bool liked;
  final bool saved;
  final VoidCallback onTogglePlayback;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback onComments;
  final VoidCallback onContext;

  @override
  Widget build(BuildContext context) => Semantics(
    label: '${reel.title}. Cultural reel preview by ${reel.creator}.',
    child: GestureDetector(
      onTap: onTogglePlayback,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _ReelBackground(reel: reel, isActive: isActive, isPlaying: isPlaying),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x66000000),
                  Color(0x08000000),
                  Color(0xE6000000),
                ],
                stops: [0, 0.45, 1],
              ),
            ),
          ),
          if (!isPlaying)
            Center(
              child: Container(
                width: 68,
                height: 68,
                decoration: const BoxDecoration(
                  color: Color(0x99000000),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: 40,
                ),
              ),
            ),
          Positioned(
            left: 18,
            right: 82,
            bottom: 42,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _PreviewPill(label: reel.label),
                const SizedBox(height: 10),
                Text(
                  reel.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 34,
                    height: 0.98,
                    letterSpacing: -1.3,
                    fontWeight: FontWeight.w900,
                    shadows: [Shadow(blurRadius: 16, color: Colors.black)],
                  ),
                ),
                const SizedBox(height: 13),
                Text(
                  reel.creator,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  reel.caption,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 9),
                Row(
                  children: [
                    const Icon(
                      Icons.music_note_rounded,
                      color: Colors.white70,
                      size: 15,
                    ),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        reel.sound,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  reel.credit,
                  style: const TextStyle(color: Colors.white54, fontSize: 9),
                ),
              ],
            ),
          ),
          Positioned(
            right: 11,
            bottom: 44,
            child: Column(
              children: [
                _CreatorAvatar(
                  initials: reel.initials,
                  avatarUrl: reel.avatarUrl,
                  // Following a creator is not wired to this feed yet, so the
                  // published reels do not offer a button that would do
                  // nothing.
                  showAddBadge: !reel.isLive,
                ),
                const SizedBox(height: 13),
                _ReelAction(
                  icon: liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  label: reel.isLive
                      ? (liked ? 'Loved' : 'Love')
                      : _shortCount(reel.likes + (liked ? 1 : 0)),
                  active: liked,
                  onTap: onLike,
                ),
                _ReelAction(
                  icon: Icons.chat_bubble_outline_rounded,
                  label: reel.isLive ? 'Discuss' : '${reel.comments}',
                  onTap: onComments,
                ),
                _ReelAction(
                  icon: saved
                      ? Icons.bookmark_rounded
                      : Icons.bookmark_border_rounded,
                  label: saved ? 'Saved' : 'Save',
                  active: saved,
                  onTap: onSave,
                ),
                _ReelAction(
                  icon: Icons.menu_book_outlined,
                  label: 'Context',
                  onTap: onContext,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

/// The reel background: a slow "Ken Burns" poster for image reels, or an
/// autoplaying, looping video for video reels while they are the active page.
class _ReelBackground extends StatelessWidget {
  const _ReelBackground({
    required this.reel,
    required this.isActive,
    required this.isPlaying,
  });

  final _Reel reel;
  final bool isActive;
  final bool isPlaying;

  @override
  Widget build(BuildContext context) {
    final poster = _poster();
    final videoUrl = reel.videoUrl;
    if (videoUrl != null && isActive) {
      return _ReelVideo(url: videoUrl, isPlaying: isPlaying, poster: poster);
    }
    return poster;
  }

  Widget _poster() {
    final Widget image = reel.imageUrl.isEmpty
        ? const _ReelPlaceholder()
        : CachedNetworkImage(
            imageUrl: reel.imageUrl,
            fit: BoxFit.cover,
            alignment: reel.alignment,
            placeholder: (context, url) => const _ReelPlaceholder(),
            errorWidget: (context, url, error) => const _ReelPlaceholder(),
          );
    return TweenAnimationBuilder<double>(
      key: ValueKey('${reel.imageUrl}-$isActive'),
      duration: const Duration(seconds: 12),
      tween: Tween(begin: 1, end: isActive ? 1.08 : 1),
      builder: (context, scale, child) =>
          Transform.scale(scale: scale, child: child),
      child: image,
    );
  }
}

/// Plays a published video reel, covering the frame. Falls back to the poster
/// until the controller initialises, and on any playback error.
class _ReelVideo extends StatefulWidget {
  const _ReelVideo({
    required this.url,
    required this.isPlaying,
    required this.poster,
  });

  final String url;
  final bool isPlaying;
  final Widget poster;

  @override
  State<_ReelVideo> createState() => _ReelVideoState();
}

class _ReelVideoState extends State<_ReelVideo> {
  VideoPlayerController? _controller;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _initialise();
  }

  Future<void> _initialise() async {
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(1);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _ready = true);
      _syncPlayback();
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _syncPlayback() {
    final controller = _controller;
    if (controller == null || !_ready) return;
    if (widget.isPlaying) {
      controller.play();
    } else {
      controller.pause();
    }
  }

  @override
  void didUpdateWidget(_ReelVideo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _controller?.dispose();
      _controller = null;
      _ready = false;
      _failed = false;
      _initialise();
    } else if (oldWidget.isPlaying != widget.isPlaying) {
      _syncPlayback();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (_failed || !_ready || controller == null) {
      return widget.poster;
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.poster,
        FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: controller.value.size.width,
            height: controller.value.size.height,
            child: VideoPlayer(controller),
          ),
        ),
      ],
    );
  }
}

class _PreviewPill extends StatelessWidget {
  const _PreviewPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.34),
      border: Border.all(color: Colors.white30),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label,
      style: const TextStyle(
        color: BrandColors.kenteGold,
        fontSize: 9,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.1,
      ),
    ),
  );
}

class _ReelAction extends StatelessWidget {
  const _ReelAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 11),
    child: Column(
      children: [
        IconButton(
          tooltip: label,
          onPressed: onTap,
          style: IconButton.styleFrom(
            backgroundColor: active
                ? BrandColors.terracotta
                : Colors.black.withValues(alpha: 0.36),
            foregroundColor: active ? BrandColors.kenteGold : Colors.white,
            side: const BorderSide(color: Colors.white24),
          ),
          icon: AnimatedScale(
            scale: active ? 1.12 : 1,
            duration: const Duration(milliseconds: 180),
            child: Icon(icon),
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            shadows: [Shadow(blurRadius: 8, color: Colors.black)],
          ),
        ),
      ],
    ),
  );
}

class _CreatorAvatar extends StatelessWidget {
  const _CreatorAvatar({
    required this.initials,
    this.avatarUrl,
    this.showAddBadge = true,
  });

  final String initials;
  final String? avatarUrl;
  final bool showAddBadge;

  @override
  Widget build(BuildContext context) => Stack(
    clipBehavior: Clip.none,
    alignment: Alignment.bottomCenter,
    children: [
      Container(
        width: 48,
        height: 48,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: BrandColors.heritageGreen,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
        ),
        child: avatarUrl != null && avatarUrl!.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: avatarUrl!,
                fit: BoxFit.cover,
                errorWidget: (context, url, error) => _initials(),
              )
            : _initials(),
      ),
      if (showAddBadge)
        Positioned(
          bottom: -7,
          child: Container(
            width: 19,
            height: 19,
            decoration: const BoxDecoration(
              color: BrandColors.kenteGold,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.add_rounded,
              color: BrandColors.heritageGreen,
              size: 15,
            ),
          ),
        ),
    ],
  );

  Widget _initials() => Center(
    child: Text(
      initials,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 12,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _Comment extends StatelessWidget {
  const _Comment({required this.author, required this.text});

  final String author;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: BrandColors.heritageGreen,
          child: Text(
            author.characters.first,
            style: const TextStyle(color: Colors.white),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                author,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
              Text(text, style: const TextStyle(fontSize: 15)),
            ],
          ),
        ),
      ],
    ),
  );
}

class _ReelPlaceholder extends StatelessWidget {
  const _ReelPlaceholder();

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF0B3D2E), Color(0xFF9A4A2E), Color(0xFFD89B1D)],
      ),
    ),
    child: Center(
      child: Icon(
        Icons.play_circle_outline_rounded,
        color: Colors.white70,
        size: 70,
      ),
    ),
  );
}

class _Reel {
  const _Reel({
    required this.id,
    required this.imageUrl,
    required this.label,
    required this.title,
    required this.creator,
    required this.initials,
    required this.caption,
    required this.sound,
    required this.credit,
    required this.likes,
    required this.comments,
    this.englishSummary = '',
    this.culturalNotes = '',
    this.alignment = Alignment.center,
    this.videoUrl,
    this.avatarUrl,
    this.isLive = false,
  });

  /// Stable across rebuilds, so a save stays attached to the piece rather than
  /// to whatever happens to be at that scroll position.
  final String id;

  final String imageUrl;
  final String label;
  final String title;
  final String creator;
  final String initials;
  final String caption;
  final String sound;
  final String credit;
  final int likes;
  final int comments;

  /// The English summary and cultural notes shown in the context sheet.
  final String englishSummary;
  final String culturalNotes;

  final Alignment alignment;

  /// Playable video URL for published video reels; null for image reels.
  final String? videoUrl;

  /// Creator avatar image for published reels; null for the curated preview.
  final String? avatarUrl;

  /// True when this reel is real published content (vs. the curated preview),
  /// which changes copy such as the comments sheet.
  final bool isLive;
}

String _shortCount(int value) =>
    value >= 1000 ? '${(value / 1000).toStringAsFixed(1)}K' : '$value';

const _previewReels = [
  _Reel(
    id: 'preview-rhythm',
    imageUrl: 'https://images.unsplash.com/photo-1660675133223-c293889b9fb8?auto=format&fit=crop&q=82&w=1200',
    label: 'REEL PREVIEW · NORTHERN GHANA',
    title: 'Every rhythm remembers.',
    creator: '@afi.dances',
    initials: 'AD',
    caption: 'The feet carry the story. The drum calls everyone home.',
    sound: 'Original sound · Kasena rhythms',
    credit: 'Photo: Emmanuel Yeboah Okine · Unsplash',
    likes: 12800,
    comments: 426,
  ),
  _Reel(
    id: 'preview-circle',
    imageUrl: 'https://images.unsplash.com/photo-1515921560173-3633830cb11a?auto=format&fit=crop&q=82&w=1200',
    label: 'PHOTO REEL · COMMUNITY',
    title: 'The circle makes room for everyone.',
    creator: '@kasena.collective',
    initials: 'KC',
    caption: 'De zaanem. Welcome is a place beside us.',
    sound: 'Field notes · community gathering',
    credit: 'Photo: Kwasi Ansong Bamfo · Unsplash',
    likes: 7400,
    comments: 218,
  ),
  _Reel(
    id: 'preview-cloth',
    imageUrl: 'https://images.unsplash.com/photo-1757169917348-b4f790e4dc85?auto=format&fit=crop&q=82&w=1200',
    label: 'STORY REEL · CAPE COAST',
    title: 'What we wear can speak.',
    creator: '@heritage.in.motion',
    initials: 'HM',
    caption: 'Colour, memory and pride—carried into the next generation.',
    sound: 'Festival voices · story reel',
    credit: 'Photo: Oswald Elsaboath · Unsplash',
    likes: 9300,
    comments: 301,
    alignment: Alignment.centerLeft,
  ),
];
