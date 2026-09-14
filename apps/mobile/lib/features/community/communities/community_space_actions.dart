import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/create_community_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/edit_community_screen.dart';
import 'package:indigen_world_mobile/features/community/communities/hand_over_community_screen.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:share_plus/share_plus.dart';

/// Everything a member can do to a community — join, leave, share, report —
/// and everything its moderators can do to its members.
///
/// Every write that needs an account goes through [CommunityActions.
/// requireProfile] first, so a guest who taps Join is taken through sign-in
/// and profile setup and lands back where they were, rather than being told
/// to go and do those somewhere else.
class CommunitySpaceActions {
  const CommunitySpaceActions(this.ref);

  final WidgetRef ref;

  CommunityActions get _feed => CommunityActions(ref);

  Future<void> open(BuildContext context, String communityId) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunitySpaceScreen(communityId: communityId),
        ),
      );

  /// Signs in, sets up a profile if needed, then opens the create form. When a
  /// community is created, opens it in place of the form.
  Future<void> create(BuildContext context) async {
    final profile = await _feed.requireProfile(context);
    if (profile == null || !context.mounted) return;
    final created = await Navigator.of(context).push<CommunitySpace>(
      MaterialPageRoute(builder: (context) => const CreateCommunityScreen()),
    );
    if (created == null || !context.mounted) return;
    ref.invalidate(discoverCommunitiesProvider);
    ref.invalidate(joinedCommunitiesProvider);
    await open(context, created.id);
  }

  /// Joins a public community, or asks to join a private one.
  Future<void> join(BuildContext context, CommunitySpace space) async {
    final profile = await _feed.requireProfile(context);
    final repository = ref.read(communitySpaceRepositoryProvider);
    if (profile == null || repository == null || !context.mounted) return;
    HapticFeedback.selectionClick();
    try {
      final status = await repository.join(space: space, uid: profile.uid);
      ref.invalidate(joinedCommunitiesProvider);
      if (!context.mounted) return;
      showCommunityMessage(
        context,
        status == MembershipStatus.pending
            ? 'Request sent. A moderator will look at it soon.'
            : 'You joined ${space.name}.',
      );
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    }
  }

  /// Leaves [space], or withdraws a waiting request, after asking.
  ///
  /// An owner cannot simply leave — a community with nobody in charge is one
  /// nobody can moderate — so for them this offers the two ways out that
  /// exist: handing it over, or closing it when they are the only one left.
  Future<void> leave(
    BuildContext context,
    CommunitySpace space,
    CommunityMembership membership,
  ) async {
    final repository = ref.read(communitySpaceRepositoryProvider);
    if (repository == null) return;
    if (membership.role == CommunityRole.owner) {
      return _ownerLeave(context, space);
    }
    final withdrawing = membership.isPending;
    final confirmed = await showGlassConfirm(
      context: context,
      title: withdrawing ? 'Withdraw your request?' : 'Leave ${space.name}?',
      message: withdrawing
          ? 'You can ask again later.'
          : space.isPrivate
          ? 'You will stop seeing its posts, and will have to ask to join again.'
          : 'You can join again any time.',
      confirmLabel: withdrawing ? 'Withdraw' : 'Leave',
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await repository.leave(communityId: space.id, membership: membership);
      ref.invalidate(joinedCommunitiesProvider);
      if (context.mounted) {
        showCommunityMessage(
          context,
          withdrawing ? 'Request withdrawn.' : 'You left ${space.name}.',
        );
      }
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    }
  }

  /// The public web address of a community. Opens the app where it is
  /// installed and verified, and the community's page on the website
  /// everywhere else.
  static String linkFor(CommunitySpace space) =>
      'https://indigenworld.com/communities/${Uri.encodeComponent(space.id)}';

  /// Everything the screen's overflow menu offers, filtered to what [viewer]
  /// may actually do.
  Future<void> showOptions(
    BuildContext context,
    CommunitySpace space,
    CommunityMembership? viewer,
  ) async {
    final l10n = AppLocalizations.of(context);
    final isOwner =
        viewer?.isActive == true && viewer?.role == CommunityRole.owner;
    final choice = await showGlassActionSheet<String>(
      context: context,
      title: space.name,
      actions: [
        if (viewer?.canAdminister ?? false)
          GlassAction(
            value: 'edit',
            icon: Icons.edit_outlined,
            label: l10n.communityEditCommunity,
          ),
        if (isOwner)
          GlassAction(
            value: 'hand-over',
            icon: Icons.swap_horiz_rounded,
            label: l10n.communityHandOver,
          ),
        if (isOwner && space.memberCount <= 1)
          GlassAction(
            value: 'close',
            icon: Icons.door_front_door_outlined,
            label: l10n.communityClose,
            isDestructive: true,
          ),
        if (viewer != null &&
            !isOwner &&
            viewer.status != MembershipStatus.banned)
          GlassAction(
            value: 'leave',
            icon: Icons.logout_rounded,
            label: viewer.isPending
                ? l10n.communitiesCancelRequest
                : l10n.communitiesLeave,
            isDestructive: true,
          ),
        GlassAction(
          value: 'share',
          icon: Icons.ios_share_rounded,
          label: l10n.communityShareCommunity,
        ),
        if (!isOwner)
          GlassAction(
            value: 'report',
            icon: Icons.flag_outlined,
            label: l10n.communityReportCommunity,
            isDestructive: true,
          ),
      ],
    );
    if (choice == null || !context.mounted) return;
    switch (choice) {
      case 'edit':
        await edit(context, space);
      case 'hand-over':
        await handOver(context, space);
      case 'close':
        await close(context, space);
      case 'leave':
        await leave(context, space, viewer!);
      case 'share':
        await share(context, space);
      case 'report':
        await report(context, space);
    }
  }

  Future<void> edit(BuildContext context, CommunitySpace space) =>
      Navigator.of(context).push<CommunitySpace>(
        MaterialPageRoute(
          builder: (context) => EditCommunityScreen(space: space),
        ),
      );

  Future<void> handOver(BuildContext context, CommunitySpace space) async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => HandOverCommunityScreen(space: space),
      ),
    );
    if (done == true) ref.invalidate(communityMembersProvider(space.id));
  }

  /// Closes a community its owner is alone in, after saying what that means.
  Future<void> close(BuildContext context, CommunitySpace space) async {
    final l10n = AppLocalizations.of(context);
    final repository = ref.read(communitySpaceRepositoryProvider);
    final uid = ref.read(currentUidProvider);
    if (repository == null || uid == null) return;
    final confirmed = await showGlassConfirm(
      context: context,
      title: l10n.communityCloseTitle(space.name),
      message: l10n.communityCloseBody,
      confirmLabel: l10n.communityClose,
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await repository.closeCommunity(space: space, ownerUid: uid);
      ref.invalidate(joinedCommunitiesProvider);
      ref.invalidate(discoverCommunitiesProvider);
      if (context.mounted) {
        showCommunityMessage(context, l10n.communityCloseDone);
      }
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    }
  }

  Future<void> _ownerLeave(BuildContext context, CommunitySpace space) async {
    final l10n = AppLocalizations.of(context);
    final alone = space.memberCount <= 1;
    final choice = await showGlassActionSheet<String>(
      context: context,
      title: l10n.communityLeaveOwnerTitle,
      subtitle: l10n.communityLeaveOwnerBody,
      actions: [
        if (!alone)
          GlassAction(
            value: 'hand-over',
            icon: Icons.swap_horiz_rounded,
            label: l10n.communityHandOver,
          ),
        if (alone)
          GlassAction(
            value: 'close',
            icon: Icons.door_front_door_outlined,
            label: l10n.communityClose,
            isDestructive: true,
          ),
      ],
    );
    if (!context.mounted) return;
    switch (choice) {
      case 'hand-over':
        await handOver(context, space);
      case 'close':
        await close(context, space);
    }
  }

  Future<void> share(BuildContext context, CommunitySpace space) async {
    HapticFeedback.selectionClick();
    final link = linkFor(space);
    final description = space.description.trim();
    final text = [
      '${space.name} on Indigen World',
      if (description.isNotEmpty) description,
      link,
    ].join('\n\n');
    try {
      await Share.share(text);
    } on Object {
      await Clipboard.setData(ClipboardData(text: link));
      if (context.mounted) {
        showCommunityMessage(context, 'Community link copied.');
      }
    }
  }

  Future<void> report(BuildContext context, CommunitySpace space) async {
    final profile = await _feed.requireProfile(context);
    final repository = ref.read(communitySpaceRepositoryProvider);
    if (profile == null || repository == null || !context.mounted) return;
    final reason = await showGlassActionSheet<String>(
      context: context,
      title: 'Why are you reporting this community?',
      actions: [
        for (final option in const [
          'Disrespectful or abusive',
          'Culturally inappropriate',
          'Spam or advertising',
          'Pretending to be somebody else',
          'Something else',
        ])
          GlassAction(value: option, label: option),
      ],
    );
    if (reason == null) return;
    try {
      await repository.reportCommunity(
        communityId: space.id,
        reporterId: profile.uid,
        reason: reason,
      );
      if (context.mounted) {
        showCommunityMessage(
          context,
          'Reported. Moderators will review this community.',
        );
      }
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    }
  }

  // ── Moderation ────────────────────────────────────────────────────────────

  Future<void> approve(BuildContext context, String communityId, String uid) =>
      _moderate(
        context,
        () => ref
            .read(communitySpaceRepositoryProvider)!
            .approve(communityId: communityId, uid: uid),
        done: 'Request approved.',
      );

  Future<void> decline(BuildContext context, String communityId, String uid) =>
      _moderate(
        context,
        () => ref
            .read(communitySpaceRepositoryProvider)!
            .decline(communityId: communityId, uid: uid),
        done: 'Request declined.',
      );

  /// The actions a moderator may take on [member], offered as a sheet.
  Future<void> manageMember(
    BuildContext context, {
    required CommunitySpace space,
    required CommunityMembership viewer,
    required CommunityMembership member,
    required String memberName,
  }) async {
    if (!viewer.canModerate || !viewer.role.outranks(member.role)) return;
    final repository = ref.read(communitySpaceRepositoryProvider);
    if (repository == null) return;
    final choice = await showGlassActionSheet<String>(
      context: context,
      title: memberName,
      actions: [
        if (viewer.canAdminister && member.role == CommunityRole.member)
          const GlassAction(
            value: 'moderator',
            icon: Icons.shield_outlined,
            label: 'Make moderator',
          ),
        if (viewer.role == CommunityRole.owner &&
            member.role == CommunityRole.moderator)
          const GlassAction(
            value: 'admin',
            icon: Icons.admin_panel_settings_outlined,
            label: 'Make admin',
          ),
        if (viewer.canAdminister && member.role != CommunityRole.member)
          const GlassAction(
            value: 'member',
            icon: Icons.person_outline_rounded,
            label: 'Remove role',
          ),
        const GlassAction(
          value: 'remove',
          icon: Icons.person_remove_outlined,
          label: 'Remove from community',
          isDestructive: true,
        ),
        const GlassAction(
          value: 'ban',
          icon: Icons.block_rounded,
          label: 'Ban from community',
          description: 'They cannot join or ask again',
          isDestructive: true,
        ),
      ],
    );
    if (choice == null || !context.mounted) return;
    switch (choice) {
      case 'moderator' || 'admin' || 'member':
        await _moderate(
          context,
          () => repository.setRole(
            communityId: space.id,
            uid: member.uid,
            role: CommunityRole.fromWire(choice),
          ),
          done: 'Role updated.',
        );
      case 'remove' || 'ban':
        final ban = choice == 'ban';
        final confirmed = await showGlassConfirm(
          context: context,
          title: ban ? 'Ban $memberName?' : 'Remove $memberName?',
          message: ban
              ? 'They leave ${space.name} and cannot join or ask to join '
                    'again unless a moderator lifts the ban.'
              : 'They leave ${space.name}. They can join or ask again later.',
          confirmLabel: ban ? 'Ban' : 'Remove',
          isDestructive: true,
        );
        if (confirmed != true || !context.mounted) return;
        await _moderate(
          context,
          () => repository.removeMember(
            communityId: space.id,
            member: member,
            ban: ban,
          ),
          done: ban ? '$memberName is banned.' : '$memberName was removed.',
        );
    }
  }

  Future<void> _moderate(
    BuildContext context,
    Future<void> Function() write, {
    required String done,
  }) async {
    if (ref.read(communitySpaceRepositoryProvider) == null) return;
    try {
      await write();
      if (context.mounted) showCommunityMessage(context, done);
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not update. Try again.');
      }
    }
  }
}
