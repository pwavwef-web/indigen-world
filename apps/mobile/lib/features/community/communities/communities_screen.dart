import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_actions.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_widgets.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The communities directory: find one, see the ones you are in, start one.
///
/// Opened from "+ Communities" on the feed. Reading needs no account; joining
/// and creating ask for one at the moment they are tapped.
class CommunitiesScreen extends ConsumerStatefulWidget {
  const CommunitiesScreen({this.initialTab = 0, super.key});

  /// 0 for Discover, 1 for Joined.
  final int initialTab;

  @override
  ConsumerState<CommunitiesScreen> createState() => _CommunitiesScreenState();
}

class _CommunitiesScreenState extends ConsumerState<CommunitiesScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  var _query = '';
  late var _tab = widget.initialTab;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    // For the clear button, which appears with the first character.
    setState(() {});
    // A read per keystroke is a read per keystroke on somebody's data bundle.
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = value.trim());
    });
    // Clearing the field is instant; there is nothing to wait for.
    if (value.trim().isEmpty) setState(() => _query = '');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final actions = CommunitySpaceActions(ref);
    final searching = communityQueryWords(_query).isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.communitiesTitle),
        actions: [
          IconButton(
            tooltip: l10n.communitiesCreateCommunity,
            onPressed: () => actions.create(context),
            icon: const Icon(Icons.add_circle_outline_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'community-create',
        onPressed: () => actions.create(context),
        backgroundColor: context.brand.accentFill,
        foregroundColor: context.brand.onAccentFill,
        icon: const Icon(Icons.add_rounded),
        label: Text(l10n.communitiesCreate),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: TextField(
                key: const Key('communities-search'),
                controller: _search,
                onChanged: _onQueryChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: l10n.communitiesSearchHint,
                  labelText: l10n.communitiesSearchLabel,
                  floatingLabelBehavior: FloatingLabelBehavior.never,
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: l10n.communitiesClearSearch,
                          onPressed: () {
                            _search.clear();
                            _onQueryChanged('');
                          },
                          icon: const Icon(Icons.close_rounded),
                        ),
                ),
              ),
            ),
            if (!searching)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
                child: SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<int>(
                    segments: [
                      ButtonSegment(
                        value: 0,
                        icon: const Icon(Icons.explore_outlined),
                        label: Text(l10n.communitiesDiscover),
                      ),
                      ButtonSegment(
                        value: 1,
                        icon: const Icon(Icons.groups_2_outlined),
                        label: Text(l10n.communitiesJoined),
                      ),
                    ],
                    selected: {_tab},
                    showSelectedIcon: false,
                    onSelectionChanged: (value) =>
                        setState(() => _tab = value.first),
                  ),
                ),
              ),
            Expanded(
              child: searching
                  ? _SearchResults(query: _query, actions: actions)
                  : _tab == 0
                  ? _DiscoverList(actions: actions)
                  : _JoinedList(
                      actions: actions,
                      onDiscover: () => setState(() => _tab = 0),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DiscoverList extends ConsumerWidget {
  const _DiscoverList({required this.actions});

  final CommunitySpaceActions actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(discoverCommunitiesProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(discoverCommunitiesProvider.future),
      child: switch (state) {
        AsyncValue(:final value?) when value.isEmpty => _ScrollableState(
          child: CommunityEmptyState(
            icon: Icons.groups_2_outlined,
            title: l10n.communitiesEmpty,
            action: FilledButton.icon(
              onPressed: () => actions.create(context),
              icon: const Icon(Icons.add_rounded),
              label: Text(l10n.communitiesCreateCommunity),
            ),
          ),
        ),
        AsyncValue(:final value?) => _CommunityList(
          spaces: value,
          actions: actions,
        ),
        AsyncValue(:final error?) => _ScrollableState(
          child: _LoadFailed(
            error: error,
            onRetry: () => ref.invalidate(discoverCommunitiesProvider),
          ),
        ),
        _ => const _ListSkeleton(),
      },
    );
  }
}

class _JoinedList extends ConsumerWidget {
  const _JoinedList({required this.actions, required this.onDiscover});

  final CommunitySpaceActions actions;
  final VoidCallback onDiscover;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(joinedCommunitiesProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(joinedCommunitiesProvider.future),
      child: switch (state) {
        AsyncValue(:final value?) when value.isEmpty => _ScrollableState(
          child: CommunityEmptyState(
            icon: Icons.group_add_outlined,
            title: l10n.communitiesNoneJoined,
            action: FilledButton.icon(
              onPressed: onDiscover,
              icon: const Icon(Icons.explore_outlined),
              label: Text(l10n.communitiesNoneJoinedAction),
            ),
          ),
        ),
        AsyncValue(:final value?) => _CommunityList(
          spaces: value,
          actions: actions,
        ),
        AsyncValue(:final error?) => _ScrollableState(
          child: _LoadFailed(
            error: error,
            onRetry: () => ref.invalidate(joinedCommunitiesProvider),
          ),
        ),
        _ => const _ListSkeleton(),
      },
    );
  }
}

class _SearchResults extends ConsumerWidget {
  const _SearchResults({required this.query, required this.actions});

  final String query;
  final CommunitySpaceActions actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(communitySearchProvider(query));
    return switch (state) {
      AsyncValue(:final value?) when value.isEmpty => _ScrollableState(
        child: CommunityEmptyState(
          icon: Icons.search_off_rounded,
          title: l10n.communitiesNoResults(query),
          action: OutlinedButton.icon(
            onPressed: () => actions.create(context),
            icon: const Icon(Icons.add_rounded),
            label: Text(l10n.communitiesNoResultsAction),
          ),
        ),
      ),
      AsyncValue(:final value?) => _CommunityList(
        spaces: value,
        actions: actions,
      ),
      AsyncValue(:final error?) => _ScrollableState(
        child: _LoadFailed(
          error: error,
          onRetry: () => ref.invalidate(communitySearchProvider(query)),
        ),
      ),
      _ => const _ListSkeleton(),
    };
  }
}

class _CommunityList extends StatelessWidget {
  const _CommunityList({required this.spaces, required this.actions});

  final List<CommunitySpace> spaces;
  final CommunitySpaceActions actions;

  @override
  Widget build(BuildContext context) => ListView.builder(
    physics: const AlwaysScrollableScrollPhysics(),
    // Clear of the create button floating over the bottom of the list.
    padding: const EdgeInsets.only(bottom: 96),
    itemCount: spaces.length,
    itemBuilder: (context, index) {
      final space = spaces[index];
      return CommunitySpaceTile(
        key: ValueKey('community-tile-${space.id}'),
        space: space,
        onTap: () => actions.open(context, space.id),
      );
    },
  );
}

/// An empty or failed state that still accepts the pull-to-refresh gesture.
class _ScrollableState extends StatelessWidget {
  const _ScrollableState({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [child],
  );
}

class _LoadFailed extends StatelessWidget {
  const _LoadFailed({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return CommunityEmptyState(
      icon: Icons.cloud_off_rounded,
      title: isCommunityBackendPending(error)
          ? l10n.communityBackendPending
          : l10n.communitiesLoadFailed,
      action: FilledButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded),
        label: Text(l10n.communityTryAgain),
      ),
    );
  }
}

class _ListSkeleton extends StatelessWidget {
  const _ListSkeleton();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.fromLTRB(16, 12, 16, 12),
    child: Column(
      children: [
        GlassSkeleton(height: 76),
        SizedBox(height: 10),
        GlassSkeleton(height: 76),
        SizedBox(height: 10),
        GlassSkeleton(height: 76),
      ],
    ),
  );
}
