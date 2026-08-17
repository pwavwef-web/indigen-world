import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class EntryDetailScreen extends ConsumerWidget {
  const EntryDetailScreen({required this.entryId, super.key});

  final String entryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entry = ref.watch(dictionaryRepositoryProvider).findById(entryId);
    if (entry == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Entry unavailable')),
        body: const Center(
          child: Text('This entry is not in the current pack.'),
        ),
      );
    }

    final savedIds =
        ref.watch(savedEntryIdsProvider).asData?.value ?? const <String>{};
    final isSaved = savedIds.contains(entry.id);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dictionary entry'),
        actions: [
          IconButton(
            tooltip: isSaved ? 'Remove from saved words' : 'Save word',
            onPressed: () async {
              final saved = await ref
                  .read(savedEntryRepositoryProvider)
                  .toggle(entry.id);
              ref.invalidate(savedEntryIdsProvider);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      saved
                          ? 'Saved on this device.'
                          : 'Removed from saved words.',
                    ),
                  ),
                );
              }
            },
            icon: Icon(
              isSaved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
            ),
          ),
        ],
      ),
      body: ScreenContainer(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            const DemoDataNotice(),
            const SizedBox(height: 20),
            Row(
              children: [
                const StatusPill(
                  icon: Icons.verified_outlined,
                  label: 'DEMO PROJECTION',
                  color: BrandColors.savannahGreen,
                ),
                const Spacer(),
                Text(
                  entry.partOfSpeech,
                  style: const TextStyle(
                    color: BrandColors.mutedInk,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              entry.headword,
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 8),
            Text(
              entry.translation,
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(color: BrandColors.terracotta),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Chip(
                  avatar: const Icon(Icons.location_on_outlined, size: 18),
                  label: Text(entry.dialect),
                ),
                const Chip(
                  avatar: Icon(Icons.language_rounded, size: 18),
                  label: Text('Kasem'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _DetailCard(
              icon: Icons.volume_up_outlined,
              title: 'Pronunciation',
              body: entry.pronunciation,
              trailing: IconButton.filledTonal(
                tooltip: 'Audio unavailable',
                onPressed: () => _showAudioNotice(context),
                icon: const Icon(Icons.play_arrow_rounded),
              ),
            ),
            const SizedBox(height: 12),
            _DetailCard(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Example',
              body: '${entry.example}\n${entry.exampleTranslation}',
            ),
            if (entry.culturalNote != null) ...[
              const SizedBox(height: 12),
              _DetailCard(
                icon: Icons.auto_stories_outlined,
                title: 'Cultural context',
                body: entry.culturalNote!,
              ),
            ],
            const SizedBox(height: 12),
            _DetailCard(
              icon: Icons.gavel_outlined,
              title: 'Source and rights',
              body: '${entry.attribution}\nMobile channel · development only',
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () => context.push(
                '/contribute?source=${Uri.encodeQueryComponent(entry.translation)}&entryId=${entry.id}',
              ),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Suggest a correction'),
            ),
          ],
        ),
      ),
    );
  }

  void _showAudioNotice(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Audio stays disabled until consent and validation are ready.',
        ),
      ),
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({
    required this.icon,
    required this.title,
    required this.body,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String body;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: BrandColors.heritageGreen),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 7),
                Text(body),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    ),
  );
}
