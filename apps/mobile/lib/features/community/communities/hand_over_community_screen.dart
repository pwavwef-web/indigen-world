import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Picks the member who will own a community next.
///
/// Admins and moderators are listed first — somebody already trusted to run
/// the place is the likely choice — but any active member can be chosen. The
/// outgoing owner stays on as an admin. Pops with true once the handover has
/// been written.
class HandOverCommunityScreen extends ConsumerStatefulWidget {
  const HandOverCommunityScreen({required this.space, super.key});

  final CommunitySpace space;

  @override
  ConsumerState<HandOverCommunityScreen> createState() =>
      _HandOverCommunityScreenState();
}

class _HandOverCommunityScreenState
    extends ConsumerState<HandOverCommunityScreen> {
  var _working = false;

  Future<void> _choose(CommunityMembership member, String name) async {
    final l10n = AppLocalizations.of(context);
    final repository = ref.read(communitySpaceRepositoryProvider);
    final uid = ref.read(currentUidProvider);
    if (repository == null || uid == null) return;
    final confirmed = await showGlassConfirm(
      context: context,
      title: l10n.communityHandOverConfirm(name),
      message: l10n.communityHandOverBody,
      confirmLabel: l10n.communityHandOver,
    );
    if (confirmed != true || !mounted) return;
    setState(() => _working = true);
    try {
      await repository.transferOwnership(
        communityId: widget.space.id,
        ownerUid: uid,
        newOwnerUid: member.uid,
      );
      if (!mounted) return;
      showCommunityMessage(context, l10n.communityHandOverDone(name));
      Navigator.of(context).pop(true);
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() => _working = false);
      showCommunityMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final brand = context.brand;
    final uid = ref.watch(currentUidProvider);
    final members = ref.watch(communityMembersProvider(widget.space.id));
    final candidates = [
      for (final member
          in members.asData?.value ?? const <CommunityMembership>[])
        if (member.uid != uid && member.isActive) member,
    ];
    final profiles =
        ref
            .watch(
              memberProfilesProvider(
                (candidates.map((member) => member.uid).toList()..sort()).join(
                  ',',
                ),
              ),
            )
            .asData
            ?.value ??
        const <String, CommunityProfile>{};

    return Scaffold(
      appBar: AppBar(title: Text(l10n.communityHandOverTitle)),
      body: switch (members) {
        AsyncValue(hasValue: false, :final error?) => CommunityEmptyState(
          icon: Icons.cloud_off_rounded,
          title: isCommunityBackendPending(error)
              ? l10n.communityBackendPending
              : l10n.communitiesLoadFailed,
          action: FilledButton.icon(
            onPressed: () =>
                ref.invalidate(communityMembersProvider(widget.space.id)),
            icon: const Icon(Icons.refresh_rounded),
            label: Text(l10n.communityTryAgain),
          ),
        ),
        AsyncValue(hasValue: false) => const Padding(
          padding: EdgeInsets.all(16),
          child: GlassSkeleton(height: 120),
        ),
        _ when candidates.isEmpty => CommunityEmptyState(
          icon: Icons.person_search_outlined,
          title: l10n.communityHandOverNobody,
        ),
        _ => AbsorbPointer(
          absorbing: _working,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  l10n.communityHandOverBody,
                  style: TextStyle(color: brand.mutedInk, fontSize: 14),
                ),
              ),
              if (_working) const LinearProgressIndicator(minHeight: 2),
              for (final member in candidates)
                _CandidateTile(
                  key: ValueKey('hand-over-${member.uid}'),
                  member: member,
                  profile: profiles[member.uid],
                  onTap: () => _choose(
                    member,
                    profiles[member.uid]?.displayName ?? member.uid,
                  ),
                ),
            ],
          ),
        ),
      },
    );
  }
}

class _CandidateTile extends StatelessWidget {
  const _CandidateTile({
    required this.member,
    required this.profile,
    required this.onTap,
    super.key,
  });

  final CommunityMembership member;
  final CommunityProfile? profile;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final profile = this.profile;
    final role = switch (member.role) {
      CommunityRole.admin => l10n.communityRoleAdmin,
      CommunityRole.moderator => l10n.communityRoleModerator,
      _ => null,
    };
    return ListTile(
      minTileHeight: 64,
      onTap: onTap,
      leading: CommunityAvatar(
        initials: profile?.initials ?? '·',
        imageUrl: profile?.avatarUrl,
        username: profile?.username,
      ),
      title: Text(
        profile?.displayName ?? '…',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(
        [?profile?.handle, ?role].join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: const Icon(Icons.chevron_right_rounded),
    );
  }
}
