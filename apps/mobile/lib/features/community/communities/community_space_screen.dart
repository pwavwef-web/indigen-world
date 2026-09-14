import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_actions.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_widgets.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_prompt.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_compose_bar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/daily_prompt_strip.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// One community: its header, and Feed, About, Members and Rules underneath.
///
/// Everything that depends on belonging — reading a private community's feed
/// and members, posting, moderating — is decided from one [CommunityAccess],
/// so the screen cannot show a composer to somebody the rules would refuse,
/// or a locked door to somebody already inside.
class CommunitySpaceScreen extends ConsumerStatefulWidget {
  const CommunitySpaceScreen({
    required this.communityId,
    this.initialTab = CommunitySpaceTab.feed,
    super.key,
  });

  final String communityId;
  final CommunitySpaceTab initialTab;

  @override
  ConsumerState<CommunitySpaceScreen> createState() =>
      _CommunitySpaceScreenState();
}

enum CommunitySpaceTab { feed, about, members, rules }

class _CommunitySpaceScreenState extends ConsumerState<CommunitySpaceScreen>
    with SingleTickerProviderStateMixin {
  late final _tabs = TabController(
    length: CommunitySpaceTab.values.length,
    vsync: this,
    initialIndex: widget.initialTab.index,
  )..addListener(_onTabChanged);
  final _viewedPostIds = <String>{};
  var _requestedWindow = 0;

  CommunitySpaceTab get _tab => CommunitySpaceTab.values[_tabs.index];

  void _onTabChanged() {
    if (!_tabs.indexIsChanging && mounted) setState(() {});
  }

  @override
  void dispose() {
    // Flushes VisibilityDetector's coalescing timer, exactly as the main feed
    // does, so no impression callback fires after the screen has gone.
    VisibilityDetectorController.instance.notifyNow();
    _tabs
      ..removeListener(_onTabChanged)
      ..dispose();
    super.dispose();
  }

  bool _onScroll(ScrollNotification notification, {required bool canRead}) {
    if (_tab != CommunitySpaceTab.feed || !canRead) return false;
    if (notification.metrics.extentAfter > 1400) return false;
    final id = widget.communityId;
    final raw = ref.read(rawCommunitySpaceFeedProvider(id));
    final window = ref.read(communityFeedWindowsProvider(id));
    if (raw.isLoading ||
        (raw.value?.length ?? 0) < window ||
        _requestedWindow >= window) {
      return false;
    }
    _requestedWindow = window;
    void grow() => ref.read(communityFeedWindowsProvider(id).notifier).grow();
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (mounted) grow();
      });
    } else {
      grow();
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final spaceState = ref.watch(communitySpaceProvider(widget.communityId));
    final space = spaceState.asData?.value;

    if (!spaceState.hasValue) {
      return Scaffold(
        appBar: AppBar(),
        body: spaceState.hasError
            ? CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: isCommunityBackendPending(spaceState.error!)
                    ? l10n.communityBackendPending
                    : l10n.communitiesLoadFailed,
                action: FilledButton.icon(
                  onPressed: () => ref.invalidate(
                    communitySpaceProvider(widget.communityId),
                  ),
                  icon: const Icon(Icons.refresh_rounded),
                  label: Text(l10n.communityTryAgain),
                ),
              )
            : const _SpaceSkeleton(),
      );
    }
    if (space == null || !space.isAvailable) {
      return Scaffold(
        appBar: AppBar(),
        body: CommunityEmptyState(
          icon: Icons.search_off_rounded,
          title: l10n.communityUnavailableTitle,
          message: l10n.communityUnavailableBody,
        ),
      );
    }

    final uid = ref.watch(currentUidProvider);
    final membership = ref
        .watch(myMembershipProvider(widget.communityId))
        .asData
        ?.value;
    final access = resolveCommunityAccess(
      space: space,
      uid: uid,
      membership: membership,
    );
    final canRead = canReadCommunityContent(space, access);
    final spaceActions = CommunitySpaceActions(ref);
    final tabHeight =
        46 *
        MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.5).scale(1);

    return Scaffold(
      body: NotificationListener<ScrollNotification>(
        onNotification: (notification) =>
            _onScroll(notification, canRead: canRead),
        child: RefreshIndicator(
          onRefresh: () async {
            _requestedWindow = 0;
            ref
              ..invalidate(communitySpaceProvider(widget.communityId))
              ..invalidate(rawCommunitySpaceFeedProvider(widget.communityId))
              ..invalidate(communityMembersProvider(widget.communityId));
          },
          child: CustomScrollView(
            key: PageStorageKey('community-space-${widget.communityId}'),
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar(
                pinned: true,
                title: Text(
                  space.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                actions: [
                  IconButton(
                    tooltip: l10n.communityShareCommunity,
                    onPressed: () => spaceActions.share(context, space),
                    icon: const Icon(Icons.ios_share_rounded),
                  ),
                  IconButton(
                    key: const Key('community-options'),
                    tooltip: l10n.communityOptions,
                    onPressed: () =>
                        spaceActions.showOptions(context, space, membership),
                    icon: const Icon(Icons.more_vert_rounded),
                  ),
                ],
              ),
              SliverToBoxAdapter(
                child: _SpaceHeader(
                  space: space,
                  membership: membership,
                  onOpenRequests: () =>
                      _tabs.animateTo(CommunitySpaceTab.members.index),
                ),
              ),
              SliverPersistentHeader(
                pinned: true,
                delegate: _TabsDelegate(controller: _tabs, height: tabHeight),
              ),
              ...switch (_tab) {
                CommunitySpaceTab.feed => _feedSlivers(
                  space: space,
                  access: access,
                  membership: membership,
                  canRead: canRead,
                ),
                CommunitySpaceTab.about => [
                  SliverToBoxAdapter(child: _AboutTab(space: space)),
                ],
                CommunitySpaceTab.members =>
                  canRead
                      ? [
                          SliverToBoxAdapter(
                            child: _MembersTab(
                              space: space,
                              viewer: membership,
                            ),
                          ),
                        ]
                      : [
                          SliverToBoxAdapter(
                            child: _LockedState(space: space, access: access),
                          ),
                        ],
                CommunitySpaceTab.rules => [
                  SliverToBoxAdapter(child: _RulesTab(space: space)),
                ],
              },
              const SliverToBoxAdapter(child: SizedBox(height: 48)),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _feedSlivers({
    required CommunitySpace space,
    required CommunityAccess access,
    required CommunityMembership? membership,
    required bool canRead,
  }) {
    final l10n = AppLocalizations.of(context);
    if (!canRead) {
      return [
        SliverToBoxAdapter(
          child: _LockedState(space: space, access: access),
        ),
      ];
    }
    final actions = CommunityActions(ref);
    final isMember = access == CommunityAccess.member;
    final stamp = space.toPostStamp();
    final canAnnounce = membership?.canModerate ?? false;
    final feed = ref.watch(communitySpaceFeedProvider(space.id));
    final raw = ref.watch(rawCommunitySpaceFeedProvider(space.id));
    final window = ref.watch(communityFeedWindowsProvider(space.id));
    final loadingMore = raw.isLoading && raw.hasValue;

    Future<void> compose({
      CommunityMediaKind? media,
      PostCategory? category,
      String? hint,
      String initialText = '',
    }) => actions.compose(
      context,
      community: stamp,
      canAnnounce: canAnnounce,
      startWithMedia: media,
      category: category,
      hintText: hint,
      initialText: initialText,
    );

    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: isMember
              ? Column(
                  children: [
                    _SpacePromptStrip(
                      space: space,
                      onAnswer: (prompt) => compose(
                        category: prompt?.category ?? PostCategory.language,
                        hint: prompt?.composeHint ?? l10n.communityPromptHint,
                        initialText: prompt?.initialText ?? '',
                      ),
                    ),
                    const SizedBox(height: 8),
                    CommunityComposeBar(
                      placeholder: l10n.communityComposeIn(space.name),
                      onCompose: compose,
                      onAddPhoto: () =>
                          compose(media: CommunityMediaKind.photo),
                      onAddVideo: () =>
                          compose(media: CommunityMediaKind.video),
                    ),
                  ],
                )
              : _JoinToPost(space: space),
        ),
      ),
      ...switch (feed) {
        AsyncValue(:final value?) when value.isEmpty => [
          SliverToBoxAdapter(
            child: CommunityEmptyState(
              icon: Icons.forum_outlined,
              title: l10n.communitySpaceEmpty,
              action: isMember
                  ? FilledButton.icon(
                      onPressed: compose,
                      icon: const Icon(Icons.edit_rounded),
                      label: Text(l10n.communityFirstPost),
                    )
                  : null,
            ),
          ),
        ],
        AsyncValue(:final value?) => [
          SliverList.builder(
            itemCount: value.length + 1,
            findChildIndexCallback: (key) {
              if (key is! ValueKey<String>) return null;
              final index = value.indexWhere(
                (post) => 'space-post-${post.id}' == key.value,
              );
              return index < 0 ? null : index;
            },
            itemBuilder: (context, index) {
              if (index == value.length) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 22),
                  child: Center(
                    child: loadingMore
                        ? Semantics(
                            label: l10n.communityLoadingMore,
                            child: const SizedBox.square(
                              dimension: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.4,
                              ),
                            ),
                          )
                        : value.length < window && value.length > 4
                        ? Text(
                            l10n.communityCaughtUp,
                            style: TextStyle(
                              color: context.brand.faintInk,
                              fontSize: 13,
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                );
              }
              final post = value[index];
              return KeyedSubtree(
                key: ValueKey('space-post-${post.id}'),
                child: VisibilityDetector(
                  key: Key('space-post-visible-${post.id}'),
                  onVisibilityChanged: (info) {
                    if (info.visibleFraction >= 0.55 &&
                        _viewedPostIds.add(post.id)) {
                      actions.trackView(post);
                    }
                  },
                  child: _SpacePost(
                    post: post,
                    actions: actions,
                    canModerate: membership?.canModerate ?? false,
                  ),
                ),
              );
            },
          ),
        ],
        AsyncValue(:final error?) => [
          SliverToBoxAdapter(
            child: CommunityEmptyState(
              icon: Icons.cloud_off_rounded,
              title: isCommunityBackendPending(error)
                  ? l10n.communityBackendPending
                  : l10n.communityFeedFailed,
              action: FilledButton.icon(
                onPressed: () =>
                    ref.invalidate(rawCommunitySpaceFeedProvider(space.id)),
                icon: const Icon(Icons.refresh_rounded),
                label: Text(l10n.communityTryAgain),
              ),
            ),
          ),
        ],
        _ => [const SliverToBoxAdapter(child: _SpaceSkeleton())],
      },
    ];
  }
}

