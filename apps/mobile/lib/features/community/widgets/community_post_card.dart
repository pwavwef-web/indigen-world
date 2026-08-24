import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_media_view.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';

/// One post in the feed: author row, body, media, then the engagement bar.
///
/// The card is presentational — every interaction is delegated upward so the
/// same card renders inside the feed, a profile tab and the reply thread.
class CommunityPostCard extends StatelessWidget {
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
    this.onOpenHandle,
    this.showThreadLine = false,
    this.compact = false,
    super.key,
  });

  final CommunityPost post;
  final bool liked;
  final bool saved;
  final VoidCallback onLike;
  final VoidCallback onReply;
  final VoidCallback onSave;
  final VoidCallback onOpen;
  final VoidCallback onOpenAuthor;
  final VoidCallback onMore;

  /// Called with a mentioned handle (no `@`) when one is tapped. Optional: the
  /// mention still reads as a mention without it, it just does not open.
  final ValueChanged<String>? onOpenHandle;

  /// Draws the vertical thread rail used for replies under a parent post.
  final bool showThreadLine;

  /// Tighter padding, used inside reply threads.
  final bool compact;

  @override
  Widget build(BuildContext context) => Card(
    color: Colors.white,
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onOpen,
      child: Padding(
        padding: EdgeInsets.all(compact ? 13 : 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CommunityAvatar(
                  initials: post.initials,
                  imageUrl: post.authorAvatarUrl,
                  size: compact ? 36 : 44,
                  onTap: onOpenAuthor,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: onOpenAuthor,
                        child: Text(
                          post.authorName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w900,
                            color: BrandColors.ink,
                          ),
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        '${post.handle} · ${communityAgeLabel(post.createdAt)}',
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
                IconButton(
                  tooltip: 'More',
                  visualDensity: VisualDensity.compact,
                  onPressed: onMore,
                  icon: const Icon(
                    Icons.more_horiz_rounded,
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
              ),
            ],
            if (post.hasMedia) ...[
              const SizedBox(height: 12),
              PostMediaView(
                media: post.media,
                onOpen: (index) => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) =>
                        MediaViewerPage(media: post.media, initialIndex: index),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
            PostActionBar(
              replyCount: post.replyCount,
              likeCount: post.likeCount,
              liked: liked,
              saved: saved,
              onReply: onReply,
              onLike: onLike,
              onSave: onSave,
            ),
          ],
        ),
      ),
    ),
  );
}

/// Reply · Appreciate · Save row. "Appreciate" is the community's own word for
/// a like, kept from the earlier Kasem room copy.
class PostActionBar extends StatelessWidget {
  const PostActionBar({
    required this.replyCount,
    required this.likeCount,
    required this.liked,
    required this.saved,
    required this.onReply,
    required this.onLike,
    required this.onSave,
    super.key,
  });

  final int replyCount;
  final int likeCount;
  final bool liked;
  final bool saved;
  final VoidCallback onReply;
  final VoidCallback onLike;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      _ActionButton(
        icon: Icons.chat_bubble_outline_rounded,
        label: replyCount > 0 ? communityCountLabel(replyCount) : '',
        tooltip: 'Reply',
        onTap: onReply,
      ),
      const SizedBox(width: 4),
      _LikeButton(liked: liked, count: likeCount, onTap: onLike),
      const Spacer(),
      _ActionButton(
        icon: saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
        label: '',
        tooltip: saved ? 'Saved' : 'Save',
        color: saved ? BrandColors.heritageGreen : BrandColors.mutedInk,
        onTap: onSave,
      ),
    ],
  );
}

class _ActionButton extends StatelessWidget {
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
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: color),
            if (label.isNotEmpty) ...[
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 12,
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

/// The like control, with the spring pop the reference feed uses on tap.
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
  // The easing belongs inside the sequence: a TweenSequence asserts on inputs
  // outside 0..1, which an overshooting curve on the driving animation would
  // produce.
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
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
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
                const SizedBox(width: 6),
                Text(
                  communityCountLabel(widget.count),
                  style: TextStyle(
                    color: color,
                    fontSize: 12,
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
