import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/saved_drafts.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_category_style.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Posts the member chose to finish later, newest first.
///
/// Kept on this phone only. That is said on the screen, because somebody who
/// saves a draft and looks for it on their other phone deserves to know why
/// it is not there.
class DraftsScreen extends ConsumerWidget {
  const DraftsScreen({super.key});

  Future<void> _open(
    BuildContext context,
    WidgetRef ref,
    SavedDraft draft,
  ) async {
    final profile = await CommunityActions(ref).requireProfile(context);
    if (profile == null || !context.mounted) return;
    final staged = [
      for (final attachment in draft.survivingAttachments)
        PendingUpload(
          path: attachment.path,
          isVideo: _looksLikeVideo(attachment.path),
          isAudio: _looksLikeAudio(attachment.path),
          description: attachment.description,
        ),
    ];
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => ComposePostScreen(
          initialText: draft.text,
          initialCategory: draft.category,
          community: draft.community,
          initialAttachments: staged,
          initialEvent: draft.event,
          draftId: draft.id,
        ),
      ),
    );
  }

  static bool _looksLikeVideo(String path) {
    final lower = path.toLowerCase();
    return lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.m4v') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.3gp');
  }

  /// "Saved just now", "Saved 3 hr ago".
  static String _savedLabel(DateTime savedAt) {
    final age = communityAgeLabel(savedAt);
    return age == 'NOW' ? 'Saved just now' : 'Saved ${age.toLowerCase()} ago';
  }

  static bool _looksLikeAudio(String path) {
    final lower = path.toLowerCase();
    return lower.endsWith('.m4a') ||
        lower.endsWith('.aac') ||
        lower.endsWith('.mp3') ||
        lower.endsWith('.wav');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final drafts = ref.watch(savedDraftsProvider);
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Drafts')),
      body: drafts.isEmpty
          ? const CommunityEmptyState(
              icon: Icons.drafts_outlined,
              title: 'No drafts',
              message:
                  'Leave a post half-written and choose Save draft — it '
                  'waits here.',
            )
          : ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                  child: Text(
                    'Saved on this phone only.',
                    style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                  ),
                ),
                for (final draft in drafts)
                  Dismissible(
                    key: ValueKey('draft-${draft.id}'),
                    direction: DismissDirection.endToStart,
                    background: ColoredBox(
                      color: brand.terracotta,
                      child: const Align(
                        alignment: Alignment.centerRight,
                        child: Padding(
                          padding: EdgeInsets.only(right: 20),
                          child: Icon(
                            Icons.delete_outline_rounded,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    onDismissed: (_) {
                      ref.read(savedDraftsProvider.notifier).remove(draft.id);
                      showGlassToast(context, 'Draft deleted.');
                    },
                    child: ListTile(
                      onTap: () => _open(context, ref, draft),
                      contentPadding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                      title: Text(
                        draft.text.trim().isEmpty
                            ? '(Photos, no words yet)'
                            : draft.text.trim(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          [
                            _savedLabel(draft.savedAt),
                            if (draft.category case final category?)
                              category.label(l10n),
                            if (draft.community case final community?)
                              'in ${community.name}',
                            if (draft.attachmentPaths.isNotEmpty)
                              '${draft.attachmentPaths.length} attached',
                          ].join(' · '),
                          style: TextStyle(color: brand.mutedInk, fontSize: 12),
                        ),
                      ),
                      trailing: IconButton(
                        tooltip: 'Delete draft',
                        icon: const Icon(Icons.delete_outline_rounded),
                        onPressed: () async {
                          final confirmed = await showGlassConfirm(
                            context: context,
                            title: 'Delete this draft?',
                            message: 'It cannot be brought back.',
                            confirmLabel: 'Delete',
                            isDestructive: true,
                          );
                          if (confirmed != true) return;
                          await ref
                              .read(savedDraftsProvider.notifier)
                              .remove(draft.id);
                        },
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
