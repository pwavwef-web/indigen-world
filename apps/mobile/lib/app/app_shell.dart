import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_screen.dart';
import 'package:indigen_world_mobile/features/learn/learn_screen.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, this.initialIndex = 3});

  final int initialIndex;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell>
    with SingleTickerProviderStateMixin {
  late int _selectedIndex;
  late final AnimationController _transitionController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  /// Account lives in the top-right orb now, so the rail carries only the five
  /// content destinations.
  static const _screens = <Widget>[
    ExploreScreen(),
    LearnScreen(),
    CollectionScreen(),
    CommunityScreen(),
    ContributeScreen(reserveTopRight: true),
  ];

  static const _destinations = <FrostedNavBarItem>[
    FrostedNavBarItem(
      icon: Icons.play_circle_outline_rounded,
      selectedIcon: Icons.play_circle_fill_rounded,
      label: 'Explore',
    ),
    FrostedNavBarItem(
      icon: Icons.school_outlined,
      selectedIcon: Icons.school_rounded,
      label: 'Learn',
    ),
    FrostedNavBarItem(
      icon: Icons.collections_bookmark_outlined,
      selectedIcon: Icons.collections_bookmark_rounded,
      label: 'Collection',
    ),
    FrostedNavBarItem(
      icon: Icons.forum_outlined,
      selectedIcon: Icons.forum_rounded,
      label: 'Community',
    ),
    FrostedNavBarItem(
      icon: Icons.add_circle_outline_rounded,
      selectedIcon: Icons.add_circle_rounded,
      label: 'Contribute',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialIndex.clamp(0, _screens.length - 1);
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
    setState(() => _selectedIndex = index);
    _transitionController.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  @override
  Widget build(BuildContext context) {
    final onExplore = _selectedIndex == 0;
    return AnnotatedRegion<SystemUiOverlayStyle>(
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
                child: IndexedStack(index: _selectedIndex, children: _screens),
              ),
            ),
            Positioned(
              top: MediaQuery.paddingOf(context).top + 6,
              right: kProfileOrbInset,
              child: ProfileOrb(onDark: onExplore),
            ),
          ],
        ),
        bottomNavigationBar: FrostedNavBar(
          currentIndex: _selectedIndex,
          onTap: _selectDestination,
          items: _destinations,
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
