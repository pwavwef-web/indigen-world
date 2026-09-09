import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/domain/kasem_homographs.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_search.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/kasem_key_bar.dart';
import 'package:indigen_world_mobile/features/dictionary/result_row.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The dictionary, as three ways into the same lexicon.
///
/// ── Why this screen grew a nav bar ────────────────────────────────────────
/// It was one scrolling list with a search box on top, and that shape can only
/// answer one question: *what is this word?* Everything else a person opens a
/// dictionary for had nowhere to happen. Somebody who wanted to see what the
/// archive holds under `ŋ` had to scroll to it past every word beginning a
/// through n. Somebody who had saved forty words had them on a different screen
/// entirely, filed under the app rather than under the language.
///
/// Three destinations, because three is what the data honestly supports:
///
///   **Look up** — the search, and the reason the app exists. Incremental,
///   forgiving of spelling, tone and keyboard, and able to answer from a
///   plural, from the English, or from a half-remembered shape.
///
///   **Browse** — the alphabet, in Kasem order, with a letter rail. This is
///   what a printed dictionary is *for* and no search box replaces it: you
///   cannot look up a word you have not met, and browsing is how vocabulary is
///   actually acquired.
///
///   **Saved** — the words this reader kept. Already stored on the device and
///   until now visible only from elsewhere.
///
/// ── What is deliberately not here ─────────────────────────────────────────
/// Flashcards, tone drills and a document reader are the obvious next tabs and
/// none of them is in this build, because every one of them needs data the
/// archive does not yet hold in quantity — a study system built over an
/// incomplete lexicon teaches the gaps. Nothing on this screen shows a word,
/// a form, a recording or a count that is not in the published archive.
class DictionaryScreen extends ConsumerStatefulWidget {
  const DictionaryScreen({super.key});

  @override
  ConsumerState<DictionaryScreen> createState() => _DictionaryScreenState();
}

enum _Tab { lookUp, browse, saved }

class _DictionaryScreenState extends ConsumerState<DictionaryScreen> {
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();
  final _browseScroll = ScrollController();

  var _tab = _Tab.lookUp;
  var _query = '';
  var _filters = const DictionaryFilters();
  var _filtersOpen = false;