// ── Header ──────────────────────────────────────────────────────────────────

class _SpaceHeader extends ConsumerWidget {
  const _SpaceHeader({
    required this.space,
    required this.membership,
    required this.onOpenRequests,
  });

  final CommunitySpace space;
  final CommunityMembership? membership;
  final VoidCallback onOpenRequests;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final requests = membership?.canModerate ?? false
        ? ref.watch(communityRequestsProvider(space.id)).asData?.value.length ??
              0
        : 0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final coverHeight = (constraints.maxWidth / 3).clamp(96.0, 220.0);
        const avatarSize = 76.0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                SizedBox(
                  height: coverHeight,
                  width: double.infinity,
                  child: ExcludeSemantics(child: _Cover(space: space)),
                ),
                Positioned(
                  left: 16,
                  top: coverHeight - avatarSize / 2,
                  child: CommunitySpaceAvatar(
                    space: space,
                    size: avatarSize,
                    bordered: true,
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(
                children: [
                  const SizedBox(width: avatarSize + 8),
                  const Spacer(),
                  JoinCommunityButton(
                    space: space,
                    membership: membership,
                    useMine: false,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Semantics(
                          header: true,
                          child: Text(
                            space.name,
                            style: TextStyle(
                              color: brand.ink,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.4,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 10,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _MetaChip(
                        icon: space.isPrivate
                            ? Icons.lock_outline_rounded
                            : Icons.public_rounded,
                        label: space.isPrivate
                            ? l10n.communitiesPrivate
                            : l10n.communitiesPublic,
                      ),
                      _MetaChip(
                        icon: Icons.people_outline_rounded,
                        label: l10n.communitiesMembers(space.memberCount),
                      ),
                      _MetaChip(
                        icon: communityCategoryIcon(space.category),
                        label: communityCategoryLabel(space.category, l10n),
                      ),
                    ],
                  ),
                  if (space.description.trim().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(
                      space.description.trim(),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 14.5,
                        height: 1.4,
                      ),
                    ),
                  ],
                  if (requests > 0) ...[
                    const SizedBox(height: 10),
                    ActionChip(
                      avatar: const Icon(Icons.how_to_reg_outlined, size: 18),
                      label: Text('${l10n.communityRequests} · $requests'),
                      onPressed: onOpenRequests,
                      materialTapTargetSize: MaterialTapTargetSize.padded,
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({required this.space});

  final CommunitySpace space;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final fallback = Stack(
      fit: StackFit.expand,
      children: [
        const Opacity(opacity: 0.85, child: TextileMotif()),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.transparent,
                brand.background.withValues(alpha: 0.6),
              ],
            ),
          ),
        ),
      ],
    );
    final url = space.coverUrl;
    if (url == null) return fallback;
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      placeholder: (context, _) => fallback,
      errorWidget: (context, _, _) => fallback,
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: brand.mutedInk),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            color: brand.mutedInk,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _TabsDelegate extends SliverPersistentHeaderDelegate {
  const _TabsDelegate({required this.controller, required this.height});

  final TabController controller;
  final double height;

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlaps) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.5,
      child: Material(
        color: brand.background,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: brand.divider)),
          ),
          child: TabBar(
            controller: controller,
            labelColor: brand.ink,
            unselectedLabelColor: brand.mutedInk,
            indicatorColor: brand.accent,
            dividerColor: Colors.transparent,
            labelStyle: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
            tabs: [
              Tab(text: l10n.communityTabFeed),
              Tab(text: l10n.communityTabAbout),
              Tab(text: l10n.communityTabMembers),
              Tab(text: l10n.communityTabRules),
            ],
          ),
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_TabsDelegate oldDelegate) =>
      controller != oldDelegate.controller || height != oldDelegate.height;
}

