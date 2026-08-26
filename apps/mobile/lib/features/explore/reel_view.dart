import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/explore/creator_profile_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_comments_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_engagement.dart';
import 'package:indigen_world_mobile/features/explore/reel_keeps.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:video_player/video_player.dart';

/// One card in a vertical reel feed.
///
/// Public because two surfaces show the same reel: Explore's newest-first feed
/// and a creator's own page. Duplicating the card would have meant duplicating
/// the video lifecycle with it, and that is the part that has to be right.
class Reel {
  const Reel({
    required this.id,
    required this.imageUrl,
    required this.label,
    required this.title,
    required this.creator,
    required this.initials,
    required this.caption,
    required this.sound,
    required this.credit,
    this.creatorId = '',
    this.likes = 0,
    this.comments = 0,
    this.englishSummary = '',
    this.culturalNotes = '',
    this.alignment = Alignment.center,
    this.videoUrl,
    this.avatarUrl,
    this.isLive = false,
    this.communityPostId,
  });

  /// Stable across rebuilds, so an appreciation stays attached to the piece
  /// rather than to whatever happens to be at that scroll position.
  final String id;

  final String imageUrl;
  final String label;
  final String title;
  final String creator;

  /// The creator's account id. Empty on the curated preview, which has no
  /// account behind it and therefore no page to open.
  final String creatorId;

  final String initials;
  final String caption;
  final String sound;
  final String credit;

  /// Illustrative totals for the curated preview only. Live reels read their
  /// numbers from the server.
  final int likes;
  final int comments;

  /// The English summary and cultural notes shown in the context card.
  final String englishSummary;
  final String culturalNotes;

  final Alignment alignment;

  /// Playable video URL for published video reels; null for image reels.
  final String? videoUrl;

  /// Creator avatar image; null falls back to initials.
  final String? avatarUrl;

  /// True when this reel is real content rather than the curated preview,
  /// which changes both the copy and where its numbers come from.
  final bool isLive;

  /// The community post this reel *is*, when it came from the Community feed
  /// rather than the publication workflow.
  ///
  /// A community video keeps one identity across both surfaces. Appreciating
  /// it in Explore is the same like the Community feed shows, and its replies
  /// are the thread members are already having — anything else would give one
  /// video two sets of numbers and two conversations, neither of which is the
  /// real one.
  final String? communityPostId;

  bool get isCommunity => communityPostId != null;

  /// A community post as a reel.
  ///
  /// Only posts that actually carry a video reach here — see
  /// [exploreFeedProvider] — so the video URL is present by construction and
  /// the caller does not have to defend against a caption-only post arriving
  /// in a video feed.
  static Reel fromCommunityPost(CommunityPost post, CommunityMedia video) {
    final caption = post.text.trim();
    return Reel(
      id: 'community:${post.id}',
      communityPostId: post.id,
      imageUrl: video.thumbnailUrl ?? '',
      videoUrl: video.url,
      avatarUrl: post.authorAvatarUrl,
      creatorId: post.authorId,
      isLive: true,
      label: 'FROM THE COMMUNITY',
      // A post has no title, and inventing one from its first line would put
      // words in somebody's mouth. The caption carries the whole message.
      title: caption.isEmpty ? 'A moment from the community' : caption,
      creator: post.authorName,
      initials: reelInitials(post.authorName),
      caption: caption,
      likes: post.likeCount,
      comments: post.replyCount,
      sound: 'Original sound',
      credit: 'Posted by @${post.authorUsername} in Community',
      englishSummary: '',
      culturalNotes: '',
    );
  }

