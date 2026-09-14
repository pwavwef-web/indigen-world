import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:path/path.dart' as p;

/// Kawuri's media tools, as the app reaches them.
///
/// Everything here talks to Indigen World's own backend: Firebase callables
/// that verify the member's ID token, and the member's own private Storage and
/// Firestore paths. No provider URL, key or token exists in the app — Vertex AI
/// is only ever called by the Cloud Functions behind these callables.
class KawuriMediaRepository {
  KawuriMediaRepository({
    required this.functions,
    required this.firestore,
    required this.storage,
    required this.uid,
  });

  final FirebaseFunctions functions;
  final FirebaseFirestore firestore;
  final FirebaseStorage storage;
  final String? uid;

  static final _random = math.Random.secure();

  /// A fresh idempotency key. Made once per press of a button and reused for
  /// every retry of that press, so a flaky connection never buys twice.
  static String newRequestId(String prefix) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final suffix = List.generate(
      12,
      (_) => alphabet[_random.nextInt(alphabet.length)],
    ).join();
    return '${prefix}_${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}$suffix';
  }

  Future<Map<Object?, Object?>> _call(
    String name,
    Map<String, Object?> data, {
    Duration timeout = const Duration(seconds: 60),
    bool billable = false,
  }) async {
    try {
      final result = await functions
          .httpsCallable(
            name,
            options: HttpsCallableOptions(
              timeout: timeout,
              // A limited-use App Check token on every call that buys a
              // generation, so a captured token cannot be replayed.
              limitedUseAppCheckToken: billable,
            ),
          )
          .call<Map<Object?, Object?>>(data);
      return result.data;
    } on Object catch (error) {
      throw KawuriMediaException.from(error);
    }
  }

  Future<KawuriCapabilities> capabilities() async =>
      KawuriCapabilities.fromMap(await _call('getKawuriCapabilities', {}));

  String _requireUid() {
    final value = uid;
    if (value == null) {
      throw const KawuriMediaException(
        'UNAUTHENTICATED',
        'Sign in to use this Kawuri tool.',
      );
    }
    return value;
  }

  /// Uploads a file into the member's private, temporary Kawuri folder and
  /// returns its Storage path.
  Future<String> upload({
    required String purpose,
    required String filePath,
    required String contentType,
    void Function(double progress)? onProgress,
  }) async {
    final owner = _requireUid();
    final extension = p.extension(filePath).toLowerCase();
    final safeExtension = RegExp(r'^\.[a-z0-9]{1,5}$').hasMatch(extension)
        ? extension
        : '';
    final path =
        'kawuri-uploads/$owner/$purpose/${newRequestId('up')}/upload$safeExtension';
    try {
      final task = storage
          .ref(path)
          .putFile(File(filePath), SettableMetadata(contentType: contentType));
      final subscription = task.snapshotEvents.listen((snapshot) {
        if (snapshot.totalBytes > 0) {
          onProgress?.call(snapshot.bytesTransferred / snapshot.totalBytes);
        }
      });
      await task;
      await subscription.cancel();
      return path;
    } on Object catch (error) {
      throw KawuriMediaException.from(error);
    }
  }

  Future<KawuriCreation> createImage({
    required String requestId,
    required String prompt,
    required String aspectRatio,
    String? referenceImagePath,
    String sourceTaskId = '',
    String conversationId = '',
  }) async => KawuriCreation.fromMap(
    await _call(
      'createKawuriImage',
      {
        'requestId': requestId,
        'prompt': prompt,
        'aspectRatio': aspectRatio,
        'referenceImagePath': ?referenceImagePath,
        if (sourceTaskId.isNotEmpty) 'sourceTaskId': sourceTaskId,
        if (conversationId.isNotEmpty) 'conversationId': conversationId,
      },
      timeout: const Duration(seconds: 170),
      billable: true,
    ),
  );

  Future<KawuriCreation> createVideo({
    required String requestId,
    required String prompt,
    required String aspectRatio,
    required int durationSeconds,
    required String resolution,
    required bool confirmSpend,
    String negativePrompt = '',
    String quality = 'fast',
    String? referenceImagePath,
    String sourceTaskId = '',
    String conversationId = '',
  }) async => KawuriCreation.fromMap(
    await _call(
      'createKawuriVideo',
      {
        'requestId': requestId,
        'prompt': prompt,
        'negativePrompt': negativePrompt,
        'aspectRatio': aspectRatio,
        'durationSeconds': durationSeconds,
        'resolution': resolution,
        'quality': quality,
        'confirmSpend': confirmSpend,
        'referenceImagePath': ?referenceImagePath,
        if (sourceTaskId.isNotEmpty) 'sourceTaskId': sourceTaskId,
        if (conversationId.isNotEmpty) 'conversationId': conversationId,
      },
      timeout: const Duration(seconds: 110),
      billable: true,
    ),
  );

  /// The task with fresh signed links. For a video still at Vertex this is
  /// also a status check the backend makes on the app's behalf.
  Future<KawuriCreation> task(String taskId) async => KawuriCreation.fromMap(
    await _call('getKawuriTask', {
      'taskId': taskId,
    }, timeout: const Duration(seconds: 120)),
  );

  Future<KawuriCreation> cancel(String taskId) async => KawuriCreation.fromMap(
    await _call('cancelKawuriTask', {'taskId': taskId}),
  );

  Future<void> delete(String taskId) async {
    await _call('deleteKawuriCreation', {'taskId': taskId});
  }

  Future<KawuriTranscript> transcribe({
    required String requestId,
    required String storagePath,
    required int durationSeconds,
  }) async {
    final data = await _call(
      'transcribeKawuriAudio',
      {
        'requestId': requestId,
        'storagePath': storagePath,
        // English is the only language this tool accepts, and the app never
        // offers another.
        'language': 'en',
        'durationSeconds': durationSeconds,
      },
      timeout: const Duration(seconds: 110),
      billable: true,
    );
    return KawuriTranscript(
      text: data['transcript'] as String? ?? '',
      unclearSegments: data['unclearSegments'] is List
          ? (data['unclearSegments']! as List).whereType<String>().toList()
          : const [],
      durationSeconds: (data['durationSeconds'] as num?)?.toInt() ?? 0,
    );
  }

  Future<KawuriCreation> analyse({
    required String requestId,
    required String intention,
    String question = '',
    String? storagePath,
    String? followUpTaskId,
    String conversationId = '',
  }) async => KawuriCreation.fromMap(
    await _call(
      'analyseKawuriMedia',
      {
        'requestId': requestId,
        'intention': intention,
        'question': question,
        'storagePath': ?storagePath,
        'followUpTaskId': ?followUpTaskId,
        if (conversationId.isNotEmpty) 'conversationId': conversationId,
      },
      timeout: const Duration(seconds: 170),
      billable: true,
    ),
  );

  Query<Map<String, dynamic>> _mine(KawuriCreationFilter filter) {
    var query = firestore
        .collection('kawuriTasks')
        .where('userId', isEqualTo: _requireUid());
    query = filter == KawuriCreationFilter.all
        ? query.where('listed', isEqualTo: true)
        : query.where('category', isEqualTo: filter.name);
    return query.orderBy('createdAt', descending: true);
  }

  /// The member's creations, live. Status and progress arrive here as the
  /// backend writes them; the app never polls Vertex.
  Stream<List<KawuriCreation>> watchCreations({
    KawuriCreationFilter filter = KawuriCreationFilter.all,
    int limit = 50,
  }) {
    if (uid == null) return Stream.value(const []);
    return _mine(filter)
        .limit(limit)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .map((doc) => KawuriCreation.fromMap(doc.data(), id: doc.id))
              .toList(growable: false),
        );
  }

  Stream<KawuriCreation?> watchTask(String taskId) {
    if (uid == null) return Stream.value(null);
    return firestore
        .collection('kawuriTasks')
        .doc(taskId)
        .snapshots()
        .map(
          (doc) => doc.exists && doc.data() != null
              ? KawuriCreation.fromMap(doc.data()!, id: doc.id)
              : null,
        );
  }
}

