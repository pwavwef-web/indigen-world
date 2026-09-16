import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/clip_window.dart';
import 'package:indigen_world_mobile/core/media_geometry.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_screen.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/word_lookup.dart';
import 'package:indigen_world_mobile/features/explore/creator_profile_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_analytics.dart';
import 'package:indigen_world_mobile/features/explore/explore_chrome.dart';
import 'package:indigen_world_mobile/features/explore/explore_preferences.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_caption_overlay.dart';
import 'package:indigen_world_mobile/features/explore/reel_comments_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_context_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_details.dart';
import 'package:indigen_world_mobile/features/explore/reel_engagement.dart';
import 'package:indigen_world_mobile/features/explore/reel_keeps.dart';
import 'package:indigen_world_mobile/features/explore/reel_media.dart';
import 'package:indigen_world_mobile/features/explore/reel_overflow_menu.dart';
import 'package:indigen_world_mobile/features/explore/reel_rail.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:video_player/video_player.dart';

/// One card in a vertical reel feed.
///
/// Public because several surfaces show the same reel: Explore's feed, a
/// creator's own page, search results and the keeps list. Duplicating the card
/// would have meant duplicating the video lifecycle with it, and that is the
/// part that has to be right.
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
    this.mediaAspectRatio,
    this.focalPoint,
    this.community,
    this.category = '',
    this.handle = '',
    this.language = '',
    this.dialect = '',
    this.tags = const <String>[],
    this.translations = const <String>[],
    this.collectionKind = '',
    this.postCategory,
    this.sourceAttribution = '',
    this.publicationRoute = '',
    this.ageRating = '',
    this.createdAt,
    this.publishedAt,
    this.viewCount = 0,
    this.communityPost,
    this.communityMedia,
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

  /// Totals carried on the source record: a community post's denormalised
  /// counters. Published reels read theirs from the engagement collections.
  final int likes;
  final int comments;

  /// The English summary and cultural notes shown in the Context sheet.
  final String englishSummary;
  final String culturalNotes;

  final Alignment alignment;

  /// Playable video URL for video reels; null for pictures.
  final String? videoUrl;

  /// Creator avatar image; null falls back to initials.
  final String? avatarUrl;

  /// True when this reel is real content rather than an illustration, which
  /// changes both the copy and where its numbers come from.
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
  /// touching [id], which everything that counts anything reads. The pager keys
  /// its pages by (id, cycle), so a card keeps its player when a live snapshot
  /// moves it; adverts, which can legitimately fill two slots of one pass, are
  /// keyed by position instead.
  final int cycle;

  // ── Provenance and presentation ──────────────────────────────────────────

  /// Width over height of the media, when the source recorded it. Lets the
  /// card choose between a crop and a framed layout before a frame decodes.
  final double? mediaAspectRatio;

  /// The part of the frame to keep when the card crops. Null is the centre.
  final FocalPoint? focalPoint;

  /// The sub-community this was posted in, when it was.
  final PostCommunityStamp? community;

  /// The creator's own word for what this is — `storytelling`, `oral-history`
  /// — before it is tidied into [categoryLabel].
  final String category;

  /// The creator's @handle without the @, when one is known at build time.
  final String handle;

  /// A language code or name, and the dialect, as the source stated them.
  final String language;
  final String dialect;

  final List<String> tags;

  /// Meanings the creator declared for this piece.
  final List<String> translations;

  /// The Collection channel a published piece was filed under.
  final String collectionKind;

  /// The wire value of a community post's category, when it has one.
  final String? postCategory;

  /// Where the creator says the material came from.
  final String sourceAttribution;

  /// How a published piece reached the public; see [isReviewed].
  final String publicationRoute;

  /// `13+` when the submission declared that minors are involved.
  final String ageRating;

  /// When the source record was created, and when it became public.
  final DateTime? createdAt;
  final DateTime? publishedAt;

  /// The post's own view counter, for community reels. Published reels have no
  /// public view total — `reelViews` is readable only by each viewer.
  final int viewCount;

  /// The post a community reel was built from, kept whole so moderation —
  /// reporting, muting, blocking — acts on exactly what the member saw.
  final CommunityPost? communityPost;

  /// The item of [communityPost] this reel plays, carrying what its creator
  /// chose in the reel creator: the part of the file to show, whether its own
  /// sound plays, and its captions.
  final CommunityMedia? communityMedia;

  /// The trimmed part of a community clip, when its creator trimmed it.
  ClipWindow? get clipWindow => communityMedia?.clipWindow;

  /// False when the creator took the clip's own sound away.
  bool get playsOriginalSound => communityMedia?.originalSound ?? true;

  /// True when the member has watched everything and the feed has come round.
  bool get isReplay => cycle > 0;

  bool get isVideo => videoUrl?.isNotEmpty ?? false;

  /// A still picture rather than a clip.
  bool get isImage => !isVideo && imageUrl.isNotEmpty;

  /// Whether a human on the Indigen World review desk approved this before it
  /// was public. Community posts are published by their authors and never are.
  bool get isReviewed => const {
    'reviewed',
    'collection_review',
    'admin',
  }.contains(publicationRoute);

  bool get isCommunity => communityPostId != null;

  /// True when nothing on this card belongs to a member: no creator page, no
  /// appreciation, no replies, and an impression that is counted against a
  /// campaign instead of against a reel.
  bool get isSponsored => servedAd != null;

  /// Where this came from, in words.
  String get sourceLabel => isSponsored
      ? 'Paid placement'
      : isCommunity
      ? 'Community post'
      : isLive
      ? 'Published archive'
      : 'Preview';

  /// The short category line over the byline: `STORYTELLING`.
  String get categoryLabel {
    if (isSponsored) return 'SPONSORED';
    if (isCommunity) {
      // A reel made in the creator names its own topic — DANCE, not MUSIC.
      if (communityPost?.reel case final details?) {
        return details.topic.label.toUpperCase();
      }
      return switch (postCategory) {
        'story' => 'STORYTELLING',
        'music' => 'MUSIC',
        'culture' => 'CULTURE',
        'language' => 'LANGUAGE',
        'question' => 'QUESTION',
        'announcement' => 'ANNOUNCEMENT',
        _ => 'COMMUNITY',
      };
    }
    final raw = category.trim().isNotEmpty ? category : collectionKind;
    final tidy = raw.replaceAll(RegExp(r'[-_]+'), ' ').trim().toUpperCase();
    return tidy.isEmpty ? 'CULTURAL WORK' : tidy;
  }

  /// The language, named for people rather than for databases.
  String get languageLabel => exploreLanguageName(language);

  /// This same reel, queued again on pass [cycle].
  ///
  /// Every field is carried across and only [cycle] differs; a general
  /// `copyWith` would be an invitation to change [id].
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
    mediaAspectRatio: mediaAspectRatio,
    focalPoint: focalPoint,
    community: community,
    category: category,
    handle: handle,
    language: language,
    dialect: dialect,
    tags: tags,
    translations: translations,
    collectionKind: collectionKind,
    postCategory: postCategory,
    sourceAttribution: sourceAttribution,
    publicationRoute: publicationRoute,
    ageRating: ageRating,
    createdAt: createdAt,
    publishedAt: publishedAt,
    viewCount: viewCount,
    communityPost: communityPost,
    communityMedia: communityMedia,
  );

  /// A community post as a reel, opening on [media] — its first video, or a
  /// picture when it has none.
  ///
  /// Only posts that actually carry media reach here — see `communityReels` —
  /// so the caller does not have to defend against a caption-only post arriving
  /// in a full-screen feed.
  static Reel fromCommunityPost(CommunityPost post, CommunityMedia media) {
    final caption = post.text.trim();
    final category = post.category?.wire;
    // What the reel creator asked for: a topic, the creator's account of what
    // is happening, whose work it is and on what terms. Ordinary posts carry
    // none of it and read exactly as before.
    final details = post.reel;
    return Reel(
      id: 'community:${post.id}',
      communityPostId: post.id,
      communityPost: post,
      communityMedia: media,
      culturalNotes: details?.context ?? '',
      sourceAttribution: details?.attributionLine ?? '',
      imageUrl: media.isVideo ? (media.thumbnailUrl ?? '') : media.url,
      videoUrl: media.isVideo ? media.url : null,
      mediaAspectRatio: positiveAspectRatio(media.aspectRatio),
      focalPoint: media.focalPoint,
      avatarUrl: post.authorAvatarUrl,
      creatorId: post.authorId,
      isLive: true,
      label: details != null
          ? details.topic.label.toUpperCase()
          : switch (category) {
              'story' => 'STORYTELLING',
              'music' => 'MUSIC',
              'culture' => 'CULTURE',
              'language' => 'LANGUAGE',
              _ => 'FROM THE COMMUNITY',
            },
      // A post has no title, and inventing one from its first line would put
      // words in somebody's mouth. The caption carries the whole message.
      title: caption,
      creator: post.authorName,
      handle: post.authorUsername,
      initials: reelInitials(post.authorName),
      caption: caption,
      likes: post.likeCount,
      comments: post.replyCount,
      viewCount: post.viewCount,
      sound: !media.isVideo
          ? 'Photo · @${post.authorUsername}'
          : media.originalSound
          ? 'Original sound · @${post.authorUsername}'
          : 'No original sound · @${post.authorUsername}',
      credit:
          details?.rights.credit ??
          'Posted by @${post.authorUsername} in Community',
      category: details?.topic.wire ?? '',
      community: post.community,
      postCategory: category,
      createdAt: post.createdAt,
      publishedAt: post.createdAt,
    );
  }

  static Reel fromPublished(PublishedReel published) {
    final caption = published.description.trim().isNotEmpty
        ? published.description.trim()
        : published.englishSummary.trim();
    final where = [
      published.dialect,
      exploreLanguageName(published.language),
    ].where((value) => value.trim().isNotEmpty).join(' · ');
    final label = published.category.trim().isNotEmpty
        ? '${published.category.trim().toUpperCase()}'
              '${where.isNotEmpty ? ' · ${where.toUpperCase()}' : ''}'
        : (where.isNotEmpty
              ? where.toUpperCase()
              : 'PUBLISHED ON INDIGEN WORLD');
    final communityId = published.communityId;
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
      sound: published.isImage
          ? 'Photograph · ${published.creatorName}'
          : 'Original sound · ${published.creatorName}',
      credit: published.licenceDisplay.trim().isNotEmpty
          ? published.licenceDisplay.trim()
          : 'Published with permission · Indigen World',
      mediaAspectRatio: published.aspectRatio,
      focalPoint: published.focalPoint,
      community: communityId == null
          ? null
          : PostCommunityStamp(
              id: communityId,
              name: published.communityName ?? communityId,
              isPrivate: false,
            ),
      category: published.category,
      language: published.language,
      dialect: published.dialect,
      tags: published.tags,
      translations: published.translations,
      collectionKind: published.collectionKind,
      sourceAttribution: published.sourceAttribution,
      publicationRoute: published.publicationRoute,
      ageRating: published.ageRating,
      createdAt: DateTime.tryParse(published.createdAt ?? ''),
      publishedAt: DateTime.tryParse(published.publishedAt ?? ''),
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

/// A language as people name it. The publication workflow stores ISO codes —
/// `xsm` by default — which nobody watching a reel should have to decode.
String exploreLanguageName(String raw) {
  final value = raw.trim();
  return switch (value.toLowerCase()) {
    '' => '',
    'xsm' || 'kasem' || 'kasena' => 'Kasem',
    'en' || 'eng' => 'English',
    'fr' || 'fra' => 'French',
    'tw' || 'twi' => 'Twi',
    'ha' || 'hau' => 'Hausa',
    _ => value,
  };
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

/// The key a page is built under, so a card — and the player inside it —
/// follows its reel when a live snapshot moves it to another position.
///
/// Adverts are keyed by position: the same campaign can fill two slots of one
/// pass, and a keyed sliver refuses duplicate keys outright.
String reelPageKey(Reel reel, int index) =>
    reel.isSponsored ? 'ad@$index' : '${reel.id}#${reel.cycle}';

/// Where [anchor] now sits in [reels], searching outwards from [near].
///
/// Bounded, because the list may be an endless feed whose rows are computed
/// on demand; a reel that moved further than this has effectively gone.
int? reelIndexNear(List<Reel> reels, Reel anchor, int near, {int reach = 40}) {
  if (reels.isEmpty) return null;
  final key = reelPageKey(anchor, near);
  for (var distance = 0; distance <= reach; distance++) {
    for (final index in {near - distance, near + distance}) {
      if (index < 0 || index >= reels.length) continue;
      if (reelPageKey(reels[index], index) == key) return index;
    }
  }
  return null;
}

/// Makes the player for one clip.
///
/// A provider rather than a direct constructor call so the playback rules —
/// one clip playing, the next one opened and waiting, everything further away
/// released — can be tested against a player that needs no platform plugin.
final reelVideoControllerFactoryProvider =
    Provider<VideoPlayerController Function(String url)>(
      (ref) =>
          (url) => VideoPlayerController.networkUrl(Uri.parse(url)),
    );

/// A full-bleed, vertically paged reel feed with its action rail.
class ReelFeedView extends ConsumerStatefulWidget {
  const ReelFeedView({
    required this.reels,
    this.isActive = true,
    this.initialIndex = 0,
    this.header,
    this.footer,
    this.bottomInset = 0,
    this.onNearEnd,
    this.chrome,
    this.isLoadingMore = false,
    this.onActiveIndexChanged,
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

  /// Optional chrome pinned over the bottom of the feed — Explore's nav bar.
  ///
  /// A slot rather than a widget this file owns, because several surfaces show
  /// this feed and only one of them has anywhere else to navigate to.
  final Widget? footer;

  /// How much room the footer needs at the bottom of every card.
  ///
  /// Passed as a number rather than measured, because the words, the action
  /// rail and the progress bar are positioned absolutely inside each card and
  /// have to clear the footer before it is drawn over them.
  final double bottomInset;

  /// Called once the member is within [kReelLoadAheadPages] of the last reel.
  ///
  /// A callback rather than a provider read, because only Explore has more to
  /// fetch. A creator's page and a search result are finite lists.
  final VoidCallback? onNearEnd;

  /// When given, the header, footer and every card's words and rail get out of
  /// the way during playback and scrolling — see [ExploreChromeController].
  /// Without one they stay put, which is how the creator page, search results
  /// and keeps keep their controls.
  final ExploreChromeController? chrome;

  /// Whether more reels are being fetched behind the last one.
  final bool isLoadingMore;

  final ValueChanged<int>? onActiveIndexChanged;

  @override
  ConsumerState<ReelFeedView> createState() => _ReelFeedViewState();
}

class _ReelFeedViewState extends ConsumerState<ReelFeedView>
    with WidgetsBindingObserver {
  late int _activeIndex = widget.initialIndex;
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );

  /// The member's own intent for the active reel: they have not tapped it to a
  /// stop. Reset to true on every new reel.
  var _playing = true;
  var _foreground = true;

  /// True while a full screen this feed pushed — a creator's page, a thread, a
  /// community — covers it. Pushing a route does not change [ReelFeedView.
  /// isActive], so without this a reel played on under the page it opened.
  var _covered = false;

  /// True while the Context sheet covers most of the frame.
  var _sheetPaused = false;

  /// True after a word's pronunciation was played, until its panel closes, so
  /// the reel's sound never talks over the word.
  var _audioPaused = false;

  /// Appreciations and keeps tapped whose writes have not settled, by reel id.
  /// Drawn ahead of the server and dropped when the write settles either way:
  /// on success the stream already carries the change, on failure dropping it
  /// is the rollback.
  final _pendingLikes = <String, bool>{};
  final _pendingSaves = <String, bool>{};

  /// Reels whose server-side view has already been written this session.
  final _trackedViews = <String>{};

  /// The feed's length, and how deep into it the member had gone, when more was
  /// last asked for. Asked once per page of the tail — see
  /// [reelFeedShouldAskForMore].
  var _lastAskLength = -1;
  var _lastAskIndex = -1;

  // ── One continuous look at the active reel ────────────────────────────────

  static const _tick = Duration(milliseconds: 250);
  Timer? _dwellTicker;
  var _visitOnScreen = Duration.zero;
  var _visitWatched = Duration.zero;
  var _visitImpression = false;
  var _visitQualified = false;
  var _visitCompletions = 0;
  var _videoPlaying = false;
  Duration? _videoLength;

  /// Where the current drag started and how far it has gone.
  int? _dragStartIndex;
  var _dragDistance = 0.0;

  /// Keys of the pages near the active one, for the pager to find a moved card.
  var _keyIndex = const <String, int>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Before the platform has sent its first lifecycle message there is no
    // state to read, and a launching app is on its way to the foreground.
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
  }

  /// Whether this feed is currently holding the audio claim.
  ///
  /// Explore is the loudest surface in the app: without the claim it played
  /// video with sound while a song carried on underneath it.
  var _claimedAudio = false;

  late final FullScreenMediaCount _audioFocus = ref.read(
    fullScreenMediaProvider.notifier,
  );

  void _syncAudioClaim(bool onScreen) {
    if (onScreen == _claimedAudio) return;
    _claimedAudio = onScreen;
    onScreen ? _audioFocus.enter() : _audioFocus.leave();
  }

  bool get _onScreen => widget.isActive && _foreground && !_covered;

  void _syncTicker(bool onScreen) {
    if (onScreen && _dwellTicker == null) {
      _dwellTicker = Timer.periodic(_tick, (_) => _tickDwell());
    } else if (!onScreen && _dwellTicker != null) {
      _dwellTicker!.cancel();
      _dwellTicker = null;
    }
  }

  var _lastChromePlaying = false;

  void _syncChrome(bool onScreen) {
    final chrome = widget.chrome;
    if (chrome == null || widget.reels.isEmpty) return;
    chrome.alwaysVisible = MediaQuery.accessibleNavigationOf(context);
    final playing = onScreen && _effectivePlaying;
    if (playing != _lastChromePlaying) {
      _lastChromePlaying = playing;
      chrome.setPlaying(playing);
    }
  }

  bool get _effectivePlaying => _playing && !_sheetPaused && !_audioPaused;

  @override
  void didUpdateWidget(ReelFeedView oldWidget) {
    super.didUpdateWidget(oldWidget);
    _keepActiveReelInPlace(oldWidget.reels, widget.reels);
  }

  /// Keeps the member on the reel they are watching when the list changes
  /// under them.
  ///
  /// The feed is live: a reel published while somebody scrolls, a snapshot that
  /// reorders, a creator they just hid. The pager addresses reels by position,
  /// so any of those used to swap the video under their thumb. Now the active
  /// reel is found again by its key and the pager's offset corrected to it —
  /// silently, without a scroll animation or a page-change event — and the
  /// card, keyed the same way, keeps its player.
  void _keepActiveReelInPlace(List<Reel> previous, List<Reel> next) {
    if (identical(previous, next) || previous.isEmpty || next.isEmpty) return;
    final oldIndex = _activeIndex.clamp(0, previous.length - 1);
    final anchor = previous[oldIndex];
    if (oldIndex < next.length &&
        reelPageKey(next[oldIndex], oldIndex) ==
            reelPageKey(anchor, oldIndex)) {
      return;
    }
    final found = anchor.isSponsored
        ? null
        : reelIndexNear(next, anchor, oldIndex);
    if (found == null) {
      // The reel is gone — hidden, removed, or moved out of reach. The next
      // one slides into its place and is a new look, not a continuation.
      _activeIndex = oldIndex.clamp(0, next.length - 1);
      _playing = true;
      _startVisit();
      return;
    }
    _activeIndex = found;
    if (_controller.hasClients) {
      final position = _controller.position;
      if (position.hasViewportDimension) {
        position.correctPixels(found * position.viewportDimension);
      }
    }
  }

  @override
  void deactivate() {
    // A deactivated feed is on its way out — a topic switch builds a new one
    // in its place — and a tick landing between now and dispose would reach
    // for providers through a context that is no longer safe to use.
    _dwellTicker?.cancel();
    _dwellTicker = null;
    super.deactivate();
  }

  @override
  void dispose() {
    // Leaving the tab with the claim still held would silence the music for
    // the rest of the session. Given back after the frame: dispose runs while
    // the tree is being finalised, where changing a provider is refused.
    if (_claimedAudio) {
      _claimedAudio = false;
      final focus = _audioFocus;
      scheduleMicrotask(() {
        try {
          focus.leave();
        } on Object {
          // The whole scope went with the feed; there is no claim left to give.
        }
      });
    }
    _dwellTicker?.cancel();
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

  Reel? get _activeReel =>
      widget.reels.isEmpty ? null : widget.reels[_clampedIndex];

  void _onPageChanged(int index) {
    if (index == _activeIndex) return;
    setState(() {
      _activeIndex = index;
      _playing = true;
      _sheetPaused = false;
      _audioPaused = false;
    });
    _startVisit();
    _maybeLoadMore(index);
    widget.onActiveIndexChanged?.call(index);
  }

  /// Asks for more reels once the end of the feed is in sight.
  void _maybeLoadMore(int index) {
    final onNearEnd = widget.onNearEnd;
    if (onNearEnd == null) return;
    final length = widget.reels.length;
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

  // ── Measuring ─────────────────────────────────────────────────────────────

  void _startVisit() {
    _visitOnScreen = Duration.zero;
    _visitWatched = Duration.zero;
    _visitImpression = false;
    _visitQualified = false;
    _visitCompletions = 0;
    _videoPlaying = false;
    _videoLength = null;
  }

  /// Counts time on screen and time watched for the active reel, and records
  /// the impression and the qualified view as each is reached.
  ///
  /// A fling past a reel never reaches either, which is the point: see
  /// [exploreDwellFor].
  void _tickDwell() {
    final reel = _activeReel;
    if (!mounted || reel == null || !_onScreen) return;
    _visitOnScreen += _tick;
    final watching = reel.isVideo ? _videoPlaying : true;
    if (watching) _visitWatched += _tick;
    final dwell = exploreDwellFor(
      onScreen: _visitOnScreen,
      watched: _visitWatched,
      videoLength: reel.isVideo ? _videoLength : null,
    );
    if (dwell.impression && !_visitImpression) {
      _visitImpression = true;
      _recordImpression(reel);
    }
    if (dwell.qualified && !_visitQualified) {
      _visitQualified = true;
      unawaited(_recordQualifiedView(reel));
    }
  }

  void _recordImpression(Reel reel) {
    ref.read(exploreAnalyticsProvider).logReel(ExploreEvent.impression, reel);
    // A sponsored reel's impression goes to the advertiser's own counter,
    // guarded by [ServedAdTelemetry] — keyed by campaign for the session — so
    // an advert the re-queue places twice is still charged once.
    if (reel.servedAd case final ad?) {
      unawaited(
        ref.read(servedAdTelemetryProvider).recordImpression(ad.campaignId),
      );
    }
  }

  Future<void> _recordQualifiedView(Reel reel) async {
    if (reel.isSponsored) return;
    ref
        .read(exploreAnalyticsProvider)
        .logReel(ExploreEvent.qualifiedView, reel);
    if (reel.communityPost case final post?) {
      await CommunityActions(ref).trackView(post);
      return;
    }
    // [_trackedViews] holds ids, and a re-queued reel keeps the id of the reel
    // it repeats, so watching a clip again on a later pass is the view it
    // already was.
    if (!reel.isLive || !_trackedViews.add(reel.id)) return;
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(reelEngagementRepositoryProvider);
    if (uid == null || repository == null) return;
    try {
      await repository.trackView(uid: uid, reelId: reel.id);
      if (mounted) ref.invalidate(reelCountsProvider(reel.id));
    } on Object {
      // Nothing about a view is worth a word to the member.
    }
  }

  void _onVideoLooped(Reel reel) {
    _visitCompletions++;
    ref
        .read(exploreAnalyticsProvider)
        .logReel(
          _visitCompletions == 1
              ? ExploreEvent.completion
              : ExploreEvent.replay,
          reel,
          extra: {'loop': _visitCompletions},
        );
  }

  // ── Scrolling and the chrome ──────────────────────────────────────────────

  bool _onScroll(ScrollNotification notification) {
    final chrome = widget.chrome;
    if (chrome == null || notification.depth != 0) return false;
    switch (notification) {
      case ScrollStartNotification(dragDetails: _?):
        _dragStartIndex = _activeIndex;
        _dragDistance = 0;
      case ScrollUpdateNotification(dragDetails: _?, :final scrollDelta?):
        _dragDistance += scrollDelta;
        if (_dragDistance > 14) {
          chrome.dragged(towardsPrevious: false);
        } else if (_dragDistance < -14) {
          chrome.dragged(towardsPrevious: true);
        }
      case ScrollEndNotification():
        chrome.settled(changedReel: _dragStartIndex != _activeIndex);
        _dragStartIndex = null;
      default:
        break;
    }
    return false;
  }

  void _onTapMedia(Reel reel) {
    final chrome = widget.chrome;
    if (reel.isVideo) {
      HapticFeedback.selectionClick();
      setState(() {
        _playing = !_playing;
        _audioPaused = false;
      });
      if (_playing) chrome?.interacted();
      return;
    }
    chrome?.toggle();
  }

  Future<void> _withCover(Future<void> Function() open) async {
    setState(() => _covered = true);
    try {
      await open();
    } finally {
      if (mounted) setState(() => _covered = false);
    }
  }

  Future<void> _withChromeHeld(
    Object reason,
    Future<void> Function() open,
  ) async {
    widget.chrome?.hold(reason);
    try {
      await open();
    } finally {
      widget.chrome?.release(reason);
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final onScreen = _onScreen;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _syncAudioClaim(onScreen);
      _syncTicker(onScreen);
      _syncChrome(onScreen);
    });
    final reels = widget.reels;
    if (reels.isEmpty) {
      return const ColoredBox(
        color: Color(0xFF06080F),
        child: Center(
          child: Text(
            'Nothing published here yet.',
            style: TextStyle(color: Colors.white70),
          ),
        ),
      );
    }
    final activeIndex = _clampedIndex;
    _keyIndex = {
      for (
        var index = (activeIndex - 6).clamp(0, reels.length);
        index < (activeIndex + 7).clamp(0, reels.length);
        index++
      )
        reelPageKey(reels[index], index): index,
    };

    // The member's own state, from the server, so it survives a restart.
    // Illustrative reels keep a device-local store — there is no account
    // behind them to attach an edge to.
    final serverLikes =
        ref.watch(myReelLikesProvider).asData?.value ?? const <String>{};
    final serverSaves =
        ref.watch(myReelSavesProvider).asData?.value ?? const <String>{};
    // A community reel is liked and saved as the post it is, so the state
    // shown here is the same state its card shows in the Community feed.
    final communityLikes =
        ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final communityBookmarks =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final localSaves =
        ref.watch(savedReelIdsProvider).asData?.value ?? const <String>{};
    final localLikes =
        ref.watch(appreciatedReelIdsProvider).asData?.value ?? const <String>{};
    final following =
        ref.watch(followingIdsProvider).asData?.value ?? const <String>[];
    final optimistic = ref.watch(optimisticEngagementProvider);
    final uid = ref.watch(currentUidProvider);
    final soundMuted = ref.watch(exploreSoundMutedProvider);
    final dictionary = ref.watch(dictionaryIndexProvider);
    final chrome = widget.chrome;
    final compactRail = MediaQuery.sizeOf(context).height < 700;

    // Its own Material, so the words and ink on every card have a text style
    // and a surface to draw on wherever the feed is shown — the shell provides
    // one, but a feed that only works under somebody else's Scaffold draws its
    // captions in the debug fallback style everywhere else.
    return Material(
      color: const Color(0xFF06080F),
      child: Stack(
        fit: StackFit.expand,
        children: [
          NotificationListener<ScrollNotification>(
            onNotification: _onScroll,
            child: PageView.builder(
              controller: _controller,
              scrollDirection: Axis.vertical,
              // Builds the reel on either side of the active one, so the next
              // clip can be opening before the member swipes to it.
              allowImplicitScrolling: true,
              itemCount: reels.length,
              onPageChanged: _onPageChanged,
              findChildIndexCallback: (key) =>
                  key is ValueKey<String> ? _keyIndex[key.value] : null,
              itemBuilder: (context, index) {
                final reel = reels[index];
                final serverLiked = switch (reel) {
                  Reel(communityPostId: final postId?) =>
                    communityLikes.contains(postId),
                  Reel(isLive: true) => serverLikes.contains(reel.id),
                  _ => localLikes.contains(reel.id),
                };
                final liked = switch (reel) {
                  Reel(communityPostId: final postId?) => optimistic.liked(
                    postId,
                    server: serverLiked,
                  ),
                  _ => _pendingLikes[reel.id] ?? serverLiked,
                };
                final saved =
                    _pendingSaves[reel.id] ??
                    switch (reel) {
                      Reel(communityPostId: final postId?) =>
                        communityBookmarks.contains(postId),
                      Reel(isLive: true) => serverSaves.contains(reel.id),
                      _ => localSaves.contains(reel.id),
                    };
                final followState =
                    reel.isSponsored ||
                        reel.creatorId.isEmpty ||
                        reel.creatorId == uid
                    ? ReelFollowState.unavailable
                    : optimistic.following(
                        reel.creatorId,
                        server: following.contains(reel.creatorId),
                      )
                    ? ReelFollowState.following
                    : ReelFollowState.notFollowing;
                final isActive = index == activeIndex;
                return _ReelCard(
                  key: ValueKey(reelPageKey(reel, index)),
                  reel: reel,
                  bottomInset: widget.bottomInset,
                  isActive: isActive,
                  preload: index == activeIndex + 1,
                  isPlaying: isActive && _effectivePlaying,
                  userPaused: isActive && !_playing,
                  onScreen: onScreen,
                  liked: liked,
                  serverLiked: serverLiked,
                  saved: saved,
                  followState: followState,
                  soundMuted: soundMuted,
                  chrome: chrome,
                  compactRail: compactRail,
                  showLoadingMore:
                      widget.isLoadingMore && index == reels.length - 1,
                  translationAvailable: reelHasTranslation(reel, dictionary),
                  onTapMedia: () => _onTapMedia(reel),
                  onLike: () => _toggleAppreciation(reel, liked: liked),
                  onSave: () => _toggleSave(reel, saved: saved),
                  onComments: () => _openComments(reel),
                  onContext: () => _openContext(reel),
                  onTranslate: () => _openTranslation(reel),
                  onMore: () => _openMore(reel),
                  onFollow: () => _follow(reel),
                  onOpenCreator: () => _openCreator(reel),
                  onOpenCommunity: () => _openCommunity(reel),
                  onToggleSound: () {
                    ref.read(exploreSoundMutedProvider.notifier).toggle();
                    chrome?.interacted();
                  },
                  onCommunityJoined: (status) => logExploreCommunityJoin(
                    ref.read(exploreAnalyticsProvider),
                    reel,
                    status,
                  ),
                  onVideoPlaying: (playing) {
                    if (isActive) _videoPlaying = playing;
                  },
                  onVideoLength: (length) {
                    if (isActive) _videoLength = length;
                  },
                  onVideoLooped: () {
                    if (isActive) _onVideoLooped(reel);
                  },
                );
              },
            ),
          ),
          if (widget.header case final header?)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: ExploreChromeFade(
                controller: chrome,
                slide: const Offset(0, -0.4),
                child: SafeArea(bottom: false, child: header),
              ),
            ),
          if (widget.footer case final footer?)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: ExploreChromeFade(
                controller: chrome,
                slide: const Offset(0, 0.5),
                child: SafeArea(top: false, child: footer),
              ),
            ),
        ],
      ),
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  Future<void> _toggleSave(Reel reel, {required bool saved}) async {
    HapticFeedback.selectionClick();
    final analytics = ref.read(exploreAnalyticsProvider);
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

    final uid = await CommunityActions(ref).requireSignIn(context);
    if (uid == null || !mounted) return;
    setState(() => _pendingSaves[reel.id] = !saved);
    try {
      if (reel.communityPostId case final postId?) {
        final repository = ref.read(communityRepositoryProvider);
        if (repository == null) throw StateError('offline');
        await repository.toggleBookmark(uid: uid, postId: postId, saved: saved);
      } else {
        final repository = ref.read(reelEngagementRepositoryProvider);
        if (repository == null) throw StateError('offline');
        await repository.setSaved(uid: uid, reelId: reel.id, saved: !saved);
      }
      if (!saved) analytics.logReel(ExploreEvent.save, reel);
      if (mounted) {
        showGlassToast(
          context,
          saved ? 'Removed from your keeps.' : 'Kept. Find it under Saved.',
        );
      }
    } on Object {
      if (mounted) showGlassToast(context, 'Could not update. Try again.');
    } finally {
      if (mounted) setState(() => _pendingSaves.remove(reel.id));
    }
  }

  Future<void> _toggleAppreciation(Reel reel, {required bool liked}) async {
    HapticFeedback.lightImpact();
    final analytics = ref.read(exploreAnalyticsProvider);
    if (!reel.isLive) {
      await ref.read(reelKeepsProvider).toggleAppreciated(reel.id);
      ref.invalidate(savedEntryIdsProvider);
      return;
    }
    final uid = await CommunityActions(ref).requireSignIn(context);
    if (uid == null || !mounted) return;

    if (reel.communityPostId case final postId?) {
      final repository = ref.read(communityRepositoryProvider);
      if (repository == null) return;
      final optimistic = ref.read(optimisticEngagementProvider.notifier)
        ..setLike(postId, !liked);
      try {
        await repository.toggleLike(uid: uid, postId: postId, liked: liked);
        if (!liked) analytics.logReel(ExploreEvent.like, reel);
      } on Object {
        if (mounted) showGlassToast(context, 'Could not update. Try again.');
      } finally {
        optimistic.clearLike(postId);
      }
      return;
    }

    final repository = ref.read(reelEngagementRepositoryProvider);
    if (repository == null) return;
    setState(() => _pendingLikes[reel.id] = !liked);
    try {
      await repository.setLiked(uid: uid, reelId: reel.id, liked: !liked);
      if (!liked) analytics.logReel(ExploreEvent.like, reel);
      ref.invalidate(reelCountsProvider(reel.id));
    } on Object {
      if (mounted) showGlassToast(context, 'Could not update. Try again.');
    } finally {
      if (mounted) setState(() => _pendingLikes.remove(reel.id));
    }
  }

  /// Follows the reel's creator from the plus on their face.
  ///
  /// The plus becomes a check the moment it is tapped. If the write is refused
  /// the override is dropped — which puts the plus back — and the member is
  /// told, rather than being left to discover later that they follow nobody.
  Future<void> _follow(Reel reel) async {
    final uid = await CommunityActions(ref).requireSignIn(context);
    if (uid == null || !mounted || uid == reel.creatorId) return;
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) {
      showGlassToast(context, 'Following needs a connection.');
      return;
    }
    final already =
        ref.read(followingIdsProvider).asData?.value.contains(reel.creatorId) ??
        false;
    if (already) return;
    HapticFeedback.selectionClick();
    final optimistic = ref.read(optimisticEngagementProvider.notifier)
      ..setFollow(reel.creatorId, true);
    try {
      await repository.toggleFollow(
        followerId: uid,
        targetId: reel.creatorId,
        following: false,
      );
      ref
        ..invalidate(profileCountsProvider(reel.creatorId))
        ..invalidate(profileCountsProvider(uid));
      ref.read(exploreAnalyticsProvider).logReel(ExploreEvent.follow, reel);
    } on CommunityFailure catch (error) {
      if (mounted) showGlassToast(context, error.message);
    } on Object {
      if (mounted) {
        showGlassToast(context, 'Could not follow ${reel.creator}. Try again.');
      }
    } finally {
      optimistic.clearFollow(reel.creatorId);
    }
  }

  /// The name and handle to show for [reel], preferring the creator's live
  /// community profile over what the record was stamped with.
  ({String name, String handle}) _creatorLine(Reel reel) {
    final profile = reel.creatorId.isEmpty
        ? null
        : ref.read(communityProfileProvider(reel.creatorId)).asData?.value;
    return (
      name: profile?.displayName ?? reel.creator,
      handle: reel.handle.isNotEmpty ? reel.handle : (profile?.username ?? ''),
    );
  }

  Future<void> _openCreator(Reel reel) async {
    // Nobody's page. An advert has an advertiser, not a creator.
    if (reel.isSponsored || reel.creatorId.isEmpty) return;
    await _withCover(() async {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => reel.isCommunity
              ? CommunityProfileScreen(uid: reel.creatorId)
              : CreatorProfileScreen(
                  creatorId: reel.creatorId,
                  fallbackName: reel.creator,
                  fallbackAvatarUrl: reel.avatarUrl,
                ),
        ),
      );
    });
  }

  Future<void> _openCommunity(Reel reel) async {
    final community = reel.community;
    if (community == null) return;
    await _withCover(() async {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunitySpaceScreen(communityId: community.id),
        ),
      );
    });
  }

  Future<void> _openComments(Reel reel) async {
    if (reel.isSponsored) return;
    ref.read(exploreAnalyticsProvider).logReel(ExploreEvent.commentOpen, reel);
    if (reel.communityPostId case final postId?) {
      await _withCover(() async {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) => PostDetailScreen(postId: postId),
          ),
        );
      });
      return;
    }
    // An illustrative reel has no comment thread and never had one.
    if (!reel.isLive) return;
    await _withChromeHeld('comments', () async {
      await showReelCommentsSheet(context, reelId: reel.id, title: reel.title);
    });
    if (mounted) ref.invalidate(reelCountsProvider(reel.id));
  }

  /// The Context sheet: meaning, culture, words, source and permission.
  ///
  /// This is the point of the whole feed. A reel without its context is just a
  /// clip, and the permission line is what tells a viewer what they may do
  /// with somebody else's cultural work.
  Future<void> _openContext(Reel reel) async {
    final analytics = ref.read(exploreAnalyticsProvider)
      ..logReel(ExploreEvent.contextOpen, reel);
    final creator = _creatorLine(reel);
    await _withChromeHeld('context', () async {
      await showReelContextSheet(
        context,
        reel: reel,
        creatorName: creator.name,
        handle: creator.handle,
        onOpenCreator: () => _openCreator(reel),
        onOpenCommunity: reel.community == null
            ? null
            : () => _openCommunity(reel),
        onPronunciationPlay: () => _pronunciationPlayed(reel),
        onTranslationOpen: () =>
            analytics.logReel(ExploreEvent.translationOpen, reel),
        onExtentChanged: (extent) {
          final pause = extent >= kContextPauseExtent;
          if (mounted && pause != _sheetPaused) {
            setState(() => _sheetPaused = pause);
          }
        },
      );
    });
    if (mounted) {
      setState(() {
        _sheetPaused = false;
        _audioPaused = false;
      });
    }
  }

  Future<void> _openTranslation(Reel reel) async {
    ref
        .read(exploreAnalyticsProvider)
        .logReel(ExploreEvent.translationOpen, reel);
    await _withChromeHeld('translation', () async {
      await showReelTranslationSheet(
        context,
        reel: reel,
        onPronunciationPlay: () => _pronunciationPlayed(reel),
      );
    });
    if (mounted) setState(() => _audioPaused = false);
  }

  void _pronunciationPlayed(Reel reel) {
    ref
        .read(exploreAnalyticsProvider)
        .logReel(ExploreEvent.pronunciationPlay, reel);
    if (mounted && !_audioPaused) setState(() => _audioPaused = true);
  }

  Future<void> _openMore(Reel reel) async {
    final creator = _creatorLine(reel);
    await _withChromeHeld('menu', () async {
      await showReelOverflowMenu(
        context,
        ref,
        reel: reel,
        creatorName: creator.name,
        handle: creator.handle,
      );
    });
  }
}

