import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_media_view.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';

/// One complete community post surface.
///
/// The structure follows the mature SRC social card — activity context,
/// identity, every content type, and a six-part action bar — while retaining
/// Indigen's parchment, heritage green, kente gold and Kasem terminology.
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
  final bool showThreadLine;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
    final authorVerified = liveAuthor?.isVerified ?? post.authorVerified;

    return Card(
      color: Theme.of(context).colorScheme.surface,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onOpen,
        child: Padding(
          padding: EdgeInsets.all(compact ? 13 : 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (post.isResharedFeedItem) ...[
                _ActivityLabel(
                  name: post.resharedByName ?? 'A community member',
                  onTap: onOpenResharer,
                ),
                const SizedBox(height: 8),
              ],
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CommunityAvatar(
                    initials: authorInitials,
                    imageUrl: authorAvatar,
                    size: compact ? 36 : 44,
                    onTap: onOpenAuthor,
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: onOpenAuthor,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  authorName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w900,
                                    color: BrandColors.ink,
                                  ),
                                ),
                              ),
                              if (authorVerified) ...[
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.verified_rounded,
                                  size: 15,
                                  color: BrandColors.savannahGreen,
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 1),
                          Text(
                            '$authorHandle · ${communityAgeLabel(post.createdAt)}${post.isEdited ? ' · EDITED' : ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: BrandColors.mutedInk,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'More',
                    visualDensity: VisualDensity.compact,
                    onPressed: onMore,
                    icon: const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: BrandColors.mutedInk,
                    ),
                  ),
                ],
              ),
              if (post.text.isNotEmpty) ...[
                const SizedBox(height: 10),
                PostText(
                  text: post.text,
                  fontSize: compact ? 15 : 16.5,
                  onOpenHandle: onOpenHandle,
                  onOpenLink: onOpenLink,
                ),
              ],
              if (post.firstLink case final link?) ...[
                const SizedBox(height: 10),
                CommunityLinkPreview(
                  url: link,
                  onTap: onOpenLink == null ? null : () => onOpenLink!(link),
                ),
              ],
              if (post.hasMedia) ...[
                const SizedBox(height: 12),
                PostMediaView(
                  media: post.media,
                  onOpen: (index) => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (context) => MediaViewerPage(
                        media: post.media,
                        initialIndex: index,
                      ),
                    ),
                  ),
                ),
              ],
              if (post.poll case final poll?) ...[
                const SizedBox(height: 12),
                CommunityPollCard(
                  poll: poll,
                  votedOptionId: votedOptionId,
                  onVote: onVote,
                  onViewVotes: onPollVotes,
                ),
              ],
              if (post.quotedPost case final quoted?) ...[
                const SizedBox(height: 12),
                QuotedPostPreview(post: quoted, onTap: onOpenQuoted ?? onOpen),
              ],
              const SizedBox(height: 8),
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
      ),
    );
  }
}

class _ActivityLabel extends StatelessWidget {
  const _ActivityLabel({required this.name, this.onTap});

