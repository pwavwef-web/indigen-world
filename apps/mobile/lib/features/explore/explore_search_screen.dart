import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_search.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// Search across Explore: the reels, and the people who made them.
///
/// The reel side is answered on the device from the feed already in memory.
/// That is not a shortcut — it is what makes the results appear as the member
/// types, keeps working on a stalled connection, and costs nothing. People are
/// answered by the server, because the directory is far larger than any feed.
class ExploreSearchScreen extends ConsumerStatefulWidget {
  const ExploreSearchScreen({super.key});

  @override
  ConsumerState<ExploreSearchScreen> createState() =>
      _ExploreSearchScreenState();
}

class _ExploreSearchScreenState extends ConsumerState<ExploreSearchScreen>
    with SingleTickerProviderStateMixin {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  late final TabController _tabs = TabController(length: 3, vsync: this);

  /// What the results are actually computed from.
  ///
  /// Separate from the field's own text and settled a beat behind it, so a
  /// fast typist does not fire a directory lookup per keystroke.
  var _query = '';
  Timer? _debounce;

  static const _debounceDelay = Duration(milliseconds: 260);

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onTyped);
    // The keyboard is the point of arriving here.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    _tabs.dispose();
    super.dispose();
  }

  void _onTyped() {
    _debounce?.cancel();
    final text = _controller.text.trim();
    if (text == _query) return;
    // An emptied field goes back to the recents immediately; there is nothing
    // to wait for.
    if (text.isEmpty) {
      setState(() => _query = '');
      return;
    }
    _debounce = Timer(_debounceDelay, () {
      if (mounted) setState(() => _query = text);
    });
  }

  /// Runs the term as typed and remembers it.
  ///
  /// A term is only worth keeping once somebody has finished it — recording
  /// every prefix on the way would fill the list with fragments of one word.
  void _submit(String raw) {
    final term = raw.trim();
    if (term.isEmpty) return;
    _debounce?.cancel();
    setState(() => _query = term);
    _focus.unfocus();
    unawaited(ref.read(recentSearchesProvider.notifier).remember(term));
  }

  void _runSuggestion(String term) {
    _controller
      ..text = term
      ..selection = TextSelection.collapsed(offset: term.length);
    _submit(term);
  }

  void _openReel(List<Reel> results, int index) {
    HapticFeedback.selectionClick();
    unawaited(
      ref.read(recentSearchesProvider.notifier).remember(_query),
    );
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => _SearchResultFeed(
          reels: results,
          initialIndex: index,
          title: _query,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reels = ref.watch(exploreFeedProvider);
    final reelResults = searchReels(reels, _query);
    final people = _query.length < 2
        ? const AsyncValue<List<CommunityProfile>>.data(<CommunityProfile>[])
        : ref.watch(profileSearchProvider(_query));

    return NightTheme(
      child: Builder(
        builder: (context) => AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: Scaffold(
            backgroundColor: const Color(0xFF070A09),
            body: SafeArea(
              child: Column(
                children: [
                  _SearchField(
                    controller: _controller,
                    focusNode: _focus,
                    onSubmitted: _submit,
                    onClear: () {
                      _controller.clear();
                      _focus.requestFocus();
                    },
                  ),
                  if (_query.isEmpty)
                    Expanded(
                      child: _SearchLanding(
                        suggestions: trendingTerms(reels),
                        onRun: _runSuggestion,
                      ),
                    )
                  else ...[
                    _ResultTabs(
                      controller: _tabs,
                      reelCount: reelResults.length,
                      peopleCount: people.asData?.value.length ?? 0,
                    ),
                    Expanded(
                      child: TabBarView(
                        controller: _tabs,
                        children: [
                          _TopResults(
                            query: _query,
                            reels: reelResults,
                            people: people,
                            onOpenReel: (index) =>
                                _openReel(reelResults, index),
                            onSeeAllReels: () => _tabs.animateTo(1),
                            onSeeAllPeople: () => _tabs.animateTo(2),
                          ),
                          _ReelGrid(
                            reels: reelResults,
                            onOpen: (index) => _openReel(reelResults, index),
                          ),
                          _PeopleList(people: people, query: _query),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// The field
// ═══════════════════════════════════════════════════════════════════════════

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.focusNode,
    required this.onSubmitted,
    required this.onClear,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 8, 14, 10),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Back',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
        ),
        Expanded(
          child: Container(
            height: 42,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.09),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white24),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.search_rounded,
                  color: Colors.white70,
                  size: 19,
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    textInputAction: TextInputAction.search,
                    onSubmitted: onSubmitted,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                    cursorColor: context.brand.gold,
                    decoration: InputDecoration(
                      isDense: true,
                      border: InputBorder.none,
                      hintText: 'Search reels and people',
                      hintStyle: TextStyle(
                        color: Colors.white.withValues(alpha: 0.42),
                        fontSize: 14.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: controller,
                  builder: (context, value, _) => value.text.isEmpty
                      ? const SizedBox.shrink()
                      : GestureDetector(
                          onTap: onClear,
                          behavior: HitTestBehavior.opaque,
                          child: const Padding(
                            padding: EdgeInsets.only(left: 6),
                            child: Icon(
                              Icons.cancel_rounded,
                              color: Colors.white38,
                              size: 18,
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
        TextButton(
          onPressed: () => onSubmitted(controller.text),
          style: TextButton.styleFrom(
            foregroundColor: Colors.white,
            minimumSize: const Size(0, 40),
            padding: const EdgeInsets.symmetric(horizontal: 8),
          ),
          child: const Text(
            'Search',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5),
          ),
        ),
      ],
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Nothing typed yet
// ═══════════════════════════════════════════════════════════════════════════

/// What the screen shows before a word has been typed: what this member looked
/// for before, and what the feed itself is about.
class _SearchLanding extends ConsumerWidget {
  const _SearchLanding({required this.suggestions, required this.onRun});

  final List<String> suggestions;
  final ValueChanged<String> onRun;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recents = ref.watch(recentSearchesProvider).value ?? const <String>[];
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 40),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        if (recents.isNotEmpty) ...[
          Row(
            children: [
              const Expanded(child: _SectionHeading('Recent searches')),
              TextButton(
                onPressed: () =>
                    ref.read(recentSearchesProvider.notifier).clear(),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white60,
                  minimumSize: const Size(0, 32),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                child: const Text(
                  'Clear all',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          for (final term in recents)
            _RecentRow(
              term: term,
              onTap: () => onRun(term),
              onRemove: () =>
                  ref.read(recentSearchesProvider.notifier).forget(term),
            ),
          const SizedBox(height: 22),
        ],
        if (suggestions.isNotEmpty) ...[
          const _SectionHeading('Try'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final term in suggestions)
                _SuggestionChip(label: term, onTap: () => onRun(term)),
            ],
          ),
        ] else
          const Padding(
            padding: EdgeInsets.only(top: 40),
            child: Center(
              child: Text(
                'Search for a reel, a place, or somebody by name.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white54, fontSize: 13.5),
              ),
            ),
          ),
      ],
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text(
      label.toUpperCase(),
      style: const TextStyle(
        color: Colors.white54,
        fontSize: 10,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.2,
      ),
    ),
  );
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({
    required this.term,
    required this.onTap,
    required this.onRemove,
  });

  final String term;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(12),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          const Icon(Icons.history_rounded, color: Colors.white38, size: 19),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              term,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Remove',
            onPressed: onRemove,
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.close_rounded, color: Colors.white38,
                size: 17),
          ),
        ],
      ),
    ),
  );
}

class _SuggestionChip extends StatelessWidget {
  const _SuggestionChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white.withValues(alpha: 0.08),
    borderRadius: BorderRadius.circular(999),
    child: InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════════════════

class _ResultTabs extends StatelessWidget {
  const _ResultTabs({
    required this.controller,
    required this.reelCount,
    required this.peopleCount,
  });

  final TabController controller;
  final int reelCount;
  final int peopleCount;

  @override
  Widget build(BuildContext context) => TabBar(
    controller: controller,
    labelColor: Colors.white,
    unselectedLabelColor: Colors.white54,
    indicatorColor: context.brand.gold,
    indicatorSize: TabBarIndicatorSize.label,
    dividerColor: Colors.white12,
    labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
    tabs: [
      const Tab(text: 'Top'),
      Tab(text: reelCount == 0 ? 'Reels' : 'Reels · $reelCount'),
      Tab(text: peopleCount == 0 ? 'People' : 'People · $peopleCount'),
    ],
  );
}

/// The blended view: the strongest few reels, then the people, then a way into
/// the rest of each.
class _TopResults extends StatelessWidget {
  const _TopResults({
    required this.query,
    required this.reels,
    required this.people,
    required this.onOpenReel,
    required this.onSeeAllReels,
    required this.onSeeAllPeople,
  });

  final String query;
  final List<Reel> reels;
  final AsyncValue<List<CommunityProfile>> people;
  final ValueChanged<int> onOpenReel;
  final VoidCallback onSeeAllReels;
  final VoidCallback onSeeAllPeople;

  static const _reelPreview = 6;
  static const _peoplePreview = 3;

  @override
  Widget build(BuildContext context) {
    final profiles = people.asData?.value ?? const <CommunityProfile>[];
    if (reels.isEmpty && profiles.isEmpty && !people.isLoading) {
      return _EmptyResults(query: query);
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 40),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        if (profiles.isNotEmpty) ...[
          _ResultHeading(
            label: 'People',
            onSeeAll: profiles.length > _peoplePreview ? onSeeAllPeople : null,
          ),
          for (final profile in profiles.take(_peoplePreview))
            _PersonRow(profile: profile),
          const SizedBox(height: 20),
        ],
        if (reels.isNotEmpty) ...[
          _ResultHeading(
            label: 'Reels',
            onSeeAll: reels.length > _reelPreview ? onSeeAllReels : null,
          ),
          const SizedBox(height: 10),
          _ReelGridBody(
            reels: reels.take(_reelPreview).toList(growable: false),
            onOpen: onOpenReel,
            shrinkWrap: true,
          ),
        ],
      ],
    );
  }
}

class _ResultHeading extends StatelessWidget {
  const _ResultHeading({required this.label, this.onSeeAll});

  final String label;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      if (onSeeAll case final onSeeAll?)
        TextButton(
          onPressed: onSeeAll,
          style: TextButton.styleFrom(
            foregroundColor: context.brand.gold,
            minimumSize: const Size(0, 32),
            padding: const EdgeInsets.symmetric(horizontal: 6),
          ),
          child: const Text(
            'See all',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
          ),
        ),
    ],
  );
}

class _ReelGrid extends StatelessWidget {
  const _ReelGrid({required this.reels, required this.onOpen});

  final List<Reel> reels;
  final ValueChanged<int> onOpen;

  @override
  Widget build(BuildContext context) => reels.isEmpty
      ? const _EmptyResults(query: '')
      : Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 40),
          child: _ReelGridBody(reels: reels, onOpen: onOpen),
        );
}

class _ReelGridBody extends StatelessWidget {
  const _ReelGridBody({
    required this.reels,
    required this.onOpen,
    this.shrinkWrap = false,
  });

  final List<Reel> reels;
  final ValueChanged<int> onOpen;
  final bool shrinkWrap;

  @override
  Widget build(BuildContext context) => GridView.builder(
    shrinkWrap: shrinkWrap,
    physics: shrinkWrap ? const NeverScrollableScrollPhysics() : null,
    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
    padding: EdgeInsets.zero,
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 3,
      crossAxisSpacing: 6,
      mainAxisSpacing: 6,
      childAspectRatio: 9 / 15,
    ),
    itemCount: reels.length,
    itemBuilder: (context, index) =>
        _ReelTile(reel: reels[index], onTap: () => onOpen(index)),
  );
}

