import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/explore/reel_engagement.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// Opens the reply thread for a published reel.
///
/// Reels used to send anyone who tapped "Discuss" over to the Community tab
/// with the title pre-quoted, because there was nowhere for a reply to live.
/// Now there is: a reply belongs to the reel it is about, it is counted on the
/// reel's own rail, and the creator finds it under their work rather than in
/// a feed of everything.
Future<void> showReelCommentsSheet(
  BuildContext context, {
  required String reelId,
  required String title,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  backgroundColor: Colors.transparent,
  builder: (context) => ReelCommentsSheet(reelId: reelId, title: title),
);

class ReelCommentsSheet extends ConsumerStatefulWidget {
  const ReelCommentsSheet({
    required this.reelId,
    required this.title,
    super.key,
  });

  final String reelId;
  final String title;

  @override
  ConsumerState<ReelCommentsSheet> createState() => _ReelCommentsSheetState();
}

class _ReelCommentsSheetState extends ConsumerState<ReelCommentsSheet> {
  final _controller = TextEditingController();
  var _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _sending) return;
    // Replying is posting, so it needs the same public identity every other
    // post carries — a reply with no handle behind it has nobody to answer.
    final profile = await CommunityActions(ref).requireProfile(context);
    final repository = ref.read(reelEngagementRepositoryProvider);
    if (profile == null || repository == null) return;

    setState(() => _sending = true);
    try {
      await repository.addComment(
        author: profile,
        reelId: widget.reelId,
        text: body,
      );
      if (!mounted) return;
      _controller.clear();
      HapticFeedback.lightImpact();
      ref.invalidate(reelCountsProvider(widget.reelId));
    } on Object {
      if (mounted) showGlassToast(context, 'Could not post your reply.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(ReelComment comment) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete this reply?',
      message: 'It is removed for everyone. This cannot be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
    );
    if (confirmed != true) return;
    final repository = ref.read(reelEngagementRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.deleteComment(comment.id);
      if (mounted) ref.invalidate(reelCountsProvider(widget.reelId));
    } on Object {
      if (mounted) showGlassToast(context, 'Could not delete that reply.');
    }
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    final comments = ref.watch(reelCommentsProvider(widget.reelId));
    final myUid = ref.watch(currentUidProvider);
    final insets = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: insets),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.72,
        minChildSize: 0.45,
        maxChildSize: 0.94,
        builder: (context, scrollController) => DecoratedBox(
          decoration: BoxDecoration(
            color: context.brand.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: context.brand.divider,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'REPLIES',
                      style: TextStyle(
                        color: context.brand.terracotta,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: context.brand.divider),
              Expanded(
                child: switch (comments) {
                  AsyncValue(:final value?) when value.isEmpty => ListView(
                    controller: scrollController,
                    children: [
                      const SizedBox(height: 60),
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 40),
                          child: Text(
                            'No replies yet. Say the first thing — in Kasem, '
                            'if you can.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: context.brand.mutedInk,
                              height: 1.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  AsyncValue(:final value?) => ListView.separated(
                    controller: scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: value.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(height: 14),
                    itemBuilder: (context, index) => _CommentTile(
                      comment: value[index],
                      isMine: myUid == value[index].authorId,
                      onDelete: () => _delete(value[index]),
                    ),
                  ),
                  AsyncValue(error: final _?) => Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 40),
                      child: Text(
                        'Replies could not be loaded right now.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: context.brand.mutedInk),
                      ),
                    ),
                  ),
                  _ => Center(
                    child: CircularProgressIndicator(
                      color: context.brand.accent,
                    ),
                  ),
                },
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          minLines: 1,
                          maxLines: 4,
                          maxLength: ReelEngagementRepository.maxCommentLength,
                          textInputAction: TextInputAction.newline,
                          decoration: const InputDecoration(
                            hintText: 'Reply in Kasem…',
                            isDense: true,
                            counterText: '',
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        tooltip: 'Send reply',
                        onPressed: _sending ? null : _send,
                        style: IconButton.styleFrom(
                          backgroundColor: context.brand.accentFill,
                          foregroundColor: context.brand.onAccentFill,
                        ),
                        icon: _sending
                            ? SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.brand.gold,
                                ),
                              )
                            : const Icon(Icons.arrow_upward_rounded),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.isMine,
    required this.onDelete,
  });

  final ReelComment comment;
  final bool isMine;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      CommunityAvatar(
        initials: comment.initials,
        imageUrl: comment.authorAvatarUrl,
        size: 36,
        onTap: comment.authorId.isEmpty
            ? null
            : () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) =>
                      CommunityProfileScreen(uid: comment.authorId),
                ),
              ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${comment.authorName}  ${comment.handle} · '
              '${communityAgeLabel(comment.createdAt)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: context.brand.mutedInk,
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              comment.text,
              style: const TextStyle(fontSize: 15, height: 1.4),
            ),
          ],
        ),
      ),
      if (isMine)
        IconButton(
          tooltip: 'Delete reply',
          visualDensity: VisualDensity.compact,
          onPressed: onDelete,
          icon: Icon(
            Icons.delete_outline_rounded,
            size: 18,
            color: context.brand.mutedInk,
          ),
        ),
    ],
  );
}