  final String name;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(999),
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.only(left: 50, right: 8, top: 2, bottom: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.repeat_rounded,
            size: 14,
            color: BrandColors.savannahGreen,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              '$name reshared',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: BrandColors.mutedInk,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Compact immutable source shown inside a quote post.
class QuotedPostPreview extends StatelessWidget {
  const QuotedPostPreview({required this.post, required this.onTap, super.key});

  final CommunityPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(16),
    onTap: onTap,
    child: Ink(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BrandColors.plasterCream.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: BrandColors.heritageGreen.withValues(alpha: 0.18),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CommunityAvatar(
                initials: post.initials,
                imageUrl: post.authorAvatarUrl,
                size: 28,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  '${post.authorName}  ${post.handle} · ${communityAgeLabel(post.createdAt)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: BrandColors.mutedInk,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          if (post.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              post.text,
              maxLines: 5,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13.5, height: 1.4),
            ),
          ],
          if (post.media.isNotEmpty) ...[
            const SizedBox(height: 9),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: AspectRatio(
                aspectRatio: 16 / 8,
                child: post.media.first.isAudio
                    ? const ColoredBox(
                        color: BrandColors.heritageGreen,
                        child: Icon(
                          Icons.graphic_eq_rounded,
                          color: BrandColors.kenteGold,
                        ),
                      )
                    : post.media.first.isVideo
                    ? const ColoredBox(
                        color: BrandColors.nightGreen,
                        child: Icon(
                          Icons.play_circle_fill_rounded,
                          color: Colors.white,
                        ),
                      )
                    : Image.network(
                        post.media.first.url,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const ColoredBox(color: BrandColors.divider),
                      ),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

class CommunityLinkPreview extends StatelessWidget {
  const CommunityLinkPreview({required this.url, this.onTap, super.key});

  final String url;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final uri = Uri.tryParse(url);
    final host = uri?.host.replaceFirst(RegExp(r'^www\.'), '') ?? url;
    return Semantics(
      button: onTap != null,
      label: 'Open link to $host',
      child: InkWell(
        borderRadius: BorderRadius.circular(15),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: BrandGradients.parchment,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: BrandColors.divider),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: BrandColors.heritageGreen.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.link_rounded,
                  color: BrandColors.heritageGreen,
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
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      url,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BrandColors.mutedInk,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.open_in_new_rounded,
                color: BrandColors.mutedInk,
                size: 18,
              ),
            ],
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
          const SizedBox(height: 7),
        ],
        InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onViewVotes,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Text(
              '${communityCountLabel(poll.totalVotes)} ${poll.totalVotes == 1 ? 'vote' : 'votes'} · ${poll.hasEnded ? 'Poll ended' : 'Ends ${communityAgeFutureLabel(poll.endsAt)}'}',
              style: TextStyle(
                color: onViewVotes == null
                    ? BrandColors.mutedInk
                    : BrandColors.heritageGreen,
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                decoration: onViewVotes == null
                    ? null
                    : TextDecoration.underline,
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
    final fraction = totalVotes == 0 ? 0.0 : option.voteCount / totalVotes;
    final percentage = (fraction * 100).round();
    return Semantics(
      button: enabled,
      selected: selected,
      label: revealsResults
          ? '${option.text}, $percentage percent'
          : option.text,
      child: InkWell(
        borderRadius: BorderRadius.circular(13),
        onTap: enabled
            ? () {
                HapticFeedback.selectionClick();
                onTap();
              }
            : null,
        child: Container(
          height: 42,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: BrandColors.plasterCream.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(
              color: selected ? BrandColors.heritageGreen : BrandColors.divider,
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (revealsResults)
                FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: fraction.clamp(0, 1),
                  child: ColoredBox(
                    color:
                        (selected
                                ? BrandColors.kenteGold
                                : BrandColors.heritageGreen)
                            .withValues(alpha: 0.18),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    if (selected) ...[
                      const Icon(
                        Icons.check_circle_rounded,
                        size: 16,
                        color: BrandColors.heritageGreen,
                      ),
                      const SizedBox(width: 7),
                    ],
                    Expanded(
                      child: Text(
                        option.text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (revealsResults)
                      Text(
                        '$percentage%',
                        style: const TextStyle(
                          color: BrandColors.heritageGreen,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
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
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      _ActionButton(
        icon: Icons.chat_bubble_outline_rounded,
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
        icon: Icons.visibility_outlined,
        label: _label(viewCount),
        tooltip: onViews == null ? 'Views' : 'View engagement',
        color: onViews == null
            ? BrandColors.mutedInk
            : BrandColors.heritageGreen,
        onTap: onViews,
      ),
      _ActionButton(
        icon: saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
        label: '',
        tooltip: saved ? 'Saved' : 'Save',
        color: saved ? BrandColors.heritageGreen : BrandColors.mutedInk,
        onTap: onSave,
      ),
      _ActionButton(
        icon: Icons.share_outlined,
        label: '',
        tooltip: 'Share',
        onTap: onShare,
      ),
    ],
  );
}

class _ActionButton extends StatefulWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.onTap,
    this.color = BrandColors.mutedInk,
  });

  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback? onTap;
  final Color color;

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
  Widget build(BuildContext context) => Tooltip(
    message: widget.tooltip,
    child: InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: widget.onTap == null ? null : _tap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(widget.icon, size: 18, color: widget.color),
            if (widget.label.isNotEmpty) ...[
              const SizedBox(width: 4),
              Text(
                widget.label,
                style: TextStyle(
                  color: widget.color,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
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
    final color = reposted ? BrandColors.savannahGreen : BrandColors.mutedInk;
    return Tooltip(
      message: reposted ? 'Reshared' : 'Reshare or quote',
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onRepost == null && onQuote == null
            ? null
            : () => _showSheet(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.repeat_rounded, size: 18, color: color),
              if (count.isNotEmpty) ...[
                const SizedBox(width: 4),
                Text(
                  count,
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
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
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(
                Icons.repeat_rounded,
                color: reposted
                    ? BrandColors.savannahGreen
                    : BrandColors.heritageGreen,
              ),
              title: Text(reposted ? 'Undo reshare' : 'Reshare'),
              subtitle: const Text(
                'Bring this post into your followers’ feed.',
              ),
              onTap: () => Navigator.pop(context, 'repost'),
            ),
            ListTile(
              leading: const Icon(Icons.format_quote_rounded),
              title: const Text('Quote post'),
              subtitle: const Text('Add your own words above this post.'),
              onTap: () => Navigator.pop(context, 'quote'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
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
    final color = widget.liked ? BrandColors.terracotta : BrandColors.mutedInk;
    return Tooltip(
      message: widget.liked ? 'Appreciated' : 'Appreciate',
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () {
          HapticFeedback.lightImpact();
          if (!widget.liked) _controller.forward(from: 0);
          widget.onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ScaleTransition(
                scale: _scale,
                child: Icon(
                  widget.liked
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  size: 18,
                  color: color,
                ),
              ),
              if (widget.count > 0) ...[
                const SizedBox(width: 4),
                Text(
                  communityCountLabel(widget.count),
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
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