/// One reel, full frame: its footage, its words and its action rail.
///
/// The card owns the video player rather than delegating it to the background
/// layer, because everything drawn *over* the footage needs to know how the
/// footage is doing — whether it is still opening, whether it failed, whether
/// it is stopped, and how far through it is.
class _ReelCard extends ConsumerStatefulWidget {
  const _ReelCard({
    required this.reel,
    required this.bottomInset,
    required this.isActive,
    required this.preload,
    required this.isPlaying,
    required this.userPaused,
    required this.onScreen,
    required this.liked,
    required this.serverLiked,
    required this.saved,
    required this.followState,
    required this.soundMuted,
    required this.chrome,
    required this.compactRail,
    required this.showLoadingMore,
    required this.translationAvailable,
    required this.onTapMedia,
    required this.onLike,
    required this.onSave,
    required this.onComments,
    required this.onContext,
    required this.onTranslate,
    required this.onMore,
    required this.onFollow,
    required this.onOpenCreator,
    required this.onOpenCommunity,
    required this.onToggleSound,
    required this.onCommunityJoined,
    required this.onVideoPlaying,
    required this.onVideoLength,
    required this.onVideoLooped,
    super.key,
  });

  final Reel reel;

  /// Room reserved at the bottom of this card for chrome drawn over it.
  final double bottomInset;

