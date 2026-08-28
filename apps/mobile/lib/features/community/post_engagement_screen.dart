import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// Author-only audience detail, matching SRC's tappable view statistic without
/// exposing one member's reading history to arbitrary accounts.
class PostEngagementScreen extends ConsumerWidget {
  const PostEngagementScreen({
    required this.post,
    this.initialKind = CommunityEngagementKind.views,
    super.key,
  });

  final CommunityPost post;
  final CommunityEngagementKind initialKind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOwner = ref.watch(currentUidProvider) == post.authorId;
    final kinds = [
      CommunityEngagementKind.views,
      CommunityEngagementKind.appreciations,
      if (post.hasPoll) CommunityEngagementKind.pollVotes,
    ];
    final requestedIndex = kinds.indexOf(initialKind);
    return DefaultTabController(
      length: kinds.length,
      initialIndex: requestedIndex < 0 ? 0 : requestedIndex,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Post engagement'),
          bottom: TabBar(
            isScrollable: kinds.length > 2,
            tabs: [
              for (final kind in kinds)
                Tab(
                  text: switch (kind) {
                    CommunityEngagementKind.views => 'Views',
                    CommunityEngagementKind.appreciations => 'Appreciations',
                    CommunityEngagementKind.pollVotes => 'Poll voters',
                  },
                ),
            ],
          ),
        ),
        body: isOwner
            ? TabBarView(
                children: [
                  for (final kind in kinds)
                    _EngagementList(
                      postId: post.id,
                      kind: kind,
                      count: switch (kind) {
                        CommunityEngagementKind.views => post.viewCount,
                        CommunityEngagementKind.appreciations => post.likeCount,
                        CommunityEngagementKind.pollVotes =>
                          post.poll?.totalVotes ?? 0,
                      },
                    ),
                ],
              )
            : const CommunityEmptyState(
                icon: Icons.lock_outline_rounded,
                title: 'Private to the author',
                message:
                    'Only the person who wrote this post can see its audience.',
              ),
      ),
    );
  }
}

class _EngagementList extends ConsumerWidget {
  const _EngagementList({
    required this.postId,
    required this.kind,
    required this.count,
  });

  final String postId;
  final CommunityEngagementKind kind;
  final int count;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = (postId: postId, kind: kind);
    final people = ref.watch(postEngagementProfilesProvider(request));
    return switch (people) {
      AsyncValue(:final value?) when value.isEmpty => CommunityEmptyState(
        icon: switch (kind) {
          CommunityEngagementKind.views => Icons.visibility_outlined,
          CommunityEngagementKind.appreciations =>
            Icons.favorite_border_rounded,
          CommunityEngagementKind.pollVotes => Icons.how_to_vote_outlined,
        },
        title: switch (kind) {
          CommunityEngagementKind.views => 'No recorded views yet',
          CommunityEngagementKind.appreciations => 'No appreciations yet',
          CommunityEngagementKind.pollVotes => 'No poll votes yet',
        },
        message: count > 0
            ? 'Some older engagement predates the audience ledger.'
            : 'Engagement will appear here as the community responds.',
      ),
      AsyncValue(:final value?) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
        itemCount: value.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final profile = value[index];
          return ProfileTile(
            profile: profile,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => CommunityProfileScreen(uid: profile.uid),
              ),
            ),
          );
        },
      ),
      AsyncValue(hasError: true) => const CommunityEmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'Engagement unavailable',
        message: 'Check your connection and try again.',
      ),
      _ => Center(
        child: CircularProgressIndicator(color: context.brand.accent),
      ),
    };
  }
}