  static Reel fromPublished(PublishedReel published) {
    final caption = published.description.trim().isNotEmpty
        ? published.description.trim()
        : published.englishSummary.trim();
    final where = [
      published.dialect,
      published.language,
    ].where((value) => value.trim().isNotEmpty).join(' · ');
    final label = published.category.trim().isNotEmpty
        ? '${published.category.trim().toUpperCase()}'
              '${where.isNotEmpty ? ' · $where' : ''}'
        : (where.isNotEmpty
              ? where.toUpperCase()
              : 'PUBLISHED ON INDIGEN WORLD');
    return Reel(
      id: published.id,
      imageUrl: published.posterUrl ?? '',
      videoUrl: published.videoUrl,
      avatarUrl: published.creatorAvatarUrl,
      creatorId: published.creatorId,
      isLive: true,
      englishSummary: published.englishSummary,
      culturalNotes: published.culturalNotes,
      label: label,
      title: published.title,
      creator: published.creatorName,
      initials: reelInitials(published.creatorName),
      caption: caption,
      sound: published.category.trim().isNotEmpty
          ? published.category.trim()
          : 'Cultural reel',
      credit: published.licenceDisplay.trim().isNotEmpty
          ? published.licenceDisplay.trim()
          : 'Published with permission · Indigen World',
    );
  }
}

