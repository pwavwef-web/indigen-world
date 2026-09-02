import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
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
class MySubmissionsScreen extends StatelessWidget {
  const MySubmissionsScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.brand.background,
    appBar: AppBar(title: const Text('Your submissions')),
    body: SafeArea(
      bottom: false,
      child: ListView(
        padding: EdgeInsets.fromLTRB(18, 12, 18, 32 + musicInset(context)),
        children: const [_ContributionActivity()],
      ),
    ),
  );
}

class _ContributionActivity extends ConsumerWidget {
  const _ContributionActivity();

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
          data: (items) {
            if (items.isEmpty) {
              return const _ActivityEmpty(
                icon: Icons.inbox_outlined,
                message: 'No submissions yet. Your first one will appear here.',
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
