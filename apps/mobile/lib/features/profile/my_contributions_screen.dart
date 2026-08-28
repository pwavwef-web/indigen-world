import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The statuses that mean a reviewer said yes.
///
/// `archived` is in here on purpose: it is what an approved contribution
/// becomes when the contributor did not grant publication permission. It was
/// approved; it simply is not public.
const _approvedStatuses = {'approved', 'published', 'scheduled', 'archived'};

bool isApprovedContribution(CollectionContributionRecord record) =>
    _approvedStatuses.contains(record.status.toLowerCase());

/// Everything this member has sent for review — or only what came back
/// approved, which is what the Approved stat on the profile opens.
class MyContributionsScreen extends ConsumerWidget {
  const MyContributionsScreen({this.approvedOnly = false, super.key});

  final bool approvedOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contributions = ref.watch(myCollectionContributionsProvider);
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: Text(approvedOnly ? 'Approved' : 'Your contributions'),
      ),
      body: SafeArea(
        bottom: false,
        child: contributions.when(
          loading: () => ListView(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
            children: const [
              GlassSkeleton(height: 92),
              SizedBox(height: 12),
              GlassSkeleton(height: 92),
              SizedBox(height: 12),
              GlassSkeleton(height: 92),
            ],
          ),
          error: (_, _) => ListView(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
            children: [
              GlassEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Your submissions could not be loaded',
                color: context.brand.terracotta,
                padding: EdgeInsets.zero,
              ),
            ],
          ),
          data: (all) {
            final items = approvedOnly
                ? all.where(isApprovedContribution).toList(growable: false)
                : all;
            if (items.isEmpty) {
              return ListView(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
                children: [
                  GlassEmptyState(
                    icon: approvedOnly
                        ? Icons.stars_rounded
                        : Icons.outbox_rounded,
                    title: approvedOnly
                        ? 'Nothing approved yet'
                        : 'You have not contributed yet',
                    padding: EdgeInsets.zero,
                    action: FilledButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (context) =>
                              const ContributeScreen(standalone: true),
                        ),
                      ),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Contribute something'),
                    ),
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
              children: [
                for (final item in items) ...[
                  _ContributionCard(record: item),
                  const SizedBox(height: 12),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ContributionCard extends StatelessWidget {
  const _ContributionCard({required this.record});

  final CollectionContributionRecord record;

  @override
  Widget build(BuildContext context) {
    final approved = isApprovedContribution(record);
    final colour = approved
        ? context.brand.success
        : record.status.toLowerCase() == 'rejected'
        ? const Color(0xFFA12A2A)
        : context.brand.gold;
    return GlassCard.listItem(
      accent: colour,
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GlassIconPlate(icon: _icon(record), color: colour, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      record.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${record.kind.label} · ${statusLabel(record.status)}',
                      style: TextStyle(
                        color: colour,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (record.reviewFeedback.isNotEmpty) ...[
            const SizedBox(height: 11),
            Text(
              record.reviewFeedback,
              style: TextStyle(
                color: context.brand.mutedInk,
                fontSize: 12.5,
                height: 1.35,
              ),
            ),
          ],
        ],
      ),
    );
  }

  static IconData _icon(CollectionContributionRecord record) =>
      switch (record.kind.name) {
        'music' => Icons.music_note_rounded,
        'literature' => Icons.auto_stories_rounded,
        'audiobooks' => Icons.headphones_rounded,
        'video' => Icons.movie_creation_rounded,
        _ => Icons.translate_rounded,
      };
}

/// The member-facing name for a review status.
String statusLabel(String status) => switch (status.toLowerCase()) {
  'approved' => 'Approved',
  'needs_changes' || 'needs_revision' => 'Needs changes',
  'rejected' => 'Not approved',
  'published' => 'Published',
  'scheduled' => 'Scheduled',
  'under_review' => 'Under review',
  'withdrawn' => 'Withdrawn',
  'archived' => 'Approved privately',
  _ => 'Submitted for review',
};
