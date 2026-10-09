import 'dart:ui';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_repository.dart';
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
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/contributor_scores.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/leaderboard_screen.dart';
import 'package:indigen_world_mobile/features/contribute/my_submissions_screen.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';
import 'package:indigen_world_mobile/features/explore/kept_reels_screen.dart';
import 'package:indigen_world_mobile/features/profile/saved_words_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:indigen_world_mobile/features/subscriptions/membership_screen.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// My Space's three destinations.
///
/// There were five: Overview, Profile, Adverts, Membership and Settings. The
/// first two were one subject split down the middle — the member's name and
/// numbers on one, their community identity on the other, a button on each
/// pointing at the other — and every count on Overview appeared twice, once as
/// a stat and once as a row. Adverts is a tool a handful of members use, and it
/// held a fifth of the bar everybody shares. So: You, which is the whole of the
/// member and everything they keep and make; Membership, untouched, because the
/// plans *are* that tab; and Settings.
enum ProfileTab {
  you('You', Icons.person_outline_rounded, Icons.person_rounded),
  membership(
    'Membership',
    Icons.favorite_border_rounded,
    Icons.favorite_rounded,
  ),
  settings('Settings', Icons.tune_outlined, Icons.tune_rounded);

  const ProfileTab(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({this.initialTab = ProfileTab.you, super.key});

  /// Where My Space opens. The shell's profile orb opens You; the Community
  /// drawer's Settings row opens Settings, so there is one Settings screen in
  /// the app rather than a second copy with its own app bar.
  final ProfileTab initialTab;

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  late var _tab = widget.initialTab;

  static final _destinations = <FrostedNavBarItem>[
    for (final tab in ProfileTab.values)
      FrostedNavBarItem(
        icon: tab.icon,
        selectedIcon: tab.selectedIcon,
        label: tab.label,
      ),
  ];

  @override
  Widget build(BuildContext context) {
    final savedCount =
        ref.watch(savedDictionaryEntryIdsProvider).asData?.value.length ?? 0;
    final contributions =
        ref.watch(myCollectionContributionsProvider).asData?.value ??
        const <CollectionContributionRecord>[];
    // The server's totals where it can give them: the list stops at fifty, and
    // an active word translator passes fifty in an afternoon.
    final totals =
        ref.watch(myContributionTotalsProvider).asData?.value ??
        (
          sent: contributions.length,
          approved: contributions
              .where((record) => contributionApproved(record.status))
              .length,
          capped: contributions.length >= kMyContributionsLimit,
        );
    final data = _ProfileViewData(
      user: ref.watch(authStateProvider).asData?.value,
      communityProfile: ref.watch(myCommunityProfileProvider).asData?.value,
      savedCount: savedCount,
      totals: totals,
      waitingCount: contributions
          .where(
            (record) =>
                contributionAwaitingReview(record.status) &&
                !contributionNeedsChanges(record.status),
          )
          .length,
      returnedCount: contributions
          .where((record) => contributionNeedsChanges(record.status))
          .length,
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
                        title: _tab.label,
                        onBack: () => Navigator.of(context).maybePop(),
                      ),
                      Expanded(
                        child: AnimatedSwitcher(
                          duration: motionOr(context, AppMotion.standard),
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
          currentIndex: _tab.index,
          onTap: (index) {
            final next = ProfileTab.values[index];
            if (next == _tab) return;
            HapticFeedback.selectionClick();
            setState(() => _tab = next);
          },
          items: _destinations,
        ),
      ),
    );
  }

  Widget _buildDestination(_ProfileViewData data) => switch (_tab) {
    ProfileTab.you => _YouTab(
      key: const ValueKey('profile-you'),
      data: data,
      onSignIn: _signIn,
      onSetUp: _openProfileSetup,
      onEdit: _openEditProfile,
      onPreview: _openPublicProfile,
      onOpen: _open,
    ),
    ProfileTab.membership => MembershipScreen(
      key: const ValueKey('profile-membership'),
      embedded: true,
      bottomPadding: shellBottomReserve(context) + 28,
    ),
    ProfileTab.settings => SettingsScreen(
      key: const ValueKey('profile-settings'),
      embedded: true,
      bottomPadding: shellBottomReserve(context) + 28,
    ),
  };

  Future<void> _signIn() async {
    final signedIn = await showSignInSheet(context);
    if ((signedIn ?? false) && mounted) {
      _showMessage('Signed in. Welcome to Indigen World.');
    }
  }

  /// Claims a handle, for somebody who has never had one.
  void _openProfileSetup() {
    if (ref.read(currentUidProvider) == null) {
      _signIn();
      return;
    }
    _open(const CommunitySetupScreen());
  }

