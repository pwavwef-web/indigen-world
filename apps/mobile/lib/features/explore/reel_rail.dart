import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart'
    show reelCountLabel;

/// Where the member stands with the creator of the reel in front of them.
enum ReelFollowState {
  /// Nothing to offer: the member's own reel, or a reel with no account.
  unavailable,

  /// Not followed yet. The avatar carries a plus.
  notFollowing,

  /// Followed. The plus is gone; a check shows briefly when it has just
  /// happened.
  following,
}

/// The column of actions down the right of a reel.
///
/// Creator, appreciate, reply, keep, context, and more — in that order, top to
/// bottom, so the one that is about a *person* sits apart at the head and the
/// one that opens a menu sits at the foot where a menu is looked for.
///
/// Every control is at least 48 logical pixels square, has a spoken label, and
/// says its state in words as well as in a filled icon: a heart that is filled
/// tells a sighted member they appreciated this, and "Remove appreciation"
/// tells everybody else.
class ReelActionRail extends StatelessWidget {
  const ReelActionRail({
    required this.creatorName,
    required this.initials,
    required this.avatarUrl,
    required this.followState,
    required this.likeCount,
    required this.commentCount,
    required this.liked,
    required this.saved,
    required this.onOpenCreator,
    required this.onFollow,
    required this.onLike,
    required this.onComments,
    required this.onSave,
    required this.onContext,
    required this.onMore,
    this.compact = false,
    super.key,
  });

  final String creatorName;
  final String initials;
  final String? avatarUrl;
  final ReelFollowState followState;
  final int likeCount;
  final int commentCount;
  final bool liked;
  final bool saved;

  /// Null when there is no page to open.
  final VoidCallback? onOpenCreator;
  final VoidCallback onFollow;
  final VoidCallback onLike;
  final VoidCallback onComments;
  final VoidCallback onSave;
  final VoidCallback onContext;
  final VoidCallback onMore;

  /// Tighter spacing for short screens, so the rail still clears the header.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final gap = compact ? 2.0 : 8.0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ReelCreatorAvatar(
          initials: initials,
          avatarUrl: avatarUrl,
          creatorName: creatorName,
          onTap: onOpenCreator,
          followState: followState,
          onFollow: onFollow,
        ),
        SizedBox(height: followState == ReelFollowState.notFollowing ? 0 : 12),
        ReelRailButton(
          icon: Icons.favorite_border_rounded,
          activeIcon: Icons.favorite_rounded,
          label: reelCountLabel(likeCount),
          semanticLabel: liked
              ? 'Remove appreciation. $likeCount appreciations'
              : 'Appreciate. $likeCount appreciations',
          active: liked,
          onTap: onLike,
        ),
        SizedBox(height: gap),
        ReelRailButton(
          icon: Icons.chat_bubble_outline_rounded,
          label: reelCountLabel(commentCount),
          semanticLabel: 'Replies. $commentCount replies',
          onTap: onComments,
        ),
        SizedBox(height: gap),
        ReelRailButton(
          icon: Icons.bookmark_border_rounded,
          activeIcon: Icons.bookmark_rounded,
          label: saved ? 'Kept' : 'Keep',
          semanticLabel: saved ? 'Remove from your keeps' : 'Keep this',
          active: saved,
          onTap: onSave,
        ),
        SizedBox(height: gap),
        ReelRailButton(
          icon: Icons.menu_book_rounded,
          label: 'Context',
          semanticLabel: 'Context, translation and attribution',
          ring: brand.gold,
          onTap: onContext,
        ),
        SizedBox(height: gap),
        ReelRailButton(
          icon: Icons.more_horiz_rounded,
          label: 'More',
          semanticLabel: 'More options',
          onTap: onMore,
        ),
      ],
    );
  }
}

/// One round action on the rail, with its label under it.
class ReelRailButton extends StatelessWidget {
  const ReelRailButton({
    required this.icon,
    required this.label,
    required this.semanticLabel,
    required this.onTap,
    this.activeIcon,
    this.active = false,
    this.ring,
    super.key,
  });

  final IconData icon;
  final IconData? activeIcon;
  final String label;
  final String semanticLabel;
  final VoidCallback onTap;
  final bool active;

  /// A coloured ring in place of the hairline. Context wears the gold one: it
  /// is the action that makes this feed different, so it is the one that is
  /// marked — by colour, not by size.
  final Color? ring;

