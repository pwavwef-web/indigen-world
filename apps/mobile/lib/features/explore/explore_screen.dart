import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:video_player/video_player.dart';

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  final _liked = <int>{};
  final _saved = <int>{};
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
                  liked: _liked.contains(index),
                  saved: _saved.contains(index),
                  onTogglePlayback: () => setState(() => _playing = !_playing),
                  onLike: () => setState(() {
                    _liked.contains(index)
                        ? _liked.remove(index)
                        : _liked.add(index);
                  }),
                  onSave: () => setState(() {
                    _saved.contains(index)
                        ? _saved.remove(index)
                        : _saved.add(index);
                  }),
                  onComments: () => _openComments(context, reel),
                  onShare: () => _showMessage(
                    context,
                    'Sharing unlocks when approved public reel links are connected.',
                  ),
                );
              },
            ),
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(bottom: false, child: _ExploreHeader()),
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
      imageUrl: p.posterUrl ?? '',
      videoUrl: p.videoUrl,
      avatarUrl: p.creatorAvatarUrl,
      isLive: true,
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

  Future<void> _openComments(BuildContext context, _Reel reel) async {
    final replyController = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: BrandColors.surface,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          18 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: reel.isLive
              ? [
                  Text(
                    'Comments',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Community replies open when messaging is enabled for published reels.',
                    style: TextStyle(color: BrandColors.mutedInk, fontSize: 12),
                  ),
                  const SizedBox(height: 18),
                ]
              : [
                  Text(
                    '${reel.comments} community replies',
                    style: Theme.of(context).textTheme.titleLarge,
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
                          Navigator.pop(context);
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
  const _ExploreHeader();

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
        const Text(
          'Following',
          style: TextStyle(
            color: Colors.white60,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 18),
        const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'For you',
              style: TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
            SizedBox(height: 5),
            SizedBox(
              width: 22,
              child: Divider(
                height: 2,
                thickness: 2,
                color: BrandColors.kenteGold,
              ),
            ),
          ],
        ),
      ],
    ),
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
    required this.onShare,
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
  final VoidCallback onShare;

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
                ),
                const SizedBox(height: 13),
                _ReelAction(
                  icon: liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  label: _shortCount(reel.likes + (liked ? 1 : 0)),
                  active: liked,
                  onTap: onLike,
                ),
                _ReelAction(
                  icon: Icons.chat_bubble_outline_rounded,
                  label: '${reel.comments}',
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
                  icon: Icons.near_me_outlined,
                  label: 'Share',
                  onTap: onShare,
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
  const _CreatorAvatar({required this.initials, this.avatarUrl});

  final String initials;
  final String? avatarUrl;

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
    this.alignment = Alignment.center,
    this.videoUrl,
    this.avatarUrl,
    this.isLive = false,
  });

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