  /// The editor. The only route to it in the app.
  void _openEditProfile() {
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    if (profile == null) {
      _openProfileSetup();
      return;
    }
    _open(EditCommunityProfileScreen(profile: profile));
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
    _open(CommunityProfileScreen(uid: uid));
  }

  void _open(Widget screen) =>
      Navigator.of(context)
          .push(MaterialPageRoute<void>(builder: (context) => screen));

  void _showMessage(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
}

class _ProfileViewData {
  const _ProfileViewData({
    required this.user,
    required this.communityProfile,
    required this.savedCount,
    required this.totals,
    required this.waitingCount,
    required this.returnedCount,
  });

  final User? user;
  final CommunityProfile? communityProfile;
  final int savedCount;
  final ContributionTotals totals;

  /// Submissions a reviewer has not reached yet.
  final int waitingCount;

  /// Submissions sent back to the member with a note.
  final int returnedCount;

  bool get signedIn => user != null;

  String get name {
    final communityName = communityProfile?.displayName.trim();
    if (communityName != null && communityName.isNotEmpty) return communityName;
    final authName = user?.displayName?.trim();
    if (authName != null && authName.isNotEmpty) return authName;
    return signedIn ? 'Indigen World member' : 'Guest learner';
  }

  /// The line under the name: the handle a member is known by, else the email
  /// they signed in with.
  ///
  /// A guest used to see "Kasem · production environment" here — the name of
  /// the Firebase project this build talks to, under their own name, which
  /// reads as something having gone wrong.
  String get detail => signedIn
      ? (communityProfile?.handle ?? user?.email ?? 'Signed in')
      : 'Browsing as a guest';
}

/// Everything about the member, and everything they keep and make, on one
/// scrolling page.
///
/// ── What is no longer here ──────────────────────────────────────────────────
/// Each count used to appear twice — as a stat card and again as a row under
/// it. A "Next best step" panel told members who had done everything that
/// their identity was ready, and a line under the name said the account was
/// "connected and ready to sync", which is true of every account and so says
/// nothing. The identity card that was a separate tab is the header now.
class _YouTab extends ConsumerWidget {
  const _YouTab({
    required this.data,
    required this.onSignIn,
    required this.onSetUp,
    required this.onEdit,
    required this.onPreview,
    required this.onOpen,
    super.key,
  });

  final _ProfileViewData data;
  final VoidCallback onSignIn;
  final VoidCallback onSetUp;
  final VoidCallback onEdit;
  final VoidCallback onPreview;
  final ValueChanged<Widget> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = data.communityProfile;
    final totals = data.totals;
    final downloadCount = ref.watch(downloadedIdsProvider).length;
    // Offered while a plan allows downloads, and kept for anybody who still
    // has some on the phone after their plan ended — they are theirs to play
    // or delete either way.
    final showDownloads =
        ref.watch(downloadsAllowedProvider) || downloadCount > 0;
    final campaigns =
        ref.watch(myAdCampaignsProvider).asData?.value ?? const <AdCampaign>[];
    final running = campaigns
        .where((campaign) => campaign.status == AdCampaignStatus.active)
        .length;