// ── Feed ────────────────────────────────────────────────────────────────────

/// The community's own daily prompt: the one staff published for it, or an
/// invitation in the language it speaks.
class _SpacePromptStrip extends ConsumerWidget {
  const _SpacePromptStrip({required this.space, required this.onAnswer});

  final CommunitySpace space;
  final ValueChanged<CommunityPrompt?> onAnswer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final prompt = ref.watch(communityPromptProvider(space.id)).asData?.value;
    final language = space.language.trim();
    final title =
        prompt?.title ??
        l10n.communityPromptTitle(language.isNotEmpty ? language : space.name);
    final subtitle = prompt?.subtitle ?? l10n.communityPromptSubtitle;
    return DailyPromptStrip(
      title: title,
      subtitle: subtitle,
      imageUrl: prompt?.imageUrl,
      semanticLabel: l10n.communityPromptSemantics(title, subtitle),
      onTap: () => onAnswer(prompt),
    );
  }
}

class _JoinToPost extends StatelessWidget {
  const _JoinToPost({required this.space});

  final CommunitySpace space;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      child: Row(
        children: [
          Icon(Icons.edit_note_rounded, color: brand.mutedInk),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              AppLocalizations.of(context).communityJoinToPost,
              style: TextStyle(
                color: brand.ink,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          JoinCommunityButton(space: space, dense: true),
        ],
      ),
    );
  }
}

