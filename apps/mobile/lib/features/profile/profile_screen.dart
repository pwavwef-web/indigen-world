import 'dart:ui';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
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
import 'package:indigen_world_mobile/features/community/edit_community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';
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

  /// The Profile destination's index, named rather than written as a literal:
  /// two other places switch to it, and a bare `1` is the kind of thing that
  /// survives a reorder of the rail and quietly starts opening Adverts.
  static const _profileIndex = 1;

  static const _titles = ['Overview', 'Profile', 'Adverts', 'Settings'];

  /// ── Why "Profile" and not "Community" ─────────────────────────────────────
  /// Because the member's community identity had three front doors — a button
  /// on Overview, a button on this tab, and a row in Settings — and three doors
  /// into one room means nobody knows which one is *the* one, or whether the
  /// three of them do the same thing. They now do not exist: this tab is the
  /// only place the identity is viewed, edited, previewed or set up.
  ///
  /// It is deliberately not named Community. That word already belongs to a
  /// destination in the app's own shell — the room everybody is in — and this is
  /// the opposite thing: the one page in it that is only about you. The badge
  /// icon says the same, and is nothing like the shell's `groups` glyph.
  static const _destinations = <FrostedNavBarItem>[
    FrostedNavBarItem(
      icon: Icons.dashboard_outlined,
      selectedIcon: Icons.dashboard_rounded,
      label: 'Overview',
    ),
    FrostedNavBarItem(
      icon: Icons.badge_outlined,
      selectedIcon: Icons.badge_rounded,
      label: 'Profile',
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
      // Was pinned to dark icons, which are invisible on the dark palette's
      // near-black bars. The shared helper resolves both from the theme.
      value: brandOverlayStyle(context.brand),
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
      onAccountAction: data.signedIn ? _goToProfileTab : _signIn,
      onOpenSavedWords: _openSavedWords,
      onOpenContributions: _openContributions,
      onOpenApproved: _openApproved,
    ),
    _profileIndex => _ProfileTab(
      key: const ValueKey('profile-identity'),
      data: data,
      onSetUp: _openProfileSetup,
      onEdit: _openEditProfile,
      onPreview: _openPublicProfile,
      onOpenSavedPosts: _openSavedPosts,
      onSignIn: _signIn,
    ),
    2 => const AdsScreen(key: ValueKey('profile-ads')),
    _ => _SettingsTab(
      key: const ValueKey('profile-settings'),
      data: data,
      onOpenSettings: _openSettings,
      onAccountAction: data.signedIn ? _signOut : _signIn,
    ),
  };

  /// Overview's one identity affordance: it points at the Profile tab rather
  /// than opening a profile screen of its own. A signpost is not a second front
  /// door — everything that can be *done* to the identity still happens in one
  /// place, and the member ends up looking at the place it happens.
  void _goToProfileTab() {
    if (_selectedIndex == _profileIndex) return;
    HapticFeedback.selectionClick();
    setState(() => _selectedIndex = _profileIndex);
  }

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

  /// Claims a handle, for somebody who has never had one.
  void _openProfileSetup() {
    if (ref.read(currentUidProvider) == null) {
      _signIn();
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const CommunitySetupScreen()),
    );
  }

  /// The editor. The only route to it in the app.
  void _openEditProfile() {
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    if (profile == null) {
      _openProfileSetup();
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => EditCommunityProfileScreen(profile: profile),
      ),
    );
  }

  /// The public page, exactly as everybody else sees it.
  ///
  /// Worth its own action rather than being folded into the editor: a form
  /// shows a member their fields, and what they actually want to know before
  /// they post is what a stranger sees.
  void _openPublicProfile() {
    final uid = ref.read(currentUidProvider);
    if (uid == null) {
      _signIn();
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => CommunityProfileScreen(uid: uid)),
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
        // The top of the wash used to be a literal cream, which is the right
        // warmth on plaster and a grey haze on charcoal — the whitish patch
        // behind every profile page in dark mode.
        gradient: BrandGradients.pageWash(context.brand),
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
    padding: EdgeInsets.fromLTRB(
      18,
      8,
      18,
      shellBottomReserve(context) + 28,
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
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onAccountAction,
              icon: Icon(
                data.signedIn ? Icons.badge_rounded : Icons.login_rounded,
              ),
              label: Text(
                data.signedIn
                    ? 'Go to your profile'
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

/// The one place the member's community identity lives.
///
/// Everything that used to be scattered across three screens is here and only
/// here: what the profile says, how complete it is, the way into the editor, and
/// the way to see the public page a stranger sees. The two buttons are
/// deliberately different verbs — *Edit* changes it, *Preview* does not — because
/// the commonest thing anybody wants before they post is to check, and a page
/// where checking means opening a form full of their own text is a page that
/// invites accidental edits.
class _ProfileTab extends StatelessWidget {
  const _ProfileTab({
    required this.data,
    required this.onSetUp,
    required this.onEdit,
    required this.onPreview,
    required this.onOpenSavedPosts,
    required this.onSignIn,
    super.key,
  });

  final _ProfileViewData data;
  final VoidCallback onSetUp;
  final VoidCallback onEdit;
  final VoidCallback onPreview;
  final VoidCallback onOpenSavedPosts;
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    final profile = data.communityProfile;
    return ListView(
      key: const PageStorageKey('profile-identity-scroll'),
      padding: EdgeInsets.fromLTRB(
        18,
        8,
        18,
        shellBottomReserve(context) + 28,
      ),
      children: [
        const _TabIntro(
          icon: Icons.badge_rounded,
          eyebrow: 'YOUR COMMUNITY IDENTITY',
          title: 'Be known. Stay connected.',
        ),
        const SizedBox(height: 14),
        _GlassPanel(
          child: profile == null
              ? _EmptyIdentity(
                  signedIn: data.signedIn,
                  onOpen: data.signedIn ? onSetUp : onSignIn,
                )
              : _IdentityCard(
                  profile: profile,
                  onEdit: onEdit,
                  onPreview: onPreview,
                ),
        ),
        if (profile != null) ...[
          const SizedBox(height: 14),
          _ProfileCompleteness(profile: profile, onEdit: onEdit),
        ],
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

class _IdentityCard extends StatelessWidget {
  const _IdentityCard({
    required this.profile,
    required this.onEdit,
    required this.onPreview,
  });

  final CommunityProfile profile;
  final VoidCallback onEdit;
  final VoidCallback onPreview;

  @override
  Widget build(BuildContext context) => Column(
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
          if (profile.mark != VerifiedMark.none)
            VerifiedBadge(mark: profile.mark, size: 20),
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
              _InfoPill(icon: Icons.translate_rounded, label: profile.dialect),
          ],
        ),
      ],
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_rounded, size: 18),
              label: const Text('Edit profile'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onPreview,
              icon: const Icon(Icons.visibility_outlined, size: 18),
              label: const Text('Preview'),
            ),
          ),
        ],
      ),
    ],
  );
}

