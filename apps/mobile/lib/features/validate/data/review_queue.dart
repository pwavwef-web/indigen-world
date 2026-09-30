import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';

/// The roles that may review submitted work.
///
/// Mirrors `isValidator()` in firestore.rules and `requireRole(_, 'validator')`
/// in the functions. Kept as one list in one place, because a client that
/// showed the queue to somebody the rules will refuse is a screen that only
/// ever produces permission errors.
const kReviewerRoles = {'validator', 'reviewer', 'admin', 'super_admin'};

/// The signed-in member's role claim, or null.
///
/// Read from the ID token rather than from a document: the claim is what the
/// Security Rules and the callables actually check, so anything else the app
/// believed would be a second, divergent answer.
final userRoleProvider = FutureProvider<String?>((ref) async {
  final user = ref.watch(authStateProvider).asData?.value;
  if (user == null) return null;
  try {
    // Not forced: a forced refresh on every rebuild is a network round trip
    // per frame. A role change lands on the next natural token refresh, or on
    // the next sign-in, which is soon enough for a permission being granted.
    final token = await user.getIdTokenResult();
    final role = token.claims?['role'];
    return role is String && role.isNotEmpty ? role : null;
  } on FirebaseAuthException {
    return null;
  }
});

/// Whether this device is signed in as somebody who may validate.
final isReviewerProvider = Provider<bool>((ref) {
  final role = ref.watch(userRoleProvider).asData?.value;
  return role != null && kReviewerRoles.contains(role);
});

/// The decisions a validator can record, as `decideSubmission` names them.
enum ReviewDecision {
  approve,
  requestRevision,
  reject,
  publish,
  escalateCultural;

  String get wire => switch (this) {
    ReviewDecision.approve => 'APPROVE',
    ReviewDecision.requestRevision => 'REQUEST_REVISION',
    ReviewDecision.reject => 'REJECT',
    ReviewDecision.publish => 'PUBLISH',
    ReviewDecision.escalateCultural => 'ESCALATE_CULTURAL',
  };

  String get label => switch (this) {
    ReviewDecision.approve => 'Approve',
    ReviewDecision.requestRevision => 'Ask for changes',
    ReviewDecision.reject => 'Reject',
    ReviewDecision.publish => 'Publish',
    ReviewDecision.escalateCultural => 'Escalate',
  };

  IconData get icon => switch (this) {
    ReviewDecision.approve => Icons.check_circle_rounded,
    ReviewDecision.requestRevision => Icons.edit_note_rounded,
    ReviewDecision.reject => Icons.block_rounded,
    ReviewDecision.publish => Icons.public_rounded,
    ReviewDecision.escalateCultural => Icons.flag_rounded,
  };

  /// The colour this decision is drawn in, resolved for [brand].
  Color color(BrandPalette brand) => switch (this) {
    ReviewDecision.approve => brand.success,
    ReviewDecision.publish => brand.accent,
    ReviewDecision.requestRevision => brand.gold,
    ReviewDecision.reject => brand.danger,
    ReviewDecision.escalateCultural => brand.terracotta,
  };

  /// The backend refuses a revision or a rejection without a reason, and it is
  /// right to: a contributor told "no" with no explanation cannot act on it.
  bool get requiresFeedback =>
      this == ReviewDecision.requestRevision || this == ReviewDecision.reject;
}

/// One item in the review queue.
@immutable
class ReviewItem {
  const ReviewItem({
    required this.id,
    required this.title,
    required this.status,
    required this.collectionKind,
    required this.format,
    required this.dialect,
    required this.body,
    required this.description,
    required this.source,
    required this.notes,
    required this.authorUid,
    this.kasemExample = '',
    this.englishExample = '',
    this.mediaType,
    this.mediaStoragePath,
    this.externalUrl,
    this.publicationPermission = false,
    this.participantsConsented = false,
    this.usesThirdPartyMaterial = false,
    this.involvesMinors,
    this.feedback = '',
    this.wordQueueId = '',
    this.queueSentence = '',
    this.wordQueueOrigin = '',
    this.revisionCount = 0,
    this.aiTraining = false,
    this.creditAnonymous = false,
    this.publishAs = '',
    this.linkedEntryId = '',
    this.createdAt,
  });

  final String id;
  final String title;
  final String status;
  final String collectionKind;
  final String format;
  final String dialect;
  final String body;
  final String description;
  final String source;
  final String notes;
  final String authorUid;
  final String kasemExample;
  final String englishExample;
  final String? mediaType;
  final String? mediaStoragePath;
  final String? externalUrl;
  final bool publicationPermission;
  final bool participantsConsented;
  final bool usesThirdPartyMaterial;

  /// Null where the form never put the question — which a reviewer must be
  /// able to tell apart from a declared "no".
  final bool? involvesMinors;

  final String feedback;
  final DateTime? createdAt;

  // ── A word-queue answer ────────────────────────────────────────────────
  /// The queue word this answers, or empty for anything else.
  final String wordQueueId;

  /// The English sentence the word was asked with, when there was one.
  final String queueSentence;

  /// Where the member met the word: queue, explore, search, topic, kawuri.
  final String wordQueueOrigin;

