import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';

class CollectionContributionRecord {
  const CollectionContributionRecord({
    required this.id,
    required this.kind,
    required this.title,
    required this.status,
    required this.publicationPermission,
    this.reviewFeedback = '',
    this.createdAt,
    this.wordQueueId = '',
    this.body = '',
    this.kasemExample = '',
    this.notes = '',
    this.dialect = '',
    this.partOfSpeechId = '',
    this.publishedAs = '',
    this.duplicateOf = '',
    this.revisionCount = 0,
    this.queueDetails = const {},
  });

  final String id;
  final CollectionKind kind;
  final String title;
  final String status;
  final bool publicationPermission;
  final String reviewFeedback;
  final DateTime? createdAt;

  // ── A word-queue answer ────────────────────────────────────────────────
  /// The queue word this answered, or empty.
  final String wordQueueId;

  /// The Kasem the member sent, as they typed it.
  final String body;
  final String kasemExample;
  final String notes;
  final String dialect;
  final String partOfSpeechId;

  /// What a reviewer decided the answer became (`headword`, `expression`…).
  final String publishedAs;

  /// The dictionary entry a rejected answer repeats, when that was the reason.
  final String duplicateOf;
  final int revisionCount;
  final Map<String, dynamic> queueDetails;

  bool get isQueueAnswer => wordQueueId.isNotEmpty;

  /// Whether the member can correct it now: a reviewer asked for changes.
  bool get canRevise =>
      isQueueAnswer &&
      const {'needs_revision', 'needs_changes'}.contains(status.toLowerCase());

  static CollectionContributionRecord fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    final category = _kindFromName(
      _text(data['collectionKind'], fallback: _text(data['category'])),
    );
    final created = data['createdAt'];
    return CollectionContributionRecord(
      queueDetails: {
        for (final key in [
          'forms',
          'ipa',
          'kasemDefinition',
          'etymology',
          'alsoUsedAs',
          'media',
          'sentenceFit',
          'attribution',
          'wordQueueOrigin',
        ])
          if (data[key] != null) key: data[key],
      },
      id: doc.id,
      kind: category,
      title: _text(data['title'], fallback: 'Untitled contribution'),
      status: _text(data['status'], fallback: 'submitted'),
      publicationPermission: data['publicationPermission'] == true,
      reviewFeedback: _text(data['reviewFeedback']),
      createdAt: created is Timestamp ? created.toDate() : null,
      wordQueueId: _text(data['wordQueueId']),
      body: _text(data['body']),
      kasemExample: _text(data['kasemExample']),
      notes: _text(data['notes']),
      dialect: _text(data['dialect']),
      partOfSpeechId: _text(data['partOfSpeechId']),
      publishedAs: _text(data['publishedAs']),
      duplicateOf: _text(data['duplicateOf']),
      revisionCount: data['revisionCount'] is num
          ? (data['revisionCount'] as num).toInt()
          : 0,
    );
  }
}

class CollectionContributionDraft {
  const CollectionContributionDraft({
    required this.kind,
    this.lexicalKind = 'word',
    required this.title,
    required this.body,
    required this.format,
    required this.dialect,
    required this.source,
    this.literalTranslation = '',
    this.usageContext = '',
    this.frenchTranslation = '',
    required this.media,
    required this.notes,
    this.cover,
    required this.publicationPermission,
    required this.involvesMinors,
    required this.usesThirdPartyMaterial,
    required this.participantConsentConfirmed,
    this.kasemExample = '',
    this.englishExample = '',
    this.relatedEntryId,
    this.forms = const <String, String>{},
    this.alsoUsedAs = const <String>[],
    this.ipa = '',
    this.kasemDefinition = '',
    this.etymology = '',
    this.senses = const <Map<String, Object?>>[],
  });

  final CollectionKind kind;
  final String lexicalKind;
  final String title;
  final String body;
  final String format;
  final String dialect;
  final String source;
  final String literalTranslation;
  final String usageContext;
  final String frenchTranslation;

  /// The uploaded song, narration or manuscript, when this kind carries one.
  final UploadedContributionFile? media;

  /// The song's artwork, when a member chose one.
  ///
  /// Kept apart from [media] rather than being a second entry in a list: it is
  /// not another draft of the work, it is the picture the player shows while
  /// the work plays, and review treats the two differently — a song with no
  /// cover is still publishable, a song with no recording is not.
  final UploadedContributionFile? cover;

  final String notes;
  final bool publicationPermission;

  /// Null where the form never asked — a word has no participants, so an
  /// answer would be invented rather than declared.
  final bool? involvesMinors;
  final bool usesThirdPartyMaterial;
  final bool participantConsentConfirmed;
  final String kasemExample;
  final String englishExample;
  final String? relatedEntryId;

  /// The paradigm, as answered slots only.
  ///
  /// ── Why this is a map rather than thirteen named fields ──────────────
  /// Because the draft is a courier and the server owns the vocabulary. The
  /// slot names — `definite`, `pluralDefinite`, `past` — are validated against
  /// `FORM_SLOTS` in `kasem-morphology.ts` and anything else is dropped, so a
  /// field added on the server needs no change here at all. Naming each one on
  /// this class would put the same list in a third place and guarantee it
  /// falls behind the other two.
  ///
  /// Empty for every kind but the dictionary, and for most dictionary words.
  final Map<String, String> forms;