  /// The visible disc. The touch target around it is [_target].
  static const double _disc = 44;
  static const double _target = 48;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      toggled: activeIcon == null ? null : active,
      label: semanticLabel,
      excludeSemantics: true,
      child: Tooltip(
        message: semanticLabel,
        excludeFromSemantics: true,
        child: Material(
          type: MaterialType.transparency,
          child: InkResponse(
            onTap: onTap,
            radius: 30,
            child: SizedBox(
              width: 56,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox.square(
                    dimension: _target,
                    child: Center(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        width: _disc,
                        height: _disc,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: active
                              ? brand.terracotta
                              : Colors.black.withValues(alpha: 0.32),
                          border: Border.all(
                            color: ring ?? Colors.white24,
                            width: ring == null ? 1 : 1.6,
                          ),
                        ),
                        child: AnimatedScale(
                          scale: active ? 1.08 : 1,
                          duration: const Duration(milliseconds: 180),
                          child: Icon(
                            active ? (activeIcon ?? icon) : icon,
                            size: 23,
                            color: active
                                ? brand.gold
                                : (ring != null ? brand.gold : Colors.white),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.fade,
                    softWrap: false,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      height: 1.2,
                      fontWeight: FontWeight.w700,
                      shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                    ),
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

/// The creator's face at the head of the rail.
///
/// Tapping the face opens their page. When the member does not follow them yet
/// a small plus sits on its lower edge, and tapping *that* follows — its own
/// 48-pixel target, laid over the lower part of the face, so the two actions
/// never have to be guessed between. After a follow the plus turns into a
/// check for a moment and then leaves.
class ReelCreatorAvatar extends StatefulWidget {
  const ReelCreatorAvatar({
    required this.initials,
    this.avatarUrl,
    this.onTap,
    this.creatorName = '',
    this.followState = ReelFollowState.unavailable,
    this.onFollow,
    super.key,
  });

  final String initials;
  final String? avatarUrl;
  final VoidCallback? onTap;
  final String creatorName;
  final ReelFollowState followState;
  final VoidCallback? onFollow;

  @override
  State<ReelCreatorAvatar> createState() => _ReelCreatorAvatarState();
}

class _ReelCreatorAvatarState extends State<ReelCreatorAvatar> {
  /// Set when the state moves from not following to following while this
  /// avatar is on screen, and cleared a moment later.
  var _confirming = false;
  Timer? _confirmTimer;

  static const double _face = 48;

  @override
  void didUpdateWidget(ReelCreatorAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.followState == ReelFollowState.notFollowing &&
        widget.followState == ReelFollowState.following) {
      _confirmTimer?.cancel();
      setState(() => _confirming = true);
      _confirmTimer = Timer(const Duration(milliseconds: 1400), () {
        if (mounted) setState(() => _confirming = false);
      });
    } else if (widget.followState != ReelFollowState.following && _confirming) {
      _confirmTimer?.cancel();
      _confirming = false;
    }
  }

  @override
  void dispose() {
    _confirmTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final canFollow =
        widget.followState == ReelFollowState.notFollowing &&
        widget.onFollow != null;
    final showBadge = canFollow || _confirming;
    final name = widget.creatorName.trim().isEmpty
        ? 'the creator'
        : widget.creatorName.trim();

    final face = Container(
      width: _face,
      height: _face,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: brand.accent,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
      ),
      child: widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: widget.avatarUrl!,
              fit: BoxFit.cover,
              memCacheWidth: 144,
              placeholder: (context, url) => _initials(),
              errorWidget: (context, url, error) => _initials(),
            )
          : _initials(),
    );

    final Widget faceTarget = widget.onTap == null
        ? face
        : Semantics(
            button: true,
            label: 'Open $name’s page',
            excludeSemantics: true,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: widget.onTap,
              child: face,
            ),
          );

    if (!showBadge) {
      return SizedBox(
        width: 56,
        height: _face,
        child: Center(child: faceTarget),
      );
    }

    // The badge's target starts 14 pixels up the face and runs 48 pixels
    // down, so it meets the minimum without the rail growing taller than the
    // plus needs to be seen.
    return SizedBox(
      width: 56,
      height: _face + 34,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Positioned(top: 0, child: faceTarget),
          Positioned(
            top: _face - 14,
            left: 4,
            right: 4,
            height: 48,
            child: Semantics(
              button: true,
              label: _confirming ? 'Following $name' : 'Follow $name',
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: canFollow ? widget.onFollow : null,
                child: Align(
                  alignment: Alignment.topCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      transitionBuilder: (child, animation) => ScaleTransition(
                        scale: animation,
                        child: FadeTransition(opacity: animation, child: child),
                      ),
                      child: _confirming
                          ? _badge(
                              key: const ValueKey('followed'),
                              colour: Colors.white,
                              icon: Icons.check_rounded,
                              iconColour: brand.success,
                            )
                          : _badge(
                              key: const ValueKey('follow'),
                              colour: brand.gold,
                              icon: Icons.add_rounded,
                              iconColour: const Color(0xFF1A1206),
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _badge({
    required Key key,
    required Color colour,
    required IconData icon,
    required Color iconColour,
  }) => Container(
    key: key,
    width: 22,
    height: 22,
    decoration: BoxDecoration(
      color: colour,
      shape: BoxShape.circle,
      boxShadow: const [BoxShadow(blurRadius: 6, color: Color(0x66000000))],
    ),
    child: Icon(icon, size: 16, color: iconColour),
  );

  Widget _initials() => Center(
    child: Text(
      widget.initials,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 13,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}
