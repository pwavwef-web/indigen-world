import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/word_queue_screen.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Everything this member has sent, and what became of it.
///
/// It used to be the last five, pinned to the bottom of the contribute form
/// under a section title — which meant the sixth submission somebody ever made
/// quietly hid the first, and that following a review meant scrolling past the
/// whole of a form you were not filling in. It has its own screen now, so it
/// can show all of them.
///
/// It is also the only such screen. My Space had a second one, "Your
/// contributions", reading the same records into differently drawn cards with
/// no way to withdraw anything — so which list somebody saw depended on which
/// door they came in by. Both doors lead here now, and the Approved count on
/// My Space opens it already narrowed with [initialFilter].
class MySubmissionsScreen extends StatefulWidget {
  const MySubmissionsScreen({
    this.initialFilter = SubmissionFilter.all,
    super.key,
  });

  final SubmissionFilter initialFilter;

  @override
  State<MySubmissionsScreen> createState() => _MySubmissionsScreenState();
}

class _MySubmissionsScreenState extends State<MySubmissionsScreen> {
  late var _filter = widget.initialFilter;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.brand.background,
    appBar: AppBar(title: const Text('Your submissions')),
    body: SafeArea(
      bottom: false,
      child: ListView(
        padding: EdgeInsets.fromLTRB(18, 8, 18, 32 + musicInset(context)),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final filter in SubmissionFilter.values)
                ChoiceChip(
                  key: ValueKey('submissions-filter-${filter.name}'),
                  label: Text(filter.label),
                  selected: filter == _filter,
                  onSelected: (_) => setState(() => _filter = filter),
                ),
            ],
          ),
          const SizedBox(height: 14),
          _ContributionActivity(filter: _filter),
        ],
      ),
    ),
  );
}

class _ContributionActivity extends ConsumerWidget {
  const _ContributionActivity({required this.filter});