  /// Where each browse letter starts in the alphabetical list, rebuilt when the
  /// archive changes. Index rather than key, so the rail can jump to a row
  /// without every row having to hold a `GlobalKey`.
  final _letterOffsets = <String, int>{};

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocus.dispose();
    _browseScroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(publishedDictionaryEntriesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Kasem dictionary'),
        actions: [
          IconButton(
            tooltip: 'Add a word',
            onPressed: () => context.push('/contribute?category=dictionary'),
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
      // ── The Kasem letters, above the keyboard, on the Look up tab ────────
      // 785 of the published headwords carry a letter no stock keyboard
      // produces. `foldForSearch` rescues the reader who types `di` for `dɩ`;
      // this is for the reader who would rather type the real letter, and for
      // every future surface where folding is not available.
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_tab == _Tab.lookUp)
            KasemKeyBar(
              targets: {_searchController: _searchFocus},
              onInserted: () =>
                  setState(() => _query = _searchController.text),
            ),
          NavigationBar(
            selectedIndex: _Tab.values.indexOf(_tab),
            onDestinationSelected: (index) =>
                setState(() => _tab = _Tab.values[index]),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.search_rounded),
                label: 'Look up',
              ),
              NavigationDestination(
                icon: Icon(Icons.sort_by_alpha_rounded),
                label: 'Browse',
              ),
              NavigationDestination(
                icon: Icon(Icons.bookmark_border_rounded),
                selectedIcon: Icon(Icons.bookmark_rounded),
                label: 'Saved',
              ),
            ],
          ),
        ],
      ),
      body: entries.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _LoadFailed(
          onRetry: () => ref.invalidate(publishedDictionaryEntriesProvider),
        ),
        data: (all) => switch (_tab) {
          _Tab.lookUp => _lookUp(all),
          _Tab.browse => _browse(all),
          _Tab.saved => _saved(all),
        },
      ),
    );
  }

  // ── Look up ───────────────────────────────────────────────────────────────

  Widget _lookUp(List<DictionaryEntry> all) {
    final results = searchDictionary(
      entries: all,
      query: _query,
      filters: _filters,
    );
    final counts = ref.watch(dictionaryHeadwordCountsProvider);
    final searching = _query.trim().isNotEmpty;
    // The rule the Collection has always used, kept: adverts over the whole
    // dictionary, none over a search. Somebody who has typed a word is looking
    // for that word, and a sponsored card between the third and fourth answer
    // is an interruption of a question rather than a break in a browse.
    final rows = searching || _filters.isNarrowed
        ? List<Object>.of(results.hits)
        : collectionRowsWithAds(
            items: List<Object>.of(results.hits),
            ads: ref.watch(collectionAdsProvider),
          );
    return ScreenContainer(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  focusNode: _searchFocus,
                  textInputAction: TextInputAction.search,
                  onChanged: (value) => setState(() => _query = value),
                  decoration: InputDecoration(
                    hintText: 'A Kasem word, an English one, or ba*ra',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_query.isNotEmpty)
                          IconButton(
                            tooltip: 'Clear search',
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _query = '');
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                        IconButton(
                          tooltip: 'Narrow the search',
                          onPressed: () =>
                              setState(() => _filtersOpen = !_filtersOpen),
                          icon: Icon(
                            Icons.tune_rounded,
                            color: _filters.isNarrowed
                                ? context.brand.accent
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_filtersOpen) ...[
                  const SizedBox(height: 10),
                  _FilterBar(
                    filters: _filters,
                    onChanged: (value) => setState(() => _filters = value),
                  ),
                ],
                const SizedBox(height: 8),
                _ResultCount(
                  results: results,
                  searching: searching || _filters.isNarrowed,
                  archiveSize: all.length,
                ),
              ],
            ),
          ),
          Expanded(
            child: results.isEmpty
                ? _NoResults(
                    query: _query,
                    suggestions: results.suggestions,
                    narrowed: _filters.isNarrowed,
                    onSuggestion: (entry) {
                      _searchController.text = entry.headword;
                      setState(() => _query = entry.headword);
                    },
                    onClearFilters: () => setState(
                      () => _filters = const DictionaryFilters(),
                    ),
                  )
                : _ResultList(rows: rows, counts: counts),
          ),
        ],
      ),
    );
  }

  // ── Browse ────────────────────────────────────────────────────────────────

  /// The whole archive in Kasem alphabetical order, with a letter rail.
  ///
  /// The list arrives sorted — `FirestoreDictionaryRepository` sorts on
  /// [DictionaryEntry.sortKey] so that ɛ files after e and ŋ after n rather
  /// than all of them after z — so browsing is a render of what is already
  /// there rather than a second ordering that could disagree with it.
  Widget _browse(List<DictionaryEntry> all) {
    final letters = browseLetters(all);
    final counts = ref.watch(dictionaryHeadwordCountsProvider);
    _letterOffsets.clear();
    for (var index = 0; index < all.length; index++) {
      final letter = browseLetterOf(all[index]);
      _letterOffsets.putIfAbsent(letter, () => index);
    }
    if (all.isEmpty) {
      return const _Empty(
        icon: Icons.menu_book_outlined,
        title: 'No words yet',
        body: 'Published entries appear here as the community adds them.',
      );
    }
    return ScreenContainer(
      child: Row(
        children: [
          Expanded(
            child: ListView.separated(
              controller: _browseScroll,
              padding: const EdgeInsets.fromLTRB(18, 12, 8, 28),
              itemCount: all.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final entry = all[index];
                final letter = browseLetterOf(entry);
                final startsLetter = _letterOffsets[letter] == index;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (startsLetter) _LetterHeading(letter: letter),
                    DictionaryResultRow(
                      hit: DictionaryHit(entry: entry, rank: 0),
                      siblings: counts[headwordKey(entry.headword)] ?? 1,
                    ),
                  ],
                );
              },
            ),
          ),
          _LetterRail(
            letters: letters,
            onTap: (letter) {
              final index = _letterOffsets[letter];
              if (index == null || !_browseScroll.hasClients) return;
              // An estimate rather than a measured offset: the rows are
              // near-uniform and jumpTo on an estimate lands within a row,
              // which is close enough for a rail. Measuring would mean a
              // `GlobalKey` on twelve hundred rows to save a reader one flick.
              _browseScroll.jumpTo(
                (index * _estimatedRowHeight).clamp(
                  0,
                  _browseScroll.position.maxScrollExtent,
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  static const _estimatedRowHeight = 84.0;

  // ── Saved ─────────────────────────────────────────────────────────────────

  Widget _saved(List<DictionaryEntry> all) {
    final savedIds = ref.watch(savedDictionaryEntryIdsProvider);
    final counts = ref.watch(dictionaryHeadwordCountsProvider);
    return savedIds.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => const _Empty(
        icon: Icons.bookmark_border_rounded,
        title: 'Saved words unavailable',
        body: 'This device could not read its saved list.',
      ),
      data: (ids) {
        // Filtered from the archive rather than fetched by id, so a word that
        // has since been withdrawn or merged away simply stops appearing —
        // rather than becoming a row that opens on an error.
        final rows = all
            .where((entry) => ids.contains(entry.id))
            .toList(growable: false);
        if (rows.isEmpty) {
          return const _Empty(
            icon: Icons.bookmark_border_rounded,
            title: 'Nothing saved yet',
            body:
                'Tap the bookmark on any entry and it is kept here, on this '
                'device, with or without a connection.',
          );
        }
        return ScreenContainer(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 28),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) => DictionaryResultRow(
              hit: DictionaryHit(entry: rows[index], rank: 0),
              siblings: counts[headwordKey(rows[index].headword)] ?? 1,
            ),
          ),
        );
      },
    );
  }
}

