import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/word_lookup.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';

/// Today's word on the Learn tab.
@immutable
class DailyWord {
  const DailyWord({
    required this.entry,
    this.imageUrl = '',
    this.imageAttribution = '',
    this.chosen = false,
  });

  final DictionaryEntry entry;

  /// A picture an administrator attached for today, with its credit.
  final String imageUrl;
  final String imageAttribution;

  /// True when somebody picked this word for today; false when it is the date's
  /// turn in the walk through the published dictionary.
  final bool chosen;

  bool get hasAudio => entry.audioUrl.isNotEmpty;
}

/// What `dailyWords/{today}` says, if anything.
@immutable
class DailyWordPick {
  const DailyWordPick({
    required this.entryId,
    this.imageUrl = '',
    this.imageAttribution = '',
  });

  final String entryId;
  final String imageUrl;
  final String imageAttribution;
}

/// The pick for the learner's own today, read from `dailyWords/{yyyy-MM-dd}`.
final dailyWordPickProvider = StreamProvider<DailyWordPick?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(null);
  return FirebaseFirestore.instance
      .collection('dailyWords')
      .doc(dayKey(learnNow()))
      .snapshots()
      .map((snapshot) {
        final data = snapshot.data();
        final entryId = data?['entryId'];
        if (entryId is! String || entryId.isEmpty) return null;
        String text(String key) {
          final value = data?[key];
          return value is String ? value.trim() : '';
        }

        return DailyWordPick(
          entryId: entryId,
          imageUrl: text('imageUrl'),
          imageAttribution: text('imageAttribution'),
        );
      })
      // No document, no permission or no connection all mean the same thing
      // here: walk the dictionary instead.
      .handleError((Object _) {});
});

/// Today's word: the administrator's pick when there is one and it is still
/// published, otherwise the date's entry from the published dictionary. Null
/// when the dictionary has nothing published.
final dailyWordProvider = Provider<DailyWord?>((ref) {
  final pick = ref.watch(dailyWordPickProvider).asData?.value;
  if (pick != null) {
    final entries =
        ref.watch(publishedDictionaryEntriesProvider).asData?.value ??
        const <DictionaryEntry>[];
    for (final entry in entries) {
      if (entry.id == pick.entryId) {
        return DailyWord(
          entry: entry,
          imageUrl: pick.imageUrl,
          imageAttribution: pick.imageAttribution,
          chosen: true,
        );
      }
    }
  }
  final walked = ref.watch(wordOfTheDayProvider);
  return walked == null ? null : DailyWord(entry: walked);
});