  final SubmissionFilter filter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(authStateProvider).asData?.value != null;
    if (!signedIn) {
      return const _ActivityEmpty(
        icon: Icons.lock_outline_rounded,
        message: 'Sign in to submit and follow your review status.',
      );
    }
    return ref
        .watch(myCollectionContributionsProvider)
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => const _ActivityEmpty(
            icon: Icons.cloud_off_rounded,
            message: 'Your submissions could not be refreshed.',
          ),
          data: (all) {
            final items = all
                .where((item) => filter.matches(item.status))
                .toList(growable: false);
            if (items.isEmpty) {
              return _ActivityEmpty(
                icon: switch (filter) {
                  SubmissionFilter.approved => Icons.stars_rounded,
                  _ => Icons.inbox_outlined,
                },
                message: switch (filter) {
                  SubmissionFilter.all =>
                    'No submissions yet. Your first one will appear here.',
                  SubmissionFilter.inReview =>
                    'Nothing is waiting on a reviewer.',
                  SubmissionFilter.needsChanges =>
                    'Nothing has been sent back to you.',
                  SubmissionFilter.approved => 'Nothing approved yet.',
                },
              );
            }
            return Column(
              children: [
                for (final item in items) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 2, 10, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 11,
                              vertical: 5,
                            ),
                            leading: CircleAvatar(
                              backgroundColor: context.brand.accentFill
                                  .withValues(alpha: 0.1),
                              foregroundColor: context.brand.accent,
                              child: Icon(contributionKindIcon(item.kind)),
                            ),
                            title: Text(
                              item.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              '${item.kind.label} · ${contributionStatusLabel(item.status)}',
                            ),
                            trailing: Icon(
                              item.status.toLowerCase() == 'published'
                                  ? Icons.public_rounded
                                  : Icons.schedule_rounded,
                              size: 19,
                            ),
                          ),
                          if (item.reviewFeedback.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 8, 8),
                              child: Text(
                                'Reviewer note: ${item.reviewFeedback}',
                                style: TextStyle(
                                  color: context.brand.mutedInk,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          if (item.isQueueAnswer &&
                              queueAnswerOutcome(item) != null)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(12, 0, 8, 8),
                              child: Text(
                                queueAnswerOutcome(item)!,
                                style: TextStyle(
                                  color: context.brand.ink,
                                  fontSize: 12,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          if (item.duplicateOf.isNotEmpty)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () =>
                                    context.push('/entry/${item.duplicateOf}'),
                                icon: const Icon(
                                  Icons.menu_book_outlined,
                                  size: 18,
                                ),
                                label: const Text('See the word it repeats'),
                              ),
                            ),
                          if (item.canRevise)
                            Align(
                              alignment: Alignment.centerRight,
                              child: FilledButton.tonalIcon(
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (context) => WordQueueScreen(
                                      revision: QueueRevision(
                                        contributionId: item.id,
                                        wordId: item.wordQueueId,
                                        word: item.title,
                                        translations: item.body,
                                        kasemExample: item.kasemExample,
                                        notes: item.notes,
                                        dialect: item.dialect,
                                        partOfSpeechId: item.partOfSpeechId,
                                        reviewerNote: item.reviewFeedback,
                                        revisionCount: item.revisionCount,
                                        details: item.queueDetails,
                                        publicationPermission:
                                            item.publicationPermission,
                                      ),
                                    ),
                                  ),
                                ),
                                icon: const Icon(
                                  Icons.edit_note_rounded,
                                  size: 18,
                                ),
                                label: const Text('Correct your answer'),
                              ),
                            ),
                          if (_canWithdraw(item.status))
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton.icon(
                                onPressed: () => _withdraw(context, ref, item),
                                icon: const Icon(
                                  Icons.remove_circle_outline_rounded,
                                  size: 18,
                                ),
                                label: Text(
                                  item.status.toLowerCase() == 'published'
                                      ? 'Withdraw from public Collection'
                                      : 'Withdraw submission',
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 9),
                ],
                // The list is the most recent ones only. Saying so beats a
                // member scrolling to the end and concluding the rest are lost.
                if (all.length >= kMyContributionsLimit)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Showing your latest $kMyContributionsLimit.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: context.brand.mutedInk,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            );
          },
        );
  }

  bool _canWithdraw(String status) => !const {
    'withdrawn',
    'rejected',
    'archived',
  }.contains(status.toLowerCase());

  Future<void> _withdraw(
    BuildContext context,
    WidgetRef ref,
    CollectionContributionRecord item,
  ) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Withdraw this contribution?',
      message: item.status.toLowerCase() == 'published'
          ? 'This will remove the work from the public Collection and revoke publication permission.'
          : 'This will remove the contribution from active review.',
      cancelLabel: 'Keep it',
      confirmLabel: 'Withdraw',
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;

    final repository = ref.read(collectionContributionRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.withdraw(item.id);
      ref.invalidate(myCollectionContributionsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Contribution withdrawn.')),
        );
      }
    } on Object {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not withdraw this contribution. Try again.'),
          ),
        );
      }
    }
  }
}

class _ActivityEmpty extends StatelessWidget {
  const _ActivityEmpty({required this.icon, required this.message});

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) => GlassCard(
    padding: const EdgeInsets.all(18),
    child: Row(
      children: [
        Icon(icon, color: context.brand.terracotta),
        const SizedBox(width: 12),
        Expanded(child: Text(message)),
      ],
    ),
  );
}

/// What happened to a word-queue answer, in a sentence, once there is
/// something to say.
String? queueAnswerOutcome(CollectionContributionRecord item) {
  final status = item.status.toLowerCase();
  if (item.revisionCount > 0 && contributionAwaitingReview(status)) {
    return 'Corrected and back with the reviewers.';
  }
  if (!contributionApproved(status)) return null;
  return switch (item.publishedAs) {
    'expression' => 'Approved as an expression.',
    'variant' => 'Approved as a regional variant of a dictionary word.',
    'example' => 'Approved as an example sentence.',
    'translation-pair' => 'Approved as a translation pair.',
    'training' => 'Approved and kept to help test and train language tools.',
    _ => null,
  };
}