class _SpacePost extends ConsumerWidget {
  const _SpacePost({
    required this.post,
    required this.actions,
    required this.canModerate,
  });

  final CommunityPost post;
  final CommunityActions actions;
  final bool canModerate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final serverLiked = ref.watch(
      myLikesProvider.select(
        (value) => value.asData?.value.contains(post.id) ?? false,
      ),
    );
    final saved = ref.watch(
      myBookmarksProvider.select(
        (value) => value.asData?.value.contains(post.id) ?? false,
      ),
    );
    final reposted = ref.watch(
      myRepostsProvider.select(
        (value) => value.asData?.value.contains(post.id) ?? false,
      ),
    );
    final votedOptionId = ref.watch(
      myPollVotesProvider.select((value) => value.asData?.value[post.id]),
    );
    final pending = ref.watch(
      optimisticEngagementProvider.select((state) => state.likes[post.id]),
    );
    final isOwner = ref.watch(currentUidProvider) == post.authorId;
    final shown = pending == null || pending == serverLiked
        ? post
        : post.withLikeCount(post.likeCount + (pending ? 1 : -1));
    final public = !post.isPrivateCommunityPost;

    return CommunityPostCard(
      post: shown,
      liked: pending ?? serverLiked,
      saved: saved,
      reposted: reposted,
      votedOptionId: votedOptionId,
      showCommunityLabel: false,
      onLike: () => actions.toggleLike(context, post),
      onRepost: public ? () => actions.toggleRepost(context, post) : null,
      onQuote: public ? () => actions.quote(context, post) : null,
      onSave: public ? () => actions.toggleSave(context, post) : null,
      onShare: public ? () => actions.share(context, post) : null,
      onViews: public && isOwner
          ? () => actions.openEngagement(context, post)
          : null,
      onVote: (optionId) => actions.vote(context, post, optionId),
      onReply: () => actions.reply(context, post),
      onMore: () =>
          actions.showPostMenu(context, post, canModerate: canModerate),
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

/// What somebody who cannot read the feed sees instead: why, and the one
/// thing they can do about it.
class _LockedState extends StatelessWidget {
  const _LockedState({required this.space, required this.access});

  final CommunitySpace space;
  final CommunityAccess access;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return switch (access) {
      CommunityAccess.pending => CommunityEmptyState(
        icon: Icons.hourglass_top_rounded,
        title: l10n.communityPendingTitle,
        message: l10n.communityPendingBody,
        action: JoinCommunityButton(space: space, useMine: false),
      ),
      CommunityAccess.banned => CommunityEmptyState(
        icon: Icons.block_rounded,
        title: l10n.communityBannedTitle,
      ),
      _ => CommunityEmptyState(
        icon: Icons.lock_outline_rounded,
        title: l10n.communityPrivateTitle,
        message: l10n.communityPrivateBody,
        action: JoinCommunityButton(space: space),
      ),
    };
  }
}

// ── About ───────────────────────────────────────────────────────────────────

class _AboutTab extends ConsumerWidget {
  const _AboutTab({required this.space});

