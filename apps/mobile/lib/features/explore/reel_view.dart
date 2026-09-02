import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
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
    this.servedAd,
    this.cycle = 0,
  });

  /// Stable across rebuilds, so an appreciation stays attached to the piece
  /// rather than to whatever happens to be at that scroll position.
  ///
  /// Deliberately *not* made unique when a reel is queued again on a later pass
  /// through an endless feed — see [cycle]. Everything this id reaches is
  /// something the archive holds one of: the view that has already been
  /// counted, the appreciation the member has already left, the counts document
  /// the card subscribes to. A repeat that carried a fresh id would double-count
  /// the first, lose the second and open a second listener for the third.
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

  /// The advert this reel *is*, when it was spliced into the feed by
  /// [spliceSponsored] rather than published or posted by anybody.
  ///
  /// The whole [ServedAd] rather than a bare flag, because the card has to draw
  /// the advertiser's own call to action and open the advertiser's own link,
  /// and copying those two fields onto [Reel] would have been two more places
  /// for the wording of a paid advert to go stale.
  final ServedAd? servedAd;

  /// Which pass through an endless feed this card is: 0 the first time the
  /// archive shows it, 1 the first time it comes round again, and so on.
  ///
  /// It exists so a repeat can be told apart from the reel it repeats without
  /// touching [id], which everything that counts anything reads. What it is
  /// deliberately *not* used for is a widget key: the pager keys its pages by
  /// position, as it always has, and the one list that would need unique keys
  /// is the one that cannot promise them — an advert can legitimately fill two
  /// slots of the same pass when the rotation holds fewer campaigns than the
  /// pass has room for, and a keyed sliver refuses duplicates outright.
  final int cycle;

  /// True when the member has watched everything and the feed has come round.
  bool get isReplay => cycle > 0;

  /// This same reel, queued again on pass [cycle].
  ///
  /// Spelt out field by field rather than through a general `copyWith`, because
  /// there is exactly one field a repeat is allowed to differ in and a copier
  /// that could change any of them would be an invitation to change [id].
  Reel replayed(int cycle) => Reel(
    id: id,
    imageUrl: imageUrl,
    label: label,
    title: title,
    creator: creator,
    initials: initials,
    caption: caption,
    sound: sound,
    credit: credit,
    creatorId: creatorId,
    likes: likes,
    comments: comments,
    englishSummary: englishSummary,
    culturalNotes: culturalNotes,
    alignment: alignment,
    videoUrl: videoUrl,
    avatarUrl: avatarUrl,
    isLive: isLive,
    communityPostId: communityPostId,
    servedAd: servedAd,
    cycle: cycle,
  );

  bool get isCommunity => communityPostId != null;

  /// True when nothing on this card belongs to a member: no creator page, no
  /// appreciation, no replies, and an impression that is counted against a
  /// campaign instead of against a reel.
  bool get isSponsored => servedAd != null;

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

  /// A paid advert as a full-screen reel.
  ///
  /// Its id is the campaign's and not a document's, because that is what the
  /// advertiser is counted on and what keeps the same advert from being counted
  /// twice when the rotation puts it in the feed more than once.
  ///
  /// A video creative *does* play here, unlike on the feed cards, and for the
  /// reason given in `sponsored_card.dart`: Explore holds exactly one reel in
  /// front of the member and stops everything else, so there is no second
  /// soundtrack to talk over. An advert frozen on a still in a column of moving
  /// pictures would be the only motionless thing on the screen, which is a
  /// worse kind of conspicuous than an honest label.
  static Reel fromServedAd(ServedAd ad) => Reel(
    id: 'sponsored:${ad.campaignId}',
    servedAd: ad,
    isLive: true,
    videoUrl: ad.isVideo && ad.hasCreative ? ad.creativeUrl : null,
    imageUrl: !ad.isVideo && ad.hasCreative ? ad.creativeUrl : '',
    label: 'SPONSORED',
    title: ad.headline,
    // The placement record carries no advertiser name, and inventing one — the
    // campaign id, "an advertiser", the CTA label — would put a byline on the
    // card where a member's name goes. The card leaves that line out instead.
    creator: '',
    initials: '',
    caption: ad.body,
    sound: '',
    credit: 'Sponsored · paid placement on Indigen World',
  );
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

