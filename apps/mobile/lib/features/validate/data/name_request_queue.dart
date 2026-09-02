import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';

/// The names half of the review desk.
///
/// A member asks for a Kassena name to be added to the list the kente ring is
/// awarded from, and a reviewer decides. It is the same people, the same claim
/// and the same desk as contributions and adverts — but not the same object:
/// there is nothing to publish or schedule, and the only thing that can go
/// wrong after a yes is the handle, which is decided in the same transaction
/// and reported back on the request.
///
/// The model is `KasemNameRequest`, shared with the community screens rather
/// than copied. A reviewer and the member who asked are looking at exactly the
/// same document, and two readings of it would eventually disagree.

/// What a reviewer can do to a request, matching `decideKasemNameRequest`.
enum NameRequestDecision {
  approve,
  reject;

  String get wire => switch (this) {
    NameRequestDecision.approve => 'approve',
    NameRequestDecision.reject => 'reject',
  };

  String get label => switch (this) {
    NameRequestDecision.approve => 'Add the name',
    NameRequestDecision.reject => 'Reject',
  };

  IconData get icon => switch (this) {
    NameRequestDecision.approve => Icons.playlist_add_check_rounded,
    NameRequestDecision.reject => Icons.block_rounded,
  };

  Color color(BrandPalette brand) => switch (this) {
    NameRequestDecision.approve => brand.success,
    NameRequestDecision.reject => brand.danger,
  };

  /// The callable refuses a rejection with no reason, and it is right to: a
  /// member told their grandmother's name is not a name deserves a sentence.
  bool get requiresFeedback => this == NameRequestDecision.reject;
}

/// The queues a reviewer moves requests between.
const kNameRequestQueues = <(String, String, IconData)>[
  ('pending', 'Waiting', Icons.inbox_rounded),
  ('approved', 'Added', Icons.check_circle_rounded),
  ('rejected', 'Rejected', Icons.block_rounded),
];

/// Reads the name-request queue and records decisions.
///
/// Reads are direct: `kasemNameRequests` is readable by staff under the
/// Security Rules. Writes are not — the whole point of the collection is that
/// `ascii` is derived on the server, so a phone that could write one could
/// award the ring for anything.
class NameRequestRepository {
  const NameRequestRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const _timeout = Duration(seconds: 45);

  /// Requests in [status], newest first.
  ///
  /// Sorted on the device so the query stays a single-field equality and needs
  /// no composite index — the same trade every other queue in the app makes.
  Stream<List<KasemNameRequest>> watchQueue(String status) => _firestore
      .collection('kasemNameRequests')
      .where('status', isEqualTo: status)
      .limit(60)
      .snapshots()
      .map((snapshot) {
        final rows =
            snapshot.docs
                .map(KasemNameRequest.fromDoc)
                .whereType<KasemNameRequest>()
                .toList(growable: true)
              ..sort((left, right) {
                final leftAt = left.createdAt ?? DateTime(1970);
                final rightAt = right.createdAt ?? DateTime(1970);
                return rightAt.compareTo(leftAt);
              });
        return List<KasemNameRequest>.unmodifiable(rows);
      });

  Future<void> decide({
    required String requestId,
    required NameRequestDecision decision,
    required String note,
  }) async {
    try {
      final callable = _functions.httpsCallable(
        'decideKasemNameRequest',
        options: HttpsCallableOptions(timeout: _timeout),
      );
      await callable.call<Map<Object?, Object?>>({
        'requestId': requestId,
        'decision': decision.wire,
        'note': note.trim(),
      });
    } on FirebaseFunctionsException catch (error) {
      // The callable's own message names the precondition that failed, which
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

final nameRequestRepositoryProvider = Provider<NameRequestRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return NameRequestRepository(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

/// Which name queue the desk is showing.
class NameRequestQueueStatus extends Notifier<String> {
  @override
  String build() => 'pending';

  void select(String status) => state = status;
}

final nameRequestQueueStatusProvider =
    NotifierProvider<NameRequestQueueStatus, String>(
      NameRequestQueueStatus.new,
    );

final nameRequestQueueProvider = StreamProvider<List<KasemNameRequest>>((ref) {
  final repository = ref.watch(nameRequestRepositoryProvider);
  final canReview = ref.watch(isReviewerProvider);
  if (repository == null || !canReview) {
    return Stream.value(const <KasemNameRequest>[]);
  }
  return repository.watchQueue(ref.watch(nameRequestQueueStatusProvider));
});

/// How many requests are waiting, for the badge on the desk's Names tab.
///
/// Its own subscription rather than a read of the visible queue, so the count
/// is still right while a reviewer is looking at the Added list — and so the
/// review-desk card on Contribute can show it without opening the desk at all.
final nameRequestWaitingCountProvider = StreamProvider<int>((ref) {
  final repository = ref.watch(nameRequestRepositoryProvider);
  if (repository == null || !ref.watch(isReviewerProvider)) {
    return Stream.value(0);
  }
  return repository.watchQueue('pending').map((rows) => rows.length);
});
