import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_category_style.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// Whether a saved [post] answers [query] and carries [topic] (when one is
/// chosen). The words are matched against what was written and who wrote it,
/// case and tone marks aside.
bool savedPostMatches(
  CommunityPost post, {
  String query = '',
  PostCategory? topic,
}) {
  if (topic != null && post.category != topic) return false;
  final needle = communityFold(query.trim().replaceFirst('@', ''));
  if (needle.isEmpty) return true;
  return communityFold(post.text).contains(needle) ||
      communityFold(post.authorName).contains(needle) ||
      communityFold(post.authorUsername).contains(needle);
}

/// Posts the signed-in member has saved. Saves are private — the bookmark
/// documents are readable only by their owner.
class SavedPostsScreen extends ConsumerStatefulWidget {
  const SavedPostsScreen({super.key});

  @override
  ConsumerState<SavedPostsScreen> createState() => _SavedPostsScreenState();
}

class _SavedPostsScreenState extends ConsumerState<SavedPostsScreen> {
  final _search = TextEditingController();
  var _query = '';
  PostCategory? _topic;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
              AsyncValue(:final value?) => _filtered(
                context,
                value,
                (post) => CommunityPostCard(
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
                  onOpenHandle: (handle) => actions.openHandle(context, handle),
                  onOpenLink: (url) => actions.openLink(context, url),
                ),
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

  /// The search box, the topic chips the saves actually use, and the saves
  /// that match both.
  Widget _filtered(
    BuildContext context,
    List<CommunityPost> saved,
    Widget Function(CommunityPost post) card,
  ) {
    final l10n = AppLocalizations.of(context);
    final brand = context.brand;
    final topics = [
      for (final topic in PostCategory.values)
        if (saved.any((post) => post.category == topic)) topic,
    ];
    final shown = saved
        .where((post) => savedPostMatches(post, query: _query, topic: _topic))
        .toList(growable: false);
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
          child: TextField(
            key: const Key('saved-posts-search'),
            controller: _search,
            onChanged: (value) => setState(() => _query = value),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search your saved posts',
              prefixIcon: const Icon(Icons.search_rounded),
              isDense: true,
              suffixIcon: _query.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () {
                        _search.clear();
                        setState(() => _query = '');
                      },
                    ),
            ),
          ),
        ),
        if (topics.isNotEmpty)
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
              children: [
                for (final topic in topics)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      key: ValueKey('saved-topic-${topic.wire}'),
                      avatar: Icon(
                        topic.icon,
                        size: 15,
                        color: topic.colorOn(brand),
                      ),
                      label: Text(topic.label(l10n)),
                      selected: _topic == topic,
                      showCheckmark: false,
                      onSelected: (on) =>
                          setState(() => _topic = on ? topic : null),
                    ),
                  ),
              ],
            ),
          ),
        if (shown.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
            child: Text(
              'No saved post matches that.',
              textAlign: TextAlign.center,
              style: TextStyle(color: brand.mutedInk),
            ),
          )
        else
          for (final post in shown)
            KeyedSubtree(key: ValueKey('saved-${post.id}'), child: card(post)),
      ],
    );
  }
}