  final bool isActive;

  /// The reel after the active one: its clip opens, paused on the first frame,
  /// so the swipe to it lands on a picture rather than a spinner.
  final bool preload;

  /// Whether the clip should be playing: active, not tapped to a stop, not
  /// covered by a sheet.
  final bool isPlaying;

  /// The member tapped this reel to a stop — the only pause that draws a play
  /// button.
  final bool userPaused;

  /// Whether the feed is in front of the member at all.
  final bool onScreen;

  final bool liked;
  final bool serverLiked;
  final bool saved;
  final ReelFollowState followState;
  final bool soundMuted;
  final ExploreChromeController? chrome;
  final bool compactRail;
  final bool showLoadingMore;
  final bool translationAvailable;
  final VoidCallback onTapMedia;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback onComments;
  final VoidCallback onContext;
  final VoidCallback onTranslate;
  final VoidCallback onMore;
  final VoidCallback onFollow;
  final VoidCallback onOpenCreator;
  final VoidCallback onOpenCommunity;
  final VoidCallback onToggleSound;
  final ValueChanged<MembershipStatus> onCommunityJoined;
  final ValueChanged<bool> onVideoPlaying;
  final ValueChanged<Duration> onVideoLength;
  final VoidCallback onVideoLooped;

  @override
  ConsumerState<_ReelCard> createState() => _ReelCardState();
}