  /// The other word classes this word is also used as. Stable ids.
  final List<String> alsoUsedAs;

  /// How the word is said, in IPA. Sent as typed; the server strips any
  /// delimiters, because half of people type them and half do not.
  final String ipa;

  /// What the word means, said in Kasem, and where it came from. Both prose,
  /// both optional, and the first of the two is the most valuable string this
  /// project collects — see `MAX_KASEM_DEFINITION_LENGTH` on the server.
  final String kasemDefinition;
  final String etymology;

  /// Every distinct meaning this word carries, already shaped for the wire.
  ///
  /// ── Why a list of maps rather than a list of a typed class ───────────
  /// Same reason [forms] is a map: the draft is a courier and the server owns
  /// the vocabulary. `parseSenses` in `lexical-senses.ts` validates every key
  /// and drops what it does not recognise, so a field added on the server
  /// needs no change on this class at all. A typed mirror here would be a
  /// third copy of the same shape, and it is the copy that falls behind.
  ///
  /// Empty for every kind but the dictionary, and — where a contributor gave
  /// exactly one meaning with no detail on it — the server drops it again
  /// rather than storing an array to repeat one string.
  final List<Map<String, Object?>> senses;
}

class CollectionContributionRepository {
  const CollectionContributionRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection('collectionContributions');

  Future<void> submit(
    CollectionContributionDraft draft, {
    String? requestId,
  }) async {
    final callable = _functions.httpsCallable(
      'submitCollectionContribution',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
    );
    await callable.call<Map<Object?, Object?>>({
      'requestId': ?requestId,
      'collectionKind': draft.kind.name,
      'lexicalKind': draft.lexicalKind,
      'title': draft.title.trim(),
      'body': draft.body.trim(),
      'format': draft.format.trim(),
      'dialect': draft.dialect.trim(),
      'source': draft.source.trim(),
      if (draft.literalTranslation.trim().isNotEmpty)
        'literalTranslation': draft.literalTranslation.trim(),
      if (draft.usageContext.trim().isNotEmpty)
        'usageContext': draft.usageContext.trim(),
      if (draft.frenchTranslation.trim().isNotEmpty)
        'frenchTranslation': draft.frenchTranslation.trim(),
      // The bytes went to Storage under the member's own prefix; the callable
      // only ever sees where they landed.
      'media': draft.media?.toMap(),
      // The cover travels the same way and in the same shape as `media`, in
      // its own top-level key: a reviewer approving a song has to be able to
      // see the artwork it will be published with without unpacking a list and
      // guessing which entry is the picture.
      'cover': draft.cover?.toMap(),
      'notes': draft.notes.trim(),
      'kasemExample': draft.kasemExample.trim(),
      'englishExample': draft.englishExample.trim(),
      'relatedEntryId': draft.relatedEntryId,
      // Omitted rather than sent empty. The callable treats an absent key as
      // "not asked" and an empty one as "answered with nothing", and on a
      // song or a poem none of these was ever asked.
      if (draft.forms.isNotEmpty) 'forms': draft.forms,
      if (draft.alsoUsedAs.isNotEmpty) 'alsoUsedAs': draft.alsoUsedAs,
      if (draft.ipa.trim().isNotEmpty) 'ipa': draft.ipa.trim(),
      if (draft.kasemDefinition.trim().isNotEmpty)
        'kasemDefinition': draft.kasemDefinition.trim(),
      if (draft.etymology.trim().isNotEmpty)
        'etymology': draft.etymology.trim(),
      // Omitted rather than sent empty, on the same terms as `forms` above.
      if (draft.senses.isNotEmpty) 'senses': draft.senses,
      'rightsConfirmed': true,
      'publicationPermission': draft.publicationPermission,
      'involvesMinors': draft.involvesMinors,
      'usesThirdPartyMaterial': draft.usesThirdPartyMaterial,
      'participantConsentConfirmed': draft.participantConsentConfirmed,
    });
  }

  Future<void> withdraw(String contributionId) async {
    final callable = _functions.httpsCallable(
      'withdrawCollectionContribution',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
    );
    await callable.call<Map<Object?, Object?>>({
      'contributionId': contributionId,
    });
  }

