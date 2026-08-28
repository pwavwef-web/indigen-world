import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/campaign_detail_screen.dart';
import 'package:indigen_world_mobile/features/ads/create_ad_screen.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_repository.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Create adverts and watch the ones already running.
///
/// Lives inside the profile as its own destination and also stands alone, so a
/// link from anywhere in the app can land here.
class AdsScreen extends ConsumerWidget {
  const AdsScreen({this.standalone = false, super.key});

  final bool standalone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final body = const _AdsBody();
    if (!standalone) return body;
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(title: const Text('Adverts')),
      body: SafeArea(bottom: false, child: body),
    );
  }
}

class _AdsBody extends ConsumerWidget {
  const _AdsBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(authStateProvider).asData?.value != null;
    final campaigns = ref.watch(myAdCampaignsProvider);

    Future<void> create() async {
      if (!signedIn) {
        final ok = await showSignInSheet(context);
        if (ok != true || !context.mounted) return;
      }
      if (!context.mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<bool>(builder: (context) => const CreateAdScreen()),
      );
    }

    return ListView(
      key: const PageStorageKey('profile-ads-scroll'),
      padding: const EdgeInsets.fromLTRB(
        18,
        8,
        18,
        kFrostedNavBarReservedSpace + 28,
      ),
      children: [
        _AdsHero(onCreate: create),
        const SizedBox(height: 16),
        Row(
          children: [
            Text(
              'Your campaigns',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Spacer(),
            if (campaigns.asData?.value.isNotEmpty ?? false)
              TextButton.icon(
                onPressed: create,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('New'),
              ),
          ],
        ),
        const SizedBox(height: 10),
        if (!signedIn)
          GlassEmptyState(
            icon: Icons.lock_outline_rounded,
            title: 'Sign in to advertise',
            padding: EdgeInsets.zero,
            action: FilledButton.icon(
              onPressed: create,
              icon: const Icon(Icons.login_rounded),
              label: const Text('Sign in'),
            ),
          )
        else
          campaigns.when(
            loading: () => const Column(
              children: [
                GlassSkeleton(height: 108),
                SizedBox(height: 12),
                GlassSkeleton(height: 108),
              ],
            ),
            error: (_, _) => GlassEmptyState(
              icon: Icons.cloud_off_rounded,
              title: 'Your campaigns could not be loaded',
              color: context.brand.terracotta,
              padding: EdgeInsets.zero,
            ),
            data: (items) => items.isEmpty
                ? GlassEmptyState(
                    icon: Icons.campaign_rounded,
                    title: 'No campaigns yet',
                    padding: EdgeInsets.zero,
                    action: FilledButton.icon(
                      onPressed: create,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Create your first advert'),
                    ),
                  )
                : Column(
                    children: [
                      for (final campaign in items) ...[
                        AdCampaignCard(campaign: campaign),
                        const SizedBox(height: 12),
                      ],
                    ],
                  ),
          ),
      ],
    );
  }
}

/// The one thing this screen is for, said once at the top.
class _AdsHero extends StatelessWidget {
  const _AdsHero({required this.onCreate});

  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(26),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFF082F25),
          BrandColors.heritageGreen,
          Color(0xFF17644C),
        ],
      ),
      boxShadow: glassShadows(context.brand, onDark: true),
    ),
    child: Stack(
      children: [
        const Positioned(
          right: -14,
          bottom: -30,
          child: Opacity(
            opacity: 0.1,
            child: Icon(Icons.campaign_rounded, color: Colors.white, size: 128),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'ADVERTISE',
              style: TextStyle(
                color: context.brand.gold,
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.3,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Reach the community.',
              style: Theme.of(context).textTheme.headlineSmall
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onCreate,
              style: FilledButton.styleFrom(
                backgroundColor: context.brand.gold,
                foregroundColor: context.brand.accent,
              ),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Create an advert'),
            ),
          ],
        ),
      ],
    ),
  );
}

/// One campaign in the list: what it is, where it stands, what it costs.
class AdCampaignCard extends StatelessWidget {
  const AdCampaignCard({required this.campaign, super.key});

  final AdCampaign campaign;

  @override
  Widget build(BuildContext context) => GlassCard.listItem(
    accent: campaign.status.color(context.brand),
    onTap: () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CampaignDetailScreen(campaignId: campaign.id),
      ),
    ),
    padding: const EdgeInsets.all(15),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            GlassIconPlate(
              icon: campaign.creative?.isVideo ?? false
                  ? Icons.movie_creation_rounded
                  : Icons.image_rounded,
              color: campaign.status.color(context.brand),
              size: 42,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    campaign.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${cedis(campaign.totalBudgetPesewas)} · '
                    '${campaign.durationDays} '
                    '${campaign.durationDays == 1 ? 'day' : 'days'}',
                    style: TextStyle(
                      color: context.brand.mutedInk,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: context.brand.mutedInk),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            AdStatusPill(status: campaign.status),
            const Spacer(),
            if (campaign.status == AdCampaignStatus.active)
              Text(
                '${campaign.impressions} views · ${campaign.clicks} taps',
                style: TextStyle(
                  color: context.brand.mutedInk,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
          ],
        ),
      ],
    ),
  );
}

class AdStatusPill extends StatelessWidget {
  const AdStatusPill({required this.status, super.key});

  final AdCampaignStatus status;

  @override
  Widget build(BuildContext context) {
    final color = status.color(context.brand);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(status.icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            status.label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