/// How close to the end the member has to get before more is asked for.
///
/// Three reels ahead: far enough that a widened window has landed before the
/// last card does, close enough that somebody who opens Explore and closes it
/// again has not quietly fetched twice what they looked at. It is also the
/// budget the end of an endless feed has to work in — two asks, one to try
/// fetching and one to conclude there is nothing to fetch and come round
/// instead, both of which fit inside three pages.
const int kReelLoadAheadPages = 3;

/// Whether arriving at [index] of a feed of [length] rows is an ask for more.
///
/// Pure, public and named, because the rule is subtle enough that both ways of
/// getting it wrong are bad in ways nobody would notice in a review: ask on
/// every swipe and the feed re-subscribes two live queries under the member's
/// thumb; ask only once per length and a feed that has stopped fetching can
/// never be told to come round, so the member hits a wall at the end of the
/// archive. It asks once per page of the tail, and never again for a page it
/// has already asked from.
bool reelFeedShouldAskForMore({
  required int index,
  required int length,
  required int lastAskLength,
  required int lastAskIndex,
  int loadAhead = kReelLoadAheadPages,
}) {
  if (index < length - loadAhead) return false;
  return length != lastAskLength || index > lastAskIndex;
}

/// A full-bleed, vertically paged reel feed with its action rail.
class ReelFeedView extends ConsumerStatefulWidget {
  const ReelFeedView({
    required this.reels,
    this.isActive = true,
    this.initialIndex = 0,
    this.header,
    this.onNearEnd,
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

  /// Called once the member is within [kReelLoadAheadPages] of the last reel.
  ///
  /// A callback rather than a provider read, because three surfaces show this
  /// feed and only one of them — Explore — has more to fetch. A creator's page
  /// and a search result are finite lists, and asking them to grow would be
  /// asking for reels that are deliberately not theirs to show.
  final VoidCallback? onNearEnd;

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

  /// The feed's length, and how deep into it the member had gone, when more was
  /// last asked for.
  ///
  /// ── Why this is no longer "ask once per length" ────────────────────────
  /// It used to be exactly that: growing re-subscribes two live queries, so the
  /// ask was made once per arrival at the end rather than once per page turn
  /// inside the same tail, and a feed that had not grown since the last ask was
  /// a feed where asking again changed nothing.
  ///
  /// That was true while the only answer to "there is nothing left" was to
  /// stop. It is now the *question*: a feed with nothing left to fetch queues
  /// what it holds again instead, and the way [ExploreScreen] tells a window
  /// still filling from an archive already exhausted is that a second ask
  /// arrives with the feed no longer than the first one left it. A guard that
  /// refused to ask twice at the same length was refusing to ask the one
  /// question that had a new answer, and the member hit a wall three swipes
  /// later.
  ///
  /// So the ask is made once per *page* instead. Every fresh page inside the
  /// tail asks again — at most [kReelLoadAheadPages] asks before the feed either
  /// grows or comes round — while a member scrolling back up through pages they
  /// have already asked from is still silent, which is what the old guard was
  /// really protecting.
  var _lastAskLength = -1;
  var _lastAskIndex = -1;

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

  /// Whether this feed is currently holding the audio claim.
  ///
  /// Explore is the loudest surface in the app and until now it claimed
  /// nothing: it played video with sound while a song carried on underneath it,
  /// which is two soundtracks at once — exactly what
  /// [fullScreenMediaProvider] was built to prevent for community clips.
  var _claimedAudio = false;

  late final FullScreenMediaCount _audioFocus = ref.read(
    fullScreenMediaProvider.notifier,
  );

  /// Takes or gives back the claim as the feed comes and goes.
  ///
  /// Driven from `build` through a post-frame callback rather than called
  /// inline: `onScreen` is computed during layout and moving another provider
  /// there would be mutating state mid-build.
  void _syncAudioClaim(bool onScreen) {
    if (onScreen == _claimedAudio) return;
    _claimedAudio = onScreen;
    onScreen ? _audioFocus.enter() : _audioFocus.leave();
  }

  @override
  void dispose() {
    // Leaving the tab with the claim still held would silence the music for
    // the rest of the session.
    if (_claimedAudio) _audioFocus.leave();
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

  /// Asks for more reels once the end of the feed is in sight.
  void _maybeLoadMore(int index) {
    final onNearEnd = widget.onNearEnd;
    if (onNearEnd == null) return;
    final length = widget.reels.length;
    // Asked once per page of the tail, and not again for a page already asked
    // from — see [_lastAskLength] for why this is not once per length.
    if (!reelFeedShouldAskForMore(
      index: index,
      length: length,
      lastAskLength: _lastAskLength,
      lastAskIndex: _lastAskIndex,
    )) {
      return;
    }
    _lastAskLength = length;
    _lastAskIndex = index;
    onNearEnd();
  }

  /// Impressions are telemetry: written best-effort, never spoken about, and
  /// never allowed to interrupt watching.
  Future<void> _trackActiveView() async {
    if (widget.reels.isEmpty || !widget.isActive) return;
    final reel = widget.reels[_clampedIndex];
    // A sponsored reel is not a reel anybody published, so it has no view
    // document and belongs in none of the engagement collections. Its
    // impression goes to the advertiser's own counter instead, guarded by
    // [ServedAdTelemetry] rather than by [_trackedViews] — the campaign must
    // stay counted once even if the member leaves Explore and comes back to a
    // freshly built feed.
    //
    // That guard is also what makes an endless feed safe to charge from. It is
    // keyed by campaign and lives for the session, so an advert the re-queue
    // happens to place a second time cannot be counted a second time — an
    // advertiser is charged for reaching a member, not for how long that member
    // kept scrolling.
    if (reel.servedAd case final ad?) {
      await ref.read(servedAdTelemetryProvider).recordImpression(ad.campaignId);
      return;
    }
    // [_trackedViews] holds ids, and a re-queued reel keeps the id of the reel
    // it repeats, so the same discipline covers the loop: watching a clip for
    // the second time on the third pass is the view it already was.
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncAudioClaim(onScreen);
    });
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
              _maybeLoadMore(index);
            },
            itemBuilder: (context, index) {
              final reel = reels[index];
              final liked = switch (reel) {
                Reel(communityPostId: final postId?) => communityLikes.contains(
                  postId,
                ),
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
          // No "3 of 40" rail along the bottom any more. An endless feed has
          // no meaningful length to be three-fortieths of, and the one bar
          // worth having down there is the one that says where you are in the
          // *clip* — which each card now draws for itself, because only the
          // card knows whether it is playing anything.
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
        await repository.toggleBookmark(uid: uid, postId: postId, saved: saved);
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
    // Nobody's page. An advert has an advertiser, not a creator, and the one
    // door it is allowed to open is the one it paid for — which the card draws
    // as its own button. Reached only from the name line, which a sponsored
    // card does not draw either; the guard is here so it cannot be reached by a
    // route added later.
    if (reel.isSponsored) return;
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
            style: TextStyle(
              color: context.brand.mutedInk,
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
          Divider(color: context.brand.divider),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.copyright_rounded,
                size: 17,
                color: context.brand.mutedInk,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  reel.credit,
                  style: TextStyle(
                    color: context.brand.mutedInk,
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
      subtitle: 'Preview · sample copy',
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
  color: Color(0xFFCE7D60),
  fontSize: 10,
  fontWeight: FontWeight.w800,
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
        style: TextStyle(
          color: context.brand.accent,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.1,
        ),
      ),
      const SizedBox(height: 6),
      Text(
        body.trim(),
        style: TextStyle(color: context.brand.ink, fontSize: 14.5, height: 1.5),
      ),
    ],
  );
}

/// One reel, full frame: its footage, its words and its action rail.
///
/// The card owns the video player rather than delegating it to the background
/// layer, because everything drawn *over* the footage needs to know how the
/// footage is doing — whether it is still opening, whether it is stopped, and
/// how far through it is. Those three answers live in one place now, and the
/// chrome that reports them sits above the scrim where it can be seen.
class _ReelCard extends ConsumerStatefulWidget {
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
  ConsumerState<_ReelCard> createState() => _ReelCardState();
}

class _ReelCardState extends ConsumerState<_ReelCard> {
  VideoPlayerController? _controller;
  var _ready = false;
  var _failed = false;

  /// Bumped every time a controller is let go.
  ///
  /// Opening a video is a network round trip, and the member can leave the feed
  /// or flick to the next reel long before it finishes. The counter is how a
  /// late-arriving `initialize()` recognises that it belongs to a player
  /// nobody is waiting for any more, so it cannot resurrect playback.
  var _generation = 0;

  /// The clip this card should have open, or null when it should have none.
  ///
  /// Off screen the player goes altogether and the poster takes its place.
  /// Merely pausing would leave a decoder and an open audio session behind
  /// another tab.
  String? get _wantedUrl =>
      widget.isActive ? widget.reel.videoUrl : null;

  /// Whether the member is waiting on footage that has not arrived.
  ///
  /// This is the state that used to be drawn as a play button: a reel that had
  /// not finished opening looked exactly like a reel somebody had stopped, so
  /// the only honest read of a slow connection was "tapping does nothing".
  bool get _opening => _wantedUrl != null && !_ready && !_failed;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(_ReelCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reel.videoUrl != widget.reel.videoUrl ||
        oldWidget.isActive != widget.isActive) {
      _sync();
    } else if (oldWidget.isPlaying != widget.isPlaying ||
        oldWidget.onScreen != widget.onScreen) {
      _syncPlayback();
    }
  }

  @override
  void dispose() {
    _release();
    super.dispose();
  }

  /// Opens the clip this card should be showing, or lets go of the one it is.
  ///
  /// Only ever called from `initState` and `didUpdateWidget`, both of which a
  /// build follows immediately — so the fields are set plainly rather than
  /// through `setState`, which would only ask for a rebuild already on its way.
  void _sync() {
    final wanted = _wantedUrl;
    if (wanted == null) {
      _release();
      _failed = false;
      return;
    }
    if (_controller != null && _controller!.dataSource == wanted) {
      _syncPlayback();
      return;
    }
    _release();
    _failed = false;
    _open(wanted);
  }

  Future<void> _open(String url) async {
    final generation = _generation;
    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
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
    // Opened while paused — because the member stopped this reel before it
    // finished loading — the sync leaves it on its first frame rather than
    // starting sound nobody asked for.
    _syncPlayback();
  }

  /// True once this open no longer speaks for the card: it has been disposed,
  /// or a newer controller has taken over.
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

  /// Drops the current controller and makes every open so far stale.
  void _release() {
    _generation++;
    _ready = false;
    final controller = _controller;
    if (controller != null) _discard(controller);
  }

  void _syncPlayback() {
    final controller = _controller;
    // Nothing left to sync once the controller has gone: a disposed player
    // throws when told to play, and there is nobody there to hear it anyway.
    if (controller == null || !_ready || !mounted) return;
    if (widget.isPlaying && widget.onScreen) {
      controller.play();
    } else {
      controller.pause();
    }
  }

  @override
  Widget build(BuildContext context) {
    final reel = widget.reel;

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
    // conversation that is plainly happening. A sponsored reel is excluded for
    // a blunter reason: there is no engagement document behind a campaign id,
    // so this would open a snapshot listener on a reel that does not exist.
    final counts = reel.isLive && !reel.isCommunity && !reel.isSponsored
        ? (ref.watch(reelCountsProvider(reel.id)).asData?.value ??
              emptyReelCounts)
        : (likes: reel.likes, comments: reel.comments, views: 0);

    // A live total already counts this member's own edge, so adding one for
    // the filled heart would show every liker a number one too high. Only the
    // curated preview, whose figure is a fixed illustration, gets the local
    // bump — but a filled heart over a nought is a plain contradiction, so a
    // server total that has not caught up yet is floored at the one like the
    // member can see they left.
    final likeTotal = reel.isLive
        ? (widget.liked && counts.likes < 1 ? 1 : counts.likes)
        : counts.likes + (widget.liked ? 1 : 0);

    final ready = _ready ? _controller : null;

    return Semantics(
      // A screen reader hears what it is before it hears what it says, exactly
      // as a sighted member reads the pill before the headline.
      label: reel.isSponsored
          ? 'Sponsored. ${reel.title}.'
          : '${reel.title}. Cultural reel by ${reel.creator}.',
      child: GestureDetector(
        onTap: widget.onTogglePlayback,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _ReelBackground(
              reel: reel,
              isActive: widget.isActive,
              controller: ready,
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
            if (_opening)
              const Center(child: _ReelSpinner())
            else if (!widget.isPlaying)
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
              // The 82 is the room the action rail needs. An advert draws no
              // rail, so it does not hold a column of empty screen open beside
              // itself.
              right: reel.isSponsored ? 18 : 82,
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
                  // The byline and the sound line are both claims about a
                  // person: who made this, and what they are playing. An
                  // advert has neither, so it draws neither rather than
                  // drawing them empty.
                  if (!reel.isSponsored) ...[
                    const SizedBox(height: 13),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: widget.onOpenCreator,
                      child: Text(
                        memberProfile?.displayName ?? reel.creator,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
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
                  // The advert's own button stands where the sound line does on
                  // a real reel: the one place on the card that is a claim
                  // about the thing itself rather than about the person.
                  if (reel.servedAd case final ad? when ad.hasLink)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: SponsoredCtaButton(ad: ad, onDark: true),
                    )
                  else if (!reel.isSponsored)
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
            // No rail at all on an advert. Every control on it — the heart, the
            // replies, the keep, the context card with its licence line —
            // asserts that a member made this and that other members are
            // talking about it. An appreciation count under a paid placement is
            // not a small cosmetic wrong; it is the app vouching for an advert
            // in the same words it uses for somebody's grandmother singing.
            if (!reel.isSponsored)
              Positioned(
                right: 11,
                bottom: 44,
                child: Column(
                  children: [
                    ReelCreatorAvatar(
                      initials: reel.initials,
                      avatarUrl: avatarUrl,
                      onTap: reel.creatorId.isEmpty
                          ? null
                          : widget.onOpenCreator,
                    ),
                    const SizedBox(height: 13),
                    _ReelAction(
                      icon: widget.liked
                          ? Icons.favorite_rounded
                          : Icons.favorite_border_rounded,
                      label: reelCountLabel(likeTotal),
                      tooltip: widget.liked
                          ? 'Remove appreciation'
                          : 'Appreciate',
                      active: widget.liked,
                      onTap: widget.onLike,
                    ),
                    _ReelAction(
                      icon: Icons.chat_bubble_outline_rounded,
                      label: reelCountLabel(counts.comments),
                      tooltip: 'Replies',
                      onTap: widget.onComments,
                    ),
                    _ReelAction(
                      icon: widget.saved
                          ? Icons.bookmark_rounded
                          : Icons.bookmark_border_rounded,
                      label: widget.saved ? 'Kept' : 'Keep',
                      tooltip: widget.saved
                          ? 'Remove from keeps'
                          : 'Keep this reel',
                      active: widget.saved,
                      onTap: widget.onSave,
                    ),
                    _ReelAction(
                      icon: Icons.menu_book_outlined,
                      label: 'Context',
                      tooltip: 'Cultural context and licence',
                      onTap: widget.onContext,
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
                            shadows: [
                              Shadow(blurRadius: 8, color: Colors.black),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            // Above the scrim and below nothing: where you are in the clip is
            // the last thing a full-bleed video should hide.
            if (ready case final controller?)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: SafeArea(
                  top: false,
                  child: ReelProgressBar(controller: controller),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The wait while a clip opens.
///
/// A ring rather than a bar: nothing here knows how long the opening will
/// take, and a bar that cannot say how full it is only invites the question.
class _ReelSpinner extends StatelessWidget {
  const _ReelSpinner();

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    label: 'Loading the reel',
    child: Container(
      width: 68,
      height: 68,
      decoration: const BoxDecoration(
        color: Color(0x99000000),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: SizedBox.square(
          dimension: 30,
          child: CircularProgressIndicator(
            strokeWidth: 3,
            strokeCap: StrokeCap.round,
            color: context.brand.gold,
            backgroundColor: Colors.white24,
          ),
        ),
      ),
    ),
  );
}

/// How far through the clip this reel is, and a way to move it.
///
/// Public because a creator's page shows the same reels through the same card.
/// Thin and unobtrusive while it plays, and thicker under a thumb — a reel is
/// something you watch, right up until the moment you want a particular second
/// of it back.
class ReelProgressBar extends StatefulWidget {
  const ReelProgressBar({required this.controller, super.key});

  final VideoPlayerController controller;

  @override
  State<ReelProgressBar> createState() => _ReelProgressBarState();
}

class _ReelProgressBarState extends State<ReelProgressBar> {
  /// Where the thumb is, while it is down. The controller is only told at the
  /// end of the drag: seeking on every pixel makes a decoder thrash and the
  /// bar stutter under the finger that is moving it.
  double? _scrubbing;

  static const _restingHeight = 3.0;
  static const _scrubbingHeight = 7.0;

  /// The whole strip is taller than the bar it draws, so the target is worth
  /// aiming at on the very bottom edge of a phone.
  static const _touchHeight = 26.0;

  Duration _positionFor(double fraction, Duration total) => Duration(
    milliseconds: (total.inMilliseconds * fraction.clamp(0.0, 1.0)).round(),
  );

  void _seekTo(double fraction, Duration total) {
    widget.controller.seekTo(_positionFor(fraction, total));
  }

  double _fractionAt(double dx, double width) =>
      width <= 0 ? 0 : (dx / width).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<VideoPlayerValue>(
    valueListenable: widget.controller,
    builder: (context, value, _) {
      final total = value.duration;
      if (total <= Duration.zero) return const SizedBox.shrink();
      final played = _scrubbing ??
          (value.position.inMilliseconds / total.inMilliseconds)
              .clamp(0.0, 1.0);
      final scrubbing = _scrubbing != null;

      return LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            // Swallowed so a tap on the bar scrubs instead of stopping the
            // reel, which is what the card's own tap handler would do.
            onTap: () {},
            onHorizontalDragStart: (details) => setState(
              () => _scrubbing = _fractionAt(details.localPosition.dx, width),
            ),
            onHorizontalDragUpdate: (details) => setState(
              () => _scrubbing = _fractionAt(details.localPosition.dx, width),
            ),
            onHorizontalDragEnd: (_) {
              final fraction = _scrubbing;
              setState(() => _scrubbing = null);
              if (fraction != null) _seekTo(fraction, total);
            },
            onHorizontalDragCancel: () => setState(() => _scrubbing = null),
            onTapDown: (details) =>
                _seekTo(_fractionAt(details.localPosition.dx, width), total),
            child: SizedBox(
              height: _touchHeight,
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 140),
                    height: scrubbing ? _scrubbingHeight : _restingHeight,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.22),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: played,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: context.brand.gold,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      );
    },
  );
}

/// The reel background: a slow "Ken Burns" poster for image reels, or the
/// card's own player — plus its ambient edges — once it has a frame to show.
class _ReelBackground extends StatelessWidget {
  const _ReelBackground({
    required this.reel,
    required this.isActive,
    required this.controller,
  });

  final Reel reel;
  final bool isActive;

  /// An initialised player, or null while one is opening and for image reels.
  final VideoPlayerController? controller;

  @override
  Widget build(BuildContext context) {
    final poster = _poster();
    final controller = this.controller;
    if (controller == null) return poster;
    final videoAspect = controller.value.aspectRatio;
    return LayoutBuilder(
      builder: (context, constraints) {
        final cardAspect =
            constraints.hasBoundedHeight && constraints.maxHeight > 0
            ? constraints.maxWidth / constraints.maxHeight
            : videoAspect;
        return Stack(
          fit: StackFit.expand,
          children: [
            // Still the floor of the card: the texture is blank for the frame
            // or two between `initialize()` returning and the first decoded
            // picture arriving, and a black flash there reads as a failure.
            poster,
            if (reelNeedsAmbientEdges(videoAspect, cardAspect))
              _AmbientEdges(controller: controller),
            // Contained, not covered. A reel is somebody's framing, and
            // cropping a landscape clip to a portrait screen throws away the
            // sides of the shot — which on a dance or a weaving is most of what
            // was being filmed.
            Center(
              child: AspectRatio(
                aspectRatio: videoAspect,
                child: VideoPlayer(controller),
              ),
            ),
          ],
        );
      },
    );
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

/// Whether a clip of [videoAspect] leaves the card any edges to light.
///
/// A clip shot for this screen fills it outright, and blurring a second copy of
/// a texture that covers every pixel of the card would be a full-screen gaussian
/// per frame for a background nobody can see — on the one device class where
/// that budget is tightest.
bool reelNeedsAmbientEdges(double videoAspect, double cardAspect) {
  if (videoAspect <= 0 || cardAspect <= 0) return false;
  return (videoAspect - cardAspect).abs() > 0.02;
}

/// The letterbox, lit by the reel itself.
///
/// A contained clip leaves bands above and below it, and those bands used to be
/// the poster — the video's own opening frame, held still for the whole play.
/// A clip that pans, or cuts, or simply moves therefore played inside a
/// photograph of the moment before it started, and the seam between the two was
/// the most obvious thing on the card.
///
/// This is the same texture the player is already drawing, sampled a second
/// time: no second decode, no second stream, and nothing still. It is blown
/// past the card's edges so the blur has real pixels to reach for in the
/// corners, and dimmed so the reel stays the brightest thing on the screen.
///
/// Only ever one of these exists at a time — a card holds a player only while
/// it is the active reel — so the cost is one blurred layer, not one per row.
class _AmbientEdges extends StatelessWidget {
  const _AmbientEdges({required this.controller});

  final VideoPlayerController controller;

  /// Enough blur that no detail survives to compete with the reel, and not so
  /// much that a mid-range phone spends its frame budget on the background.
  static const _sigma = 26.0;

  /// Overscan. A gaussian reaches past its own edge, so a copy sized exactly to
  /// the card thins out into the corners and lets the poster show through.
  static const _overscan = 1.18;

  @override
  Widget build(BuildContext context) {
    final size = controller.value.size;
    return RepaintBoundary(
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ImageFiltered(
              imageFilter: ImageFilter.blur(
                sigmaX: _sigma,
                sigmaY: _sigma,
                tileMode: TileMode.clamp,
              ),
              child: Transform.scale(
                scale: _overscan,
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(
                    // A player that reports nothing sensible still has to be
                    // given a shape to be scaled from.
                    width: size.width > 0 ? size.width : 16,
                    height: size.height > 0 ? size.height : 9,
                    child: VideoPlayer(controller),
                  ),
                ),
              ),
            ),
            // The reel's own colours held to about a third. Without this a
            // bright clip washes the card out and the white captions over the
            // bands stop being readable.
            const ColoredBox(color: Color(0x66000000)),
          ],
        ),
      ),
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
      style: TextStyle(
        color: context.brand.gold,
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
                ? context.brand.terracotta
                : Colors.black.withValues(alpha: 0.36),
            foregroundColor: active ? context.brand.gold : Colors.white,
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
            color: context.brand.accent,
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
              decoration: BoxDecoration(
                color: context.brand.gold,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.person_rounded,
                color: context.brand.accent,
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
          backgroundColor: context.brand.accentFill,
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
