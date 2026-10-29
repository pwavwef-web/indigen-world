import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_screen.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';

/// A post row with every ordinary action wired the way the main feed wires
/// it, for the lists that show posts without being the feed — a topic page,
/// a pinned post.
///
/// Reads the member's likes, saves and votes itself, so a screen that wants a
/// list of posts does not have to thread six sets through to every row.
class StandardPostCard extends ConsumerWidget {
  const StandardPostCard({
    required this.post,
    this.showDivider = true,
    super.key,
  });

  final CommunityPost post;
  final bool showDivider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = CommunityActions(ref);
    final likes = ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final saved =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final reposts =
        ref.watch(myRepostsProvider).asData?.value ?? const <String>{};
    final votes =
        ref.watch(myPollVotesProvider).asData?.value ??
        const <String, String>{};
    final isOwner = ref.watch(currentUidProvider) == post.authorId;
    final pending = ref.watch(
      optimisticEngagementProvider.select((state) => state.likes[post.id]),
    );
    final server = likes.contains(post.id);
    final liked = pending ?? server;
    final shown = pending == null || pending == server
        ? post
        : post.withLikeCount(post.likeCount + (pending ? 1 : -1));
    final public = !post.isPrivateCommunityPost;

    return CommunityPostCard(
      post: shown,
      liked: liked,
      saved: saved.contains(post.id),
      reposted: reposts.contains(post.id),
      votedOptionId: votes[post.id],
      showDivider: showDivider,
      onLike: () => actions.toggleLike(context, post),
      onRepost: public ? () => actions.toggleRepost(context, post) : null,
      onQuote: public ? () => actions.quote(context, post) : null,
      onSave: public ? () => actions.toggleSave(context, post) : null,
      onShare: public ? () => actions.share(context, post) : null,
      onViews: isOwner ? () => actions.openEngagement(context, post) : null,
      onVote: (optionId) => actions.vote(context, post, optionId),
      onPollVotes: isOwner && post.hasPoll
          ? () => actions.openEngagement(
              context,
              post,
              initialKind: CommunityEngagementKind.pollVotes,
            )
          : null,
      onReply: () => actions.reply(context, post),
      onMore: () => actions.showPostMenu(context, post),
      onOpen: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => PostDetailScreen(
            postId: post.id,
            privateCommunityId: post.privateCommunityId,
          ),
        ),
      ),
      onOpenAuthor: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: post.authorId),
        ),
      ),
      onOpenCommunity: post.community == null
          ? null
          : () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) =>
                    CommunitySpaceScreen(communityId: post.community!.id),
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
    );
  }
}