final kawuriMediaRepositoryProvider = Provider<KawuriMediaRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return KawuriMediaRepository(
    functions: FirebaseFunctions.instance,
    firestore: FirebaseFirestore.instance,
    storage: FirebaseStorage.instance,
    uid: ref.watch(currentUidProvider),
  );
});

/// The server's capability manifest for whoever is signed in.
///
/// Re-read when the account changes or the phone comes back online. Anything
/// short of an answer is [KawuriCapabilities.none]: offline, not configured, or
/// an error all mean no media tool is offered.
final kawuriCapabilitiesProvider = FutureProvider<KawuriCapabilities>((
  ref,
) async {
  final repository = ref.watch(kawuriMediaRepositoryProvider);
  final online = ref.watch(isOnlineProvider);
  if (repository == null || !online) return KawuriCapabilities.none;
  try {
    return await repository.capabilities().timeout(const Duration(seconds: 20));
  } on Object {
    return KawuriCapabilities.none;
  }
});

/// The two newest creations, for the Recent section of Kawuri's home.
final kawuriRecentCreationsProvider = StreamProvider<List<KawuriCreation>>((
  ref,
) {
  final repository = ref.watch(kawuriMediaRepositoryProvider);
  if (repository == null || repository.uid == null) {
    return Stream.value(const []);
  }
  return repository.watchCreations(limit: 2);
});

final kawuriCreationsProvider =
    StreamProvider.family<List<KawuriCreation>, KawuriCreationFilter>((
      ref,
      filter,
    ) {
      final repository = ref.watch(kawuriMediaRepositoryProvider);
      if (repository == null || repository.uid == null) {
        return Stream.value(const []);
      }
      return repository.watchCreations(filter: filter);
    });

final kawuriTaskProvider = StreamProvider.family<KawuriCreation?, String>((
  ref,
  taskId,
) {
  final repository = ref.watch(kawuriMediaRepositoryProvider);
  if (repository == null) return Stream.value(null);
  return repository.watchTask(taskId);
});