class _ReelCardState extends ConsumerState<_ReelCard> {
  VideoPlayerController? _controller;
  var _ready = false;
  var _failed = false;
  var _stillFailed = false;

  /// Set when a clip has taken longer than [_slowAfter] to open.
  var _slow = false;
  Timer? _slowTimer;
  static const _slowAfter = Duration(seconds: 6);

  /// What the player last reported, for telling a loop from a seek.
  var _lastPosition = Duration.zero;
  var _lastPlaying = false;

  /// Keeps a trimmed community clip inside the part its creator chose. The
  /// file is uploaded whole — see `clip_window.dart` — so the trim is honoured
  /// here, at playback.
  ClipWindowGuard? _windowGuard;

  /// Sound is off when the member muted Explore or the creator removed it.
  double get _volume =>
      widget.soundMuted || !widget.reel.playsOriginalSound ? 0 : 1;

  /// Bumped every time a controller is let go.
  ///
  /// Opening a video is a network round trip, and the member can leave the feed
  /// or flick to the next reel long before it finishes. The counter is how a
  /// late-arriving `initialize()` recognises that it belongs to a player
  /// nobody is waiting for any more, so it cannot resurrect playback.
  var _generation = 0;

  /// The clip this card should have open, or null when it should have none.
  ///
  /// Only the active reel and the one after it hold a player. Everything
  /// further away lets its decoder go and shows its poster — merely pausing
  /// would leave a decoder behind for every reel somebody has swiped past.
  String? get _wantedUrl =>
      widget.isActive || widget.preload ? widget.reel.videoUrl : null;

