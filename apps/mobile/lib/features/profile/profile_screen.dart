import 'dart:ui';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/profile/my_contributions_screen.dart';
import 'package:indigen_world_mobile/features/profile/saved_words_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  var _selectedIndex = 0;

  static const _titles = ['Overview', 'Community', 'Adverts', 'Settings'];

  static const _destinations = <FrostedNavBarItem>[
    FrostedNavBarItem(
      icon: Icons.person_outline_rounded,
      selectedIcon: Icons.person_rounded,
      label: 'Overview',
    ),
    FrostedNavBarItem(
      icon: Icons.groups_outlined,
      selectedIcon: Icons.groups_rounded,
      label: 'Community',
    ),
    FrostedNavBarItem(
      icon: Icons.campaign_outlined,
      selectedIcon: Icons.campaign_rounded,
      label: 'Adverts',
    ),
    FrostedNavBarItem(
      icon: Icons.tune_outlined,
      selectedIcon: Icons.tune_rounded,
      label: 'Settings',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final savedCount =
        ref.watch(savedDictionaryEntryIdsProvider).asData?.value.length ?? 0;
    final contributions =
        ref.watch(myCollectionContributionsProvider).asData?.value ??
        const <CollectionContributionRecord>[];
    final contributionCount = contributions.length;
    // Counted rather than stubbed at zero: a member who has had work approved
    // and sees "0 Approved" on their own profile has been told the project
    // lost it.
    final approvedCount = contributions.where(isApprovedContribution).length;
    final user = ref.watch(authStateProvider).asData?.value;
    final communityProfile = ref
        .watch(myCommunityProfileProvider)
        .asData
        ?.value;
    final data = _ProfileViewData(
      user: user,
      communityProfile: communityProfile,
      savedCount: savedCount,
      contributionCount: contributionCount,
      approvedCount: approvedCount,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        systemNavigationBarColor: context.brand.background,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        extendBody: true,
        backgroundColor: context.brand.background,
        body: Stack(
          children: [
            const Positioned.fill(child: _ProfileBackdrop()),
            SafeArea(
              bottom: false,
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Column(
                    children: [
                      _ProfileTopBar(
                        title: _titles[_selectedIndex],
                        onBack: () => Navigator.of(context).maybePop(),
                      ),
                      Expanded(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 260),
                          switchInCurve: Curves.easeOutCubic,
                          switchOutCurve: Curves.easeInCubic,
                          transitionBuilder: (child, animation) =>
                              FadeTransition(
                                opacity: animation,
                                child: SlideTransition(
                                  position: Tween<Offset>(
                                    begin: const Offset(0.025, 0),
                                    end: Offset.zero,
                                  ).animate(animation),
                                  child: child,
                                ),
                              ),
                          child: _buildDestination(data),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        bottomNavigationBar: FrostedNavBar(
          currentIndex: _selectedIndex,
          onTap: (index) {
            if (index == _selectedIndex) return;
            HapticFeedback.selectionClick();
            setState(() => _selectedIndex = index);
          },
          items: _destinations,
        ),
      ),
    );
  }

  Widget _buildDestination(_ProfileViewData data) => switch (_selectedIndex) {
    0 => _OverviewTab(
      key: const ValueKey('profile-overview'),
      data: data,
      onAccountAction: data.signedIn ? _openCommunity : _signIn,
      onOpenSavedWords: _openSavedWords,
      onOpenContributions: _openContributions,
      onOpenApproved: _openApproved,
    ),
    1 => _CommunityTab(
      key: const ValueKey('profile-community'),
      data: data,
      onOpenCommunity: _openCommunity,
      onOpenSavedPosts: _openSavedPosts,
    ),
    2 => const AdsScreen(key: ValueKey('profile-ads')),
    _ => _SettingsTab(
      key: const ValueKey('profile-settings'),
      data: data,
      onOpenSettings: _openSettings,
      onOpenCommunity: _openCommunity,
      onAccountAction: data.signedIn ? _signOut : _signIn,
    ),
  };

  Future<void> _signIn() async {
    final signedIn = await showSignInSheet(context);
    if ((signedIn ?? false) && mounted) {
      _showMessage('Signed in. Welcome to Indigen World.');
    }
  }

  Future<void> _signOut() async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Sign out?',
      message: 'Public learning stays available in guest mode.',
      confirmLabel: 'Sign out',
    );
    if (confirmed != true) return;
    await unregisterThisDevice(ref);
    await ref.read(authRepositoryProvider)?.signOut();
    if (mounted) _showMessage('Signed out.');
  }

  void _openCommunity() {
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    final uid = ref.read(currentUidProvider);
    if (uid == null) {
      _signIn();
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => profile == null
            ? const CommunitySetupScreen()
            : CommunityProfileScreen(uid: uid),
      ),
    );
  }

  void _openSavedPosts() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const SavedPostsScreen()),
    );
  }

  void _openSavedWords() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const SavedWordsScreen()),
    );
  }

  void _openContributions() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const MyContributionsScreen(),
      ),
    );
  }

  void _openApproved() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const MyContributionsScreen(approvedOnly: true),
      ),
    );
  }

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const SettingsScreen()),
    );
  }

  void _showMessage(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _ProfileViewData {
  const _ProfileViewData({
    required this.user,
    required this.communityProfile,
    required this.savedCount,
    required this.contributionCount,
    required this.approvedCount,
  });

  final User? user;
  final CommunityProfile? communityProfile;
  final int savedCount;
  final int contributionCount;
  final int approvedCount;

  bool get signedIn => user != null;

  String get name {
    final communityName = communityProfile?.displayName.trim();
    if (communityName != null && communityName.isNotEmpty) return communityName;
    final authName = user?.displayName?.trim();
    if (authName != null && authName.isNotEmpty) return authName;
    return signedIn ? 'Indigen World member' : 'Guest learner';
  }

  String get detail => signedIn
      ? (communityProfile?.handle ?? user?.email ?? 'Signed in')
      : 'Kasem · $appEnvironment environment';
}

class _ProfileBackdrop extends StatelessWidget {
  const _ProfileBackdrop();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [const Color(0xFFFFFCF3), context.brand.background],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -74,
            top: 80,
            child: _GlowOrb(
              size: 220,
              color: context.brand.gold.withValues(alpha: 0.1),
            ),
          ),
          Positioned(
            left: -92,
            bottom: 110,
            child: _GlowOrb(
              size: 240,
              color: context.brand.accent.withValues(alpha: 0.08),
            ),
          ),
          Positioned(
            right: 20,
            bottom: 170,
            child: Opacity(
              opacity: 0.04,
              child: Text(
                '✣',
                style: TextStyle(
                  color: context.brand.terracotta,
                  fontSize: 118,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _GlowOrb extends StatelessWidget {
  const _GlowOrb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => ImageFiltered(
    imageFilter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    ),
  );
}

class _ProfileTopBar extends StatelessWidget {
  const _ProfileTopBar({required this.title, required this.onBack});

  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
          decoration: BoxDecoration(
            color: context.brand.surface.withValues(alpha: 0.86),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: context.brand.border),
            boxShadow: [
              BoxShadow(
                color: context.brand.shadow.withValues(
                  alpha: context.brand.isDark ? 0.4 : 0.07,
                ),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Back to the app',
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'YOUR SPACE',
                      style: TextStyle(
                        color: context.brand.terracotta,
                        fontSize: 8,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.3,
                      ),
                    ),
                    Text(
                      title,
                      style: TextStyle(
                        color: context.brand.accent,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [
                      BrandColors.heritageGreen,
                      BrandColors.savannahGreen,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.auto_awesome_rounded,
                  color: context.brand.gold,
                  size: 18,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.data,
    required this.onAccountAction,
    required this.onOpenSavedWords,
    required this.onOpenContributions,
    required this.onOpenApproved,
    super.key,
  });

  final _ProfileViewData data;
  final VoidCallback onAccountAction;
  final VoidCallback onOpenSavedWords;
  final VoidCallback onOpenContributions;
  final VoidCallback onOpenApproved;

  @override
  Widget build(BuildContext context) => ListView(
    key: const PageStorageKey('profile-overview-scroll'),
    padding: const EdgeInsets.fromLTRB(
      18,
      8,
      18,
      kFrostedNavBarReservedSpace + 28,
    ),
    children: [
      _ProfileHero(data: data),
      const SizedBox(height: 15),
      Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: Icons.bookmark_rounded,
              value: '${data.savedCount}',
              label: 'Saved words',
              color: context.brand.terracotta,
              onTap: onOpenSavedWords,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _StatCard(
              icon: Icons.outbox_rounded,
              value: '${data.contributionCount}',
              label: 'Contributions',
              color: context.brand.success,
              onTap: onOpenContributions,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _StatCard(
              icon: Icons.stars_rounded,
              value: '${data.approvedCount}',
              label: 'Approved',
              color: context.brand.gold,
              onTap: onOpenApproved,
            ),
          ),
        ],
      ),
      const SizedBox(height: 15),
      _GlassPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Eyebrow(text: 'NEXT BEST STEP'),
            const SizedBox(height: 7),
            Text(
              data.signedIn
                  ? data.communityProfile == null
                        ? 'Choose the name your community will know.'
                        : 'Your community identity is ready.'
                  : 'Carry your learning across devices.',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 7),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onAccountAction,
              icon: Icon(
                data.signedIn ? Icons.groups_rounded : Icons.login_rounded,
              ),
              label: Text(
                data.signedIn
                    ? data.communityProfile == null
                          ? 'Create community profile'
                          : 'Open community profile'
                    : 'Sign in or create an account',
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      _ActionTile(
        icon: Icons.menu_book_rounded,
        title: 'Saved words',
        subtitle: '${data.savedCount} kept on this device',
        onTap: onOpenSavedWords,
      ),
      const SizedBox(height: 10),
      _ActionTile(
        icon: Icons.outbox_rounded,
        title: 'Your contributions',
        subtitle: '${data.contributionCount} sent for review',
        onTap: onOpenContributions,
      ),
    ],
  );
}

class _CommunityTab extends StatelessWidget {
  const _CommunityTab({
    required this.data,
    required this.onOpenCommunity,
    required this.onOpenSavedPosts,
    super.key,
  });

  final _ProfileViewData data;
  final VoidCallback onOpenCommunity;
  final VoidCallback onOpenSavedPosts;

  @override
  Widget build(BuildContext context) {
    final profile = data.communityProfile;
    return ListView(
      key: const PageStorageKey('profile-community-scroll'),
      padding: const EdgeInsets.fromLTRB(
        18,
        8,
        18,
        kFrostedNavBarReservedSpace + 28,
      ),
      children: [
        const _TabIntro(
          icon: Icons.diversity_3_rounded,
          eyebrow: 'COMMUNITY IDENTITY',
          title: 'Be known. Stay connected.',
        ),
        const SizedBox(height: 14),
        _GlassPanel(
          child: profile == null
              ? _EmptyIdentity(signedIn: data.signedIn, onOpen: onOpenCommunity)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _CommunityAvatar(profile: profile),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                profile.displayName,
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                profile.handle,
                                style: TextStyle(
                                  color: context.brand.terracotta,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (profile.isVerified)
                          Icon(
                            Icons.verified_rounded,
                            color: context.brand.success,
                          ),
                      ],
                    ),
                    if (profile.bio.trim().isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text(profile.bio),
                    ],
                    if (profile.location.trim().isNotEmpty ||
                        profile.dialect.trim().isNotEmpty) ...[
                      const SizedBox(height: 13),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (profile.location.trim().isNotEmpty)
                            _InfoPill(
                              icon: Icons.location_on_outlined,
                              label: profile.location,
                            ),
                          if (profile.dialect.trim().isNotEmpty)
                            _InfoPill(
                              icon: Icons.translate_rounded,
                              label: profile.dialect,
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: onOpenCommunity,
                      icon: const Icon(Icons.arrow_outward_rounded),
                      label: const Text('Open public profile'),
                    ),
                  ],
                ),
        ),
        const SizedBox(height: 14),
        _ActionTile(
          icon: Icons.bookmarks_rounded,
          title: 'Saved community posts',
          subtitle: 'Conversations you kept',
          onTap: onOpenSavedPosts,
        ),
      ],
    );
  }
}

class _SettingsTab extends StatelessWidget {
  const _SettingsTab({
    required this.data,
    required this.onOpenSettings,
    required this.onOpenCommunity,
    required this.onAccountAction,
    super.key,
  });

  final _ProfileViewData data;
  final VoidCallback onOpenSettings;
  final VoidCallback onOpenCommunity;
  final VoidCallback onAccountAction;

  @override
  Widget build(BuildContext context) => ListView(
    key: const PageStorageKey('profile-settings-scroll'),
    padding: const EdgeInsets.fromLTRB(
      18,
      8,
      18,
      kFrostedNavBarReservedSpace + 28,
    ),
    children: [
      const _TabIntro(
        icon: Icons.shield_moon_rounded,
        eyebrow: 'CONTROL CENTRE',
        title: 'Private by design.',
      ),
      const SizedBox(height: 14),
      _ActionTile(
        icon: Icons.tune_rounded,
        title: 'App settings',
        subtitle: 'Notifications, privacy, licences',
        onTap: onOpenSettings,
      ),
      const SizedBox(height: 10),
      _ActionTile(
        icon: Icons.manage_accounts_rounded,
        title: data.communityProfile == null
            ? 'Community profile setup'
            : 'Manage community profile',
        subtitle: data.communityProfile == null
            ? 'Choose a public handle'
            : data.communityProfile!.handle,
        onTap: onOpenCommunity,
      ),
      const SizedBox(height: 14),
      _GlassPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Eyebrow(text: 'ACCOUNT SESSION'),
            const SizedBox(height: 7),
            Text(
              data.signedIn ? 'Signed in securely' : 'Using guest mode',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(
              data.signedIn
                  ? data.user?.email ?? 'Account active'
                  : 'Public learning stays open.',
              style: TextStyle(color: context.brand.mutedInk),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: data.signedIn
                  ? OutlinedButton.icon(
                      onPressed: onAccountAction,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('Sign out'),
                    )
                  : FilledButton.icon(
                      onPressed: onAccountAction,
                      icon: const Icon(Icons.login_rounded),
                      label: const Text('Sign in or create an account'),
                    ),
            ),
          ],
        ),
      ),
    ],
  );
}

class _ProfileHero extends StatelessWidget {
  const _ProfileHero({required this.data});

  final _ProfileViewData data;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(28),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFF082F25),
          BrandColors.heritageGreen,
          Color(0xFF17644C),
        ],
      ),
      boxShadow: const [
        BoxShadow(
          color: Color(0x320B3D2E),
          blurRadius: 28,
          offset: Offset(0, 14),
        ),
      ],
    ),
    child: Stack(
      children: [
        const Positioned(
          right: -8,
          bottom: -35,
          child: Opacity(
            opacity: 0.1,
            child: Text(
              '✣',
              style: TextStyle(
                color: Colors.white,
                fontSize: 132,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _ProfileAvatar(
                  user: data.user,
                  communityProfile: data.communityProfile,
                ),
                const SizedBox(width: 15),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        data.signedIn ? 'WELCOME BACK' : 'WELCOME, EXPLORER',
                        style: TextStyle(
                          color: context.brand.gold,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.15,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        data.name,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        data.detail,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.68),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.09),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white12),
              ),
              child: Row(
                children: [
                  Icon(
                    data.signedIn
                        ? Icons.verified_user_rounded
                        : Icons.lock_outline_rounded,
                    color: context.brand.gold,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      data.signedIn
                          ? 'Your account is connected and ready to sync.'
                          : 'Guest mode keeps public learning open and useful.',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _ProfileAvatar extends StatelessWidget {
  const _ProfileAvatar({required this.user, required this.communityProfile});

  final User? user;
  final CommunityProfile? communityProfile;

  @override
  Widget build(BuildContext context) {
    final photoUrl = communityProfile?.avatarUrl ?? user?.photoURL;
    final displayName = communityProfile?.displayName.trim().isNotEmpty ?? false
        ? communityProfile!.displayName.trim()
        : user?.displayName?.trim();
    final initials = (displayName != null && displayName.isNotEmpty)
        ? displayName.characters.first.toUpperCase()
        : null;

    return Container(
      width: 76,
      height: 76,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          colors: [BrandColors.kenteGold, Color(0xFFFFE9A4)],
        ),
        boxShadow: [
          BoxShadow(
            color: context.brand.gold.withValues(alpha: 0.25),
            blurRadius: 18,
          ),
        ],
      ),
      child: ClipOval(
        child: ColoredBox(
          color: context.brand.success,
          child: photoUrl != null && photoUrl.isNotEmpty
              ? Image.network(
                  photoUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => _fallback(initials),
                )
              : _fallback(initials),
        ),
      ),
    );
  }

  Widget _fallback(String? initials) => Center(
    child: initials != null
        ? Text(
            initials,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w900,
            ),
          )
        : const Icon(Icons.person_rounded, color: Colors.white, size: 34),
  );
}

/// One of the three counts across the top of the overview.
///
/// Each one is now a door: a number nobody can act on is decoration, and
/// "Saved words: 12" with no way to see the twelve words is the clearest
/// example of that in the app.
class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GlassCard(
    onTap: onTap,
    accent: color,
    semanticLabel: '$label, $value',
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
    child: Column(
      children: [
        GlassIconPlate(icon: icon, color: color, size: 34),
        const SizedBox(height: 8),
        Text(value, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 2),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: TextStyle(color: context.brand.mutedInk, fontSize: 9),
        ),
      ],
    ),
  );
}

class _TabIntro extends StatelessWidget {
  const _TabIntro({
    required this.icon,
    required this.eyebrow,
    required this.title,
  });

  final IconData icon;
  final String eyebrow;
  final String title;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(24),
      gradient: LinearGradient(
        colors: [
          BrandColors.heritageGreen.withValues(alpha: 0.96),
          BrandColors.savannahGreen.withValues(alpha: 0.9),
        ],
      ),
      boxShadow: const [
        BoxShadow(
          color: Color(0x240B3D2E),
          blurRadius: 22,
          offset: Offset(0, 10),
        ),
      ],
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white12),
          ),
          child: Icon(icon, color: context.brand.gold),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow,
                style: TextStyle(
                  color: context.brand.gold,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// The profile's own panel, now a thin alias for the app's glass so this
/// screen and the community feed are made of the same material.
class _GlassPanel extends StatelessWidget {
  const _GlassPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      GlassSurface(padding: const EdgeInsets.all(18), child: child);
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      color: context.brand.terracotta,
      fontSize: 9,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.1,
    ),
  );
}