String reelInitials(String name) {
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

/// A full-bleed, vertically paged reel feed with its action rail.
class ReelFeedView extends ConsumerStatefulWidget {
  const ReelFeedView({
    required this.reels,
    this.isActive = true,
    this.initialIndex = 0,
    this.header,
    super.key,
  });

  final List<Reel> reels;

  /// Whether this feed is the thing in front of the member at all.
  ///
  /// A feed cannot tell from its own lifecycle whether anyone can see it — it
  /// stays mounted behind a selected tab — so it has to be told, because video
  /// is hardware: a decoder and the audio session, neither of which may outlive
  /// the moment the member is watching.
  final bool isActive;

  final int initialIndex;

  /// Optional chrome pinned over the top of the feed.
  final Widget? header;

  @override
  ConsumerState<ReelFeedView> createState() => _ReelFeedViewState();
}

class _ReelFeedViewState extends ConsumerState<ReelFeedView>
    with WidgetsBindingObserver {
  late int _activeIndex = widget.initialIndex;
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );
  var _playing = true;
  var _foreground = true;

  /// Reels whose impression has already been written this session, so drifting
  /// back to one does not spend a round trip re-asserting what the server
  /// already knows.
  final _trackedViews = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Before the platform has sent its first lifecycle message there is no
    // state to read, and a launching app is on its way to the foreground.
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    WidgetsBinding.instance.addPostFrameCallback((_) => _trackActiveView());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Only `resumed` means the member is in front of the app. Everything else
    // — the app switcher, a screen lock, a call — is somebody who has stopped
    // watching, and sound that follows them out of the app is a bug.
    final foreground = state == AppLifecycleState.resumed;
    if (!mounted || foreground == _foreground) return;
    setState(() => _foreground = foreground);
  }

  int get _clampedIndex =>
      widget.reels.isEmpty ? 0 : _activeIndex.clamp(0, widget.reels.length - 1);

  /// Impressions are telemetry: written best-effort, never spoken about, and
  /// never allowed to interrupt watching.
  Future<void> _trackActiveView() async {
    if (widget.reels.isEmpty || !widget.isActive) return;
    final reel = widget.reels[_clampedIndex];
    if (!reel.isLive || reel.isCommunity || !_trackedViews.add(reel.id)) {
      return;
    }
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(reelEngagementRepositoryProvider);
    if (uid == null || repository == null) return;
    try {
      await repository.trackView(uid: uid, reelId: reel.id);
      ref.invalidate(reelCountsProvider(reel.id));
    } on Object {
      // Nothing about a view is worth a word to the member.
    }
  }

  @override
  Widget build(BuildContext context) {
    // The single question the whole feed hangs on: is this reel in front of a
    // pair of eyes right now?
    final onScreen = widget.isActive && _foreground;
    final reels = widget.reels;
    if (reels.isEmpty) {
      return const ColoredBox(
        color: Color(0xFF070A09),
        child: Center(
          child: Text(
            'Nothing published here yet.',
            style: TextStyle(color: Colors.white70),
          ),
        ),
      );
    }
    final activeIndex = _clampedIndex;

    // Appreciations and keeps for live reels come from the server, so they
    // survive a restart. The curated preview keeps its device-local store —
    // there is no account behind an illustrative card to attach an edge to.
    final serverLikes =
        ref.watch(myReelLikesProvider).asData?.value ?? const <String>{};
    final serverSaves =
        ref.watch(myReelSavesProvider).asData?.value ?? const <String>{};
    // A community video is liked and saved as the post it is, so the state
    // shown here is the same state its card shows in the Community feed.
    final communityLikes =
        ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final communityBookmarks =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final localSaves =
        ref.watch(savedReelIdsProvider).asData?.value ?? const <String>{};
    final localLikes =
        ref.watch(appreciatedReelIdsProvider).asData?.value ?? const <String>{};

    return ColoredBox(
      color: const Color(0xFF070A09),
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: _controller,
            scrollDirection: Axis.vertical,
            itemCount: reels.length,
            onPageChanged: (index) {
              setState(() {
                _activeIndex = index;
                _playing = true;
              });
              _trackActiveView();
            },
            itemBuilder: (context, index) {
              final reel = reels[index];
              final liked = switch (reel) {
                Reel(communityPostId: final postId?) =>
                  communityLikes.contains(postId),
                Reel(isLive: true) => serverLikes.contains(reel.id),
                _ => localLikes.contains(reel.id),
              };
              final saved = switch (reel) {
                Reel(communityPostId: final postId?) =>
                  communityBookmarks.contains(postId),
                Reel(isLive: true) => serverSaves.contains(reel.id),
                _ => localSaves.contains(reel.id),
              };
              return _ReelCard(
                reel: reel,
                isActive: index == activeIndex,
                isPlaying: index == activeIndex && _playing,
                onScreen: onScreen,
                liked: liked,
                saved: saved,
                onTogglePlayback: () => setState(() => _playing = !_playing),
                onLike: () => _toggleAppreciation(reel, liked: liked),
                onSave: () => _toggleSave(reel, saved: saved),
                onComments: () => _openComments(context, reel),
                onContext: () => _openContext(context, reel),
                onOpenCreator: () => _openCreator(context, reel),
              );
            },
          ),
          if (widget.header case final header?)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(bottom: false, child: header),
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
    );
  }

  Future<void> _toggleSave(Reel reel, {required bool saved}) async {
    HapticFeedback.selectionClick();
    if (!reel.isLive) {
      final nowSaved = await ref.read(reelKeepsProvider).toggleSaved(reel.id);
      ref.invalidate(savedEntryIdsProvider);
      if (!mounted) return;
      showGlassToast(
        context,
        nowSaved ? 'Saved on this device.' : 'Removed from your saves.',
      );
      return;
    }

    if (reel.communityPostId case final postId?) {
      final uid = await CommunityActions(ref).requireSignIn(context);
      final repository = ref.read(communityRepositoryProvider);
      if (uid == null || repository == null) return;
      try {
        await repository.toggleBookmark(
          uid: uid,
          postId: postId,
          saved: saved,
        );
        if (!mounted) return;
        showGlassToast(
          context,
          saved ? 'Removed from your saved posts.' : 'Saved.',
        );
      } on Object {
        if (mounted) showGlassToast(context, 'Could not update. Try again.');
      }
      return;
    }

    final uid = await CommunityActions(ref).requireSignIn(context);
    final repository = ref.read(reelEngagementRepositoryProvider);
    if (uid == null || repository == null) return;
    try {
      await repository.setSaved(uid: uid, reelId: reel.id, saved: !saved);
      if (!mounted) return;
      showGlassToast(context, saved ? 'Removed from your keeps.' : 'Kept.');
    } on Object {
      if (mounted) showGlassToast(context, 'Could not update. Try again.');
    }
  }

  Future<void> _toggleAppreciation(Reel reel, {required bool liked}) async {
    HapticFeedback.lightImpact();
    if (reel.communityPostId case final postId?) {
      final uid = await CommunityActions(ref).requireSignIn(context);
      final repository = ref.read(communityRepositoryProvider);
      if (uid == null || repository == null) return;
      try {
        await repository.toggleLike(uid: uid, postId: postId, liked: liked);
      } on Object {
        if (mounted) showGlassToast(context, 'Could not update. Try again.');
      }
      return;
    }
    if (!reel.isLive) {
      await ref.read(reelKeepsProvider).toggleAppreciated(reel.id);
      ref.invalidate(savedEntryIdsProvider);
      return;
    }

    final uid = await CommunityActions(ref).requireSignIn(context);
    final repository = ref.read(reelEngagementRepositoryProvider);
    if (uid == null || repository == null) return;
    try {
      await repository.setLiked(uid: uid, reelId: reel.id, liked: !liked);
      ref.invalidate(reelCountsProvider(reel.id));
    } on Object {
      if (mounted) showGlassToast(context, 'Could not update. Try again.');
    }
  }

  Future<void> _openCreator(BuildContext context, Reel reel) async {
    if (reel.isCommunity && reel.creatorId.isNotEmpty) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: reel.creatorId),
        ),
      );
      return;
    }
    if (reel.creatorId.isEmpty) {
      showGlassToast(context, 'This preview card has no creator page.');
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CreatorProfileScreen(
          creatorId: reel.creatorId,
          fallbackName: reel.creator,
          fallbackAvatarUrl: reel.avatarUrl,
        ),
      ),
    );
  }

  Future<void> _openComments(BuildContext context, Reel reel) async {
    if (reel.communityPostId case final postId?) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => PostDetailScreen(postId: postId),
        ),
      );
      return;
    }
    if (!reel.isLive) {
      await _openPreviewComments(context, reel);
      return;
    }
    await showReelCommentsSheet(context, reelId: reel.id, title: reel.title);
    if (mounted) ref.invalidate(reelCountsProvider(reel.id));
  }

  /// The context card: the English summary, cultural notes, where the piece
  /// comes from and how it is licensed.
  ///
  /// This is the point of the whole feed. A reel without its context is just a
  /// clip, and the licence line is what tells a viewer what they may do with
  /// somebody else's cultural work.
  Future<void> _openContext(BuildContext context, Reel reel) {
    return showGlassPopup<void>(
      context: context,
      builder: (popupContext) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(reel.label, style: kReelSheetEyebrow),
          const SizedBox(height: 8),
          Text(
            reel.title,
            style: Theme.of(popupContext).textTheme.headlineMedium,
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
            ReelContextBlock(heading: 'About this', body: reel.caption),
          ],
          if (reel.englishSummary.trim().isNotEmpty) ...[
            const SizedBox(height: 16),
            ReelContextBlock(heading: 'In English', body: reel.englishSummary),
          ],
          if (reel.culturalNotes.trim().isNotEmpty) ...[
            const SizedBox(height: 16),
            ReelContextBlock(
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
    );
  }

  /// The curated preview keeps its illustrative sample thread, clearly
  /// labelled as sample copy.
  Future<void> _openPreviewComments(BuildContext context, Reel reel) async {
    final replyController = TextEditingController();
    await showGlassPopup<void>(
      context: context,
      title: '${reel.comments} community replies',
      subtitle:
          'Kasem-only conversation preview · sample copy is not validated '
          'guidance.',
      builder: (popupContext) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PreviewComment(author: 'Amina', text: 'Ko gara.'),
          const _PreviewComment(author: 'Nyaaba', text: 'De N lei.'),
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
                  Navigator.pop(popupContext);
                  showGlassToast(
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
    );
    replyController.dispose();
  }
}

const kReelSheetEyebrow = TextStyle(
  color: BrandColors.terracotta,
  fontSize: 10,
  fontWeight: FontWeight.w900,
  letterSpacing: 1.2,
);

/// One labelled paragraph in the context card.
class ReelContextBlock extends StatelessWidget {
  const ReelContextBlock({
    required this.heading,
    required this.body,
    super.key,
  });

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

class _ReelCard extends ConsumerWidget {
  const _ReelCard({
    required this.reel,
    required this.isActive,
    required this.isPlaying,
    required this.onScreen,
    required this.liked,
    required this.saved,
    required this.onTogglePlayback,
    required this.onLike,
    required this.onSave,
    required this.onComments,
    required this.onContext,
    required this.onOpenCreator,
  });

  final Reel reel;
  final bool isActive;

  /// The member's own intent: they have not tapped this reel to a stop.
  ///
  /// Kept separate from [onScreen] so the paused overlay stays a statement
  /// about what they chose, not about which tab happens to be selected.
  final bool isPlaying;

  /// Whether the feed is in front of the member at all.
  final bool onScreen;

  final bool liked;
  final bool saved;
  final VoidCallback onTogglePlayback;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback onComments;
  final VoidCallback onContext;
  final VoidCallback onOpenCreator;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Published records only carry the avatar the creator had when the piece
    // was approved, and for most creators that is null. Their community
    // profile is world-readable and current, so it is what fills the gap —
    // which is the difference between a face on the feed and two grey letters.
    final memberProfile = reel.creatorId.isEmpty
        ? null
        : ref.watch(communityProfileProvider(reel.creatorId)).asData?.value;
    final avatarUrl = reel.avatarUrl?.isNotEmpty ?? false
        ? reel.avatarUrl
        : memberProfile?.avatarUrl;

    // A community video counts where it lives: its appreciations and replies
    // are the post's own, already denormalised onto it, so reading the reel
    // engagement collections for one would show a permanent zero beside a
    // conversation that is plainly happening.
    final counts = reel.isLive && !reel.isCommunity
        ? (ref.watch(reelCountsProvider(reel.id)).asData?.value ??
              emptyReelCounts)
        : (likes: reel.likes, comments: reel.comments, views: 0);

    return Semantics(
      label: '${reel.title}. Cultural reel by ${reel.creator}.',
      child: GestureDetector(
        onTap: onTogglePlayback,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _ReelBackground(
              reel: reel,
              isActive: isActive,
              isPlaying: isPlaying && onScreen,
            ),
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
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: onOpenCreator,
                    child: Text(
                      memberProfile?.displayName ?? reel.creator,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                      ),
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
                  ReelCreatorAvatar(
                    initials: reel.initials,
                    avatarUrl: avatarUrl,
                    onTap: reel.creatorId.isEmpty ? null : onOpenCreator,
                  ),
                  const SizedBox(height: 13),
                  _ReelAction(
                    icon: liked
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    // A live total already counts this member's own edge, so
                    // adding one for the filled heart would show every liker a
                    // number one too high. Only the curated preview, whose
                    // figure is a fixed illustration, gets the local bump.
                    label: reelCountLabel(
                      reel.isLive
                          ? counts.likes
                          : counts.likes + (liked ? 1 : 0),
                    ),
                    tooltip: liked ? 'Remove appreciation' : 'Appreciate',
                    active: liked,
                    onTap: onLike,
                  ),
                  _ReelAction(
                    icon: Icons.chat_bubble_outline_rounded,
                    label: reelCountLabel(counts.comments),
                    tooltip: 'Replies',
                    onTap: onComments,
                  ),
                  _ReelAction(
                    icon: saved
                        ? Icons.bookmark_rounded
                        : Icons.bookmark_border_rounded,
                    label: saved ? 'Kept' : 'Keep',
                    tooltip: saved ? 'Remove from keeps' : 'Keep this reel',
                    active: saved,
                    onTap: onSave,
                  ),
                  _ReelAction(
                    icon: Icons.menu_book_outlined,
                    label: 'Context',
                    tooltip: 'Cultural context and licence',
                    onTap: onContext,
                  ),
                  if (reel.isLive && counts.views > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '${reelCountLabel(counts.views)} views',
                        style: const TextStyle(
                          color: Colors.white60,
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The reel background: a slow "Ken Burns" poster for image reels, or an
/// autoplaying, looping video for video reels while they are the active page
/// and the feed is in front of the member.
class _ReelBackground extends StatelessWidget {
  const _ReelBackground({
    required this.reel,
    required this.isActive,
    required this.isPlaying,
  });

  final Reel reel;
  final bool isActive;
  final bool isPlaying;

  @override
  Widget build(BuildContext context) {
    final poster = _poster();
    final videoUrl = reel.videoUrl;
    // Off screen the player leaves the tree altogether and the poster takes
    // its place, which disposes the controller on the way out. Merely pausing
    // would leave a decoder and an open audio session behind another tab.
    if (videoUrl != null && isActive) {
      return _ReelVideo(url: videoUrl, isPlaying: isPlaying, poster: poster);
    }
    return poster;
  }

  Widget _poster() {
    final Widget image = reel.imageUrl.isEmpty
        ? const ReelPlaceholder()
        : CachedNetworkImage(
            imageUrl: reel.imageUrl,
            fit: BoxFit.cover,
            alignment: reel.alignment,
            placeholder: (context, url) => const ReelPlaceholder(),
            errorWidget: (context, url, error) => const ReelPlaceholder(),
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

  /// Bumped every time a controller is let go.
  ///
  /// Opening a video is a network round trip, and the member can leave the feed
  /// or flick to the next reel long before it finishes. The counter is how a
  /// late-arriving `initialize()` recognises that it belongs to a player
  /// nobody is waiting for any more, so it cannot resurrect playback.
  var _generation = 0;

  @override
  void initState() {
    super.initState();
    _initialise();
  }

  Future<void> _initialise() async {
    final generation = _generation;
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(1);
    } on Object {
      _discard(controller);
      if (_isStale(generation)) return;
      setState(() => _failed = true);
      return;
    }
    if (_isStale(generation)) {
      _discard(controller);
      return;
    }
    setState(() => _ready = true);
    // Built while paused — because the member had stopped this reel before it
    // finished opening — the sync leaves it on its first frame rather than
    // starting sound nobody asked for.
    _syncPlayback();
  }

  /// True once this initialise no longer speaks for the widget: it has been
  /// disposed, or a newer controller has taken over.
  bool _isStale(int generation) => !mounted || generation != _generation;

  /// Releases [controller] unless it has already been handed over: ownership
  /// decides who closes a player, and that is whoever still holds it in
  /// [_controller].
  ///
  /// The dispose is deliberately not awaited. A controller that failed before
  /// the platform ever created it waits forever to be torn down, and nothing
  /// here has any reason to wait with it.
  void _discard(VideoPlayerController controller) {
    if (!identical(_controller, controller)) return;
    _controller = null;
    _ready = false;
    controller.dispose();
  }

  /// Drops the current controller and makes every initialise so far stale.
  void _release() {
    _generation++;
    final controller = _controller;
    if (controller != null) _discard(controller);
  }

  void _syncPlayback() {
    final controller = _controller;
    // Nothing left to sync once the controller has gone: a disposed player
    // throws when told to play, and there is nobody there to hear it anyway.
    if (controller == null || !_ready || !mounted) return;
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
      _release();
      _failed = false;
      _initialise();
    } else if (oldWidget.isPlaying != widget.isPlaying) {
      _syncPlayback();
    }
  }

  @override
  void dispose() {
    _release();
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
    required this.tooltip,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 11),
    child: Column(
      children: [
        IconButton(
          tooltip: tooltip,
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

/// The creator's face on the reel rail. Tapping it opens their page.
class ReelCreatorAvatar extends StatelessWidget {
  const ReelCreatorAvatar({
    required this.initials,
    this.avatarUrl,
    this.onTap,
    super.key,
  });

  final String initials;
  final String? avatarUrl;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = Stack(
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
                  placeholder: (context, url) => _initials(),
                  errorWidget: (context, url, error) => _initials(),
                )
              : _initials(),
        ),
        if (onTap != null)
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
                Icons.person_rounded,
                color: BrandColors.heritageGreen,
                size: 13,
              ),
            ),
          ),
      ],
    );

    if (onTap == null) return avatar;
    return Semantics(
      button: true,
      label: 'Open creator page',
      child: Tooltip(
        message: 'Open creator page',
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: avatar,
        ),
      ),
    );
  }

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

class _PreviewComment extends StatelessWidget {
  const _PreviewComment({required this.author, required this.text});

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

class ReelPlaceholder extends StatelessWidget {
  const ReelPlaceholder({super.key});

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

/// Compact count label — `1.2K`, `3M`, or the plain number.
String reelCountLabel(int value) {
  if (value <= 0) return '0';
  if (value >= 1000000) {
    final millions = value / 1000000;
    return millions % 1 == 0
        ? '${millions.toInt()}M'
        : '${millions.toStringAsFixed(1)}M';
  }
  if (value >= 1000) {
    final thousands = value / 1000;
    return thousands % 1 == 0
        ? '${thousands.toInt()}K'
        : '${thousands.toStringAsFixed(1)}K';
  }
  return '$value';
}
