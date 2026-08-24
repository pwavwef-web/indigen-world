import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

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

  /// The overflow sheet: save, report, and delete for your own posts.
  Future<void> showPostMenu(
    BuildContext context,
    CommunityPost post, {
    VoidCallback? onDeleted,
  }) async {
    final uid = ref.read(currentUidProvider);
    final isMine = uid != null && uid == post.authorId;
    final saved =
        ref.read(myBookmarksProvider).asData?.value.contains(post.id) ?? false;

    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(
                saved
                    ? Icons.bookmark_remove_outlined
                    : Icons.bookmark_border_rounded,
              ),
              title: Text(saved ? 'Remove from saved' : 'Save post'),
              onTap: () => Navigator.pop(sheetContext, 'save'),
            ),
            if (!isMine)
              ListTile(
                leading: const Icon(
                  Icons.flag_outlined,
                  color: BrandColors.terracotta,
                ),
                title: const Text('Report to moderators'),
                onTap: () => Navigator.pop(sheetContext, 'report'),
              ),
            if (isMine)
              ListTile(
                leading: const Icon(
                  Icons.delete_outline_rounded,
                  color: BrandColors.terracotta,
                ),
                title: const Text('Delete post'),
                onTap: () => Navigator.pop(sheetContext, 'delete'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (choice == null || !context.mounted) return;
    switch (choice) {
      case 'save':
        await toggleSave(context, post);
      case 'report':
        await _report(context, post);
      case 'delete':
        await _delete(context, post, onDeleted: onDeleted);
    }
  }

  Future<void> _report(BuildContext context, CommunityPost post) async {
    final profile = await requireProfile(context);
    if (profile == null || !context.mounted) return;

    final reason = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Why are you reporting this?',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                ),
              ),
            ),
            for (final option in const [
              'Not written in Kasem',
              'Disrespectful or abusive',
              'Culturally inappropriate',
              'Spam or advertising',
              'Something else',
            ])
              ListTile(
                title: Text(option),
                onTap: () => Navigator.pop(sheetContext, option),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete this post?'),
        content: const Text(
          'The post and its media are removed for everyone. Replies people '
          'already wrote stay on their own profiles. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete'),
          ),
        ],
      ),
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