class _ReelTile extends StatelessWidget {
  const _ReelTile({required this.reel, required this.onTap});

  final Reel reel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: reel.title,
    excludeSemantics: true,
    child: GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (reel.imageUrl.isEmpty)
              const ReelPlaceholder()
            else
              CachedNetworkImage(
                imageUrl: reel.imageUrl,
                fit: BoxFit.cover,
                placeholder: (context, url) => const ReelPlaceholder(),
                errorWidget: (context, url, error) => const ReelPlaceholder(),
              ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x00000000), Color(0xCC000000)],
                  stops: [0.45, 1],
                ),
              ),
            ),
            if (reel.videoUrl != null)
              const Positioned(
                top: 6,
                right: 6,
                child: Icon(
                  Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: 18,
                  shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                ),
              ),
            Positioned(
              left: 7,
              right: 7,
              bottom: 7,
              child: Text(
                reel.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  height: 1.2,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PeopleList extends StatelessWidget {
  const _PeopleList({required this.people, required this.query});

  final AsyncValue<List<CommunityProfile>> people;
  final String query;

  @override
  Widget build(BuildContext context) => switch (people) {
    AsyncValue(:final value?) when value.isEmpty => _EmptyResults(query: query),
    AsyncValue(:final value?) => ListView.builder(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 40),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: value.length,
      itemBuilder: (context, index) => _PersonRow(profile: value[index]),
    ),
    AsyncValue(hasError: true) => _EmptyResults(query: query),
    _ => const Center(
      child: SizedBox.square(
        dimension: 26,
        child: CircularProgressIndicator(strokeWidth: 2.4),
      ),
    ),
  };
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.profile});

  final CommunityProfile profile;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(14),
    onTap: () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CommunityProfileScreen(uid: profile.uid),
      ),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
      child: Row(
        children: [
          CommunityAvatar(
            initials: profile.initials,
            imageUrl: profile.avatarUrl,
            size: 44,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.displayName,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  profile.handle,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.chevron_right_rounded,
            color: Colors.white38,
            size: 20,
          ),
        ],
      ),
    ),
  );
}