/// How many words answered, and how many were left out.
///
/// Stated rather than implied. A list silently capped at fifty tells a reader
/// the dictionary is small; "50 of 312" tells them to type another letter.
class _ResultCount extends StatelessWidget {
  const _ResultCount({
    required this.results,
    required this.searching,
    required this.archiveSize,
  });

  final DictionaryResults results;
  final bool searching;
  final int archiveSize;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final text = !searching
        ? '$archiveSize published ${archiveSize == 1 ? 'word' : 'words'}'
        : results.truncated
        ? 'Showing ${results.hits.length} of ${results.total} — type another letter to narrow it'
        : '${results.total} ${results.total == 1 ? 'word' : 'words'}';
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        text,
        style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
      ),
    );
  }
}

/// The narrowing controls, opened from the tune icon.
class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.filters, required this.onChanged});

  final DictionaryFilters filters;
  final ValueChanged<DictionaryFilters> onChanged;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final scope in DictionaryScope.values)
              Padding(
                padding: const EdgeInsets.only(right: 7),
                child: GlassPill(
                  label: scope.label,
                  dense: true,
                  selected: filters.scope == scope,
                  onTap: () => onChanged(filters.copyWith(scope: scope)),
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 7),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            GlassPill(
              label: 'Recorded',
              icon: Icons.volume_up_rounded,
              dense: true,
              selected: filters.recordedOnly,
              onTap: () => onChanged(
                filters.copyWith(recordedOnly: !filters.recordedOnly),
              ),
            ),
            const SizedBox(width: 7),
            GlassPill(
              label: 'With an example',
              icon: Icons.chat_bubble_outline_rounded,
              dense: true,
              selected: filters.withExampleOnly,
              onTap: () => onChanged(
                filters.copyWith(withExampleOnly: !filters.withExampleOnly),
              ),
            ),
            const SizedBox(width: 7),
            // Only the classes a reader plausibly filters by. The full
            // twenty-five-item list belongs in the contribution picker, where
            // somebody is describing one word; here it would be a horizontal
            // scroll nobody reaches the end of.
            for (final id in const ['noun', 'verb', 'adjective', 'proverb'])
              Padding(
                padding: const EdgeInsets.only(right: 7),
                child: GlassPill(
                  label: partOfSpeechById(id)?.label ?? id,
                  dense: true,
                  selected: filters.wordClass == id,
                  onTap: () => onChanged(
                    filters.copyWith(
                      wordClass: filters.wordClass == id ? '' : id,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ],
  );
}

/// What a search that found nothing says.
///
/// ── Why an empty screen was the wrong answer ──────────────────────────────
/// It reads as *this word is not in the dictionary*, which for a learner
/// working from something they heard is usually false — the word is there and
/// they spelled it the way it sounded. The near spellings turn the commonest
/// failure back into a lookup, and cost one pass over a list already in memory.
class _NoResults extends StatelessWidget {
  const _NoResults({
    required this.query,
    required this.suggestions,
    required this.narrowed,
    required this.onSuggestion,
    required this.onClearFilters,
  });

  final String query;
  final List<DictionaryEntry> suggestions;
  final bool narrowed;
  final ValueChanged<DictionaryEntry> onSuggestion;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 24, 18, 28),
      children: [
        Icon(Icons.search_off_rounded, size: 38, color: brand.faintInk),
        const SizedBox(height: 12),
        Text(
          query.trim().isEmpty
              ? 'Nothing matches those filters'
              : 'No word spelled “${query.trim()}”',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          narrowed
              ? 'The filters may be doing this rather than the spelling.'
              : 'Tone marks and the letters ɛ ɩ ŋ ɔ ʋ are all optional — '
                    'typing what you can reach finds the word either way.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: brand.mutedInk,
            fontSize: 12.5,
            height: 1.45,
          ),
        ),
        if (narrowed) ...[
          const SizedBox(height: 14),
          Center(
            child: OutlinedButton.icon(
              onPressed: onClearFilters,
              icon: const Icon(Icons.filter_alt_off_rounded, size: 18),
              label: const Text('Clear the filters'),
            ),
          ),
        ],
        if (suggestions.isNotEmpty) ...[
          const SizedBox(height: 22),
          Text(
            'DID YOU MEAN',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: brand.terracotta,
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in suggestions)
                GlassPill(
                  label: entry.headword,
                  onTap: () => onSuggestion(entry),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

/// The answers, with whatever sponsored cards belong between them.
class _ResultList extends StatelessWidget {
  const _ResultList({required this.rows, required this.counts});

  final List<Object> rows;
  final Map<String, int> counts;

  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
    itemCount: rows.length,
    separatorBuilder: (_, _) => const SizedBox(height: 8),
    itemBuilder: (context, index) {
      final row = rows[index];
      if (row is ServedAd) {
        return SponsoredCard(
          ad: row,
          slot: 'dictionary-$index',
          margin: EdgeInsets.zero,
        );
      }
      final hit = row as DictionaryHit;
      return DictionaryResultRow(
        hit: hit,
        siblings: counts[headwordKey(hit.entry.headword)] ?? 1,
      );
    },
  );
}

class _LetterHeading extends StatelessWidget {
  const _LetterHeading({required this.letter});

  final String letter;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 10, bottom: 8),
    child: Row(
      children: [
        Text(
          letter,
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 18,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(child: Divider(color: context.brand.divider)),
      ],
    ),
  );
}

/// The alphabet down the side, in Kasem order.
///
/// Lists only the letters the archive actually has entries under — a rail
/// offering `q` on a Kasem dictionary sends a reader to an empty screen and
/// reads as a broken index rather than as an honest gap.
class _LetterRail extends StatelessWidget {
  const _LetterRail({required this.letters, required this.onTap});

  final List<String> letters;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    if (letters.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      width: 30,
      child: LayoutBuilder(
        builder: (context, constraints) {
          // Sized to fit rather than scrolled. A rail that scrolls is a rail
          // that has to be scrolled to be used, which defeats the point of
          // having one beside a list that already scrolls.
          final size = (constraints.maxHeight / letters.length).clamp(
            11.0,
            22.0,
          );
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final letter in letters)
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onTap(letter),
                    child: Center(
                      child: Text(
                        letter,
                        style: TextStyle(
                          fontSize: (size * 0.62).clamp(9.0, 13.0),
                          fontWeight: FontWeight.w800,
                          color: context.brand.mutedInk,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 38, color: context.brand.faintInk),
          const SizedBox(height: 12),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 12.5,
              height: 1.45,
            ),
          ),
        ],
      ),
    ),
  );
}

class _LoadFailed extends StatelessWidget {
  const _LoadFailed({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'The dictionary could not be loaded.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Try again'),
          ),
        ],
      ),
    ),
  );
}

/// Opens an entry. One place, so every surface in this feature pushes the same
/// route with the same argument.
void openDictionaryEntry(BuildContext context, DictionaryEntry entry) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => EntryDetailScreen(entryId: entry.id, entry: entry),
    ),
  );
}