  /// Whether the member is waiting on footage that has not arrived.
  bool get _opening =>
      widget.isActive && _wantedUrl != null && !_ready && !_failed;

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(_ReelCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.reel.videoUrl != widget.reel.videoUrl ||
        oldWidget.isActive != widget.isActive ||
        oldWidget.preload != widget.preload) {
      _sync();
      if (widget.isActive && !oldWidget.isActive) _reportLength();
    } else if (oldWidget.isPlaying != widget.isPlaying ||
        oldWidget.onScreen != widget.onScreen ||
        oldWidget.soundMuted != widget.soundMuted) {
      _syncPlayback();
    }
    if (oldWidget.reel.imageUrl != widget.reel.imageUrl) _stillFailed = false;
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
    final controller = ref.read(reelVideoControllerFactoryProvider)(url);
    _controller = controller;
    _slowTimer?.cancel();
    _slow = false;
    _slowTimer = Timer(_slowAfter, () {
      if (!_isStale(generation) && !_ready) setState(() => _slow = true);
    });
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(_volume);
      final window = widget.reel.clipWindow;
      if (window != null) await controller.seekTo(window.start);
    } on Object {
      _discard(controller);
      if (_isStale(generation)) return;
      _slowTimer?.cancel();
      setState(() {
        _failed = true;
        _slow = false;
      });
      return;
    }
    if (_isStale(generation)) {
      _discard(controller);
      return;
    }
    _slowTimer?.cancel();
    controller.addListener(_onPlayerTick);
    if (widget.reel.clipWindow case final window?) {
      _windowGuard = ClipWindowGuard(
        controller,
        window,
        onLooped: () {
          if (mounted && widget.isActive) widget.onVideoLooped();
        },
      )..attach();
    }
    setState(() {
      _ready = true;
      _slow = false;
    });
    _reportLength();
    // Opened while paused — because this is the preloaded reel, or the member
    // stopped it before it finished loading — the sync leaves it on its first
    // frame rather than starting sound nobody asked for.
    _syncPlayback();
  }

  void _retry() {
    final url = widget.reel.videoUrl;
    if (url == null) return;
    setState(() {
      _release();
      _failed = false;
      _open(url);
    });
  }

  void _reportLength() {
    final controller = _controller;
    if (!widget.isActive || controller == null || !_ready) return;
    final duration = controller.value.duration;
    widget.onVideoLength(
      widget.reel.clipWindow?.lengthWithin(duration) ?? duration,
    );
  }

  /// Reads the player for the two things the feed measures: whether it is
  /// really playing, and whether it has just looped.
  void _onPlayerTick() {
    final controller = _controller;
    if (controller == null || !widget.isActive) return;
    final value = controller.value;
    if (value.isPlaying != _lastPlaying) {
      _lastPlaying = value.isPlaying;
      widget.onVideoPlaying(value.isPlaying);
    }
    // A trimmed clip's loops are reported by its guard, which is what sends
    // it back to the start; reading them off the position too would count
    // each one twice.
    if (_windowGuard == null &&
        exploreLoopedBack(
          previous: _lastPosition,
          current: value.position,
          length: value.duration,
        )) {
      widget.onVideoLooped();
    }
    _lastPosition = value.position;
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
    _windowGuard?.detach();
    _windowGuard = null;
    controller
      ..removeListener(_onPlayerTick)
      ..dispose();
  }

  /// Drops the current controller and makes every open so far stale.
  void _release() {
    _generation++;
    _ready = false;
    _slow = false;
    _slowTimer?.cancel();
    _lastPosition = Duration.zero;
    _lastPlaying = false;
    final controller = _controller;
    if (controller != null) _discard(controller);
  }

  void _syncPlayback() {
    final controller = _controller;
    // Nothing left to sync once the controller has gone: a disposed player
    // throws when told to play, and there is nobody there to hear it anyway.
    if (controller == null || !_ready || !mounted) return;
    controller.setVolume(_volume);
    // Only the active reel ever plays. The preloaded one waits on its first
    // frame, so two clips can never be heard at once.
    if (widget.isActive && widget.isPlaying && widget.onScreen) {
      controller.play();
    } else {
      controller.pause();
    }
  }

  @override
  Widget build(BuildContext context) {
    final reel = widget.reel;
    final chrome = widget.chrome;

    // Published records only carry the avatar the creator had when the piece
    // was approved, and for most creators that is null. Their community
    // profile is world-readable and current, so it is what fills the gap.
    final memberProfile = reel.creatorId.isEmpty
        ? null
        : ref.watch(communityProfileProvider(reel.creatorId)).asData?.value;
    final avatarUrl = reel.avatarUrl?.isNotEmpty ?? false
        ? reel.avatarUrl
        : memberProfile?.avatarUrl;
    final displayName = memberProfile?.displayName ?? reel.creator;
    final handle = reel.handle.isNotEmpty
        ? reel.handle
        : (memberProfile?.username ?? '');

    // A community video counts where it lives: its appreciations and replies
    // are the post's own. A sponsored reel has no engagement document at all.
    final counts = reel.isLive && !reel.isCommunity && !reel.isSponsored
        ? (ref.watch(reelCountsProvider(reel.id)).asData?.value ??
              emptyReelCounts)
        : (likes: reel.likes, comments: reel.comments, views: reel.viewCount);

    // The totals already count this member's own edge once the server has it,
    // so the displayed number moves by one only while a tap is ahead of the
    // server — and a filled heart is never drawn over a nought.
    var likeTotal = counts.likes;
    if (widget.liked != widget.serverLiked) {
      likeTotal += widget.liked ? 1 : -1;
    }
    if (widget.liked && likeTotal < 1) likeTotal = 1;
    if (likeTotal < 0) likeTotal = 0;

    final ready = _ready ? _controller : null;
    final media = ReelMediaFrame(
      imageUrl: reel.imageUrl,
      isActive: widget.isActive,
      controller: ready,
      aspectRatio: reel.mediaAspectRatio,
      focalPoint: reel.focalPoint,
      onStillFailed: reel.isImage
          ? () {
              if (mounted && !_stillFailed) setState(() => _stillFailed = true);
            }
          : null,
    );

    final bottom = widget.bottomInset;
    // The words and the rail clear the nav bar, the device's own gesture
    // area, and the strip the progress bar runs along between them.
    final lift = bottom + MediaQuery.paddingOf(context).bottom + 22;
    return Semantics(
      // One node per reel, so a screen reader moves through a reel's parts —
      // its words, its rail — rather than hearing them run together.
      container: true,
      // A screen reader hears what it is before it hears what it says.
      label: reel.isSponsored
          ? 'Sponsored. ${reel.title}.'
          : '${reel.categoryLabel.toLowerCase()} '
                '${reel.isVideo ? 'video' : 'picture'} by $displayName.'
                '${reel.title.trim().isEmpty ? '' : ' ${reel.title.trim()}.'}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTapMedia,
        child: Stack(
          fit: StackFit.expand,
          children: [
            media,
            // The shades exist to make the words legible, so they leave with
            // the words and the picture is left clean.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 150,
              child: ExploreChromeFade(
                controller: chrome,
                child: const IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0x73000000), Color(0x00000000)],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 340 + bottom,
              child: ExploreChromeFade(
                controller: chrome,
                child: const IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0x00000000),
                          Color(0x8C000000),
                          Color(0xCC000000),
                        ],
                        stops: [0, 0.55, 1],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (_opening)
              Center(child: _ReelSpinner(slow: _slow))
            else if (widget.isActive && _failed)
              Center(
                child: _MediaUnavailable(
                  message: 'This video cannot be played right now.',
                  onRetry: _retry,
                ),
              )
            else if (widget.isActive && reel.isImage && _stillFailed)
              const Center(
                child: _MediaUnavailable(
                  message: 'This picture could not be loaded.',
                ),
              )
            else if (reel.isVideo && widget.userPaused)
              const Center(child: _PausedMark()),
            // Captions sit over the picture and clear of the words, and stay
            // when the rest of the chrome fades: they belong to the video,
            // not to the card.
            if ((ready, reel.communityMedia?.captions)
                case (final controller?, final captions?)
                when captions.isShowable)
              Positioned(
                left: 0,
                right: 0,
                bottom: lift + 170,
                child: ReelCaptionOverlay(
                  controller: controller,
                  track: captions,
                  bottomPadding: 0,
                ),
              ),
            if (widget.showLoadingMore)
              Positioned(
                top: MediaQuery.paddingOf(context).top + 62,
                left: 0,
                right: 0,
                child: const Center(child: _LoadingMorePill()),
              ),
            Positioned(
              left: 14,
              // Room for the rail; an advert draws only its menu button.
              right: reel.isSponsored ? 70 : 78,
              bottom: lift,
              child: ExploreChromeFade(
                controller: chrome,
                slide: const Offset(0, 0.04),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ReelDetails(
                      reel: reel,
                      displayName: displayName,
                      handle: handle,
                      isActive: widget.isActive,
                      viewCount: counts.views,
                      soundMuted: widget.soundMuted,
                      onOpenCreator: widget.onOpenCreator,
                      onOpenCommunity: widget.onOpenCommunity,
                      onToggleSound: widget.onToggleSound,
                      onTranslate: widget.translationAvailable
                          ? widget.onTranslate
                          : null,
                      onCommunityJoined: widget.onCommunityJoined,
                    ),
                    // The advert's own button stands where the sound line does
                    // on a real reel.
                    if (reel.servedAd case final ad? when ad.hasLink) ...[
                      const SizedBox(height: 10),
                      SponsoredCtaButton(ad: ad, onDark: true),
                    ],
                  ],
                ),
              ),
            ),
            // An advert carries no appreciation, replies, keep or context —
            // every one of those asserts that a member made this — only the
            // menu, so it can still be reported.
            Positioned(
              right: 8,
              bottom: lift - 4,
              child: ExploreChromeFade(
                controller: chrome,
                slide: const Offset(0.2, 0),
                child: reel.isSponsored
                    ? ReelRailButton(
                        icon: Icons.more_horiz_rounded,
                        label: 'More',
                        semanticLabel: 'More options',
                        onTap: widget.onMore,
                      )
                    : ReelActionRail(
                        creatorName: displayName,
                        initials: reel.initials,
                        avatarUrl: avatarUrl,
                        followState: widget.followState,
                        likeCount: likeTotal,
                        commentCount: counts.comments,
                        liked: widget.liked,
                        saved: widget.saved,
                        compact: widget.compactRail,
                        onOpenCreator: reel.creatorId.isEmpty
                            ? null
                            : widget.onOpenCreator,
                        onFollow: widget.onFollow,
                        onLike: widget.onLike,
                        onComments: widget.onComments,
                        onSave: widget.onSave,
                        onContext: widget.onContext,
                        onMore: widget.onMore,
                      ),
              ),
            ),
            // Where you are in the clip. It rides just above the nav bar while
            // the bar is there and drops to the bottom edge when it goes.
            if (ready case final controller? when widget.isActive)
              _ProgressDock(
                chrome: chrome,
                bottomInset: bottom,
                child: ReelProgressBar(
                  controller: controller,
                  window: reel.clipWindow,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ProgressDock extends StatelessWidget {
  const _ProgressDock({
    required this.chrome,
    required this.bottomInset,
    required this.child,
  });

  final ExploreChromeController? chrome;
  final double bottomInset;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final chrome = this.chrome;
    Widget dock(double bottom) => Positioned(
      left: 0,
      right: 0,
      bottom: bottom,
      child: SafeArea(top: false, child: child),
    );
    if (chrome == null) return dock(bottomInset);
    return ValueListenableBuilder<bool>(
      valueListenable: chrome,
      builder: (context, visible, _) => dock(visible ? bottomInset : 0),
    );
  }
}

/// The wait while a clip opens, and what it says when the wait runs long.
class _ReelSpinner extends StatelessWidget {
  const _ReelSpinner({required this.slow});

  final bool slow;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    label: slow
        ? 'Slow connection. Still loading the video'
        : 'Loading the video',
    excludeSemantics: true,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: const BoxDecoration(
            color: Color(0x99000000),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: SizedBox.square(
              dimension: 28,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                strokeCap: StrokeCap.round,
                color: context.brand.gold,
                backgroundColor: Colors.white24,
              ),
            ),
          ),
        ),
        if (slow) ...[
          const SizedBox(height: 10),
          const _DarkPill(
            icon: Icons.network_check_rounded,
            text: 'Slow connection — still loading',
          ),
        ],
      ],
    ),
  );
}

