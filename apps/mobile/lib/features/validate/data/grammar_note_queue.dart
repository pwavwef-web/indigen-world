import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';

/// A legacy token gloss retained for display; v2 annotations may span phrases.
@immutable
class GlossPair {
  const GlossPair({required this.kasem, required this.english});

  final String kasem;
  final String english;

  static GlossPair? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final kasem = (raw['kasem'] as String?)?.trim() ?? '';
    if (kasem.isEmpty) return null;
    return GlossPair(
      kasem: kasem,
      english: (raw['english'] as String?)?.trim() ?? '',
    );
  }
}

/// One attested sentence inside a note.
@immutable
class GrammarExample {
  const GrammarExample({
    this.data = const {},
    required this.kasem,
    required this.english,
    required this.literal,
    required this.gloss,
    required this.note,
    required this.dialect,
    required this.constructions,
  });

  final String kasem;
  final String english;
  final Map<String, dynamic> data;

  /// The word-for-word line as the speaker typed it. Kept beside [gloss]
  /// rather than replaced by it: the columns are for checking, and this is
  /// what the person actually wrote.
  final String literal;

  final List<GlossPair> gloss;
  final String note;
  final String dialect;
  final List<String> constructions;

  static GrammarExample? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final kasem = (raw['kasem'] as String?)?.trim() ?? '';
    final english = (raw['english'] as String?)?.trim() ?? '';
    // Both sides or nothing, matching `corpusRecordFrom` on the server. A row
    // with one of them cannot teach a translation and cannot be checked.
    if (kasem.isEmpty || english.isEmpty) return null;

    final gloss = (raw['gloss'] as List?)
        ?.map(GlossPair.fromMap)
        .whereType<GlossPair>()
        .toList(growable: false);

    return GrammarExample(
      data: Map<String, dynamic>.from(raw),
      kasem: kasem,
      english: english,
      literal: (raw['literal'] as String?)?.trim() ?? '',
      gloss: List<GlossPair>.unmodifiable(gloss ?? const <GlossPair>[]),
      note: (raw['note'] as String?)?.trim() ?? '',
      dialect: (raw['dialect'] as String?)?.trim() ?? '',
      constructions: List<String>.unmodifiable(
        (raw['constructions'] as List?)?.whereType<String>() ??
            const <String>[],
      ),
    );
  }
}

/// A speaker's explanation and the sentences under it.
@immutable
class GrammarNote {
  const GrammarNote({
    this.data = const {},
    required this.id,
    required this.status,
    required this.origin,
    required this.title,
    required this.explanation,
    required this.constructions,
    required this.examples,
    required this.question,
    required this.answer,
    required this.wrongSpan,
    required this.reviewNote,
    required this.harvestedWords,
    required this.createdAt,
  });

  final String id;
  final Map<String, dynamic> data;
  final String status;

  /// `contribution` when somebody came to teach, `correction` when they came
  /// because Kawuri was wrong. The desk shows the difference because the two
  /// need reading differently: a correction arrives with the answer it is
  /// arguing against, and that answer is often the fastest way to see what the
  /// member means.
  final String origin;

  final String title;
  final String explanation;
  final List<String> constructions;
  final List<GrammarExample> examples;

  /// What was asked of Kawuri. Empty on a contribution.
  final String question;

  /// What Kawuri said. Empty on a contribution.
  final String answer;

  /// The part of that answer the member says is wrong. Often empty.
  final String wrongSpan;

  final String reviewNote;

  /// How many dictionary contributions confirming this note opened. Zero until
  /// it is confirmed.
  final int harvestedWords;

  final DateTime? createdAt;

  bool get isPending => status == 'submitted';
  bool get isCorrection => origin == 'correction';

  static GrammarNote? fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final examples = (data['examples'] as List?)
        ?.map(GrammarExample.fromMap)
        .whereType<GrammarExample>()
        .toList(growable: false);
    // A note with no readable example is one a reviewer cannot decide on —
    // there is nothing to check. Dropped rather than shown as an empty card.
    if (examples == null || examples.isEmpty) return null;