  /// This member's most recent [kMyContributionsLimit] contributions, newest
  /// first.
  ///
  /// ── Why there are two queries ─────────────────────────────────────────
  /// The word queue writes one contribution per word answered, so an active
  /// translator passes the limit within a sitting or two. Limited without an
  /// order, Firestore hands back fifty in document-id order — an arbitrary
  /// fifty, not the latest — and the list showed a member everything but what
  /// they had just sent. Ordering by `createdAt` beside the `authUid` filter
  /// needs the composite index in `firestore.indexes.json`, which is deployed
  /// apart from the app; until it is, the query is refused with
  /// `failed-precondition` and the old unordered read stands in for it.
  ///
  /// `await for` rather than `yield*` for the first of the two: an error from
  /// a `yield*` stream is passed straight through to the listener and never
  /// reaches the `catch`, so the fallback could not have happened.
  Stream<List<CollectionContributionRecord>> watchMine(String uid) async* {
    final mine = _collection.where('authUid', isEqualTo: uid);
    try {
      await for (final snapshot
          in mine
              .orderBy('createdAt', descending: true)
              .limit(kMyContributionsLimit)
              .snapshots()) {
        yield _newestFirst(snapshot);
      }
    } on FirebaseException catch (error) {
      if (error.code != 'failed-precondition') rethrow;
      yield* mine.limit(kMyContributionsLimit).snapshots().map(_newestFirst);
    }
  }

  static List<CollectionContributionRecord> _newestFirst(
    QuerySnapshot<Map<String, dynamic>> snapshot,
  ) {
    final rows =
        snapshot.docs
            .map(CollectionContributionRecord.fromDoc)
            .toList(growable: true)
          ..sort((left, right) {
            final leftDate = left.createdAt ?? DateTime(1970);
            final rightDate = right.createdAt ?? DateTime(1970);
            return rightDate.compareTo(leftDate);
          });
    return List.unmodifiable(rows);
  }

  /// How many contributions this member has sent, and how many were approved,
  /// counted by the server rather than from the list — which stops at
  /// [kMyContributionsLimit].
  ///
  /// Two aggregate counts: each is billed per thousand index entries rather
  /// than per document, and both are equality filters that Firestore serves
  /// from its single-field indexes without a composite one.
  Future<({int sent, int approved})> countMine(String uid) async {
    final mine = _collection.where('authUid', isEqualTo: uid);
    final results = await Future.wait([
      mine.count().get(),
      mine
          .where('status', whereIn: kApprovedContributionStatuses.toList())
          .count()
          .get(),
    ]);
    return (sent: results[0].count ?? 0, approved: results[1].count ?? 0);
  }
}

/// How many contributions the submissions list reads at most.
const int kMyContributionsLimit = 50;

final collectionContributionRepositoryProvider =
    Provider<CollectionContributionRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return CollectionContributionRepository(
        FirebaseFirestore.instance,
        FirebaseFunctions.instance,
      );
    });

final myCollectionContributionsProvider =
    StreamProvider<List<CollectionContributionRecord>>((ref) {
      final uid = ref.watch(authStateProvider).asData?.value?.uid;
      final repository = ref.watch(collectionContributionRepositoryProvider);
      if (uid == null || repository == null) {
        return Stream.value(const <CollectionContributionRecord>[]);
      }
      return repository.watchMine(uid);
    });

/// What this member has sent and had approved, in total.
///
/// The server's counts when it can give them, and otherwise what the list
/// itself holds — marked [capped] when the list is full, so a screen can say
/// "50+" rather than present fifty as the whole story.
typedef ContributionTotals = ({int sent, int approved, bool capped});

final myContributionTotalsProvider = FutureProvider<ContributionTotals>((
  ref,
) async {
  // Watched rather than read, so a contribution landing in the list — or a
  // review moving one — asks the server again.
  final listed =
      ref.watch(myCollectionContributionsProvider).asData?.value ??
      const <CollectionContributionRecord>[];
  final local = (
    sent: listed.length,
    approved: listed
        .where((record) => contributionApproved(record.status))
        .length,
    capped: listed.length >= kMyContributionsLimit,
  );
  final uid = ref.watch(authStateProvider).asData?.value?.uid;
  final repository = ref.watch(collectionContributionRepositoryProvider);
  if (uid == null || repository == null) return local;
  try {
    final counted = await repository.countMine(uid);
    return (
      // Never fewer than the list can see: a count taken a moment before a
      // snapshot is the only way the two can disagree, and it is the list
      // that is newer then.
      sent: counted.sent < local.sent ? local.sent : counted.sent,
      approved: counted.approved < local.approved
          ? local.approved
          : counted.approved,
      capped: false,
    );
  } on Object catch (error) {
    debugPrint('Contribution totals could not be counted: $error');
    return local;
  }
});

/// A count for a label: the number, or "50+" when all that is known is that
/// the list is full.
String contributionCountLabel(int count, {required bool capped}) =>
    capped && count >= kMyContributionsLimit
    ? '$kMyContributionsLimit+'
    : '$count';

/// The stored `collectionKind` read back as the enum.
///
/// `video` was missing from this switch, so every film a member sent came back
/// into their own submissions list labelled *Dictionary* with a translation
/// glyph beside it. The fallback is deliberately still the dictionary — it is
/// the oldest kind and the one legacy rows carry no marker for — but a kind we
/// actually write must never reach it.
CollectionKind _kindFromName(String value) => switch (value) {
  'music' => CollectionKind.music,
  'literature' => CollectionKind.literature,
  'audiobooks' || 'audiobook' => CollectionKind.audiobooks,
  'video' || 'film' => CollectionKind.video,
  _ => CollectionKind.dictionary,
};

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  if (value is num) return value.toString();
  return fallback;
}