class _PausedMark extends StatelessWidget {
  const _PausedMark();

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Paused. Tap to play',
    excludeSemantics: true,
    child: Container(
      width: 64,
      height: 64,
      decoration: const BoxDecoration(
        color: Color(0x99000000),
        shape: BoxShape.circle,
      ),
      child: const Icon(
        Icons.play_arrow_rounded,
        color: Colors.white,
        size: 38,
      ),
    ),
  );
}

class _MediaUnavailable extends StatelessWidget {
  const _MediaUnavailable({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 48),
    padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
    decoration: BoxDecoration(
      color: const Color(0xCC06080F),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: Colors.white24),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(
          Icons.broken_image_outlined,
          color: Colors.white70,
          size: 28,
        ),
        const SizedBox(height: 8),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            height: 1.35,
          ),
        ),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('Try again'))
        else
          const SizedBox(height: 6),
      ],
    ),
  );
}

class _LoadingMorePill extends StatelessWidget {
  const _LoadingMorePill();

  @override
  Widget build(BuildContext context) =>
      const _DarkPill(text: 'Loading more…', spinner: true);
}

class _DarkPill extends StatelessWidget {
  const _DarkPill({required this.text, this.icon, this.spinner = false});

  final String text;
  final IconData? icon;
  final bool spinner;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
    decoration: BoxDecoration(
      color: const Color(0xB306080F),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.white24),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (spinner)
          SizedBox.square(
            dimension: 13,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: context.brand.gold,
            ),
          )
        else if (icon != null)
          Icon(icon, size: 15, color: Colors.white70),
        const SizedBox(width: 8),
        Text(
          text,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
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
  const ReelProgressBar({required this.controller, this.window, super.key});

  final VideoPlayerController controller;

  /// The part of the file the bar spans, for a trimmed clip. Null is the whole
  /// file.
  final ClipWindow? window;

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
    final start = widget.window?.start ?? Duration.zero;
    widget.controller.seekTo(start + _positionFor(fraction, total));
  }

  double _fractionAt(double dx, double width) =>
      width <= 0 ? 0 : (dx / width).clamp(0.0, 1.0);

  @override
  Widget build(
    BuildContext context,
  ) => ValueListenableBuilder<VideoPlayerValue>(
    valueListenable: widget.controller,
    builder: (context, value, _) {
      final window = widget.window;
      final total = window?.lengthWithin(value.duration) ?? value.duration;
      if (total <= Duration.zero) return const SizedBox.shrink();
      final into = value.position - (window?.start ?? Duration.zero);
      final played =
          _scrubbing ??
          (into.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
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
                    // The track spans the card; only the gold part is how far
                    // through the clip it is.
                    width: double.infinity,
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

/// Whether a clip of [videoAspect] leaves the card any edges to light.
///
/// A clip shot for this screen fills it outright, and blurring a second copy of
/// a texture that covers every pixel of the card would be a full-screen gaussian
/// per frame for a background nobody can see. [reelMediaLayout] makes the
/// fuller decision — whether a crop is safe — and this remains the cheap
/// guard for "is there any difference in shape at all".
bool reelNeedsAmbientEdges(double videoAspect, double cardAspect) {
  if (videoAspect <= 0 || cardAspect <= 0) return false;
  return (videoAspect - cardAspect).abs() > 0.02;
}

/// What stands in for a poster that has not arrived, or never will.
class ReelPlaceholder extends StatelessWidget {
  const ReelPlaceholder({super.key});

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [context.brand.heroMid, context.brand.heroLit, context.brand.highlight],
      ),
    ),
    child: const Center(
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
