import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_media_view.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/widgets/supporter_badge.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// One complete community post surface.
///
/// ── Why this is not a card ──────────────────────────────────────────────
/// It used to be: a tinted pane with a lit edge, a warm lift and a gold or
/// green halo bloomed underneath it. Twenty of those scrolling past turned a
/// page of writing into a row of glowing boxes, and the loudest thing on the
/// screen was the container rather than what somebody had written in it.
///
/// So the feed follows the shape that every text-first social product has
/// converged on for the same reason — a full-bleed row, a hairline underneath
/// it, and nothing else. The only colour on a resting post is the writing;
/// everything the reader can *do* stays grey until they have done it, and then
/// exactly one glyph lights up. Media, polls and quotes get a hairline box of
/// their own so they read as attachments to the post rather than as cards
/// inside a card.
class CommunityPostCard extends ConsumerWidget {
  const CommunityPostCard({
    required this.post,
    required this.liked,
    required this.saved,
    required this.onLike,
    required this.onReply,
    required this.onSave,
    required this.onOpen,
    required this.onOpenAuthor,
    required this.onMore,
    this.reposted = false,
    this.votedOptionId,
    this.onRepost,
    this.onQuote,
    this.onShare,
    this.onViews,
    this.onVote,
    this.onOpenQuoted,
    this.onOpenResharer,
    this.onOpenHandle,
    this.onOpenLink,
    this.onPollVotes,
    this.showThreadLine = false,
    this.showDivider = true,
    this.compact = false,
    super.key,
  });

  final CommunityPost post;
  final bool liked;
  final bool saved;
  final bool reposted;
  final String? votedOptionId;
  final VoidCallback onLike;
  final VoidCallback onReply;
  final VoidCallback onSave;
  final VoidCallback onOpen;
  final VoidCallback onOpenAuthor;
  final VoidCallback onMore;
  final VoidCallback? onRepost;
  final VoidCallback? onQuote;
  final VoidCallback? onShare;
  final VoidCallback? onViews;
  final ValueChanged<String>? onVote;
  final VoidCallback? onOpenQuoted;
  final VoidCallback? onOpenResharer;
  final ValueChanged<String>? onOpenHandle;
  final ValueChanged<String>? onOpenLink;
  final VoidCallback? onPollVotes;

  /// Draws the vertical rule from this post's avatar down to the next one, for
  /// a reply that continues a thread.
  final bool showThreadLine;

  /// The hairline that separates one post from the next. Off for the last row
  /// of a list that already ends in one.
  final bool showDivider;

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;

    // Author stamps make the feed cheap and offline-capable; the live profile
    // makes later avatar/name changes visible immediately. This dual lookup is
    // also what repairs older cards whose stamp never carried a photo URL.
    final liveAuthor = ref
        .watch(communityProfileProvider(post.authorId))
        .asData
        ?.value;
    final authorName = liveAuthor?.displayName ?? post.authorName;
    final authorHandle = liveAuthor?.handle ?? post.handle;
    final authorAvatar = liveAuthor?.avatarUrl ?? post.authorAvatarUrl;
    final authorInitials = liveAuthor?.initials ?? post.initials;
    final authorMark = liveAuthor?.mark ?? post.authorMark;
    // The live profile first, exactly as the verification mark does. A profile
    // read is what makes a badge disappear the day a subscription lapses; the
    // stamp on the post is only the fallback for a feed drawn before the
    // profile has arrived.
    final authorSupporter =
        liveAuthor?.supporterMark ?? post.authorSupporterMark;