  /// How many times the member has corrected it after a request for changes.
  final int revisionCount;

  /// Whether the member agreed to the answer being used for training tools.
  final bool aiTraining;

  /// Whether the member asked not to be named where it is published.
  final bool creditAnonymous;

  /// What an earlier approval decided the answer becomes, and the dictionary
  /// entry that decision pointed at, if any.
  final String publishAs;
  final String linkedEntryId;

  bool get isQueueAnswer => wordQueueId.isNotEmpty;

  bool get hasMedia => (mediaStoragePath ?? '').isNotEmpty;

  /// Whether this is a word for the dictionary rather than a song or a story.
  ///
  /// Decided on the collection kind, which `submitCollectionContribution`
  /// writes, and read case-insensitively because the field has carried both
  /// `dictionary` and older aliases over the years. What it gates is the
  /// duplicate check on the review screen — and asking that question of a song
  /// would search the dictionary for a title.
  bool get isDictionaryWord =>
      collectionKind.trim().toLowerCase() == 'dictionary' && body.isNotEmpty;

  /// Which decisions make sense from where this item currently is.
  ///
  /// Publishing is only offered on already-approved work whose contributor
  /// granted publication permission — the same precondition `decideSubmission`
  /// enforces, surfaced here so a reviewer is not offered a button that is
  /// going to be refused.
  List<ReviewDecision> get availableDecisions {
    final upper = status.toUpperCase();
    if (upper == 'APPROVED' || upper == 'SCHEDULED') {
      return [
        if (publicationPermission) ReviewDecision.publish,
        ReviewDecision.reject,
      ];
    }
    if (upper == 'PUBLISHED') return const [];
    return [
      ReviewDecision.approve,
      // Other Collection work has no way back to its author's form, so the
      // backend refuses a revision for it; a word-queue answer can be
      // corrected from its author's list of submissions.
      if (collectionKind.isEmpty || isQueueAnswer)
        ReviewDecision.requestRevision,
      ReviewDecision.reject,
      ReviewDecision.escalateCultural,
    ];
  }

  static ReviewItem fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final media = data['media'];
    final disclosures = data['disclosures'];
    final attestations = data['attestations'];
    final permissions = data['permissions'];
    final moderation = data['moderation'];
    final lifecycle = data['lifecycle'];
    final createdAt = lifecycle is Map ? lifecycle['createdAt'] : null;
    return ReviewItem(
      id: doc.id,
      title: _text(data['title'], fallback: 'Untitled submission'),
      status: _text(data['status'], fallback: 'SUBMITTED'),
      collectionKind: _text(data['collectionKind']),
      format: _text(data['format']),
      dialect: _text(data['dialect']),
      body: _text(data['body']),
      description: _text(data['description']),
      source: _text(data['sourceReferences']),
      notes: _text(data['translationNotes']),
      authorUid: _text(data['authUid']),
      kasemExample: _text(data['kasemExample']),
      englishExample: _text(data['englishExample']),
      mediaType: media is Map ? _text(media['mediaType']) : null,
      mediaStoragePath: media is Map ? _text(media['storagePath']) : null,
      externalUrl: _text(data['externalPostUrl']),
      publicationPermission:
          permissions is Map && permissions['publication'] == true,
      participantsConsented:
          attestations is Map && attestations['participantsConsented'] == true,
      usesThirdPartyMaterial:
          disclosures is Map && disclosures['usesThirdPartyMaterial'] == true,
      involvesMinors:
          disclosures is Map && disclosures['involvesMinors'] is bool
          ? disclosures['involvesMinors'] as bool
          : null,
      feedback: moderation is Map ? _text(moderation['feedback']) : '',
      createdAt: createdAt is String ? DateTime.tryParse(createdAt) : null,
      wordQueueId: _text(data['wordQueueId']),
      queueSentence: data['wordQueuePrompt'] is Map
          ? _text((data['wordQueuePrompt'] as Map)['sentence'])
          : '',
      wordQueueOrigin: _text(data['wordQueueOrigin']),
      revisionCount: data['revisionCount'] is num
          ? (data['revisionCount'] as num).toInt()
          : 0,
      aiTraining: permissions is Map && permissions['aiTraining'] == true,
      creditAnonymous:
          data['attribution'] is Map &&
          (data['attribution'] as Map)['preference'] == 'anonymous',
      publishAs: moderation is Map ? _text(moderation['publishAs']) : '',
      linkedEntryId: moderation is Map
          ? _text(moderation['linkedEntryId'])
          : '',
    );
  }
}

class ReviewFailure implements Exception {
  const ReviewFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Reads the queue and records decisions.
class ReviewRepository {
  const ReviewRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  /// Waiting work, newest first.
  ///
  /// Sorted on the device so the query stays a single-field equality and needs
  /// no composite index — the same trade the contributor's own queue makes.
  Stream<List<ReviewItem>> watchQueue(String status) => _firestore
      .collection('submissions')
      .where('status', isEqualTo: status)
      .limit(60)
      .snapshots()
      .map((snapshot) {
        final rows =
            snapshot.docs.map(ReviewItem.fromDoc).toList(growable: true)
              ..sort((left, right) {
                final leftAt = left.createdAt ?? DateTime(1970);
                final rightAt = right.createdAt ?? DateTime(1970);
                return rightAt.compareTo(leftAt);
              });
        return List<ReviewItem>.unmodifiable(rows);
      });

