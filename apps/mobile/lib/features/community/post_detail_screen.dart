import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// A post and its reply thread.
class PostDetailScreen extends ConsumerWidget {
  const PostDetailScreen({required this.postId, super.key});

  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = CommunityActions(ref);
    final postState = ref.watch(postProvider(postId));
    final post = postState.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Conversation')),
      floatingActionButton: post == null
          ? null
          : FloatingActionButton.extended(
              heroTag: 'post-reply',
              onPressed: () => actions.reply(context, post),
              backgroundColor: BrandColors.heritageGreen,
              foregroundColor: BrandColors.kenteGold,
              icon: const Icon(Icons.reply_rounded),
              label: const Text('Reply'),
            ),
      body: switch (postState) {
        AsyncData() when post == null => const CommunityEmptyState(
          icon: Icons.search_off_rounded,
          title: 'This post is gone',
          message: 'It was deleted, or it is no longer visible to you.',
        ),
        AsyncData() => _Thread(post: post!, actions: actions),
        AsyncError() => const CommunityEmptyState(
          icon: Icons.cloud_off_rounded,
          title: 'Could not open this post',
          message: 'Check your connection and try again.',
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _Thread extends ConsumerWidget {
  const _Thread({required this.post, required this.actions});

  final CommunityPost post;
  final CommunityActions actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final replies = ref.watch(repliesProvider(post.id));
    final likes = ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final saved =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        CommunityPostCard(
          post: post,
          liked: likes.contains(post.id),
          saved: saved.contains(post.id),
          onLike: () => actions.toggleLike(context, post),
          onSave: () => actions.toggleSave(context, post),
          onReply: () => actions.reply(context, post),
          onMore: () => actions.showPostMenu(
            context,
            post,
            onDeleted: () => Navigator.of(context).maybePop(),
          ),
          onOpen: () {},
          onOpenAuthor: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) => CommunityProfileScreen(uid: post.authorId),
            ),
          ),
          onOpenHandle: (handle) => actions.openHandle(context, handle),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Text(
              post.replyCount == 1 ? '1 REPLY' : '${post.replyCount} REPLIES',
              style: const TextStyle(
                color: BrandColors.heritageGreen,
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: 10),
        ...switch (replies) {
          AsyncData(:final value) when value.isEmpty => const [
            CommunityEmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'No replies yet',
              message: 'Keep the conversation in Kasem.',
            ),
          ],
          AsyncData(:final value) => [
            for (final reply in value)
              Padding(
                padding: const EdgeInsets.only(left: 14, bottom: 10),
                child: _ThreadedReply(
                  reply: reply,
                  liked: likes.contains(reply.id),
                  saved: saved.contains(reply.id),
                  actions: actions,
                ),
              ),
          ],
          AsyncError() => const [
            Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Replies could not load.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BrandColors.mutedInk),
              ),
            ),
          ],
          _ => const [
            Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            ),
          ],
        },
      ],
    );
  }
}

/// A reply, drawn against the kente-gold thread rail.
class _ThreadedReply extends StatelessWidget {
  const _ThreadedReply({
    required this.reply,
    required this.liked,
    required this.saved,
    required this.actions,
  });

  final CommunityPost reply;
  final bool liked;
  final bool saved;
  final CommunityActions actions;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.only(left: 12),
    decoration: const BoxDecoration(
      border: Border(left: BorderSide(color: BrandColors.kenteGold, width: 2)),
    ),
    child: CommunityPostCard(
      post: reply,
      liked: liked,
      saved: saved,
      compact: true,
      onLike: () => actions.toggleLike(context, reply),
      onSave: () => actions.toggleSave(context, reply),
      onReply: () => actions.reply(context, reply),
      onMore: () => actions.showPostMenu(context, reply),
      onOpen: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => PostDetailScreen(postId: reply.id),
        ),
      ),
      onOpenAuthor: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: reply.authorId),
        ),
      ),
      onOpenHandle: (handle) => actions.openHandle(context, handle),
    ),
  );
}