    final avatarSize = compact ? 34.0 : 42.0;
    final gutter = compact ? 10.0 : 12.0;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onOpen,
        splashFactory: NoSplash.splashFactory,
        highlightColor: brand.ink.withValues(alpha: 0.03),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: showDivider
                ? Border(bottom: BorderSide(color: brand.divider))
                : null,
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, compact ? 10 : 13, 12, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (post.isResharedFeedItem) ...[
                  Padding(
                    padding: EdgeInsets.only(left: avatarSize + gutter),
                    child: _ActivityLabel(
                      name: post.resharedByName ?? 'A community member',
                      onTap: onOpenResharer,
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
                Stack(
                  children: [
                    // The rule from this post's avatar down to the next one.
                    // Drawn here rather than inside the avatar's own column:
                    // the attachment below now breaks out of that column, and
                    // the rule still has to run the whole height of the post.
                    if (showThreadLine)
                      Positioned(
                        top: avatarSize + 6,
                        bottom: 0,
                        left: avatarSize / 2 - 1,
                        width: 2,
                        child: ColoredBox(color: brand.divider),
                      ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CommunityAvatar(
                              initials: authorInitials,
                              imageUrl: authorAvatar,
                              username: liveAuthor?.username ??
                                  post.authorUsername,
                              size: avatarSize,
                              onTap: onOpenAuthor,
                            ),
                            SizedBox(width: gutter),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _PostByline(
                                    name: authorName,
                                    handle: authorHandle,
                                    mark: authorMark,
                                    supporter: authorSupporter,
                                    age: communityAgeLabel(post.createdAt),
                                    edited: post.isEdited,
                                    compact: compact,
                                    onOpenAuthor: onOpenAuthor,
                                    onMore: onMore,
                                  ),
                                  if (post.text.isNotEmpty) ...[
                                    const SizedBox(height: 3),
                                    PostText(
                                      text: post.text,
                                      fontSize: compact ? 14.5 : 15.5,
                                      onOpenHandle: onOpenHandle,
                                      onOpenLink: onOpenLink,
                                    ),
                                  ],
                                  if (post.firstLink case final link?) ...[
                                    const SizedBox(height: 10),
                                    CommunityLinkPreview(
                                      url: link,
                                      onTap: onOpenLink == null
                                          ? null
                                          : () => onOpenLink!(link),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                        // Full width, rather than tucked into the column beside
                        // the avatar. Indented by an avatar's width on one side
                        // and stopped short on the other, an attachment reads
                        // as pushed to the right — and a portrait video, the
                        // tallest thing in the feed, took the whole post with
                        // it. Writing stays under the byline it belongs to;
                        // the picture does not have to.
                        if (post.hasMedia) ...[
                          const SizedBox(height: 10),
                          Padding(
                            // Squares the right margin with the card's own left
                            // inset, so the block sits centred rather than
                            // merely wider.
                            padding: const EdgeInsets.only(right: 4),
                            child: PostMediaView(
                              media: post.media,
                              // The viewer can appreciate, reply to and share
                              // the post the picture came from, so somebody
                              // who opened it to look properly never has to
                              // close it again to say anything.
                              actions: MediaPostActions(
                                postId: post.id,
                                likeCount: post.likeCount,
                                replyCount: post.replyCount,
                                onLike: onLike,
                                onReply: onReply,
                                onShare: onShare,
                              ),
                              // And it says whose it is while they look. The
                              // byline the card draws above is the first thing
                              // a full-screen picture covers up, and a
                              // photograph nobody is named under is a
                              // photograph nobody can follow, reply to or
                              // trust.
                              author: MediaPostAuthor(
                                displayName: authorName,
                                handle: authorHandle,
                                initials: authorInitials,
                                mark: authorMark,
                                supporterMark: authorSupporter,
                                avatarUrl: authorAvatar,
                                caption: post.text,
                                onOpenProfile: onOpenAuthor,
                              ),
                            ),
                          ),
                        ],
                        Padding(
                          padding: EdgeInsets.only(left: avatarSize + gutter),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (post.poll case final poll?) ...[
                                const SizedBox(height: 10),
                                CommunityPollCard(
                                  poll: poll,
                                  votedOptionId: votedOptionId,
                                  onVote: onVote,
                                  onViewVotes: onPollVotes,
                                ),
                              ],
                              if (post.quotedPost case final quoted?) ...[
                                const SizedBox(height: 10),
                                QuotedPostPreview(
                                  post: quoted,
                                  onTap: onOpenQuoted ?? onOpen,
                                ),
                              ],
                              const SizedBox(height: 2),
                              PostActionBar(
                                replyCount: post.replyCount,
                                repostCount: post.reshareAndQuoteCount,
                                likeCount: post.likeCount,
                                viewCount: post.viewCount,
                                liked: liked,
                                reposted: reposted,
                                saved: saved,
                                onReply: onReply,
                                onRepost: onRepost,
                                onQuote: onQuote,
                                onLike: onLike,
                                onViews: onViews,
                                onSave: onSave,
                                onShare: onShare,
                              ),
                            ],
                          ),
                        ),
                      ],
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
}

/// Name · handle · age, on one line, with the overflow menu at the end.
///
/// One line rather than the stacked name-over-handle block it used to be: the
/// second line was pure chrome repeated down the whole feed, and collapsing it
/// buys every post a line of its actual writing.
class _PostByline extends StatelessWidget {
  const _PostByline({
    required this.name,
    required this.handle,
    required this.mark,
    required this.supporter,
    required this.age,
    required this.edited,
    required this.compact,
    required this.onOpenAuthor,
    required this.onMore,
  });

  final String name;
  final String handle;
  final VerifiedMark mark;

  /// Drawn after the verification mark and never instead of it: the two say
  /// different things and a byline that showed only one of them would be
  /// saying the wrong one.
  final SupporterMark supporter;

  final String age;
  final bool edited;
  final bool compact;
  final VoidCallback onOpenAuthor;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final size = compact ? 13.5 : 14.5;
    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onOpenAuthor,
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: size,
                      fontWeight: FontWeight.w700,
                      color: brand.ink,
                      letterSpacing: -0.1,
                    ),
                  ),
                ),
                if (mark != VerifiedMark.none) ...[
                  const SizedBox(width: 3),
                  VerifiedBadge(mark: mark, size: size),
                ],
                if (supporter != SupporterMark.none) ...[
                  const SizedBox(width: 3),
                  SupporterBadge(mark: supporter, size: size),
                ],
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    '$handle · $age${edited ? ' · edited' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: size - 0.5,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        _IconTap(
          icon: Icons.more_horiz_rounded,
          tooltip: 'More',
          size: 18,
          onTap: onMore,
        ),
      ],
    );
  }
}