    return ListView(
      key: const PageStorageKey('profile-you-scroll'),
      padding: EdgeInsets.fromLTRB(18, 8, 18, shellBottomReserve(context) + 28),
      children: [
        _IdentityHero(
          data: data,
          onSignIn: onSignIn,
          onSetUp: onSetUp,
          onEdit: onEdit,
          onPreview: onPreview,
        ),
        if (profile != null && !_ProfileCompleteness.isComplete(profile)) ...[
          const SizedBox(height: 14),
          _ProfileCompleteness(profile: profile, onEdit: onEdit),
        ],
        const SizedBox(height: 15),
        // What the member has given the archive, at a glance. Each number is
        // a door to its own list, and nothing below repeats it.
        Row(
          children: [
            Expanded(
              child: _StatCard(
                icon: Icons.outbox_rounded,
                value: contributionCountLabel(
                  totals.sent,
                  capped: totals.capped,
                ),
                label: 'Contributions',
                color: context.brand.accent,
                onTap: () => onOpen(const MySubmissionsScreen()),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                icon: Icons.stars_rounded,
                value: contributionCountLabel(
                  totals.approved,
                  capped: totals.capped,
                ),
                label: 'Approved',
                color: context.brand.gold,
                onTap: () => onOpen(
                  const MySubmissionsScreen(
                    initialFilter: SubmissionFilter.approved,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _StatCard(
                icon: Icons.bolt_rounded,
                value: '${ref.watch(myContributionPointsProvider)}',
                label: 'Points',
                color: context.brand.terracotta,
                onTap: () => onOpen(const LeaderboardScreen()),
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        const _SectionLabel('YOUR LIBRARY'),
        const SizedBox(height: 9),
        _ActionTile(
          key: const ValueKey('library-saved-words'),
          icon: Icons.menu_book_rounded,
          title: 'Saved words',
          subtitle: data.savedCount == 0
              ? 'Words you keep from the dictionary'
              : '${data.savedCount} kept from the dictionary',
          onTap: () => onOpen(const SavedWordsScreen()),
        ),
        const SizedBox(height: 10),
        _ActionTile(
          key: const ValueKey('library-saved-posts'),
          icon: Icons.bookmarks_rounded,
          title: 'Saved posts',
          subtitle: 'Posts you kept from Community',
          onTap: () => onOpen(const SavedPostsScreen()),
        ),
        const SizedBox(height: 10),
        _ActionTile(
          key: const ValueKey('library-kept-reels'),
          icon: Icons.play_circle_outline_rounded,
          title: 'Kept reels',
          subtitle: 'Reels you kept from Explore',
          onTap: () => onOpen(const KeptReelsScreen()),
        ),
        if (showDownloads) ...[
          const SizedBox(height: 10),
          _ActionTile(
            key: const ValueKey('library-downloads'),
            icon: Icons.download_for_offline_outlined,
            title: 'Downloads',
            subtitle: downloadCount > 0
                ? '$downloadCount kept for listening offline'
                : 'Songs and chapters kept for listening offline',
            onTap: () => onOpen(const DownloadsScreen()),
          ),
        ],
        const SizedBox(height: 22),
        const _SectionLabel('YOUR WORK'),
        const SizedBox(height: 9),
        // Only while something is waiting on the member. A permanent row here
        // would be the Contributions count above said a second time.
        if (data.returnedCount > 0) ...[
          _ActionTile(
            key: const ValueKey('work-sent-back'),
            icon: Icons.reply_rounded,
            title: 'Sent back to you',
            subtitle: data.returnedCount == 1
                ? 'One submission needs a change from you'
                : '${data.returnedCount} submissions need a change from you',
            onTap: () => onOpen(
              const MySubmissionsScreen(
                initialFilter: SubmissionFilter.needsChanges,
              ),
            ),
          ),
          const SizedBox(height: 10),
        ],
        // Adverts used to be a tab of their own here. They are a row now: a
        // tool for the members who run campaigns, one tap away for them and
        // out of the bar for everybody else.
        _ActionTile(
          key: const ValueKey('work-adverts'),
          icon: Icons.campaign_rounded,
          title: 'Your adverts',
          subtitle: running > 0
              ? '$running running'
              : campaigns.isEmpty
              ? 'Promote something to the community'
              : '${campaigns.length} campaign'
                    '${campaigns.length == 1 ? '' : 's'}',
          onTap: () => onOpen(const AdsScreen(standalone: true)),
        ),
      ],
    );
  }
}

/// Who the member is, and the one thing they can do about it next.
///
/// The identity that used to be a tab of its own is this card: the picture,
/// the name and handle, the words they wrote about themselves, and the two
/// verbs — *Edit* changes it, *Preview* does not — because the commonest thing
/// anybody wants before they post is to check, and a page where checking means
/// opening a form full of their own text is a page that invites accidental
/// edits. Without a profile it offers to make one, and without an account it
/// offers to sign in.
class _IdentityHero extends StatelessWidget {
  const _IdentityHero({
    required this.data,
    required this.onSignIn,
    required this.onSetUp,
    required this.onEdit,
    required this.onPreview,
  });

  final _ProfileViewData data;
  final VoidCallback onSignIn;
  final VoidCallback onSetUp;
  final VoidCallback onEdit;
  final VoidCallback onPreview;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final profile = data.communityProfile;
    final onGold = FilledButton.styleFrom(
      backgroundColor: brand.gold,
      foregroundColor: const Color(0xFF1A1206),
    );
    final outline = OutlinedButton.styleFrom(
      foregroundColor: Colors.white,
      side: const BorderSide(color: Colors.white54),
    );
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: BrandGradients.heroRich(brand),
        boxShadow: [
          BoxShadow(
            color: brand.shadow.withValues(alpha: 0.2),
            blurRadius: 28,
            offset: const Offset(0, 14),
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
                  _ProfileAvatar(user: data.user, communityProfile: profile),
                  const SizedBox(width: 15),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.signedIn ? 'YOUR SPACE' : 'WELCOME, EXPLORER',
                          style: TextStyle(
                            color: brand.gold,
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.15,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                data.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.headlineSmall
                                    ?.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w900,
                                    ),
                              ),
                            ),
                            if (profile != null &&
                                profile.mark != VerifiedMark.none) ...[
                              const SizedBox(width: 6),
                              VerifiedBadge(mark: profile.mark, size: 18),
                            ],
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          data.detail,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.72),
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (profile != null && profile.bio.trim().isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  profile.bio.trim(),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.9),
                    height: 1.4,
                  ),
                ),
              ],
              if (profile != null &&
                  (profile.location.trim().isNotEmpty ||
                      profile.dialect.trim().isNotEmpty)) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (profile.location.trim().isNotEmpty)
                      _InfoPill(
                        icon: Icons.location_on_outlined,
                        label: profile.location.trim(),
                      ),
                    if (profile.dialect.trim().isNotEmpty)
                      _InfoPill(
                        icon: Icons.translate_rounded,
                        label: profile.dialect.trim(),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 18),
              if (!data.signedIn)
                FilledButton.icon(
                  style: onGold,
                  onPressed: onSignIn,
                  icon: const Icon(Icons.login_rounded),
                  label: const Text('Sign in or create an account'),
                )
              else if (profile == null)
                FilledButton.icon(
                  style: onGold,
                  onPressed: onSetUp,
                  icon: const Icon(Icons.alternate_email_rounded),
                  label: const Text('Set up your community profile'),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        style: onGold,
                        onPressed: onEdit,
                        icon: const Icon(Icons.edit_rounded, size: 18),
                        label: const Text('Edit profile'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        style: outline,
                        onPressed: onPreview,
                        icon: const Icon(Icons.visibility_outlined, size: 18),
                        label: const Text('Preview'),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
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
                      'MY SPACE',
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
            ],
          ),
        ),
      ),
    ),
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
/// circle called Amina is allowed to be one. And once everything is there it
/// leaves — a card congratulating somebody on a finished profile every time
/// they open My Space is furniture.
class _ProfileCompleteness extends StatelessWidget {
  const _ProfileCompleteness({required this.profile, required this.onEdit});

