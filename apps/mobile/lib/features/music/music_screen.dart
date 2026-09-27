import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_artists_tab.dart';
import 'package:indigen_world_mobile/features/music/music_home_tab.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_library_tab.dart';
import 'package:indigen_world_mobile/features/music/music_search_screen.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// The four places inside the channel.
enum MusicTab { home, search, artists, library }

/// The Music channel, as a place rather than a page.
///
/// ── What changed, and why ─────────────────────────────────────────────────
/// It began as one grid of every published song, which answers "what is in
/// here" and nothing else. It became a library — the people as a shelf, what
/// you came back for at the top, everything else as a list you can read. And
/// now it has its own rail: Home, Search, Artists, Library, the four questions
/// anybody opens a music app with, each a thumb's reach away and each keeping
/// its place while you visit the others.
///
/// ── Why a second rail is not a second app ─────────────────────────────────
/// It is the app's own rail — the same glass, the same pill that stretches and
/// wiggles and can be dragged — worn in the channel's colour. Opened from the
/// shell, the two are one hero: the app rail does not disappear under the new
/// page, it stays where it is and its destinations turn into the channel's.
/// Back undoes it the same way.
///
/// Audiobooks come through here too. They are the same shape — one long audio
/// record with a transcript — and giving them a second, near-identical screen
/// would mean two players fighting over one set of speakers.
class MusicScreen extends ConsumerStatefulWidget {
  const MusicScreen({
    this.kind = CollectionKind.music,
    this.initialTab = MusicTab.home,
    super.key,
  });

  final CollectionKind kind;
  final MusicTab initialTab;

  @override
  ConsumerState<MusicScreen> createState() => _MusicScreenState();
}

class _MusicScreenState extends ConsumerState<MusicScreen>
    with SingleTickerProviderStateMixin {
  late int _tab = widget.initialTab.index;
  late final _visited = <int>{_tab};
  final _scrolls = List<ScrollController>.generate(
    MusicTab.values.length,
    (_) => ScrollController(),
  );

  // The shell's own tab change: a short fade and a slide of a few pixels, so
  // the two rails move the same way.
  late final AnimationController _switch = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
  )..value = 1;
  late final Animation<double> _fade = Tween<double>(
    begin: 0.6,
    end: 1,
  ).animate(CurvedAnimation(parent: _switch, curve: AppMotion.arrive));
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0.02, 0),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _switch, curve: AppMotion.arrive));

  @override
  void dispose() {
    for (final scroll in _scrolls) {
      scroll.dispose();
    }
    _switch.dispose();
    super.dispose();
  }

  void _select(int index) {
    if (index == _tab) {
      // Already here: the rail's second tap means "back to the top", as it
      // does everywhere else in the app.
      final scroll = _scrolls[index];
      if (scroll.hasClients && scroll.offset > 0) {
        scroll.animateTo(
          0,
          duration: motionOr(context, AppMotion.emphasized),
          curve: AppMotion.arrive,
        );
      }
      HapticFeedback.selectionClick();
      return;
    }
    setState(() {
      _tab = index;
      _visited.add(index);
    });
    if (motionAllowed(context)) _switch.forward(from: 0);
  }

  Widget _tabAt(int index, Color accent) {
    if (!_visited.contains(index)) return const SizedBox.shrink();
    final kind = widget.kind;
    final Widget tab = switch (MusicTab.values[index]) {
      MusicTab.home => MusicHomeTab(
        kind: kind,
        items: ref.watch(playableMusicProvider(kind)),
        accent: accent,
        scrollController: _scrolls[index],
        onBrowseArtists: () => _select(MusicTab.artists.index),
        onRetry: () => ref.invalidate(
          kind == CollectionKind.audiobooks
              ? audiobookCollectionProvider
              : musicCollectionProvider,
        ),
      ),
      MusicTab.search => MusicSearchScreen(
        kind: kind,
        accent: accent,
        scrollController: _scrolls[index],
      ),
      MusicTab.artists => MusicArtistsTab(
        kind: kind,
        accent: accent,
        scrollController: _scrolls[index],
      ),
      MusicTab.library => MusicLibraryTab(
        kind: kind,
        accent: accent,
        scrollController: _scrolls[index],
      ),
    };
    final active = index == _tab;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Home opens on a dark stage; the other tabs on the page's own ground.
      value: index == MusicTab.home.index
          ? SystemUiOverlayStyle.light
          : brandOverlayStyle(context.brand),
      // A hidden tab is not on screen, so it may not fly heroes — the same
      // artist is on the Home shelf and in the Artists wall — and may not
      // tick: an equalizer nobody can see is battery nobody asked to spend.
      child: HeroMode(
        enabled: active,
        child: TickerMode(
          enabled: active,
          // Each tab opens its own window for entrances when it is first
          // visited, so a tab somebody reaches later still deals itself in.
          child: EntranceGate(child: tab),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final kind = widget.kind;
    final accent = musicChannelColor(brand, kind);
    final people = kind == CollectionKind.audiobooks ? 'Readers' : 'Artists';

    return PopScope<void>(
      // Back from another tab goes Home first, the way the app rail's does
      // from Explore; back from Home leaves the channel.
      canPop: _tab == MusicTab.home.index,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _select(MusicTab.home.index);
      },
      child: Scaffold(
        backgroundColor: brand.background,
        extendBody: true,
        body: FadeTransition(
          opacity: _fade,
          child: SlideTransition(
            position: _slide,
            child: IndexedStack(
              index: _tab,
              children: [
                for (var index = 0; index < MusicTab.values.length; index++)
                  _tabAt(index, accent),
              ],
            ),
          ),
        ),
        bottomNavigationBar: FrostedNavBar(
          currentIndex: _tab,
          onTap: _select,
          accent: accent,
          heroTag: kAppRailHeroTag,
          items: [
            const FrostedNavBarItem(
              icon: Icons.home_outlined,
              selectedIcon: Icons.home_rounded,
              label: 'Home',
              motion: NavIconMotion.bounce,
            ),
            const FrostedNavBarItem(
              icon: Icons.search_rounded,
              selectedIcon: Icons.manage_search_rounded,
              label: 'Search',
              motion: NavIconMotion.turn,
            ),
            FrostedNavBarItem(
              icon: kind == CollectionKind.audiobooks
                  ? Icons.record_voice_over_outlined
                  : Icons.people_outline_rounded,
              selectedIcon: kind == CollectionKind.audiobooks
                  ? Icons.record_voice_over_rounded
                  : Icons.people_alt_rounded,
              label: people,
              motion: NavIconMotion.pop,
            ),
            const FrostedNavBarItem(
              icon: Icons.library_music_outlined,
              selectedIcon: Icons.library_music_rounded,
              label: 'Library',
              motion: NavIconMotion.flip,
            ),
          ],
        ),
      ),
    );
  }
}
