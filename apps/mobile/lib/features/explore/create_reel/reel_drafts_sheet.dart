import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The reels saved on this phone, other than the one open now: resume one, or
/// delete it with a confirmation.
Future<void> showReelDraftsSheet(
  BuildContext context,
  ReelEditorController controller,
) => showGlassPopup<void>(
  context: context,
  title: 'Your drafts',
  subtitle: 'Saved on this phone',
  scrollable: false,
  builder: (context) => _DraftsBody(controller: controller),
);

class _DraftsBody extends StatefulWidget {
  const _DraftsBody({required this.controller});

  final ReelEditorController controller;

  @override
  State<_DraftsBody> createState() => _DraftsBodyState();
}

class _DraftsBodyState extends State<_DraftsBody> {
  late Future<List<ReelDraft>> _drafts = widget.controller.otherDrafts();
  var _busy = false;

  void _reload() {
    final drafts = widget.controller.otherDrafts();
    setState(() {
      _drafts = drafts;
    });
  }

  Future<void> _resume(ReelDraft draft) async {
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    await widget.controller.resumeDraft(draft.id);
    navigator.pop();
  }

  Future<void> _delete(ReelDraft draft) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete this draft?',
      message:
          'Its video and details will be removed from this phone. This cannot '
          'be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    await widget.controller.deleteDraft(draft.id);
    if (!mounted) return;
    setState(() => _busy = false);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.6,
      ),
      child: FutureBuilder<List<ReelDraft>>(
        future: _drafts,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const ReelBanner(
              isError: true,
              message: 'Your drafts could not be read.',
            );
          }
          final drafts = snapshot.data;
          if (drafts == null) {
            return const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (drafts.isEmpty) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                'No other drafts.',
                textAlign: TextAlign.center,
                style: TextStyle(color: brand.mutedInk),
              ),
            );
          }
          return ListView.separated(
            shrinkWrap: true,
            itemCount: drafts.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) => _DraftRow(
              draft: drafts[index],
              enabled: !_busy && !widget.controller.locked,
              onResume: () => _resume(drafts[index]),
              onDelete: () => _delete(drafts[index]),
            ),
          );
        },
      ),
    );
  }
}

class _DraftRow extends StatelessWidget {
  const _DraftRow({
    required this.draft,
    required this.enabled,
    required this.onResume,
    required this.onDelete,
  });

  final ReelDraft draft;
  final bool enabled;
  final VoidCallback onResume;
  final VoidCallback onDelete;

  String get _title {
    final caption = draft.caption.trim();
    if (caption.isNotEmpty) return caption.split('\n').first;
    return draft.topic?.label ?? 'Untitled reel';
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final subtitle = [
      reelEditedLabel(draft.updatedAt),
      if (draft.video == null)
        'Video missing — choose it again'
      else
        formatReelClock(draft.selectedDuration),
    ].join(' · ');
    return Row(
      children: [
        SizedBox(
          width: 48,
          height: 84,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: ReelCoverImage(path: draft.coverPath, decodeWidth: 160),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: brand.ink, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  color: draft.video == null ? brand.danger : brand.mutedInk,
                  fontSize: 12.5,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: enabled ? onResume : null,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(48, 40),
                  alignment: Alignment.centerLeft,
                ),
                child: Text('Resume', semanticsLabel: 'Resume $_title'),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Delete draft',
          onPressed: enabled ? onDelete : null,
          icon: Icon(Icons.delete_outline_rounded, color: brand.danger),
        ),
      ],
    );
  }
}
