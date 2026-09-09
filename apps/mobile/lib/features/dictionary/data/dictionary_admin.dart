import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';

/// The desk a validator edits the published dictionary from.
///
/// ── Why this is callables and not Firestore writes ────────────────────────
/// `firestore.rules` says `allow write: if false` on `dictionaryEntries` and it
/// still does. Every rule the backend enforces — a headword is never blanked, a
/// homograph number is never silently reused, a merge leaves a forwarding
/// address, a deletion carries the whole document into the audit log first — is
/// a rule about the shape of the archive that a Security Rule cannot express.
/// So this file sends intentions, and `services/functions/src/dictionary-admin.ts`
/// decides what happens.
///
/// ── The one thing to keep in step ─────────────────────────────────────────
/// [EntryPatch.toJson] emits only the keys somebody actually changed, because
/// the backend reads an absent key as "leave it alone". A patch that helpfully
/// posted every field would let a reviewer who opened the editor to fix a typo
/// blank the etymology a different person spent an afternoon on — and it would
/// do it silently, on a screen that reported success.

/// A validator's edit to one published entry, as the fields they touched.
///
/// Deliberately a map of *changes* rather than a copy of the entry. See the
/// header: the shape is the safety property.
@immutable
class EntryPatch {
  const EntryPatch(this._fields);

  const EntryPatch.empty() : _fields = const <String, Object?>{};

  final Map<String, Object?> _fields;

  bool get isEmpty => _fields.isEmpty;

  /// This patch with [field] set to [value], unless [value] equals [original] —
  /// in which case the field is dropped, so a box a reviewer clicked into and
  /// left alone is not sent as a change.
  EntryPatch withField(String field, Object? value, {Object? original}) {
    final next = Map<String, Object?>.of(_fields);
    if (_same(value, original)) {
      next.remove(field);
    } else {
      next[field] = value;
    }
    return EntryPatch(next);
  }

  Map<String, Object?> toJson() => Map<String, Object?>.unmodifiable(_fields);

  static bool _same(Object? left, Object? right) {
    if (left is List && right is List) {
      return left.length == right.length &&
          List.generate(left.length, (i) => left[i] == right[i]).every((x) => x);
    }
    if (left is Map && right is Map) {
      return left.length == right.length &&
          left.entries.every((entry) => right[entry.key] == entry.value);
    }
    return left == right;
  }
}

/// One entry the archive already holds under a spelling.
///
/// What a reviewer is shown when the desk says *this word already exists*. It
/// carries enough to tell two words apart at a glance — the meaning, the class,
/// the sense number — because "already exists" is only useful if the reviewer
/// can see whether it is the same word or a homograph.
@immutable
class ExistingEntry {
  const ExistingEntry({
    required this.id,
    required this.kasemText,
    required this.englishText,
    required this.partOfSpeech,
    required this.dialect,
    required this.homographIndex,
    required this.isPublished,
    required this.hasAudio,
    required this.similarity,
    required this.exact,
  });

  final String id;
  final String kasemText;
  final String englishText;
  final String partOfSpeech;
  final String dialect;
  final int homographIndex;
  final bool isPublished;
  final bool hasAudio;

  /// 1 for an identical spelling; below 1 for a near miss the reviewer should
  /// look at but which the backend is not claiming is the same word.
  final double similarity;

  final bool exact;

  static ExistingEntry fromJson(Map<Object?, Object?> json) => ExistingEntry(
    id: _text(json['id']),
    kasemText: _text(json['kasemText']),
    englishText: _text(json['englishText']),
    partOfSpeech: _text(json['partOfSpeech']),
    dialect: _text(json['dialect']),
    homographIndex: (json['homographIndex'] as num?)?.toInt() ?? 0,
    isPublished: json['isPublished'] == true,
    hasAudio: json['hasAudio'] == true,
    similarity: (json['similarity'] as num?)?.toDouble() ?? 0,
    exact: json['exact'] == true,
  );
}

/// What the archive holds under one spelling.
@immutable
class ExistingEntries {
  const ExistingEntries({
    required this.headword,
    required this.matches,
    required this.exactCount,
  });

  static const empty = ExistingEntries(
    headword: '',
    matches: <ExistingEntry>[],
    exactCount: 0,
  );

  final String headword;
  final List<ExistingEntry> matches;

  /// How many carry the identical spelling. The near misses below these are
  /// offered for a human to judge and are not counted as duplicates.
  final int exactCount;

  bool get hasExact => exactCount > 0;
  bool get isEmpty => matches.isEmpty;
}

/// One field, as both entries have it, for the compare screen.
@immutable
class MergeRow {
  const MergeRow({
    required this.field,
    required this.target,
    required this.source,
    required this.conflict,
  });

  final String field;
  final String target;
  final String source;