class _ActivityLabel extends StatelessWidget {
  const _ActivityLabel({required this.name, this.onTap});

  final String name;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.repeat_rounded, size: 13, color: brand.faintInk),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                '$name reshared',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: brand.faintInk,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact immutable source shown inside a quote post.
class QuotedPostPreview extends StatelessWidget {
  const QuotedPostPreview({required this.post, required this.onTap, super.key});

  final CommunityPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            border: Border.all(color: brand.border),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CommunityAvatar(
                    initials: post.initials,
                    imageUrl: post.authorAvatarUrl,
                    username: post.authorUsername,
                    size: 20,
                  ),
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: post.authorName,
                            style: TextStyle(
                              color: brand.ink,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          TextSpan(
                            text:
                                '  ${post.handle} · '
                                '${communityAgeLabel(post.createdAt)}',
                            style: TextStyle(color: brand.mutedInk),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
              if (post.text.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  post.text,
                  maxLines: 5,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    color: brand.ink,
                  ),
                ),
              ],
              if (post.media.isNotEmpty) ...[
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: AspectRatio(
                    aspectRatio: 16 / 8,
                    child: post.media.first.isAudio
                        ? ColoredBox(
                            color: brand.surfaceMuted,
                            child: Icon(
                              Icons.graphic_eq_rounded,
                              color: brand.mutedInk,
                            ),
                          )
                        : post.media.first.isVideo
                        ? Stack(
                            fit: StackFit.expand,
                            children: [
                              VideoCover(
                                videoUrl: post.media.first.url,
                                thumbnailUrl: post.media.first.thumbnailUrl,
                              ),
                              const Center(
                                child: Icon(
                                  Icons.play_circle_fill_rounded,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          )
                        : Image.network(
                            post.media.first.url,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) =>
                                ColoredBox(color: brand.surfaceMuted),
                          ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class CommunityLinkPreview extends StatelessWidget {
  const CommunityLinkPreview({required this.url, this.onTap, super.key});

  final String url;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final uri = Uri.tryParse(url);
    final host = uri?.host.replaceFirst(RegExp(r'^www\.'), '') ?? url;
    return Semantics(
      button: onTap != null,
      label: 'Open link to $host',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              border: Border.all(color: brand.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: brand.surfaceMuted,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.link_rounded,
                    size: 17,
                    color: brand.mutedInk,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        host.isEmpty ? 'External link' : host,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: brand.ink,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        url,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: brand.faintInk, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.open_in_new_rounded,
                  color: brand.faintInk,
                  size: 16,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CommunityPollCard extends StatelessWidget {
  const CommunityPollCard({
    required this.poll,
    required this.votedOptionId,
    required this.onVote,
    this.onViewVotes,
    super.key,
  });

  final CommunityPoll poll;
  final String? votedOptionId;
  final ValueChanged<String>? onVote;
  final VoidCallback? onViewVotes;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // Results are read from the member's own ballot as well as the server
    // tally, so a vote cast a second ago is already visible in the bars.
    final poll = this.poll.includingBallot(votedOptionId);
    final revealsResults = votedOptionId != null || poll.hasEnded;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final option in poll.options) ...[
          _PollOption(
            option: option,
            totalVotes: poll.totalVotes,
            selected: votedOptionId == option.id,
            revealsResults: revealsResults,
            enabled: !poll.hasEnded && votedOptionId == null && onVote != null,
            onTap: () => onVote?.call(option.id),
          ),
          const SizedBox(height: 6),
        ],
        InkWell(
          borderRadius: BorderRadius.circular(6),
          onTap: onViewVotes,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Text(
              '${communityCountLabel(poll.totalVotes)} '
              '${poll.totalVotes == 1 ? 'vote' : 'votes'} · '
              '${poll.hasEnded ? 'Poll ended' : 'Ends ${communityAgeFutureLabel(poll.endsAt)}'}',
              style: TextStyle(
                color: onViewVotes == null ? brand.faintInk : brand.accent,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PollOption extends StatelessWidget {
  const _PollOption({
    required this.option,
    required this.totalVotes,
    required this.selected,
    required this.revealsResults,
    required this.enabled,
    required this.onTap,
  });

  final CommunityPollOption option;
  final int totalVotes;
  final bool selected;
  final bool revealsResults;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final fraction = totalVotes == 0 ? 0.0 : option.voteCount / totalVotes;
    final percentage = (fraction * 100).round();
    return Semantics(
      button: enabled,
      selected: selected,
      label: revealsResults
          ? '${option.text}, $percentage percent'
          : option.text,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: enabled
            ? () {
                HapticFeedback.selectionClick();
                onTap();
              }
            : null,
        child: Container(
          height: 38,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: revealsResults ? brand.surfaceMuted : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? brand.accent : brand.border),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (revealsResults)
                FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: fraction.clamp(0, 1),
                  child: ColoredBox(
                    color: brand.accent.withValues(
                      alpha: selected ? 0.22 : 0.11,
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  children: [
                    if (selected) ...[
                      Icon(
                        Icons.check_circle_rounded,
                        size: 15,
                        color: brand.accent,
                      ),
                      const SizedBox(width: 6),
                    ],
                    Expanded(
                      child: Text(
                        option.text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w600,
                          color: brand.ink,
                        ),
                      ),
                    ),
                    if (revealsResults)
                      Text(
                        '$percentage%',
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String communityAgeFutureLabel(DateTime endsAt) {
  final remaining = endsAt.difference(DateTime.now());
  if (remaining.isNegative) return 'now';
  if (remaining.inMinutes < 60) return 'in ${remaining.inMinutes + 1} min';
  if (remaining.inHours < 24) return 'in ${remaining.inHours + 1} hr';
  return 'in ${remaining.inDays + 1} d';
}

/// Reply · Reshare/quote · Appreciate · Views · Save · Share.
///
/// Every glyph is [BrandPalette.mutedInk] until it means something. Colour on
/// this row is a *state*, not decoration: exactly one icon lights up, and only
/// because the reader made it.
class PostActionBar extends StatelessWidget {
  const PostActionBar({
    required this.replyCount,
    required this.repostCount,
    required this.likeCount,
    required this.viewCount,
    required this.liked,
    required this.reposted,
    required this.saved,
    required this.onReply,
    required this.onRepost,
    required this.onQuote,
    required this.onLike,
    required this.onViews,
    required this.onSave,
    required this.onShare,
    super.key,
  });

  final int replyCount;
  final int repostCount;
  final int likeCount;
  final int viewCount;
  final bool liked;
  final bool reposted;
  final bool saved;
  final VoidCallback onReply;
  final VoidCallback? onRepost;
  final VoidCallback? onQuote;
  final VoidCallback onLike;
  final VoidCallback? onViews;
  final VoidCallback onSave;
  final VoidCallback? onShare;

  String _label(int count) => count > 0 ? communityCountLabel(count) : '';

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _ActionButton(
          icon: Icons.mode_comment_outlined,
          label: _label(replyCount),
          tooltip: 'Reply',
          onTap: onReply,
        ),
        _RepostButton(
          count: _label(repostCount),
          reposted: reposted,
          onRepost: onRepost,
          onQuote: onQuote,
        ),
        _LikeButton(liked: liked, count: likeCount, onTap: onLike),
        _ActionButton(
          icon: Icons.bar_chart_rounded,
          label: _label(viewCount),
          tooltip: onViews == null ? 'Views' : 'View engagement',
          onTap: onViews,
        ),
        _ActionButton(
          icon: saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
          label: '',
          tooltip: saved ? 'Saved' : 'Save',
          color: saved ? brand.accent : null,
          onTap: onSave,
        ),
        _ActionButton(
          icon: Icons.ios_share_rounded,
          label: '',
          tooltip: 'Share',
          onTap: onShare,
        ),
      ],
    );
  }
}

/// The one tap target shape on the action row: a round ink well big enough for
/// a thumb, with an optional count sitting beside the glyph.
class _ActionButton extends StatefulWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback? onTap;

  /// Defaults to [BrandPalette.mutedInk] — the resting state.
  final Color? color;

  @override
  State<_ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<_ActionButton> {
  var _processing = false;

  Future<void> _tap() async {
    if (_processing || widget.onTap == null) return;
    _processing = true;
    HapticFeedback.selectionClick();
    widget.onTap!();
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (mounted) _processing = false;
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = widget.color ?? brand.mutedInk;
    return Tooltip(
      message: widget.tooltip,
      child: InkResponse(
        radius: 22,
        onTap: widget.onTap == null ? null : _tap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(widget.icon, size: 17, color: color),
              if (widget.label.isNotEmpty) ...[
                const SizedBox(width: 5),
                Text(
                  widget.label,
                  style: TextStyle(
                    color: color,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _RepostButton extends StatelessWidget {
  const _RepostButton({
    required this.count,
    required this.reposted,
    required this.onRepost,
    required this.onQuote,
  });

  final String count;
  final bool reposted;
  final VoidCallback? onRepost;
  final VoidCallback? onQuote;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = reposted ? brand.repost : brand.mutedInk;
    return Tooltip(
      message: reposted ? 'Reshared' : 'Reshare or quote',
      child: InkResponse(
        radius: 22,
        onTap: onRepost == null && onQuote == null
            ? null
            : () => _showSheet(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.repeat_rounded, size: 17, color: color),
              if (count.isNotEmpty) ...[
                const SizedBox(width: 5),
                Text(
                  count,
                  style: TextStyle(
                    color: color,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showSheet(BuildContext context) async {
    HapticFeedback.selectionClick();
    final choice = await showGlassActionSheet<String>(
      context: context,
      actions: [
        GlassAction(
          value: 'repost',
          icon: Icons.repeat_rounded,
          label: reposted ? 'Undo reshare' : 'Reshare',
        ),
        const GlassAction(
          value: 'quote',
          icon: Icons.format_quote_rounded,
          label: 'Quote post',
        ),
      ],
    );
    if (choice == 'repost') onRepost?.call();
    if (choice == 'quote') onQuote?.call();
  }
}

class _LikeButton extends StatefulWidget {
  const _LikeButton({
    required this.liked,
    required this.count,
    required this.onTap,
  });

  final bool liked;
  final int count;
  final VoidCallback onTap;

  @override
  State<_LikeButton> createState() => _LikeButtonState();
}

class _LikeButtonState extends State<_LikeButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween(
        begin: 1.0,
        end: 1.35,
      ).chain(CurveTween(curve: Curves.easeOut)),
      weight: 40,
    ),
    TweenSequenceItem(
      tween: Tween(
        begin: 1.35,
        end: 1.0,
      ).chain(CurveTween(curve: Curves.easeIn)),
      weight: 60,
    ),
  ]).animate(_controller);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = widget.liked ? brand.like : brand.mutedInk;
    return Tooltip(
      message: widget.liked ? 'Appreciated' : 'Appreciate',
      child: InkResponse(
        radius: 22,
        onTap: () {
          HapticFeedback.lightImpact();
          if (!widget.liked) _controller.forward(from: 0);
          widget.onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ScaleTransition(
                scale: _scale,
                child: Icon(
                  widget.liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  size: 17,
                  color: color,
                ),
              ),
              if (widget.count > 0) ...[
                const SizedBox(width: 5),
                Text(
                  communityCountLabel(widget.count),
                  style: TextStyle(
                    color: color,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A bare icon tap target — used where an [IconButton]'s 48px box would push
/// the row it sits in out of alignment.
class _IconTap extends StatelessWidget {
  const _IconTap({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.size = 20,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkResponse(
      radius: 20,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(icon, size: size, color: context.brand.faintInk),
      ),
    ),
  );
}
