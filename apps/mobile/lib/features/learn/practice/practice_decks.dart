import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';

/// Which published entries make sense to practise.
///
/// A good share of the published dictionary is sentence pairs and reference
/// rows. A flashcard of a twelve-word sentence is not a word review, and an
/// entry with no meaning cannot be checked, so both are left out.
bool isPractisable(DictionaryEntry entry) {
  final headword = entry.headword.trim();
  final meaning = entry.translation.trim();
  if (headword.isEmpty || meaning.isEmpty) return false;
  return headword.split(RegExp(r'\s+')).length <= 3 && meaning.length <= 80;
}

/// Today's review: words that are due first, then a few new ones — the
/// member's saved words before anything else, then today's word, then the
/// dictionary from where today's walk has reached.
List<DictionaryEntry> buildReviewDeck({
  required List<DictionaryEntry> entries,
  required LearnProgress progress,
  Set<String> savedIds = const {},
  String? todayWordId,
  int size = 10,
  int newLimit = 5,
}) {
  final usable = entries.where(isPractisable).toList();
  final byId = {for (final entry in usable) entry.id: entry};
  final now = learnNow();

  final due =
      progress.reviewCards.entries
          .where((card) => card.value.isDue(now) && byId.containsKey(card.key))
          .toList()
        ..sort((a, b) {
          final byDue = a.value.dueDay.compareTo(b.value.dueDay);
          return byDue != 0 ? byDue : a.value.box.compareTo(b.value.box);
        });
  final deck = <DictionaryEntry>[
    for (final card in due.take(size)) byId[card.key]!,
  ];
  if (deck.length >= size) return deck;

  final fresh = <DictionaryEntry>[];
  final taken = <String>{...progress.reviewCards.keys};
  void offer(DictionaryEntry? entry) {
    if (entry == null || taken.contains(entry.id)) return;
    taken.add(entry.id);
    fresh.add(entry);
  }

  for (final id in savedIds) {
    offer(byId[id]);
  }
  offer(byId[todayWordId]);
  if (usable.isNotEmpty) {
    final start =
        startOfDay(now).difference(DateTime(2020)).inDays.abs() % usable.length;
    for (var step = 0; step < usable.length && fresh.length < newLimit; step++) {
      offer(usable[(start + step) % usable.length]);
    }
  }
  deck.addAll(fresh.take(newLimit).take(size - deck.length));
  return deck;
}

/// Entries with a real recording and a meaning — what Listen can use.
List<DictionaryEntry> listenableEntries(List<DictionaryEntry> entries) => [
  for (final entry in entries)
    if (entry.audioUrl.isNotEmpty && isPractisable(entry)) entry,
];

/// The fewest recordings a listening quiz needs: one answer and three
/// distractors that are all real, published meanings.
const listenQuizMinimum = 4;

/// Three wrong meanings for [answer], from other listenable entries, in a
/// stable order for [round] so a rebuild does not reshuffle the options.
List<String> listenOptions({
  required DictionaryEntry answer,
  required List<DictionaryEntry> pool,
  required int round,
}) {
  final meanings = <String>{answer.translation.trim()};
  final others = [
    for (final entry in pool)
      if (entry.id != answer.id &&
          entry.translation.trim().toLowerCase() !=
              answer.translation.trim().toLowerCase())
        entry.translation.trim(),
  ];
  if (others.isNotEmpty) {
    // Walked from a round-dependent start, so each round draws a different set
    // and every distinct meaning is reachable.
    final start = (round * 7) % others.length;
    for (var step = 0; step < others.length && meanings.length < 4; step++) {
      meanings.add(others[(start + step) % others.length]);
    }
  }
  final options = meanings.toList();
  // Rotate so the right answer is not always first.
  final shift = round % options.length;
  return [...options.sublist(shift), ...options.sublist(0, shift)];
}

/// Whether an English transcript says the dictionary meaning.
///
/// Deliberately forgiving about articles and punctuation and deliberately
/// strict about everything else: this is shown as *experimental* feedback, and
/// a false "correct" teaches the wrong thing.
bool transcriptMatchesMeaning(String transcript, DictionaryEntry entry) {
  String fold(String value) => value
      .toLowerCase()
      .replaceAll(RegExp(r"[^a-z0-9' ]"), ' ')
      .replaceAll(RegExp(r'\b(a|an|the|to|it is|it means|means)\b'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  final said = fold(transcript);
  if (said.isEmpty) return false;
  final meanings = <String>{
    entry.translation,
    ...entry.translations,
  }.expand((meaning) => meaning.split(RegExp(r'[,;/]'))).map(fold);
  return meanings.any(
    (meaning) =>
        meaning.isNotEmpty &&
        (said == meaning || ' $said '.contains(' $meaning ')),
  );
}