  /// Opens the private submission file for a reviewer.
  ///
  /// Raw uploads live in the contributor's own prefix, which Storage rules
  /// open to staff. Without this a reviewer would be asked to judge a song
  /// they cannot hear.
  Future<String?> mediaUrl(String storagePath) async {
    if (storagePath.isEmpty) return null;
    try {
      return await FirebaseStorage.instance.ref(storagePath).getDownloadURL();
    } on FirebaseException {
      // A missing or unreadable object is a fact about this submission, not a
      // failure of the screen: the review still has to be possible on the
      // written record.
      return null;
    }
  }

  Future<void> decide({
    required String submissionId,
    required ReviewDecision decision,
    required String feedback,
    String? publishAs,
    String? entryId,
    String? reason,
  }) async {
    try {
      final callable = _functions.httpsCallable(
        'decideSubmission',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
      );
      await callable.call<Map<Object?, Object?>>({
        'submissionId': submissionId,
        'decision': decision.wire,
        'feedback': feedback.trim(),
        'publishAs': ?publishAs,
        if (entryId != null && entryId.isNotEmpty) 'entryId': entryId,
        'reason': ?reason,
      });
    } on FirebaseFunctionsException catch (error) {
      // The backend's own message names the precondition that failed — which
      // is exactly what a reviewer needs to know.
      throw ReviewFailure(
        error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That decision could not be recorded. Try again.',
      );
    } on Object {
      throw const ReviewFailure(
        'That decision could not be recorded. Try again.',
      );
    }
  }
}

final reviewRepositoryProvider = Provider<ReviewRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return ReviewRepository(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

/// Which queue the validator screen is showing.
class ReviewQueueStatus extends Notifier<String> {
  @override
  String build() => 'SUBMITTED';

  void select(String status) => state = status;
}

final reviewQueueStatusProvider = NotifierProvider<ReviewQueueStatus, String>(
  ReviewQueueStatus.new,
);

/// How many contributions are waiting, for the badge on the review desk card.
///
/// Its own subscription rather than a read of the visible queue, so the count
/// is still right while a reviewer is looking at the Published list — and so
/// the Contribute screen can show it without opening the desk at all.
final reviewWaitingCountProvider = StreamProvider<int>((ref) {
  final repository = ref.watch(reviewRepositoryProvider);
  if (repository == null || !ref.watch(isReviewerProvider)) {
    return Stream.value(0);
  }
  return repository.watchQueue('SUBMITTED').map((rows) => rows.length);
});

final reviewQueueProvider = StreamProvider<List<ReviewItem>>((ref) {
  final repository = ref.watch(reviewRepositoryProvider);
  final canReview = ref.watch(isReviewerProvider);
  if (repository == null || !canReview) {
    return Stream.value(const <ReviewItem>[]);
  }
  return repository.watchQueue(ref.watch(reviewQueueStatusProvider));
});

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return fallback;
}

/// What a reviewer may decide a word-queue answer becomes. Mirrors
/// `PUBLISH_AS` in `services/functions/src/language-loop.ts`.
enum AnswerTarget {
  headword('headword', 'A dictionary word', 'Published as an entry of its own.'),
  variant(
    'variant',
    'A regional variant',
    'An entry of its own, marked as a regional form of a word the dictionary has.',
  ),
  expression(
    'expression',
    'An expression',
    'A phrase or idiom, published with the other expressions.',
  ),
  example(
    'example',
    'An example sentence',
    'Its Kasem sentence, shown on the entry for the word.',
  ),
  translationPair(
    'translation-pair',
    'A translation pair',
    'The English sentence and its Kasem, for lessons and Kawuri.',
  ),
  training(
    'training',
    'Training material',
    'Kept for testing and training language tools. Never published.',
  );

  const AnswerTarget(this.wire, this.label, this.detail);

  final String wire;
  final String label;
  final String detail;

  /// A variant and an example point at an existing entry.
  bool get needsEntry => this == variant || this == example;

  static AnswerTarget fromWire(String wire) => AnswerTarget.values.firstWhere(
    (target) => target.wire == wire,
    orElse: () => AnswerTarget.headword,
  );

  /// Why this cannot be chosen for [item], or null when it can. The backend
  /// checks the same things; saying so here keeps a reviewer from choosing an
  /// option that is going to be refused.
  String? problemFor(ReviewItem item) => switch (this) {
    AnswerTarget.training when !item.aiTraining =>
      'The contributor did not agree to training use.',
    AnswerTarget.example when item.kasemExample.isEmpty =>
      'There is no Kasem sentence in this answer.',
    AnswerTarget.translationPair
        when item.kasemExample.isEmpty ||
            (item.queueSentence.isEmpty && item.englishExample.isEmpty) =>
      'It needs an English sentence and its Kasem.',
    _ => null,
  };
}
