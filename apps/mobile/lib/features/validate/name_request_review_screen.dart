import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/validate/data/name_request_queue.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/validate_screen.dart'
    show ReviewFlag;
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// One name request, in full, with the decision at the bottom.
///
/// The reviewer is being asked something a queue card cannot answer: is this a
/// real Kassena name, and does this person have any business carrying it. So
/// everything that bears on it is on one screen — the name as written, the fold
/// it becomes, what it is said to mean, who is said to bear it, and who is
/// asking — and the note is the part that matters most, because the spelling
/// alone tells nobody anything.
class NameRequestReviewScreen extends ConsumerStatefulWidget {
  const NameRequestReviewScreen({required this.request, super.key});

  final KasemNameRequest request;

  @override
  ConsumerState<NameRequestReviewScreen> createState() =>
      _NameRequestReviewScreenState();
}

class _NameRequestReviewScreenState
    extends ConsumerState<NameRequestReviewScreen> {
  final _note = TextEditingController();
  var _submitting = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _decide(NameRequestDecision decision) async {
    final repository = ref.read(nameRequestRepositoryProvider);
    if (repository == null || _submitting) return;

    final note = _note.text.trim();
    if (decision.requiresFeedback && note.length < 5) {
      setState(
        () => _error = 'Say why. The member reads this, and a "no" with no '
            'reason is one they cannot answer.',
      );
      return;
    }

    final request = widget.request;
    final confirmed = await showGlassConfirm(
      context: context,
      title: '${decision.label}?',
      message: switch (decision) {
        NameRequestDecision.approve => request.handle.isEmpty
            ? '${request.name} goes on the published list and anybody may '
                  'take it.'
            : '${request.name} goes on the published list and @${request.handle}'
                  ' becomes theirs in the same moment.',
        NameRequestDecision.reject =>
          'The name is not added, and the member is told why.',
      },
      confirmLabel: decision.label,
      isDestructive: decision == NameRequestDecision.reject,
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await repository.decide(
        requestId: request.id,
        decision: decision,
        note: note,
      );
      if (!mounted) return;
      showGlassToast(context, '${decision.label} — the member was told.');
      Navigator.of(context).pop(true);
    } on ReviewFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final request = widget.request;
    final decided = !request.isPending;

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(title: const Text('Review name')),
      body: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 40),
              children: [
                // The name as written, above the fold it becomes. That gap is
                // the entire subject of the decision: six letters of the
                // alphabet Kasem is written in cannot appear in a handle, so
                // approving this is approving both spellings at once.
                Text(
                  request.name,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  'Folds to @${request.ascii}',
                  style: TextStyle(
                    color: brand.accent,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 7,
                  runSpacing: 7,
                  children: [
                    ReviewFlag(
                      icon: Icons.category_rounded,
                      label: request.kindLabel,
                      color: brand.accent,
                    ),
                    ReviewFlag(
                      icon: Icons.tag_rounded,
                      label: request.status,
                      color: brand.mutedInk,
                    ),
                    if (request.handle.isNotEmpty)
                      ReviewFlag(
                        icon: Icons.workspace_premium_outlined,
                        label: '@${request.handle}',
                        color: brand.terracotta,
                      ),
                  ],
                ),
                const SizedBox(height: 16),

                // ── Who is asking ───────────────────────────────────────
                _Block(
                  heading: 'Who is asking',
                  child: Row(
                    children: [
                      CommunityAvatar(
                        initials: _initials(request),
                        size: 42,
                        username: request.requesterHandle,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              request.requesterName.isEmpty
                                  ? 'A member'
                                  : request.requesterName,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              request.requesterHandle.isEmpty
                                  ? 'No handle on file'
                                  : '@${request.requesterHandle}',
                              style: TextStyle(
                                color: brand.mutedInk,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ── The case for the name ───────────────────────────────
                _Block(
                  heading: 'Why it is a name',
                  child: Text(
                    request.note.isEmpty
                        ? 'Nothing was written.'
                        : request.note,
                    style: TextStyle(color: brand.ink, height: 1.5),
                  ),
                ),
                if (request.meaning.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _Block(
                    heading: 'What it means',
                    child: Text(
                      request.meaning,
                      style: TextStyle(color: brand.ink, height: 1.5),
                    ),
                  ),
                ],

                if (request.handle.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _Block(
                    heading: 'The handle asked for',
                    child: Text(
                      decided
                          ? _handleOutcome(request)
                          : 'Approving also gives them @${request.handle} — '
                                'their one name change, spent in the same '
                                'transaction. If it has since been taken, or '
                                'they have already spent it, the name is still '
                                'added and they are told why the handle was '
                                'not.',
                      style: TextStyle(color: brand.mutedInk, height: 1.5),
                    ),
                  ),
                ],

                if (decided && request.reviewNote.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _Block(
                    heading: 'The note left',
                    child: Text(
                      request.reviewNote,
                      style: TextStyle(color: brand.mutedInk, height: 1.5),
                    ),
                  ),
                ],

                const SizedBox(height: 20),

                if (decided)
                  GlassSurface(
                    padding: const EdgeInsets.all(15),
                    child: Row(
                      children: [
                        Icon(Icons.lock_outline_rounded, color: brand.mutedInk),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'This request has already been answered — there is '
                            'nothing left to decide.',
                            style: TextStyle(
                              color: brand.mutedInk,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                else ...[
                  TextField(
                    key: const Key('name-review-note'),
                    controller: _note,
                    minLines: 2,
                    maxLines: 5,
                    maxLength: 1000,
                    decoration: const InputDecoration(
                      labelText: 'Note to the member',
                      helperText: 'Required when rejecting.',
                    ),
                  ),
                  if (_error case final error?) ...[
                    const SizedBox(height: 8),
                    Text(
                      error,
                      style: TextStyle(
                        color: brand.danger,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  for (final decision in NameRequestDecision.values) ...[
                    FilledButton.icon(
                      key: Key('name-review-${decision.wire}'),
                      onPressed: _submitting ? null : () => _decide(decision),
                      style: FilledButton.styleFrom(
                        backgroundColor: decision.color(brand),
                        foregroundColor: Colors.white,
                      ),
                      icon: Icon(decision.icon),
                      label: Text(decision.label),
                    ),
                    const SizedBox(height: 9),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _initials(KasemNameRequest request) {
    final source = request.requesterName.isNotEmpty
        ? request.requesterName
        : request.requesterHandle;
    if (source.isEmpty) return '··';
    final parts = source.trim().split(RegExp(r'\s+'));
    final letters = parts
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();
    return letters.isEmpty ? '··' : letters;
  }

  /// What became of the handle, said plainly. The reviewer who approved it is
  /// often not the one reading this afterwards.
  static String _handleOutcome(KasemNameRequest request) =>
      switch (request.handleOutcome) {
        'applied' => '@${request.handle} was given to them.',
        'already-yours' => 'They were already called @${request.handle}, so the '
            'ring appeared the moment the name was published.',
        'already-changed' =>
          '@${request.handle} was not given: they had already spent their one '
              'name change. The name was added anyway.',
        'taken' =>
          '@${request.handle} was not given: somebody else had taken it by '
              'then. The name was added anyway.',
        'no-profile' =>
          '@${request.handle} was not given: they have no community profile '
              'yet. The name was added anyway.',
        _ => 'No handle was asked for.',
      };
}

class _Block extends StatelessWidget {
  const _Block({required this.heading, required this.child});

  final String heading;
  final Widget child;

  @override
  Widget build(BuildContext context) => GlassSurface(
    padding: const EdgeInsets.all(15),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          heading.toUpperCase(),
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 9.5,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 10),
        child,
      ],
    ),
  );
}