class _EmptyIdentity extends StatelessWidget {
  const _EmptyIdentity({required this.signedIn, required this.onOpen});

  final bool signedIn;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: context.brand.gold.withValues(alpha: 0.12),
          shape: BoxShape.circle,
        ),
        child: Icon(
          Icons.person_add_alt_1_rounded,
          color: context.brand.accent,
          size: 30,
        ),
      ),
      const SizedBox(height: 14),
      Text(
        signedIn ? 'Your public identity awaits' : 'Join the conversation',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 7),
      const SizedBox(height: 16),
      FilledButton.icon(
        onPressed: onOpen,
        icon: Icon(
          signedIn ? Icons.alternate_email_rounded : Icons.login_rounded,
        ),
        label: Text(
          signedIn ? 'Set up community profile' : 'Sign in to continue',
        ),
      ),
    ],
  );
}

class _CommunityAvatar extends StatelessWidget {
  const _CommunityAvatar({required this.profile});

  final CommunityProfile profile;

  @override
  Widget build(BuildContext context) => Container(
    width: 58,
    height: 58,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: context.brand.accent,
      shape: BoxShape.circle,
      border: Border.all(color: context.brand.gold, width: 2),
    ),
    child: profile.avatarUrl != null && profile.avatarUrl!.isNotEmpty
        ? Image.network(
            profile.avatarUrl!,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => _communityInitials(),
          )
        : _communityInitials(),
  );

  Widget _communityInitials() => Center(
    child: Text(
      profile.initials,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: context.brand.accent.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: context.brand.accent, size: 15),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) =>
      GlassRow(icon: icon, title: title, detail: subtitle, onTap: onTap);
}