  /// Both sides said something and they differ. The only rows a reviewer has to
  /// make a decision about — everything else merges without asking.
  final bool conflict;

  static MergeRow fromJson(Map<Object?, Object?> json) => MergeRow(
    field: _text(json['field']),
    target: _text(json['target']),
    source: _text(json['source']),
    conflict: json['conflict'] == true,
  );

  /// The field name as a reviewer reads it.
  ///
  /// The stored names are the document's, and `pluralDefinite` on a compare
  /// screen is a schema detail leaking into a decision somebody is being asked
  /// to make. The wording matches `DictionaryEntry.nounForms` and
  /// `verbForms` so the compare screen and the entry screen call the same
  /// thing the same name.
  String get label => switch (field) {
    'englishText' => 'Meaning',
    'kasemDefinition' => 'In Kasem',
    'ipa' => 'Pronunciation (IPA)',
    'pronunciation' => 'Written guide',
    'etymology' => 'Where it comes from',
    'kasemExample' => 'Example (Kasem)',
    'englishExample' => 'Example (English)',
    'culturalNote' => 'Cultural context',
    'source' => 'Source',
    'dialect' => 'Dialect',
    'partOfSpeech' => 'Word class',
    'audioUrl' => 'Recording',
    'nounClass' => 'Noun class',
    'forms.definite' => 'The one',
    'forms.plural' => 'Many',
    'forms.pluralDefinite' => 'The many',
    'forms.counted' => 'Two',
    'forms.pronoun' => 'Stands for it',
    'forms.article' => 'Determiner',
    'forms.present' => 'Now',
    'forms.past' => 'Yesterday',
    'forms.future' => 'Tomorrow',
    'forms.pluralSubject' => 'Several doing it',
    'forms.imperative' => 'Telling somebody',
    'forms.agreeingOne' => 'Used with',
    'forms.agreeingTwo' => 'And with',
    _ => field,
  };
}

/// Both sides of a proposed merge.
@immutable
class MergePreview {
  const MergePreview({
    required this.targetHeadword,
    required this.sourceHeadword,
    required this.rows,
  });

  final String targetHeadword;
  final String sourceHeadword;
  final List<MergeRow> rows;

  List<MergeRow> get conflicts =>
      rows.where((row) => row.conflict).toList(growable: false);
}

/// What happens to the duplicate once its content has been taken.
enum MergeDisposition {
  /// Unpublished, marked `mergedInto`, left in place. Old links still resolve.
  retire,

  /// Removed from the collection. Admin only; the whole document is copied into
  /// the audit log first.
  delete;

  String get wire => name;
}

class DictionaryAdminFailure implements Exception {
  const DictionaryAdminFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// What a screen may ask of the privileged dictionary callables.
///
/// An interface rather than the Firebase class itself, and the reason is a
/// gap this release closed: nothing could pump a frame of the editor or the
/// merge screen, because standing one up meant standing up
/// `FirebaseFunctions`. A screen that can rewrite a published word deserves a
/// widget test, and a widget test needs somewhere to put a fake. The
/// production implementation is [FirebaseDictionaryAdminRepository]; the tests
/// supply their own.
abstract class DictionaryAdminRepository {
  /// What the archive already holds under [headword], or under the word inside
  /// [submissionId].
  Future<ExistingEntries> findMatches({
    String? headword,
    String? submissionId,
    String? excludeEntryId,
  });

  /// The two entries side by side, field by field.
  Future<MergePreview> preview({
    required String targetId,
    required String sourceId,
  });

  /// Corrects a published entry in place. Returns the fields that changed.
  Future<List<String>> edit({
    required String entryId,
    required EntryPatch patch,
    required String reason,
  });

  /// Folds [sourceId] into [targetId].
  Future<void> merge({
    required String targetId,
    required String sourceId,
    required String reason,
    Map<String, String> choices = const <String, String>{},
    MergeDisposition disposition = MergeDisposition.retire,
  });

  /// Removes an entry from the archive outright. Admin only.
  Future<void> delete({required String entryId, required String reason});
}

/// Calls the five privileged dictionary callables.
class FirebaseDictionaryAdminRepository implements DictionaryAdminRepository {
  const FirebaseDictionaryAdminRepository(this._functions);

  final FirebaseFunctions _functions;

  /// What the archive already holds under [headword], or under the word inside
  /// [submissionId] — which is what the review desk asks, because at review
  /// time the word has not been published and lives in the submission's `body`.
  @override
  Future<ExistingEntries> findMatches({
    String? headword,
    String? submissionId,
    String? excludeEntryId,
  }) async {
    final response = await _call('findDictionaryEntryMatches', {
      if (headword != null && headword.trim().isNotEmpty) 'headword': headword.trim(),
      if (submissionId != null && submissionId.isNotEmpty) 'submissionId': submissionId,
      if (excludeEntryId != null && excludeEntryId.isNotEmpty)
        'excludeEntryId': excludeEntryId,
    });
    final rows = response['matches'];
    return ExistingEntries(
      headword: _text(response['headword']),
      exactCount: (response['exactCount'] as num?)?.toInt() ?? 0,
      matches: rows is List
          ? rows
                .whereType<Map<Object?, Object?>>()
                .map(ExistingEntry.fromJson)
                .toList(growable: false)
          : const <ExistingEntry>[],
    );
  }

