import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The words this member kept, resolved against the published dictionary.
///
/// Saves are stored on the device as bare ids, so a word that was later
/// unpublished simply stops appearing rather than rendering as a broken row.
final savedDictionaryEntriesProvider =
    Provider<AsyncValue<List<DictionaryEntry>>>((ref) {
      final ids = ref.watch(savedDictionaryEntryIdsProvider);
      final entries = ref.watch(publishedDictionaryEntriesProvider);
      if (ids.hasError) return AsyncError(ids.error!, ids.stackTrace!);
      if (entries.hasError) {
        return AsyncError(entries.error!, entries.stackTrace!);
      }
      final savedIds = ids.asData?.value;
      final all = entries.asData?.value;
      if (savedIds == null || all == null) return const AsyncLoading();
      return AsyncData(
        List.unmodifiable(all.where((entry) => savedIds.contains(entry.id))),
      );
    });

class SavedWordsScreen extends ConsumerWidget {
  const SavedWordsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(savedDictionaryEntriesProvider);
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(title: const Text('Saved words')),
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(savedEntryIdsProvider);
            await ref.read(savedDictionaryEntryIdsProvider.future);
          },
          child: saved.when(
            loading: () => ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
              children: const [
                GlassSkeleton(height: 84),
                SizedBox(height: 12),
                GlassSkeleton(height: 84),
                SizedBox(height: 12),
                GlassSkeleton(height: 84),
              ],
            ),
            error: (_, _) => ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
              children: [
                GlassEmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: 'Your saved words could not be loaded',
                  color: context.brand.terracotta,
                  padding: EdgeInsets.zero,
                ),
              ],
            ),
            data: (entries) => ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
              children: entries.isEmpty
                  ? const [
                      GlassEmptyState(
                        icon: Icons.bookmark_border_rounded,
                        title: 'Nothing saved yet',
                        padding: EdgeInsets.zero,
                      ),
                    ]
                  : [
                      for (final entry in entries) ...[
                        _SavedWordCard(entry: entry),
                        const SizedBox(height: 12),
                      ],
                    ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SavedWordCard extends StatelessWidget {
  const _SavedWordCard({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) => GlassCard.listItem(
    semanticLabel: '${entry.headword}, ${entry.translation}',
    onTap: () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            EntryDetailScreen(entryId: entry.id, entry: entry),
      ),
    ),
    padding: const EdgeInsets.all(15),
    child: Row(
      children: [
        GlassIconPlate(
          icon: Icons.translate_rounded,
          color: context.brand.terracotta,
          size: 42,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                entry.headword,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 2),
              Text(
                entry.translation,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
              ),
            ],
          ),
        ),
        Icon(Icons.chevron_right_rounded, color: context.brand.mutedInk),
      ],
    ),
  );
}
