import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/validate/ad_review_screen.dart';
import 'package:indigen_world_mobile/features/validate/data/ad_review_queue.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/submission_review_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The queues a validator moves contributions between.
const _queues = <(String, String, IconData)>[
  ('SUBMITTED', 'Waiting', Icons.inbox_rounded),
  ('APPROVED', 'Approved', Icons.check_circle_rounded),
  ('UNDER_REVIEW', 'Escalated', Icons.flag_rounded),
  ('PUBLISHED', 'Published', Icons.public_rounded),
];

/// The two kinds of work that reach the desk.
enum _Desk {
  contributions,
  adverts;

  String get label => switch (this) {
    _Desk.contributions => 'Contributions',
    _Desk.adverts => 'Adverts',
  };
}

/// Which half of the desk is open.
final _deskProvider = NotifierProvider<_DeskTab, _Desk>(_DeskTab.new);

class _DeskTab extends Notifier<_Desk> {
  @override
  _Desk build() => _Desk.contributions;

  void select(_Desk desk) => state = desk;
}

/// The review desk.
///
/// Only mounted for accounts whose `role` claim can actually review — the same
/// check the Security Rules, `decideSubmission` and `decideAdCampaign` all make.
/// Showing these queues to anybody else would produce a screen made entirely of
/// permission errors.
///
/// Two halves, because two different things arrive here and neither one's
/// vocabulary fits the other. A contribution is approved, escalated or
/// published; an advert has been paid for, runs for a stated number of days,
/// and can be stopped again after it starts.
class ValidateScreen extends ConsumerWidget {
  const ValidateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final desk = ref.watch(_deskProvider);
    final role = ref.watch(userRoleProvider).asData?.value;

    // A pushed route rather than a shell tab, so it paints its own ground and
    // carries its own way back. It used to be transparent, which was right
    // when the shell was painting the motifs behind it and wrong the moment
    // there is a previous route under there instead.
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: const Text('Review desk'),
        backgroundColor: Colors.transparent,
      ),
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
                  eyebrow: role == null ? 'Review' : 'Review · $role',
                  title: 'Waiting on you.',
                ),
              ),
              SliverToBoxAdapter(
                child: _DeskSwitch(
                  selected: desk,
                  onChanged: (value) =>
                      ref.read(_deskProvider.notifier).select(value),
                ),
              ),
              ...switch (desk) {
                _Desk.contributions => _contributionSlivers(context, ref),
                _Desk.adverts => _advertSlivers(context, ref),
              },
            ],
          ),
        ),
      ),
    );
  }

  /// The contribution queue: what somebody sent in through Contribute.
  List<Widget> _contributionSlivers(BuildContext context, WidgetRef ref) {
    final status = ref.watch(reviewQueueStatusProvider);
    final queue = ref.watch(reviewQueueProvider);
    return [
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
                _ => [const _QueueSkeleton()],
              },
    ];
  }

  /// The advert queue: campaigns that have been paid for and are waiting on a
  /// decision, plus the ones already running.
  List<Widget> _advertSlivers(BuildContext context, WidgetRef ref) {
    final status = ref.watch(adReviewQueueStatusProvider);
    final queue = ref.watch(adReviewQueueProvider);
    return [
      SliverToBoxAdapter(
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: Row(
            children: [
              for (final (value, label, icon) in kAdReviewQueues) ...[
                GlassPill(
                  label: label,
                  icon: icon,
                  selected: status == value,
                  onTap: () =>
                      ref.read(adReviewQueueStatusProvider.notifier).select(value),
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
                AdCampaignStatus.inReview => 'No adverts are waiting',
                AdCampaignStatus.active => 'Nothing is running',
                AdCampaignStatus.paused => 'Nothing is paused',
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
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) =>
                  _AdQueueCard(campaign: value[index]),
            ),
          ),
        ],
        AsyncValue(:final error?) => [
          SliverToBoxAdapter(
            child: GlassEmptyState(
              icon: Icons.lock_outline_rounded,
              color: context.brand.terracotta,
              title: '$error'.contains('permission-denied')
                  ? 'This account cannot review adverts'
                  : 'The advert queue could not be loaded',
              action: FilledButton.icon(
                onPressed: () => ref.invalidate(adReviewQueueProvider),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Try again'),
              ),
            ),
          ),
        ],
        _ => [const _QueueSkeleton()],
      },
    ];
  }
}

/// Contributions or adverts. A switch rather than a second tab in the shell:
/// they are the same job, and a reviewer moves between them constantly.
class _DeskSwitch extends ConsumerWidget {
  const _DeskSwitch({required this.selected, required this.onChanged});

  final _Desk selected;
  final ValueChanged<_Desk> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final waitingAds = ref.watch(adReviewWaitingCountProvider).asData?.value ?? 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: context.brand.divider)),
        ),
        child: Row(
          children: [
            for (final desk in _Desk.values)
              _DeskTabLabel(
                label: desk.label,
                // Only the waiting count is worth a badge: a reviewer needs to
                // know there is something to do, not how much has been done.
                badge: desk == _Desk.adverts && waitingAds > 0
                    ? '$waitingAds'
                    : null,
                selected: desk == selected,
                onTap: () => onChanged(desk),
              ),
          ],
        ),
      ),
    );
  }
}

class _DeskTabLabel extends StatelessWidget {
  const _DeskTabLabel({
    required this.label,
    required this.selected,
    required this.onTap,
    this.badge,
  });

  final String label;
  final String? badge;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        child: InkWell(
          onTap: onTap,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: selected ? brand.ink : brand.mutedInk,
                        fontSize: 14,
                        fontWeight: selected
                            ? FontWeight.w800
                            : FontWeight.w500,
                      ),
                    ),
                    if (badge case final badge?) ...[
                      const SizedBox(width: 7),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: brand.terracotta,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          badge,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                height: 3,
                width: selected ? 64 : 0,
                decoration: BoxDecoration(
                  color: brand.accent,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QueueSkeleton extends StatelessWidget {
  const _QueueSkeleton();

  @override
  Widget build(BuildContext context) => const SliverPadding(
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
  );
}

/// One campaign in the advert queue.
class _AdQueueCard extends StatelessWidget {
  const _AdQueueCard({required this.campaign});

  final AdCampaign campaign;

  @override
  Widget build(BuildContext context) {
    // A campaign that reached review without being paid for is the one a
    // reviewer must not approve on autopilot, so the card says so before it is
    // opened.
    final unpaid = !campaign.isPaid;
    return GlassCard(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<bool>(
          builder: (context) => AdReviewScreen(campaign: campaign),
        ),
      ),
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  campaign.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              if (unpaid)
                StatusPill(
                  icon: Icons.money_off_rounded,
                  label: 'Unpaid',
                  color: context.brand.danger,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            campaign.headline,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 13,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 11),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              StatusPill(
                icon: Icons.payments_rounded,
                label: cedis(campaign.totalBudgetPesewas),
                color: context.brand.accent,
              ),
              StatusPill(
                icon: Icons.calendar_month_rounded,
                label: '${campaign.durationDays} days',
                color: context.brand.mutedInk,
              ),
              for (final placement in campaign.placements)
                StatusPill(
                  icon: placement.icon,
                  label: placement.label,
                  color: context.brand.terracotta,
                ),
            ],
          ),
        ],
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
