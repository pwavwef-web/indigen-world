import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_analytics.dart';
import 'package:indigen_world_mobile/features/explore/explore_preferences.dart';
import 'package:indigen_world_mobile/features/explore/reel_context_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:share_plus/share_plus.dart';

enum _ReelMenuAction {
  report,
  notInterested,
  hideCreator,
  hideCommunity,
  block,
  copyLink,
  share,
  attribution,
}

/// The id a report about [reel] is filed under in `communityReports`.
///
/// A community reel is reported as the post it is, exactly as its own menu in
/// the Community feed would. Published work and adverts have no post id, so
/// they are filed under a prefixed one — `published:<id>`, `sponsored:<id>` —
/// which the Security Rules accept as it stands and which a moderator can tell
/// apart at a glance. The admin console's Reports screen still looks every id
/// up in `communityPosts`, so until it learns these prefixes such a report
/// appears there with its reason but without a preview.
String reelReportId(Reel reel) {
  if (reel.communityPostId case final postId?) return postId;
  if (reel.isSponsored) return reel.id;
  return 'published:${reel.id}';
}

/// The overflow menu on a reel: report, not interested, hide the creator or
/// the community, block, copy the link, share, and view attribution.
///
/// Every choice that removes something from the feed takes effect straight
/// away, and says so in words — a reel that silently vanishes looks like a
/// glitch, not like the member was listened to.
Future<void> showReelOverflowMenu(
  BuildContext context,
  WidgetRef ref, {
  required Reel reel,
  required String creatorName,
  required String handle,
}) async {
  final uid = ref.read(currentUidProvider);
  final isMine = uid != null && uid == reel.creatorId;
  final post = reel.communityPost;
  final community = reel.community;
  final name = creatorName.trim().isEmpty ? 'this creator' : creatorName.trim();

  final choice = await showGlassActionSheet<_ReelMenuAction>(
    context: context,
    actions: [
      if (!isMine)
        const GlassAction(
          value: _ReelMenuAction.notInterested,
          icon: Icons.visibility_off_outlined,
          label: 'Not interested',
          description: 'Show less like this in Explore',
        ),
      if (!isMine && !reel.isSponsored && reel.creatorId.isNotEmpty)
        GlassAction(
          value: _ReelMenuAction.hideCreator,
          icon: Icons.person_off_outlined,
          label: 'Hide $name',
        ),
      if (community != null)
        GlassAction(
          value: _ReelMenuAction.hideCommunity,
          icon: Icons.group_off_outlined,
          label: 'Hide ${community.name}',
        ),
      if (post != null && !post.isPrivateCommunityPost)
        const GlassAction(
          value: _ReelMenuAction.copyLink,
          icon: Icons.link_rounded,
          label: 'Copy link',
        ),
      const GlassAction(
        value: _ReelMenuAction.share,
        icon: Icons.share_outlined,
        label: 'Share',
      ),
      const GlassAction(
        value: _ReelMenuAction.attribution,
        icon: Icons.copyright_rounded,
        label: 'View attribution',
      ),
      if (!isMine && post != null)
        GlassAction(
          value: _ReelMenuAction.block,
          icon: Icons.block_rounded,
          label: 'Block $name',
          isDestructive: true,
        ),
      if (!isMine)
        const GlassAction(
          value: _ReelMenuAction.report,
          icon: Icons.flag_outlined,
          label: 'Report',
          isDestructive: true,
        ),
    ],
  );
  if (choice == null || !context.mounted) return;

  final analytics = ref.read(exploreAnalyticsProvider);
  final hidden = ref.read(exploreHiddenProvider.notifier);
  final actions = CommunityActions(ref);

  switch (choice) {
    case _ReelMenuAction.report:
      final profile = await actions.requireProfile(context);
      if (profile == null || !context.mounted) return;
      final reason = await actions.pickReportReason(context);
      if (reason == null || !context.mounted) return;
      final repository = ref.read(communityRepositoryProvider);
      if (repository == null) return;
      try {
        await repository.reportPost(
          postId: reelReportId(reel),
          reporterId: profile.uid,
          reason: reason,
          communityId: community?.id,
        );
        analytics.logReel(ExploreEvent.report, reel);
        if (context.mounted) {
          showGlassToast(context, 'Reported. Moderators will review it.');
        }
      } on Object {
        if (context.mounted) {
          showGlassToast(context, 'Could not send the report. Try again.');
        }
      }

    case _ReelMenuAction.notInterested:
      await hidden.hideReel(reel.id);
      analytics.logReel(ExploreEvent.notInterested, reel);
      // A community post also gets the server-side hide the Community feed
      // already honours, so the choice follows the member to that feed and to
      // their other phones. Published work has no such edge yet.
      if (post != null && uid != null) {
        try {
          await ref
              .read(communityRepositoryProvider)
              ?.hidePost(uid: uid, postId: post.id);
        } on Object {
          // Hidden on this device regardless.
        }
      }
      if (context.mounted) {
        showGlassToast(context, 'Got it. You will see less like this.');
      }

    case _ReelMenuAction.hideCreator:
      await hidden.hideCreator(reel.creatorId);
      if (uid != null) {
        try {
          await ref
              .read(communityRepositoryProvider)
              ?.muteProfile(uid: uid, targetId: reel.creatorId);
        } on Object {
          // The local hide already keeps them out of Explore.
        }
      }
      if (context.mounted) {
        showGlassToast(context, '$name is hidden from your Explore feed.');
      }

    case _ReelMenuAction.hideCommunity:
      if (community == null) return;
      await hidden.hideCommunity(community.id);
      if (context.mounted) {
        showGlassToast(
          context,
          '${community.name} is hidden from your Explore feed.',
        );
      }

    case _ReelMenuAction.block:
      if (post != null) await actions.blockAuthor(context, post);

    case _ReelMenuAction.copyLink:
      if (post == null) return;
      await Clipboard.setData(
        ClipboardData(text: 'https://indigenworld.com/post/${post.id}'),
      );
      if (context.mounted) showGlassToast(context, 'Link copied.');

    case _ReelMenuAction.share:
      if (post != null) {
        await actions.share(context, post);
        return;
      }
      // Published work has no public page of its own yet, so what is shared
      // is the credit and a way to find it, never a link that would 404.
      final title = reel.title.trim().isEmpty
          ? 'A cultural reel'
          : reel.title.trim();
      try {
        await Share.share(
          '$title — by $name on Indigen World.\n'
          'Find it in Explore: https://indigenworld.com',
        );
      } on Object {
        if (context.mounted) showGlassToast(context, 'Could not share this.');
      }

    case _ReelMenuAction.attribution:
      await showReelAttribution(
        context,
        reel: reel,
        creatorName: creatorName,
        handle: handle,
      );
  }
}
