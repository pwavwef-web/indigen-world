import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/mentions.dart';
import 'package:indigen_world_mobile/features/community/post_engagement_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// The shared post interactions — like, save, reply, report, delete — plus the
/// sign-in / profile-setup gate that guards all of them.
///
/// Feed, profile tabs and reply threads all route through here so a post
/// behaves identically wherever it is rendered.
class CommunityActions {
  const CommunityActions(this.ref);

  final WidgetRef ref;

  /// Ensures the member is signed in and has a community profile. Returns the
  /// profile, or `null` after prompting for whichever step is missing.
  Future<CommunityProfile?> requireProfile(BuildContext context) async {
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) {
      // Say which of the two things is actually wrong. Telling somebody on full
      // signal that they are offline gives them nothing to act on.
      showCommunityMessage(
        context,
        ref.read(connectionBlockProvider)?.message ??
            'The community is not available right now. Please try again '
                'shortly.',
      );
      return null;
    }

    // Fast path: the profile stream already knows who this is, so likes and
    // saves cost no extra round trip.
    final cached = ref.read(myCommunityProfileProvider).asData?.value;
    if (cached != null) return cached;

    var uid = ref.read(currentUidProvider);
    if (uid == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !context.mounted) return null;
      uid = await _awaitUid();
      if (uid == null || !context.mounted) return null;
    }

    // Read straight from Firestore rather than the stream: right after a
    // sign-in the profile stream may still be carrying the guest value.
    final existing = await repository.getProfile(uid);
    if (existing != null) return existing;

    if (!context.mounted) return null;
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (context) => const CommunitySetupScreen()),
    );
    if (created != true) return null;
    return repository.getProfile(uid);
  }

  /// Ensures the member is signed in, and stops there.
  ///
  /// Deliberately weaker than [requireProfile]. Appreciating or keeping a reel
  /// needs an account for the edge to belong to and nothing else — demanding
  /// that somebody choose a public handle before they may tap a heart asks
  /// them to make a permanent decision to perform a private one.
  Future<String?> requireSignIn(BuildContext context) async {
    final existing = ref.read(currentUidProvider);
    if (existing != null) return existing;

    if (ref.read(communityRepositoryProvider) == null) {
      showCommunityMessage(
        context,
        ref.read(connectionBlockProvider)?.message ??
            'That is not available right now. Please try again shortly.',
      );
      return null;
    }

    final signedIn = await showSignInSheet(context);
    if (signedIn != true || !context.mounted) return null;
    return _awaitUid();
  }

  /// `authStateChanges()` delivers asynchronously, so the uid can lag a
  /// completed sign-in by a frame or two. Polls briefly rather than assuming.
  Future<String?> _awaitUid() async {
    for (var attempt = 0; attempt < 20; attempt++) {
      final uid = ref.read(currentUidProvider);
      if (uid != null) return uid;
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    return ref.read(currentUidProvider);
  }

  Future<void> toggleLike(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null) return;
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    final liked =
        ref.read(myLikesProvider).asData?.value.contains(post.id) ?? false;
    try {
      await repository.toggleLike(
        uid: profile.uid,
        postId: post.id,
        liked: liked,
      );
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not update. Try again.');
      }
    }
  }

  Future<void> toggleSave(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null) return;
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    final saved =
        ref.read(myBookmarksProvider).asData?.value.contains(post.id) ?? false;
    try {
      await repository.toggleBookmark(
        uid: profile.uid,
        postId: post.id,
        saved: saved,
      );
      if (context.mounted) {
        showCommunityMessage(context, saved ? 'Removed from saved.' : 'Saved.');
      }
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not update. Try again.');
      }
    }
  }

  Future<void> toggleRepost(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null) return;
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    final reposted =
        ref.read(myRepostsProvider).asData?.value.contains(post.id) ?? false;
    try {
      await repository.toggleRepost(
        profile: profile,
        postId: post.id,
        reposted: reposted,
      );
      if (context.mounted) {
        showCommunityMessage(
          context,
          reposted ? 'Reshare removed.' : 'Reshared to your followers.',
        );
      }
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not reshare. Try again.');
      }
    }
  }

  Future<bool> quote(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null || !context.mounted) return false;
    final published = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (context) => ComposePostScreen(quoteTo: post)),
    );
    return published ?? false;
  }

  Future<void> vote(
    BuildContext context,
    CommunityPost post,
    String optionId,
  ) async {
    final profile = await requireProfile(context);
    final repository = ref.read(communityRepositoryProvider);
    if (profile == null || repository == null) return;
    try {
      await repository.votePoll(
        uid: profile.uid,
        postId: post.id,
        optionId: optionId,
      );
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Your vote could not be recorded.');
      }
    }
  }

  /// Set once the backend refuses a view write outright — most often a security
  /// rule that has not been deployed yet. Every later attempt this session
  /// would be refused the same way, so we stop asking rather than spend a
  /// rejected round trip on every card that scrolls past.
  static var _viewTrackingRefused = false;

  /// Records that a member read [post]. Impressions are telemetry: written
  /// best-effort, never spoken about, and never allowed to interrupt the feed.
  Future<void> trackView(CommunityPost post) async {
    if (_viewTrackingRefused) return;
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(communityRepositoryProvider);
    if (uid == null || repository == null || post.authorId == uid) return;
    try {
      if (!await repository.trackView(uid: uid, postId: post.id)) {
        _viewTrackingRefused = true;
      }
    } on Object {
      // View tracking is telemetry. It must never interrupt reading the feed.
    }
  }

  void openEngagement(
    BuildContext context,
    CommunityPost post, {
    CommunityEngagementKind initialKind = CommunityEngagementKind.views,
  }) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            PostEngagementScreen(post: post, initialKind: initialKind),
      ),
    );
  }

  Future<void> openLink(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.scheme == 'http' || uri.scheme == 'https')) {
      showCommunityMessage(context, 'This link is not valid.');
      return;
    }
    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened && context.mounted) {
        showCommunityMessage(context, 'Could not open this link.');
      }
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not open this link.');
      }
    }
  }

  Future<void> share(BuildContext context, CommunityPost post) async {
    HapticFeedback.selectionClick();
    final preview = post.text.trim().isEmpty
        ? 'See this Kasem community post'
        : post.text.trim();
    final link = 'https://indigenworld.com/post/${post.id}';
    try {
      await Share.share('$preview\n\n$link');
    } on Object {
      if (context.mounted) {
        await Clipboard.setData(ClipboardData(text: link));
        if (context.mounted) {
          showCommunityMessage(context, 'Post link copied.');
        }
      }
    }
  }

  /// Opens the composer as a reply to [post]. Returns `true` when published.
  Future<bool> reply(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null || !context.mounted) return false;
    final published = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (context) => ComposePostScreen(replyTo: post)),
    );
    return published ?? false;
  }

  /// Opens the composer for a new top-level post, optionally pre-filled.
  /// Returns `true` when published.
  Future<bool> compose(BuildContext context, {String initialText = ''}) async {
    final profile = await requireProfile(context);
    if (profile == null || !context.mounted) return false;
    final published = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => ComposePostScreen(initialText: initialText),
      ),
    );
    return published ?? false;
  }

  /// Opens the member behind a mentioned `@handle`.
  ///
  /// Reading, unlike posting, needs no account — a guest who taps a mention
  /// should land on that member's public profile, not on a sign-in prompt.
  Future<void> openHandle(BuildContext context, String handle) async {
    // The assistant has no member profile to open — it answers in threads
    // rather than keeping a page — so its handle leads to the assistant.
    if (handle.toLowerCase() == kawuriHandle) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (context) => const KawuriScreen()),
      );
      return;
    }
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    try {
      final profile = await repository.getProfileByUsername(handle);
      if (!context.mounted) return;
      if (profile == null) {
        showCommunityMessage(context, 'No member goes by @$handle.');
        return;
      }
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: profile.uid),
        ),
      );
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not open @$handle.');
      }
    }
  }

  /// Full SRC-style overflow: sharing, saving, author tools and moderation.
  Future<void> showPostMenu(
    BuildContext context,
    CommunityPost post, {
    VoidCallback? onDeleted,
  }) async {
    final uid = ref.read(currentUidProvider);
    final isMine = uid != null && uid == post.authorId;
    final saved =
        ref.read(myBookmarksProvider).asData?.value.contains(post.id) ?? false;

    final choice = await showGlassActionSheet<String>(
      context: context,
      actions: [
        GlassAction(
          value: 'save',
          icon: saved
              ? Icons.bookmark_remove_outlined
              : Icons.bookmark_border_rounded,
          label: saved ? 'Remove from saved' : 'Save post',
        ),
        const GlassAction(
          value: 'share',
          icon: Icons.share_outlined,
          label: 'Share post',
        ),
        const GlassAction(
          value: 'copy',
          icon: Icons.link_rounded,
          label: 'Copy post link',
        ),
        if (isMine)
          const GlassAction(
            value: 'edit',
            icon: Icons.edit_outlined,
            label: 'Edit post',
          ),
        if (!isMine) ...[
          const GlassAction(
            value: 'hide',
            icon: Icons.visibility_off_outlined,
            label: 'Not interested in this post',
          ),
          GlassAction(
            value: 'mute',
            icon: Icons.volume_off_outlined,
            label: 'Mute ${post.authorName}',
          ),
          GlassAction(
            value: 'block',
            icon: Icons.block_rounded,
            label: 'Block ${post.authorName}',
            isDestructive: true,
          ),
          const GlassAction(
            value: 'report',
            icon: Icons.flag_outlined,
            label: 'Report to moderators',
            isDestructive: true,
          ),
        ],
        if (isMine)
          const GlassAction(
            value: 'delete',
            icon: Icons.delete_outline_rounded,
            label: 'Delete post',
            isDestructive: true,
          ),
      ],
    );

    if (choice == null || !context.mounted) return;
    switch (choice) {
      case 'save':
        await toggleSave(context, post);
      case 'share':
        await share(context, post);
      case 'copy':
        await Clipboard.setData(
          ClipboardData(text: 'https://indigenworld.com/post/${post.id}'),
        );
        if (context.mounted) showCommunityMessage(context, 'Post link copied.');
      case 'edit':
        await _edit(context, post);
      case 'hide':
        await _hide(context, post);
      case 'mute':
        await _mute(context, post);
      case 'block':
        await _block(context, post);
      case 'report':
        await _report(context, post);
      case 'delete':
        await _delete(context, post, onDeleted: onDeleted);
    }
  }

  Future<void> _edit(BuildContext context, CommunityPost post) async {
    final controller = TextEditingController(text: post.text);
    // The glass card centres itself in whatever room the keyboard leaves, so
    // an autofocused field stays in sight rather than sitting under it.
    final updated = await showGlassPopup<String>(
      context: context,
      title: 'Edit post',
      builder: (popupContext) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            autofocus: true,
            minLines: 3,
            maxLines: 8,
            maxLength: CommunityRepository.maxPostLength,
            decoration: const InputDecoration(hintText: 'Update your words'),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => Navigator.pop(popupContext),
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: () => Navigator.pop(popupContext, controller.text),
                child: const Text('Save changes'),
              ),
            ],
          ),
        ],
      ),
    );
    controller.dispose();
    if (updated == null || updated.trim() == post.text.trim()) return;
    if (updated.trim().isEmpty &&
        post.media.isEmpty &&
        !post.hasPoll &&
        !post.isQuote) {
      if (context.mounted) {
        showCommunityMessage(context, 'A post cannot be empty.');
      }
      return;
    }
    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.editPost(postId: post.id, text: updated);
      if (context.mounted) showCommunityMessage(context, 'Post updated.');
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not edit the post.');
      }
    }
  }

  Future<void> _hide(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    final repository = ref.read(communityRepositoryProvider);
    if (profile == null || repository == null) return;
    await repository.hidePost(uid: profile.uid, postId: post.id);
    if (context.mounted) {
      showCommunityMessage(context, 'You will see less like this.');
    }
  }

  Future<void> _mute(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    final repository = ref.read(communityRepositoryProvider);
    if (profile == null || repository == null) return;
    await repository.muteProfile(uid: profile.uid, targetId: post.authorId);
    if (context.mounted) {
      showCommunityMessage(context, '${post.authorName} is muted.');
    }
  }

  Future<void> _block(BuildContext context, CommunityPost post) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Block ${post.authorName}?',
      message:
          'Their posts and reshares will disappear from your community feed. '
          'You will also stop following them.',
      confirmLabel: 'Block',
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;
    final profile = await requireProfile(context);
    final repository = ref.read(communityRepositoryProvider);
    if (profile == null || repository == null) return;
    await repository.blockProfile(uid: profile.uid, targetId: post.authorId);
    if (context.mounted) showCommunityMessage(context, 'Member blocked.');
  }

  Future<void> _report(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null || !context.mounted) return;

    final reason = await showGlassActionSheet<String>(
      context: context,
      title: 'Why are you reporting this?',
      actions: [
        for (final option in const [
          'Not written in Kasem',
          'Disrespectful or abusive',
          'Culturally inappropriate',
          'Spam or advertising',
          'Something else',
        ])
          GlassAction(value: option, label: option),
      ],
    );
    if (reason == null) return;

    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.reportPost(
        postId: post.id,
        reporterId: profile.uid,
        reason: reason,
      );
      if (context.mounted) {
        showCommunityMessage(
          context,
          'Reported. Moderators will review this post.',
        );
      }
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not send the report.');
      }
    }
  }

  Future<void> _delete(
    BuildContext context,
    CommunityPost post, {
    VoidCallback? onDeleted,
  }) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete this post?',
      message:
          'The post and its media are removed for everyone. Replies people '
          'already wrote stay on their own profiles. This cannot be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
    );
    if (confirmed != true) return;

    final repository = ref.read(communityRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.deletePost(post);
      if (context.mounted) showCommunityMessage(context, 'Post deleted.');
      onDeleted?.call();
    } on CommunityFailure catch (error) {
      if (context.mounted) showCommunityMessage(context, error.message);
    } on Object {
      if (context.mounted) {
        showCommunityMessage(context, 'Could not delete the post.');
      }
    }
  }
}
