import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// A post and its reply thread.
class PostDetailScreen extends ConsumerStatefulWidget {
  const PostDetailScreen({
    required this.postId,
    this.privateCommunityId,
    super.key,
  });

  final String postId;

  /// Set for a post in a private community, whose thread lives under it.
  final String? privateCommunityId;

  @override
  ConsumerState<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends ConsumerState<PostDetailScreen> {
  var _viewTracked = false;

  @override
  Widget build(BuildContext context) {
    final actions = CommunityActions(ref);
    final postState = widget.privateCommunityId == null
        ? ref.watch(postProvider(widget.postId))
        : ref.watch(
            addressedPostProvider((
              postId: widget.postId,
              privateCommunityId: widget.privateCommunityId,
            )),
          );
    final post = postState.asData?.value;
    if (post != null && !_viewTracked) {
      _viewTracked = true;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => actions.trackView(post),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Conversation')),
      floatingActionButton: post == null
          ? null
          : FloatingActionButton.extended(
              heroTag: 'post-reply',
              onPressed: () => actions.reply(context, post),
              backgroundColor: context.brand.accentFill,
              foregroundColor: context.brand.onAccentFill,
              icon: const Icon(Icons.reply_rounded),
              label: const Text('Reply'),
            ),
      body: switch (postState) {
        AsyncValue(hasValue: true) when post == null =>
          const CommunityEmptyState(
            icon: Icons.search_off_rounded,
            title: 'This post is gone',
            message: 'It was deleted, or it is no longer visible to you.',
          ),
        AsyncValue(hasValue: true) => _Thread(post: post!, actions: actions),
        AsyncValue(hasError: true) => const CommunityEmptyState(
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
    final replies = post.privateCommunityId == null
        ? ref.watch(repliesProvider(post.id))
        : ref.watch(
            addressedRepliesProvider((
              postId: post.id,
              privateCommunityId: post.privateCommunityId,
            )),
          );
    // Moderators may take posts out of their community from the thread too.
    final canModerate = switch (post.community) {
      final community? =>
        ref
                .watch(myMembershipProvider(community.id))
                .asData
                ?.value
                ?.canModerate ??
            false,
      null => false,
    };
    final pendingLikes = ref.watch(
      optimisticEngagementProvider.select((state) => state.likes),
    );
    final public = !post.isPrivateCommunityPost;
    final likes = ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final saved =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final reposts =
        ref.watch(myRepostsProvider).asData?.value ?? const <String>{};
    final pollVotes =
        ref.watch(myPollVotesProvider).asData?.value ??
        const <String, String>{};
    final currentUid = ref.watch(currentUidProvider);

    return ListView(
      // Full-bleed, like the feed: the post rows draw their own gutter and
      // their own hairline, so the list adds neither.
      padding: const EdgeInsets.only(bottom: 96),
      children: [
        CommunityPostCard(
          post: _withPending(post, likes, pendingLikes),
          liked: pendingLikes[post.id] ?? likes.contains(post.id),
          saved: saved.contains(post.id),
          reposted: reposts.contains(post.id),
          votedOptionId: pollVotes[post.id],
          onLike: () => actions.toggleLike(context, post),
          onRepost: public ? () => actions.toggleRepost(context, post) : null,
          onQuote: public ? () => actions.quote(context, post) : null,
          onSave: public ? () => actions.toggleSave(context, post) : null,
          onShare: public ? () => actions.share(context, post) : null,
          onViews: currentUid == post.authorId
              ? () => actions.openEngagement(context, post)
              : null,
          onVote: (optionId) => actions.vote(context, post, optionId),
          onPollVotes: currentUid == post.authorId && post.hasPoll
              ? () => actions.openEngagement(
                  context,
                  post,
                  initialKind: CommunityEngagementKind.pollVotes,
                )
              : null,
          onReply: () => actions.reply(context, post),
          onMore: () => actions.showPostMenu(
            context,
            post,
            canModerate: canModerate,
            onDeleted: () => Navigator.of(context).maybePop(),
          ),
          onOpen: () {},
          onOpenAuthor: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) => CommunityProfileScreen(uid: post.authorId),
            ),
          ),
          onOpenQuoted: post.quotedPostId == null
              ? null
              : () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) =>
                        PostDetailScreen(postId: post.quotedPostId!),
                  ),
                ),
          onOpenHandle: (handle) => actions.openHandle(context, handle),
          onOpenLink: (url) => actions.openLink(context, url),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
          child: Text(
            post.replyCount == 1 ? '1 reply' : '${post.replyCount} replies',
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        ...switch (replies) {
          AsyncValue(:final value?) when value.isEmpty => const [
            CommunityEmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'No replies yet',
              message: 'Ask a question or join the conversation.',
            ),
          ],
          AsyncValue(:final value?) => [
            for (final reply in value)
              _ThreadedReply(
                reply: _withPending(reply, likes, pendingLikes),
                liked: pendingLikes[reply.id] ?? likes.contains(reply.id),
                canModerate: canModerate,
                saved: saved.contains(reply.id),
                reposted: reposts.contains(reply.id),
                votedOptionId: pollVotes[reply.id],
                isOwner: currentUid == reply.authorId,
                actions: actions,
              ),
          ],
          AsyncValue(hasError: true) => [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Replies could not load.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.brand.mutedInk),
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

/// [post] with its appreciation total moved to match a tap still on its way.
CommunityPost _withPending(
  CommunityPost post,
  Set<String> likes,
  Map<String, bool> pending,
) {
  final override = pending[post.id];
  final server = likes.contains(post.id);
  if (override == null || override == server) return post;
  return post.withLikeCount(post.likeCount + (override ? 1 : -1));
}

/// A reply.
///
/// Indented under the post it answers and separated by the same hairline as
/// everything else — the gold rail it used to hang off was the brightest thing
/// on a screen whose subject is a conversation.
class _ThreadedReply extends StatelessWidget {
  const _ThreadedReply({
    required this.reply,
    required this.liked,
    required this.saved,
    required this.reposted,
    required this.votedOptionId,
    required this.isOwner,
    required this.actions,
    this.canModerate = false,
  });

  final CommunityPost reply;
  final bool liked;
  final bool saved;
  final bool reposted;
  final String? votedOptionId;
  final bool isOwner;
  final CommunityActions actions;
  final bool canModerate;

  @override
  Widget build(BuildContext context) {
    final public = !reply.isPrivateCommunityPost;
    return _build(context, public);
  }

  Widget _build(BuildContext context, bool public) => Padding(
    padding: const EdgeInsets.only(left: 20),
    child: CommunityPostCard(
      post: reply,
      liked: liked,
      saved: saved,
      reposted: reposted,
      votedOptionId: votedOptionId,
      compact: true,
      onLike: () => actions.toggleLike(context, reply),
      onRepost: public ? () => actions.toggleRepost(context, reply) : null,
      onQuote: public ? () => actions.quote(context, reply) : null,
      onSave: public ? () => actions.toggleSave(context, reply) : null,
      onShare: public ? () => actions.share(context, reply) : null,
      onViews: isOwner ? () => actions.openEngagement(context, reply) : null,
      onVote: (optionId) => actions.vote(context, reply, optionId),
      onPollVotes: isOwner && reply.hasPoll
          ? () => actions.openEngagement(
              context,
              reply,
              initialKind: CommunityEngagementKind.pollVotes,
            )
          : null,
      onReply: () => actions.reply(context, reply),
      onMore: () =>
          actions.showPostMenu(context, reply, canModerate: canModerate),
      onOpen: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => PostDetailScreen(
            postId: reply.id,
            privateCommunityId: reply.privateCommunityId,
          ),
        ),
      ),
      onOpenAuthor: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: reply.authorId),
        ),
      ),
      onOpenQuoted: reply.quotedPostId == null
          ? null
          : () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) =>
                    PostDetailScreen(postId: reply.quotedPostId!),
              ),
            ),
      onOpenHandle: (handle) => actions.openHandle(context, handle),
      onOpenLink: (url) => actions.openLink(context, url),
    ),
  );
}
