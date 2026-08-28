import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/submission_review_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The queues a validator moves work between.
const _queues = <(String, String, IconData)>[
  ('SUBMITTED', 'Waiting', Icons.inbox_rounded),
  ('APPROVED', 'Approved', Icons.check_circle_rounded),
  ('UNDER_REVIEW', 'Escalated', Icons.flag_rounded),
  ('PUBLISHED', 'Published', Icons.public_rounded),
];

/// The validation desk.
///
/// Only mounted for accounts whose `role` claim can actually review — the same
/// check the Security Rules and `decideSubmission` make. Showing this queue to
/// anybody else would produce a screen made entirely of permission errors.
class ValidateScreen extends ConsumerWidget {
  const ValidateScreen({this.reserveTopRight = false, super.key});

  final bool reserveTopRight;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(reviewQueueStatusProvider);
    final queue = ref.watch(reviewQueueProvider);
    final role = ref.watch(userRoleProvider).asData?.value;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: ScreenContainer(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(userRoleProvider);
            await ref.read(userRoleProvider.future);
          },
          child: CustomScrollView(
            key: const PageStorageKey('validate-scroll'),
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: BrandHeader(
                  reserveTopRight: reserveTopRight,
                  eyebrow: role == null ? 'Validate' : 'Validate · $role',
                  title: 'The review desk.',
                ),
              ),
              SliverToBoxAdapter(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Row(
                    children: [
                      for (final (value, label, icon) in _queues) ...[
                        GlassPill(
                          label: label,
                          icon: icon,
                          selected: status == value,
                          onTap: () => ref
                              .read(reviewQueueStatusProvider.notifier)
                              .select(value),
                        ),
                        const SizedBox(width: 8),
                      ],
                    ],
                  ),
                ),
              ),
              ...switch (queue) {
                AsyncValue(:final value?) when value.isEmpty => [
                  SliverToBoxAdapter(
                    child: GlassEmptyState(
                      icon: Icons.done_all_rounded,
                      title: switch (status) {
                        'SUBMITTED' => 'Nothing is waiting for review',
                        'APPROVED' => 'Nothing approved is waiting to publish',
                        'UNDER_REVIEW' => 'Nothing has been escalated',
                        _ => 'Nothing here yet',
                      },
                      color: context.brand.success,
                    ),
                  ),
                ],
                AsyncValue(:final value?) => [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      18,
                      2,
                      18,
                      kFrostedNavBarReservedSpace + 24,
                    ),
                    sliver: SliverList.separated(
                      itemCount: value.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(height: 12),
                      itemBuilder: (context, index) =>
                          _QueueCard(item: value[index]),
                    ),
                  ),
                ],
                AsyncValue(:final error?) => [
                  SliverToBoxAdapter(
                    child: GlassEmptyState(
                      icon: Icons.lock_outline_rounded,
                      color: context.brand.terracotta,
                      title: '$error'.contains('permission-denied')
                          ? 'This account cannot review submissions'
                          : 'The queue could not be loaded',
                      action: FilledButton.icon(
                        onPressed: () => ref.invalidate(reviewQueueProvider),
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Try again'),
                      ),
                    ),
                  ),
                ],
                _ => [
                  const SliverPadding(
                    padding: EdgeInsets.fromLTRB(18, 2, 18, 24),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        children: [
                          GlassSkeleton(height: 116),
                          SizedBox(height: 12),
                          GlassSkeleton(height: 116),
                          SizedBox(height: 12),
                          GlassSkeleton(height: 116),
                        ],
                      ),
                    ),
                  ),
                ],
              },
            ],
          ),
        ),
      ),
    );
  }
}

class _QueueCard extends StatelessWidget {
  const _QueueCard({required this.item});

  final ReviewItem item;

  @override
  Widget build(BuildContext context) {
    // A submission with an undeclared minors question, borrowed material or a
    // missing consent attestation is the one a reviewer must not skim past, so
    // the card is marked before it is opened.
    final flagged =
        !item.participantsConsented ||
        item.usesThirdPartyMaterial ||
        item.involvesMinors == true;
    return GlassCard.listItem(
      accent: flagged ? context.brand.terracotta : context.brand.accent,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => SubmissionReviewScreen(item: item),
        ),
      ),
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GlassIconPlate(
                icon: _icon(item),
                color: flagged
                    ? context.brand.terracotta
                    : context.brand.accent,
                size: 44,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        if (item.collectionKind.isNotEmpty) item.collectionKind,
                        if (item.format.isNotEmpty) item.format,
                        if (item.dialect.isNotEmpty) item.dialect,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.brand.mutedInk,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: context.brand.mutedInk),
            ],
          ),
          const SizedBox(height: 11),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              if (item.hasMedia)
                ReviewFlag(
                  icon: item.mediaType == 'audio'
                      ? Icons.audiotrack_rounded
                      : item.mediaType == 'video'
                      ? Icons.movie_creation_rounded
                      : Icons.description_rounded,
                  label: item.mediaType ?? 'file',
                  color: context.brand.accent,
                ),
              if (item.publicationPermission)
                ReviewFlag(
                  icon: Icons.public_rounded,
                  label: 'May publish',
                  color: context.brand.success,
                ),
              if (!item.participantsConsented)
                ReviewFlag(
                  icon: Icons.report_gmailerrorred_rounded,
                  label: 'No consent',
                  color: context.brand.terracotta,
                ),
              if (item.usesThirdPartyMaterial)
                ReviewFlag(
                  icon: Icons.copyright_rounded,
                  label: 'Third-party',
                  color: context.brand.terracotta,
                ),
              if (item.involvesMinors == true)
                ReviewFlag(
                  icon: Icons.child_care_rounded,
                  label: 'Minors',
                  color: context.brand.terracotta,
                ),
            ],
          ),
        ],
      ),
    );
  }

  static IconData _icon(ReviewItem item) => switch (item.collectionKind) {
    'music' => Icons.music_note_rounded,
    'literature' => Icons.auto_stories_rounded,
    'audiobooks' => Icons.headphones_rounded,
    'video' => Icons.movie_creation_rounded,
    'dictionary' => Icons.translate_rounded,
    _ => Icons.inbox_rounded,
  };
}

/// A small marker on a queue card or a review sheet.
class ReviewFlag extends StatelessWidget {
  const ReviewFlag({
    required this.icon,
    required this.label,
    required this.color,
    super.key,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: color.withValues(alpha: 0.28)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    ),
  );
}