  final CommunitySpace space;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final owner = ref
        .watch(communityProfileProvider(space.ownerId))
        .asData
        ?.value;
    final created = space.createdAt;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            space.description.trim().isEmpty
                ? l10n.communityAboutNoDescription
                : space.description.trim(),
            style: TextStyle(
              color: space.description.trim().isEmpty
                  ? brand.mutedInk
                  : brand.ink,
              fontSize: 15,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          _InfoRow(
            icon: communityCategoryIcon(space.category),
            label: l10n.communityAboutCategory,
            value: communityCategoryLabel(space.category, l10n),
          ),
          if (space.language.trim().isNotEmpty)
            _InfoRow(
              icon: Icons.translate_rounded,
              label: l10n.communityAboutLanguage,
              value: space.language.trim(),
            ),
          if (space.location.trim().isNotEmpty)
            _InfoRow(
              icon: Icons.place_outlined,
              label: l10n.communityAboutLocation,
              value: space.location.trim(),
            ),
          _InfoRow(
            icon: space.isPrivate
                ? Icons.lock_outline_rounded
                : Icons.public_rounded,
            label: l10n.communityAboutVisibility,
            value: space.isPrivate
                ? '${l10n.communitiesPrivate} — ${l10n.createCommunityPrivateBody}'
                : '${l10n.communitiesPublic} — ${l10n.createCommunityPublicBody}',
          ),
          if (created != null)
            _InfoRow(
              icon: Icons.event_outlined,
              label: l10n.communityAboutCreated,
              value: MaterialLocalizations.of(context)
                  .formatMediumDate(created),
            ),
          if (owner != null) ...[
            const SizedBox(height: 12),
            Text(
              l10n.communityRoleOwner,
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            ProfileTile(
              profile: owner,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => CommunityProfileScreen(uid: owner.uid),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: MergeSemantics(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: brand.mutedInk),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    value,
                    style: TextStyle(color: brand.ink, fontSize: 14.5),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Members ─────────────────────────────────────────────────────────────────

class _MembersTab extends ConsumerWidget {
  const _MembersTab({required this.space, required this.viewer});

  final CommunitySpace space;
  final CommunityMembership? viewer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final members = ref.watch(communityMembersProvider(space.id));
    final moderator = viewer?.canModerate ?? false;
    final requests = moderator
        ? ref.watch(communityRequestsProvider(space.id)).asData?.value ??
              const <CommunityMembership>[]
        : const <CommunityMembership>[];
    final everyone = [...requests, ...?members.asData?.value];
    final profiles =
        ref
            .watch(
              memberProfilesProvider(
                (everyone.map((member) => member.uid).toList()..sort()).join(
                  ',',
                ),
              ),
            )
            .asData
            ?.value ??
        const <String, CommunityProfile>{};
    final actions = CommunitySpaceActions(ref);

    return switch (members) {
      AsyncValue(:final error?) when !members.hasValue => CommunityEmptyState(
        icon: Icons.cloud_off_rounded,
        title: isCommunityBackendPending(error)
            ? l10n.communityBackendPending
            : l10n.communitiesLoadFailed,
        action: FilledButton.icon(
          onPressed: () => ref.invalidate(communityMembersProvider(space.id)),
          icon: const Icon(Icons.refresh_rounded),
          label: Text(l10n.communityTryAgain),
        ),
      ),
      AsyncValue(hasValue: false) => const _SpaceSkeleton(),
      _ => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (requests.isNotEmpty) ...[
            _SectionLabel(
              text: '${l10n.communityRequests} · ${requests.length}',
            ),
            for (final request in requests)
              _MemberRow(
                key: ValueKey('request-${request.uid}'),
                member: request,
                profile: profiles[request.uid],
                trailing: Wrap(
                  spacing: 6,
                  children: [
                    OutlinedButton(
                      onPressed: () =>
                          actions.decline(context, space.id, request.uid),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 40),
                      ),
                      child: Text(l10n.communityDecline),
                    ),
                    FilledButton(
                      onPressed: () =>
                          actions.approve(context, space.id, request.uid),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 40),
                      ),
                      child: Text(l10n.communityApprove),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
          ],
          _SectionLabel(text: l10n.communitiesMembers(space.memberCount)),
          if (members.asData?.value.isEmpty ?? true)
            CommunityEmptyState(
              icon: Icons.people_outline_rounded,
              title: l10n.communityMembersEmpty,
            )
          else
            for (final member in members.asData!.value)
              _MemberRow(
                key: ValueKey('member-${member.uid}'),
                member: member,
                profile: profiles[member.uid],
                trailing:
                    viewer != null &&
                        viewer!.canModerate &&
                        viewer!.uid != member.uid &&
                        viewer!.role.outranks(member.role)
                    ? IconButton(
                        tooltip: l10n.communityMemberActions,
                        onPressed: () => actions.manageMember(
                          context,
                          space: space,
                          viewer: viewer!,
                          member: member,
                          memberName:
                              profiles[member.uid]?.displayName ?? member.uid,
                        ),
                        icon: const Icon(Icons.more_horiz_rounded),
                      )
                    : null,
              ),
        ],
      ),
    };
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
    child: Semantics(
      header: true,
      child: Text(
        text,
        style: TextStyle(
          color: context.brand.mutedInk,
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.member,
    required this.profile,
    this.trailing,
    super.key,
  });

  final CommunityMembership member;
  final CommunityProfile? profile;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final role = switch (member.role) {
      CommunityRole.owner => l10n.communityRoleOwner,
      CommunityRole.admin => l10n.communityRoleAdmin,
      CommunityRole.moderator => l10n.communityRoleModerator,
      CommunityRole.member => null,
    };
    final profile = this.profile;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: member.uid),
        ),
      ),
      leading: CommunityAvatar(
        initials: profile?.initials ?? '·',
        imageUrl: profile?.avatarUrl,
        username: profile?.username,
      ),
      title: Text(
        profile?.displayName ?? '…',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5),
      ),
      subtitle: Text(
        [?profile?.handle, ?role].join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
      ),
      trailing: trailing,
    );
  }
}

// ── Rules ───────────────────────────────────────────────────────────────────

class _RulesTab extends StatelessWidget {
  const _RulesTab({required this.space});

  final CommunitySpace space;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    if (space.rules.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          l10n.communityNoRules,
          textAlign: TextAlign.center,
          style: TextStyle(color: brand.mutedInk, fontSize: 14),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        children: [
          for (var index = 0; index < space.rules.length; index++)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: brand.divider)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: brand.accentSoft,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${index + 1}',
                      style: TextStyle(
                        color: brand.accent,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      space.rules[index],
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 15,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SpaceSkeleton extends StatelessWidget {
  const _SpaceSkeleton();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.fromLTRB(16, 12, 16, 12),
    child: Column(
      children: [
        GlassSkeleton(height: 120),
        SizedBox(height: 12),
        GlassSkeleton(height: 120),
      ],
    ),
  );
}