  @override
  Future<MergePreview> preview({
    required String targetId,
    required String sourceId,
  }) async {
    final response = await _call('previewDictionaryMerge', {
      'targetId': targetId,
      'sourceId': sourceId,
    });
    final target = response['target'];
    final source = response['source'];
    final rows = response['rows'];
    return MergePreview(
      targetHeadword: target is Map ? _text(target['kasemText']) : '',
      sourceHeadword: source is Map ? _text(source['kasemText']) : '',
      rows: rows is List
          ? rows
                .whereType<Map<Object?, Object?>>()
                .map(MergeRow.fromJson)
                .toList(growable: false)
          : const <MergeRow>[],
    );
  }

  /// Corrects a published entry in place. Returns the fields that changed.
  @override
  Future<List<String>> edit({
    required String entryId,
    required EntryPatch patch,
    required String reason,
  }) async {
    final response = await _call('editDictionaryEntry', {
      'entryId': entryId,
      'patch': patch.toJson(),
      'reason': reason,
    });
    final changed = response['changed'];
    return changed is List
        ? changed.whereType<String>().toList(growable: false)
        : const <String>[];
  }

  /// Folds [sourceId] into [targetId]. The target keeps its id, and therefore
  /// every saved word, shared link and citation that points at it.
  @override
  Future<void> merge({
    required String targetId,
    required String sourceId,
    required String reason,
    Map<String, String> choices = const <String, String>{},
    MergeDisposition disposition = MergeDisposition.retire,
  }) => _call('mergeDictionaryEntries', {
    'targetId': targetId,
    'sourceId': sourceId,
    'reason': reason,
    'choices': choices,
    'disposition': disposition.wire,
  });

  @override
  Future<void> delete({required String entryId, required String reason}) =>
      _call('deleteDictionaryEntry', {'entryId': entryId, 'reason': reason});

  Future<Map<Object?, Object?>> _call(
    String name,
    Map<String, Object?> payload,
  ) async {
    try {
      final callable = _functions.httpsCallable(
        name,
        options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
      );
      final result = await callable.call<Map<Object?, Object?>>(payload);
      return result.data;
    } on FirebaseFunctionsException catch (error) {
      // The backend's own message names the precondition that failed, which is
      // exactly what a reviewer needs — "this entry has been merged into
      // another one" is actionable and "something went wrong" is not.
      throw DictionaryAdminFailure(
        error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That could not be recorded. Try again.',
      );
    } on Object {
      throw const DictionaryAdminFailure(
        'That could not be recorded. Try again.',
      );
    }
  }
}

final dictionaryAdminRepositoryProvider =
    Provider<DictionaryAdminRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return FirebaseDictionaryAdminRepository(FirebaseFunctions.instance);
    });

/// Whether this device may edit the published dictionary.
///
/// The same claim `isReviewerProvider` reads, deliberately: the callables check
/// `requireRole(req, 'validator')`, and a client that showed the editor to
/// somebody the backend will refuse is a screen that only ever produces
/// permission errors. Deleting outright needs an admin and is gated separately,
/// on the screen that offers it.
final canEditDictionaryProvider = Provider<bool>(
  (ref) => ref.watch(isReviewerProvider),
);

/// Whether this device may delete an entry outright rather than retire it.
final canDeleteDictionaryProvider = Provider<bool>((ref) {
  final role = ref.watch(userRoleProvider).asData?.value;
  return role == 'admin' || role == 'super_admin';
});

/// What already exists under a spelling, for the review desk's prompt.
///
/// Keyed by the headword rather than by the submission so the merge picker and
/// the review banner share one cached answer — they ask the same question about
/// the same word within seconds of each other.
final existingEntriesProvider = FutureProvider.family<ExistingEntries, String>((
  ref,
  headword,
) async {
  final repository = ref.watch(dictionaryAdminRepositoryProvider);
  if (repository == null ||
      !ref.watch(canEditDictionaryProvider) ||
      headword.trim().isEmpty) {
    return ExistingEntries.empty;
  }
  try {
    return await repository.findMatches(headword: headword);
  } on DictionaryAdminFailure {
    // A lookup that failed must not stop a review. The prompt is an aid, and
    // an unavailable aid is a missing banner rather than a blocked decision.
    return ExistingEntries.empty;
  }
});

String _text(Object? value) => value is String ? value.trim() : '';