    return GrammarNote(
      data: data,
      id: doc.id,
      status: (data['status'] as String?) ?? 'submitted',
      origin: (data['origin'] as String?) ?? 'contribution',
      title: (data['title'] as String?)?.trim() ?? '',
      explanation: (data['explanation'] as String?)?.trim() ?? '',
      constructions: List<String>.unmodifiable(
        (data['constructions'] as List?)?.whereType<String>() ??
            const <String>[],
      ),
      examples: List<GrammarExample>.unmodifiable(examples),
      question: (data['question'] as String?)?.trim() ?? '',
      answer: (data['answer'] as String?)?.trim() ?? '',
      wrongSpan: (data['wrongSpan'] as String?)?.trim() ?? '',
      reviewNote: (data['reviewNote'] as String?)?.trim() ?? '',
      harvestedWords: (data['harvestedWords'] as num?)?.toInt() ?? 0,
      createdAt: data['createdAt'] is Timestamp
          ? (data['createdAt'] as Timestamp).toDate()
          : DateTime.tryParse(data['createdAt']?.toString() ?? ''),
    );
  }
}

/// Review queues preserve disagreements and permission states.
const kGrammarNoteQueues = <(String, String, IconData)>[
  ('submitted', 'Waiting', Icons.inbox_rounded),
  ('confirmed', 'Confirmed', Icons.verified_rounded),
  ('disputed', 'Disagreements', Icons.compare_arrows),
  ('reviewed', 'Reviewed variants', Icons.fact_check),
  ('needs-permission', 'Needs permission', Icons.lock_outline),
  ('withdrawn', 'Withdrawn', Icons.remove_circle_outline),
  ('rejected', 'Rejected', Icons.block_rounded),
];

bool grammarNoteMatches(GrammarNote note, String query) {
  final terms = query
      .toLowerCase()
      .trim()
      .split(RegExp(r'\s+'))
      .where((term) => term.isNotEmpty);
  final text = [
    note.title,
    ...note.examples.expand(
      (example) => [
        example.kasem,
        example.english,
        example.dialect,
        ...example.constructions,
        ...(example.data['context'] as Map? ?? {}).values.whereType<String>(),
      ],
    ),
  ].join(' ').toLowerCase();
  return terms.every(text.contains);
}

class GrammarNoteFilter extends Notifier<String> {
  @override
  String build() => '';
  void change(String value) => state = value;
}

final grammarNoteFilterProvider = NotifierProvider<GrammarNoteFilter, String>(
  GrammarNoteFilter.new,
);

/// Reads evidence for review. Dimension judgments are submitted by the review screen.
class GrammarNoteRepository {
  const GrammarNoteRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Notes in [status], newest first.
  ///
  /// Sorted on the device so the query stays a single-field equality and needs
  /// no composite index — the same trade every other queue in the app makes.
  Stream<List<GrammarNote>> watchQueue(String status) => _firestore
      .collection('grammarNotes')
      .where('status', isEqualTo: status)
      .limit(60)
      .snapshots()
      .map((snapshot) {
        final rows =
            snapshot.docs
                .map(GrammarNote.fromDoc)
                .whereType<GrammarNote>()
                .toList(growable: true)
              ..sort((left, right) {
                final leftAt = left.createdAt ?? DateTime(1970);
                final rightAt = right.createdAt ?? DateTime(1970);
                return rightAt.compareTo(leftAt);
              });
        return List<GrammarNote>.unmodifiable(rows);
      });
}

final grammarNoteRepositoryProvider = Provider<GrammarNoteRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return GrammarNoteRepository(FirebaseFirestore.instance);
});

/// Which note queue the desk is showing.
class GrammarNoteQueueStatus extends Notifier<String> {
  @override
  String build() => 'submitted';

  void select(String status) => state = status;
}

final grammarNoteQueueStatusProvider =
    NotifierProvider<GrammarNoteQueueStatus, String>(
      GrammarNoteQueueStatus.new,
    );

final grammarNoteQueueProvider = StreamProvider<List<GrammarNote>>((ref) {
  final repository = ref.watch(grammarNoteRepositoryProvider);
  if (repository == null || !ref.watch(isReviewerProvider)) {
    return Stream.value(const <GrammarNote>[]);
  }
  return repository.watchQueue(ref.watch(grammarNoteQueueStatusProvider));
});

/// How many notes are waiting, for the badge on the desk's Sentences tab.
///
/// Its own subscription rather than a read of the visible queue, so the count
/// is still right while a reviewer is looking at the Confirmed list.
final grammarNoteWaitingCountProvider = StreamProvider<int>((ref) {
  final repository = ref.watch(grammarNoteRepositoryProvider);
  if (repository == null || !ref.watch(isReviewerProvider)) {
    return Stream.value(0);
  }
  return repository.watchQueue('submitted').map((rows) => rows.length);
});
