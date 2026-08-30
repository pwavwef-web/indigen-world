import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_screen.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/connection_banner.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

/// Index of the Community destination in the rail.
///
/// Community sits dead centre — it is the heart of the app, and the middle slot
/// is the easiest one to reach with a thumb. Everything else is arranged
/// around it: consume on the left (Explore, Learn), keep and give on the right
/// (Collection, Contribute).
const int kCommunityTabIndex = 2;

/// Index of the Learn destination.
///
/// Public for the same reason Community's is: a screen that answers a second
/// tap on its own rail entry has to be able to tell which entry that was.
const int kLearnTabIndex = 1;

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, this.initialIndex = kCommunityTabIndex});

  final int initialIndex;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell>
    with SingleTickerProviderStateMixin {
  late int _selectedIndex;
  late int _lastNonExploreIndex;
  late final AnimationController _transitionController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  /// Account lives in the top-right orb, so the rail carries only the content
  /// destinations — with Community at the centre.
  ///
  /// Five, and only ever five. The review desk used to sit here as a sixth for
  /// staff accounts, which made the rail a different shape depending on who was
  /// holding the phone, and put a tool nobody else can open in the one strip of
  /// the app everybody shares. It is reached from Contribute now, which is
  /// where the work it reviews comes from.
  static const _exploreIndex = 0;
  static const _collectionIndex = 3;
  static const _contributeIndex = 4;
  static const _destinationCount = 5;

  /// The destinations the member has actually opened.
  ///
  /// A tab nobody has been to is never built, so nothing it owns — a video
  /// decoder, an audio session, a stream subscription — can exist before
  /// somebody has asked to see it. Once visited a destination stays in the
  /// stack, which is what keeps scroll positions and half-finished work alive
  /// across tab switches.
  final _visited = <int>{};

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialIndex.clamp(0, _destinationCount - 1);
    _visited.add(_selectedIndex);
    _lastNonExploreIndex = _selectedIndex == _exploreIndex
        ? kCommunityTabIndex
        : _selectedIndex;
    _transitionController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    )..value = 1;
    final curve = CurvedAnimation(
      parent: _transitionController,
      curve: Curves.easeOutCubic,
    );
    _fadeAnimation = Tween(begin: 0.72, end: 1.0).animate(curve);
    _slideAnimation = Tween(
      begin: const Offset(0.025, 0),
      end: Offset.zero,
    ).animate(curve);
  }

  @override
  void dispose() {
    _transitionController.dispose();
    super.dispose();
  }

  void _selectDestination(int index) {
    if (index == _selectedIndex) {
      // Already here. Every feed in the app reads this as "take me back to the
      // top", which is the one thing a rail can be asked twice for.
      ref.read(tabReselectProvider.notifier).fire(index);
      ref.read(shellChromeVisibilityProvider.notifier).reveal();
      HapticFeedback.selectionClick();
      return;
    }
    // A rail one screen's scroll pushed away must not follow the member into
    // the next tab, where nothing they do would ever bring it back.
    ref.read(shellChromeVisibilityProvider.notifier).reveal();
    setState(() {
      if (_selectedIndex != _exploreIndex) {
        _lastNonExploreIndex = _selectedIndex;
      }
      _selectedIndex = index;
      _visited.add(index);
    });
    _transitionController.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  void _returnFromExplore() {
    if (_selectedIndex != _exploreIndex) return;
    _selectDestination(_lastNonExploreIndex);
  }

  /// The destination at [index], or an empty slot if the member has never been
  /// there.
  ///
  /// Explore is told outright whether it is the tab in front of the member.
  /// It stays in the stack once visited so a return lands on the same reel,
  /// but it is the one destination holding a video decoder and the audio
  /// session, and neither may keep running behind another tab.
  Widget _screenAt(int index) {
    if (!_visited.contains(index)) return const SizedBox.shrink();
    return switch (index) {
      _exploreIndex => ExploreScreen(isActive: _selectedIndex == index),
      kLearnTabIndex => const LearnScreen(),
      kCommunityTabIndex => const CommunityScreen(),
      _collectionIndex => const CollectionScreen(),
      _contributeIndex => const ContributeScreen(reserveTopRight: true),
      _ => const SizedBox.shrink(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final onExplore = _selectedIndex == _exploreIndex;
    // Feeds hide the rail while somebody reads on. The flag is the shell's
    // because the rail is, and the scroll that moves it happens a tab away.
    final chromeVisible = ref.watch(shellChromeVisibilityProvider);
    // Registering the device for push is a shell-level concern: it has to run
    // once the member is signed in, whichever tab they happen to be on.
    ref.watch(pushRegistrationProvider);
    // Drawing an alert that arrives mid-session is the same kind of concern,
    // but it does not wait for an account: broadcast announcements reach a
    // guest device through the topic.
    ref.watch(foregroundAlertsProvider);
    // A tapped push may arrive before any route can consume it, so it is parked
    // in a provider and routed from here once there is a router to route with.
    ref.listen<String?>(pendingPushRouteProvider, (_, route) {
      if (route == null) return;
      final pending = ref.read(pendingPushRouteProvider.notifier).take();
      if (pending != null) GoRouter.of(context).push(pending);
    });
    final unread =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;

    final l10n = AppLocalizations.of(context);
    final destinations = <FrostedNavBarItem>[
      FrostedNavBarItem(
        icon: Icons.play_circle_outline_rounded,
        selectedIcon: Icons.play_circle_fill_rounded,
        label: l10n.navExplore,
      ),
      FrostedNavBarItem(
        icon: Icons.school_outlined,
        selectedIcon: Icons.school_rounded,
        label: l10n.navLearn,
      ),
      FrostedNavBarItem(
        icon: Icons.forum_outlined,
        selectedIcon: Icons.forum_rounded,
        label: l10n.navCommunity,
        badgeCount: unread,
      ),
      FrostedNavBarItem(
        icon: Icons.collections_bookmark_outlined,
        selectedIcon: Icons.collections_bookmark_rounded,
        label: l10n.navCollection,
      ),
      FrostedNavBarItem(
        icon: Icons.add_circle_outline_rounded,
        selectedIcon: Icons.add_circle_rounded,
        label: l10n.navContribute,
      ),
    ];

    return PopScope<void>(
      // Explore is deliberately immersive. Its first back gesture restores the
      // tab the member came from instead of closing the app.
      canPop: !onExplore,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && onExplore) _returnFromExplore();
      },
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: onExplore
            ? SystemUiOverlayStyle.light
            : brandOverlayStyle(context.brand),
        child: Scaffold(
          // The glass rail floats over the content rather than sitting under it.
          extendBody: true,
          body: Stack(
            children: [
              if (!onExplore) const Positioned.fill(child: _AmbientMotifs()),
              FadeTransition(
                opacity: _fadeAnimation,
                child: SlideTransition(
                  position: _slideAnimation,
                  child: IndexedStack(
                    index: _selectedIndex,
                    children: [
                      for (var index = 0; index < _destinationCount; index++)
                        _screenAt(index),
                    ],
                  ),
                ),
              ),
              // The orb travels with the rest of the shell's furniture.
              //
              // It used to be the one piece that stayed: a reader who scrolled
              // on got the rail, the composer and the feed's own header out of
              // the way, and was left with a single floating button hovering
              // over the writing. Worse, a tab whose header slides up under it
              // has nowhere to put its own controls. Everything the shell owns
              // now leaves together and comes back together.
              Positioned(
                top: MediaQuery.paddingOf(context).top + 6,
                right: kProfileOrbInset,
                child: AnimatedSlide(
                  offset: chromeVisible ? Offset.zero : const Offset(0, -1.6),
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  child: AnimatedOpacity(
                    opacity: chromeVisible ? 1 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: IgnorePointer(
                      ignoring: !chromeVisible,
                      child: ProfileOrb(onDark: onExplore),
                    ),
                  ),
                ),
              ),
              // The connection state sits above the rail, and follows it down
              // whenever the rail is not there to sit above: on Explore, which
              // has none, and in a feed somebody is reading on through. A
              // banner left hovering over the gap the rail vacated is the one
              // piece of chrome that would still be pointing at furniture.
              AnimatedPositioned(
                duration: const Duration(milliseconds: 240),
                curve: Curves.easeOutCubic,
                left: 16,
                right: 16,
                bottom: onExplore
                    ? MediaQuery.paddingOf(context).bottom + 28
                    : chromeVisible
                    ? kFrostedNavBarReservedSpace + 6
                    : MediaQuery.paddingOf(context).bottom + 16,
                child: Center(child: ConnectionBanner(onDark: onExplore)),
              ),
            ],
          ),
          // Full-bleed reels should feel like a destination, not a tab with
          // chrome painted over it. Native back is the way home from Explore.
          bottomNavigationBar: onExplore
              ? null
              // Slides out of the frame rather than being taken out of the
              // layout: the body already extends behind it, so the rail can
              // leave and come back without a single row of the feed moving.
              : AnimatedSlide(
                  offset: chromeVisible ? Offset.zero : const Offset(0, 1),
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  child: IgnorePointer(
                    ignoring: !chromeVisible,
                    child: FrostedNavBar(
                      currentIndex: _selectedIndex,
                      onTap: _selectDestination,
                      items: destinations,
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}

class _AmbientMotifs extends StatelessWidget {
  const _AmbientMotifs();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Stack(
      children: [
        Positioned(
          top: 115,
          right: -34,
          child: TweenAnimationBuilder<double>(
            duration: const Duration(seconds: 7),
            tween: Tween(begin: -0.08, end: 0.08),
            builder: (context, angle, child) =>
                Transform.rotate(angle: angle, child: child),
            // Ground texture, not ornament: the motifs are drawn in the
            // page's own ink at an opacity that reads as paper grain. In the
            // old palette they were a terracotta and a gold glyph, which on a
            // pale ground were visible enough to be decoration.
            child: Opacity(
              opacity: context.brand.isDark ? 0.05 : 0.035,
              child: Text(
                '✣',
                style: TextStyle(fontSize: 132, color: context.brand.ink),
              ),
            ),
          ),
        ),
        Positioned(
          left: -20,
          bottom: 120,
          child: Opacity(
            opacity: context.brand.isDark ? 0.045 : 0.03,
            child: Text(
              'Ƹ',
              style: TextStyle(fontSize: 100, color: context.brand.ink),
            ),
          ),
        ),
      ],
    ),
  );
}