/// How much of the identity is actually filled in, and the one thing to do next.
///
/// ── Why a member is shown this at all ─────────────────────────────────────
/// Because the editor is a form with seven optional fields and a form full of
/// optional fields gets a name typed into it and nothing else. That is not
/// laziness: nothing on the page said which of the seven were worth the effort,
/// or what any of them changes. A photo is the difference between a post
/// somebody reads and a post somebody scrolls past, and a dialect is how the
/// project knows which Kasem a contribution is in — those two are worth asking
/// for by name.
///
/// It is a nudge and not a gate. Everything works at 40%, the bar never turns
/// red, and there is no badge for finishing: a member who wants to be a grey
/// circle called Amina is allowed to be one.
class _ProfileCompleteness extends StatelessWidget {
  const _ProfileCompleteness({required this.profile, required this.onEdit});

  final CommunityProfile profile;
  final VoidCallback onEdit;

  /// The parts, in the order they are worth having.
  List<(String label, bool done)> get _steps => [
    ('A name', profile.displayName.trim().isNotEmpty),
    ('A photo', profile.avatarUrl?.isNotEmpty ?? false),
    ('A few words about you', profile.bio.trim().isNotEmpty),
    ('Where you are', profile.location.trim().isNotEmpty),
    ('The Kasem you speak', profile.dialect.trim().isNotEmpty),
    ('A verified number', profile.phoneVerified),
  ];

  @override
  Widget build(BuildContext context) {
    final steps = _steps;
    final done = steps.where((step) => step.$2).length;
    final missing = steps.where((step) => !step.$2).toList(growable: false);
    final complete = missing.isEmpty;

    return _GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Eyebrow(text: 'YOUR PROFILE'),
          const SizedBox(height: 7),
          Text(
            complete
                ? 'Nothing left to add.'
                : '$done of ${steps.length} filled in.',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: done / steps.length,
              minHeight: 7,
              backgroundColor: context.brand.accent.withValues(alpha: 0.12),
              valueColor: AlwaysStoppedAnimation<Color>(
                complete ? context.brand.success : context.brand.accent,
              ),
            ),
          ),
          if (!complete) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                // Only the first three. Six grey chips is a list of failures.
                for (final step in missing.take(3))
                  _InfoPill(icon: Icons.add_rounded, label: step.$1),
              ],
            ),
            const SizedBox(height: 14),
            // The verified mark is the one part of this the editor cannot
            // grant, so the button says what it does rather than promising to
            // finish the list.
            OutlinedButton.icon(
              onPressed: onEdit,
              icon: const Icon(Icons.edit_rounded, size: 18),
              label: const Text('Add the rest'),
            ),
          ],
        ],
      ),
    );
  }
}

class _SettingsTab extends StatelessWidget {
  const _SettingsTab({
    required this.data,
    required this.onOpenSettings,
    required this.onAccountAction,
    super.key,
  });

  final _ProfileViewData data;
  final VoidCallback onOpenSettings;
  final VoidCallback onAccountAction;

  @override
  Widget build(BuildContext context) => ListView(
    key: const PageStorageKey('profile-settings-scroll'),
    padding: EdgeInsets.fromLTRB(
      18,
      8,
      18,
      shellBottomReserve(context) + 28,
    ),
    children: [
      const _TabIntro(
        icon: Icons.shield_moon_rounded,
        eyebrow: 'CONTROL CENTRE',
        title: 'Private by design.',
      ),
      const SizedBox(height: 14),
      // The community profile is emphatically *not* offered here any more. It
      // had a row on this tab, a button on Overview and a row inside App
      // settings, which is three doors into one room; it now has one, on the
      // Profile tab next door.
      _ActionTile(
        icon: Icons.tune_rounded,
        title: 'App settings',
        subtitle: 'Notifications, privacy, licences',
        onTap: onOpenSettings,
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
