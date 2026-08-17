import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final repository = ref.watch(dictionaryRepositoryProvider);
    final trimmedQuery = _query.trim();
    final queryReady = trimmedQuery.isEmpty || trimmedQuery.runes.length >= 2;
    final results = queryReady
        ? repository.search(trimmedQuery)
        : const <DictionaryEntry>[];

    return ScreenContainer(
      child: CustomScrollView(
        key: const PageStorageKey('home-scroll'),
        slivers: [
          SliverToBoxAdapter(
            child: BrandHeader(
              eyebrow: 'Indigen World',
              title: 'Kasem, close at hand.',
              subtitle: 'Project Kasena · your language cell starts here',
              trailing: IconButton.filledTonal(
                tooltip: 'Notifications',
                onPressed: () => _showUnavailable(context),
                icon: const Icon(Icons.notifications_none_rounded),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 110),
            sliver: SliverList.list(
              children: [
                const DemoDataNotice(),
                const SizedBox(height: 18),
                Semantics(
                  textField: true,
                  label: 'Search the English and Kasem dictionary',
                  child: TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    onChanged: (value) => setState(() => _query = value),
                    decoration: InputDecoration(
                      hintText: 'Search English or Kasem',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _query.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _query = '');
                              },
                              icon: const Icon(Icons.close_rounded),
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                const Row(
                  children: [
                    StatusPill(
                      icon: Icons.offline_bolt_outlined,
                      label: 'AVAILABLE OFFLINE',
                      color: BrandColors.savannahGreen,
                    ),
                    SizedBox(width: 8),
                    StatusPill(
                      icon: Icons.translate_rounded,
                      label: 'ENGLISH ⇄ KASEM',
                      color: BrandColors.terracotta,
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                if (_query.isEmpty) ...[
                  _DailyCard(entry: DemoDictionaryRepository.entries.first),
                  const SizedBox(height: 24),
                  const SectionTitle(title: 'Explore the demo dictionary'),
                ] else if (!queryReady) ...[
                  const SectionTitle(title: 'Keep typing'),
                ] else ...[
                  SectionTitle(
                    title: results.isEmpty
                        ? 'No approved matches'
                        : '${results.length} local ${results.length == 1 ? 'match' : 'matches'}',
                  ),
                ],
                const SizedBox(height: 12),
                if (!queryReady)
                  const _SearchHint()
                else if (results.isEmpty)
                  _NoResults(query: _query)
                else
                  for (final entry in results) ...[
                    _DictionaryResultCard(entry: entry),
                    const SizedBox(height: 12),
                  ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showUnavailable(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Notifications unlock after Firebase is configured.'),
      ),
    );
  }
}

class _DailyCard extends StatelessWidget {
  const _DailyCard({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: BrandColors.heritageGreen,
      borderRadius: BorderRadius.circular(24),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.wb_sunny_outlined, color: BrandColors.kenteGold),
            SizedBox(width: 8),
            Text(
              'TODAY’S WORD · DEMO',
              style: TextStyle(
                color: BrandColors.kenteGold,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text(
          entry.headword,
          style: Theme.of(context).textTheme.headlineMedium
              ?.copyWith(color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          entry.translation,
          style: Theme.of(context).textTheme.bodyLarge
              ?.copyWith(color: Colors.white.withValues(alpha: 0.82)),
        ),
        const SizedBox(height: 18),
        FilledButton.tonalIcon(
          onPressed: () => context.push('/entry/${entry.id}'),
          icon: const Icon(Icons.arrow_forward_rounded),
          label: const Text('Open entry'),
        ),
      ],
    ),
  );
}

class _DictionaryResultCard extends StatelessWidget {
  const _DictionaryResultCard({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => context.push('/entry/${entry.id}'),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: BrandColors.terracotta.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(15),
              ),
              child: const Icon(
                Icons.menu_book_outlined,
                color: BrandColors.terracotta,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.headword,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    entry.translation,
                    style: const TextStyle(color: BrandColors.mutedInk),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    '${entry.partOfSpeech} · ${entry.dialect}',
                    style: const TextStyle(
                      color: BrandColors.savannahGreen,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    ),
  );
}

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Column(
        children: [
          const Icon(Icons.travel_explore_rounded, size: 42),
          const SizedBox(height: 12),
          Text(
            '“$query” is not in this device pack.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          const Text(
            'You can preserve the spelling and start a contribution draft.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => context.push(
              '/contribute?source=${Uri.encodeQueryComponent(query)}',
            ),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Contribute this word'),
          ),
        ],
      ),
    ),
  );
}

class _SearchHint extends StatelessWidget {
  const _SearchHint();

  @override
  Widget build(BuildContext context) => const Card(
    child: Padding(
      padding: EdgeInsets.all(18),
      child: Row(
        children: [
          Icon(Icons.keyboard_outlined, color: BrandColors.heritageGreen),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Enter at least two characters to search this device pack.',
            ),
          ),
        ],
      ),
    ),
  );
}
