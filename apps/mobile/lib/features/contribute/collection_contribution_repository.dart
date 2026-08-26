import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
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
  });

  final String id;
  final CollectionKind kind;
  final String title;
  final String status;
  final bool publicationPermission;
  final String reviewFeedback;
  final DateTime? createdAt;

  static CollectionContributionRecord fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    final category = _kindFromName(
      _text(data['collectionKind'], fallback: _text(data['category'])),
    );
    final created = data['createdAt'];
    return CollectionContributionRecord(
      id: doc.id,
      kind: category,
      title: _text(data['title'], fallback: 'Untitled contribution'),
      status: _text(data['status'], fallback: 'submitted'),
      publicationPermission: data['publicationPermission'] == true,
      reviewFeedback: _text(data['reviewFeedback']),
      createdAt: created is Timestamp ? created.toDate() : null,
    );
  }
}

class CollectionContributionDraft {
  const CollectionContributionDraft({
    required this.kind,
    required this.title,
    required this.body,
    required this.format,
    required this.dialect,
    required this.source,
    required this.media,
    required this.notes,
    required this.publicationPermission,
    required this.involvesMinors,
    required this.usesThirdPartyMaterial,
    required this.participantConsentConfirmed,
    this.kasemExample = '',
    this.englishExample = '',
    this.relatedEntryId,
  });

  final CollectionKind kind;
  final String title;
  final String body;
  final String format;
  final String dialect;
  final String source;

  /// The uploaded song, narration or manuscript, when this kind carries one.
  final UploadedContributionFile? media;

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
}

class CollectionContributionRepository {
  const CollectionContributionRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection('collectionContributions');

  Future<void> submit(CollectionContributionDraft draft) async {
    final callable = _functions.httpsCallable(
      'submitCollectionContribution',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
    );
    await callable.call<Map<Object?, Object?>>({
      'collectionKind': draft.kind.name,
      'title': draft.title.trim(),
      'body': draft.body.trim(),
      'format': draft.format.trim(),
      'dialect': draft.dialect.trim(),
      'source': draft.source.trim(),
      // The bytes went to Storage under the member's own prefix; the callable
      // only ever sees where they landed.
      'media': draft.media?.toMap(),
      'notes': draft.notes.trim(),
      'kasemExample': draft.kasemExample.trim(),
      'englishExample': draft.englishExample.trim(),
      'relatedEntryId': draft.relatedEntryId,
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

  Stream<List<CollectionContributionRecord>> watchMine(String uid) =>
      _collection.where('authUid', isEqualTo: uid).limit(50).snapshots().map((
        snapshot,
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
      });
}

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

CollectionKind _kindFromName(String value) => switch (value) {
  'music' => CollectionKind.music,
  'literature' => CollectionKind.literature,
  'audiobooks' || 'audiobook' => CollectionKind.audiobooks,
  _ => CollectionKind.dictionary,
};

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  if (value is num) return value.toString();
  return fallback;
}