class _EmptyResults extends StatelessWidget {
  const _EmptyResults({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.search_off_rounded, color: Colors.white38, size: 34),
          const SizedBox(height: 14),
          Text(
            query.isEmpty
                ? 'Nothing matched.'
                : 'Nothing here for “$query”.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Try a shorter word, a place, or somebody’s name.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white54, fontSize: 13, height: 1.4),
          ),
        ],
      ),
    ),
  );
}

/// The results, opened as a feed of their own.
///
/// A tapped result plays in the same full-bleed card the main feed uses — same
/// appreciations, same replies, same context sheet — but paging stays inside
/// what was searched for rather than dropping into the whole of Explore.
class _SearchResultFeed extends StatelessWidget {
  const _SearchResultFeed({
    required this.reels,
    required this.initialIndex,
    required this.title,
  });

  final List<Reel> reels;
  final int initialIndex;
  final String title;

  @override
  Widget build(BuildContext context) => NightTheme(
    child: AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: const Color(0xFF070A09),
        body: ReelFeedView(
          reels: reels,
          initialIndex: initialIndex,
          header: _ResultFeedHeader(title: title),
        ),
      ),
    ),
  );
}

class _ResultFeedHeader extends StatelessWidget {
  const _ResultFeedHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 6, 58, 0),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Back',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
        ),
        Expanded(
          child: Text(
            'Results for “$title”',
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w800,
              shadows: [Shadow(blurRadius: 14, color: Colors.black)],
            ),
          ),
        ),
      ],
    ),
  );
}