  final CommunityProfile profile;
  final VoidCallback onEdit;

  static bool isComplete(CommunityProfile profile) =>
      _stepsOf(profile).every((step) => step.$2);

  /// The parts, in the order they are worth having.
  static List<(String label, bool done)> _stepsOf(CommunityProfile profile) => [
    ('A name', profile.displayName.trim().isNotEmpty),
    ('A photo', profile.avatarUrl?.isNotEmpty ?? false),
    ('A few words about you', profile.bio.trim().isNotEmpty),
    ('Where you are', profile.location.trim().isNotEmpty),
    ('The Kasem you speak', profile.dialect.trim().isNotEmpty),
    ('A verified number', profile.phoneVerified),
  ];

  @override
  Widget build(BuildContext context) {
    final steps = _stepsOf(profile);
    final done = steps.where((step) => step.$2).length;
    final missing = steps.where((step) => !step.$2).toList(growable: false);

    return _GlassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Eyebrow(text: 'YOUR PROFILE'),
          const SizedBox(height: 7),
          Text(
            '$done of ${steps.length} filled in.',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: done / steps.length,
              minHeight: 7,
              backgroundColor: context.brand.accent.withValues(alpha: 0.12),
              valueColor: AlwaysStoppedAnimation<Color>(context.brand.accent),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              // Only the first three. Six grey chips is a list of failures.
              for (final step in missing.take(3))
                _InfoPill(
                  icon: Icons.add_rounded,
                  label: step.$1,
                  onDark: false,
                ),
            ],
          ),
          const SizedBox(height: 14),
          // The verified mark is the one part of this the editor cannot grant,
          // so the button says what it does rather than promising to finish
          // the list.
          OutlinedButton.icon(
            onPressed: onEdit,
            icon: const Icon(Icons.edit_rounded, size: 18),
            label: const Text('Add the rest'),
          ),
        ],
      ),
    );
  }
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
        gradient: LinearGradient(
          colors: [context.brand.highlight, context.brand.accentFill],
        ),
        boxShadow: [
          BoxShadow(
            color: context.brand.highlight.withValues(alpha: 0.25),
            blurRadius: 18,
          ),
        ],
      ),
      child: ClipOval(
        child: ColoredBox(
          color: context.brand.accentFill,
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

/// One of the three counts across the top of the You tab.
///
/// Each one is a door: a number nobody can act on is decoration, and "Saved
/// words: 12" with no way to see the twelve words is the clearest example of
/// that in the app.
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

/// The heading over a group of rows, in the same voice as Settings' sections.
class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4),
    child: _Eyebrow(text: text),
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

class _InfoPill extends StatelessWidget {
  const _InfoPill({
    required this.icon,
    required this.label,
    this.onDark = true,
  });

  final IconData icon;
  final String label;

  /// Set on the hero's gradient; off on a glass panel.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final ink = onDark ? Colors.white : context.brand.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: onDark
            ? Colors.white.withValues(alpha: 0.12)
            : context.brand.accent.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: ink, size: 15),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: onDark ? Colors.white : null,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) =>
      GlassRow(icon: icon, title: title, detail: subtitle, onTap: onTap);
}
