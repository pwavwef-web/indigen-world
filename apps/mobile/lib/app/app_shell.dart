import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_screen.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
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

  /// Account lives in the top-right orb, so the rail carries only the five
  /// content destinations — with Community at the centre.
  static const _screens = <Widget>[
    ExploreScreen(),
    LearnScreen(),
    CommunityScreen(),
    CollectionScreen(),
    ContributeScreen(reserveTopRight: true),
  ];

  static const _exploreIndex = 0;

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialIndex.clamp(0, _screens.length - 1);
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
    if (index == _selectedIndex) return;
    setState(() {
      if (_selectedIndex != _exploreIndex) {
        _lastNonExploreIndex = _selectedIndex;
      }
      _selectedIndex = index;
    });
    _transitionController.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  void _returnFromExplore() {
    if (_selectedIndex != _exploreIndex) return;
    _selectDestination(_lastNonExploreIndex);
  }

  @override
  Widget build(BuildContext context) {
    final onExplore = _selectedIndex == _exploreIndex;
    // Registering the device for push is a shell-level concern: it has to run
    // once the member is signed in, whichever tab they happen to be on.
    ref.watch(pushRegistrationProvider);
    // A tapped push may arrive before any route can consume it, so it is parked
    // in a provider and routed from here once there is a router to route with.
    ref.listen<String?>(pendingPushRouteProvider, (_, route) {
      if (route == null) return;
      final pending = ref.read(pendingPushRouteProvider.notifier).take();
      if (pending != null) GoRouter.of(context).push(pending);
    });
    final unread =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;

    final destinations = <FrostedNavBarItem>[
      const FrostedNavBarItem(
        icon: Icons.play_circle_outline_rounded,
        selectedIcon: Icons.play_circle_fill_rounded,
        label: 'Explore',
      ),
      const FrostedNavBarItem(
        icon: Icons.school_outlined,
        selectedIcon: Icons.school_rounded,
        label: 'Learn',
      ),
      FrostedNavBarItem(
        icon: Icons.forum_outlined,
        selectedIcon: Icons.forum_rounded,
        label: 'Community',
        badgeCount: unread,
      ),
      const FrostedNavBarItem(
        icon: Icons.collections_bookmark_outlined,
        selectedIcon: Icons.collections_bookmark_rounded,
        label: 'Collection',
      ),
      const FrostedNavBarItem(
        icon: Icons.add_circle_outline_rounded,
        selectedIcon: Icons.add_circle_rounded,
        label: 'Contribute',
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
            : const SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarIconBrightness: Brightness.dark,
                systemNavigationBarColor: BrandColors.plasterCream,
                systemNavigationBarIconBrightness: Brightness.dark,
              ),
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
                    children: _screens,
                  ),
                ),
              ),
              Positioned(
                top: MediaQuery.paddingOf(context).top + 6,
                right: kProfileOrbInset,
                child: ProfileOrb(onDark: onExplore),
              ),
              // On Explore the rail is absent, so the connection state moves
              // down into the freed safe area without covering reel controls.
              Positioned(
                left: 16,
                right: 16,
                bottom: onExplore
                    ? MediaQuery.paddingOf(context).bottom + 28
                    : kFrostedNavBarReservedSpace + 6,
                child: Center(child: ConnectionBanner(onDark: onExplore)),
              ),
            ],
          ),
          // Full-bleed reels should feel like a destination, not a tab with
          // chrome painted over it. Native back is the way home from Explore.
          bottomNavigationBar: onExplore
              ? null
              : FrostedNavBar(
                  currentIndex: _selectedIndex,
                  onTap: _selectDestination,
                  items: destinations,
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
            child: const Opacity(
              opacity: 0.055,
              child: Text(
                '✣',
                style: TextStyle(fontSize: 132, color: BrandColors.terracotta),
              ),
            ),
          ),
        ),
        const Positioned(
          left: -20,
          bottom: 120,
          child: Opacity(
            opacity: 0.045,
            child: Text(
              'Ƹ',
              style: TextStyle(fontSize: 100, color: BrandColors.kenteGold),
            ),
          ),
        ),
      ],
    ),
  );
}
