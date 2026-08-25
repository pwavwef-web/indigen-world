import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// Posts the signed-in member has saved. Saves are private — the bookmark
/// documents are readable only by their owner.
class SavedPostsScreen extends ConsumerWidget {
  const SavedPostsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = CommunityActions(ref);
    final posts = ref.watch(savedPostsProvider);
    final likes = ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final saved =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final reposts =
        ref.watch(myRepostsProvider).asData?.value ?? const <String>{};
    final pollVotes =
        ref.watch(myPollVotesProvider).asData?.value ??
        const <String, String>{};
    final currentUid = ref.watch(currentUidProvider);
    final signedIn = currentUid != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Saved posts')),
      body: !signedIn
          ? const CommunityEmptyState(
              icon: Icons.bookmark_border_rounded,
              title: 'Sign in to save posts',
              message: 'Saved posts are private to your account.',
            )
          : switch (posts) {
              AsyncValue(:final value?) when value.isEmpty =>
                const CommunityEmptyState(
                  icon: Icons.bookmark_border_rounded,
                  title: 'Nothing saved yet',
                  message:
                      'Tap the bookmark on any post to keep it here for later.',
                ),
              AsyncValue(:final value?) => ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
                itemCount: value.length,
                separatorBuilder: (context, index) =>
                    const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final post = value[index];
                  return CommunityPostCard(
                    post: post,
                    liked: likes.contains(post.id),
                    saved: saved.contains(post.id),
                    reposted: reposts.contains(post.id),
                    votedOptionId: pollVotes[post.id],
                    onLike: () => actions.toggleLike(context, post),
                    onRepost: () => actions.toggleRepost(context, post),
                    onQuote: () => actions.quote(context, post),
                    onSave: () async {
                      await actions.toggleSave(context, post);
                      ref.invalidate(savedPostsProvider);
                    },
                    onShare: () => actions.share(context, post),
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
                    onMore: () => actions.showPostMenu(context, post),
                    onOpen: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) => PostDetailScreen(postId: post.id),
                      ),
                    ),
                    onOpenAuthor: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) =>
                            CommunityProfileScreen(uid: post.authorId),
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
                    onOpenHandle: (handle) =>
                        actions.openHandle(context, handle),
                    onOpenLink: (url) => actions.openLink(context, url),
                  );
                },
              ),
              AsyncValue(hasError: true) => const CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Could not load your saves',
                message: 'Check your connection and try again.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
    );
  }
}
