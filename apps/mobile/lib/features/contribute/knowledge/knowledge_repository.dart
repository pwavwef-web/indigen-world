import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/features/contribute/knowledge/knowledge_models.dart';

class KnowledgeFailure implements Exception {
  const KnowledgeFailure(this.message);
  final String message;
  @override
  String toString() => message;
}

abstract class KnowledgeRepository {
  Future<KnowledgePage> list({String? cursor});
  Future<Map<String, dynamic>> get(String id);
  Future<Map<String, dynamic>> save({
    required Map<String, dynamic> record,
    required String requestId,
    required bool submit,
    String? id,
    int? revision,
  });
  Future<Map<String, dynamic>> withdraw(String id, int revision);
  Future<String> upload(PickedContributionFile file);
  Future<Map<String, dynamic>> readAudio(String id, int revision, int index);
}

class FirebaseKnowledgeRepository implements KnowledgeRepository {
  const FirebaseKnowledgeRepository(this.auth);
  final FirebaseAuth? auth;

  User _member() {
    final user = auth?.currentUser;
    if (user == null || user.isAnonymous) {
      throw const KnowledgeFailure(
        'Sign in from your profile to save knowledge records and follow their review.',
      );
    }
    return user;
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> arguments,
  ) async {
    _member();
    try {
      final result = await FirebaseFunctions.instance
          .httpsCallable(name, options: HttpsCallableOptions(timeout: const Duration(seconds: 45)))
          .call<Object?>(arguments);
      return knowledgeMap(result.data);
    } on FirebaseFunctionsException catch (error) {
      throw KnowledgeFailure(switch (error.code) {
        'unauthenticated' => 'Your session has ended. Sign in from your profile and try again.',
        'permission-denied' => 'This record is not available to your account.',
        'aborted' => 'This record changed on another device. Reopen it before saving your next revision.',
        'not-found' || 'unimplemented' => 'The knowledge workspace is not available on this server yet. Please try again later.',
        'invalid-argument' || 'failed-precondition' => error.message ?? 'Check the record and permissions, then try again.',
        _ => 'The workspace could not be reached. Check your connection and retry. Any open edits are still here.',
      });
    }
  }

  @override
  Future<KnowledgePage> list({String? cursor}) async => KnowledgePage.fromMap(
    await _call('listKnowledgeRecords', {'scope': 'mine', 'cursor': ?cursor}),
  );

  @override
  Future<Map<String, dynamic>> get(String id) => _call('getKnowledgeRecord', {'id': id});

  @override
  Future<Map<String, dynamic>> save({required Map<String, dynamic> record, required String requestId, required bool submit, String? id, int? revision}) async => knowledgeMap(
    (await _call('saveKnowledgeRecord', {
      'record': record, 'requestId': requestId, 'submit': submit,
      'id': ?id, 'revision': ?revision,
    }))['record'],
  );

  @override
  Future<Map<String, dynamic>> withdraw(String id, int revision) async => knowledgeMap(
    (await _call('withdrawKnowledgeRecord', {'id': id, 'revision': revision}))['record'],
  );

  @override
  Future<Map<String, dynamic>> readAudio(String id, int revision, int index) =>
    _call('readKnowledgeAudio', {'id': id, 'revision': revision, 'index': index});

  @override
  Future<String> upload(PickedContributionFile file) async {
    final uid = _member().uid;
    if (file.sizeBytes >= 20 * 1024 * 1024) {
      throw const KnowledgeFailure('Choose a recording smaller than 20 MB.');
    }
    final safeName = file.name.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    final path = 'grammarAudio/$uid/${DateTime.now().microsecondsSinceEpoch}_$safeName';
    try {
      await FirebaseStorage.instance.ref(path).putFile(
        File(file.path), SettableMetadata(contentType: file.mimeType),
      );
      return path;
    } on FirebaseException {
      throw const KnowledgeFailure('The recording was not uploaded. Check your connection and try again.');
    }
  }
}

final knowledgeRepositoryProvider = Provider<KnowledgeRepository>((ref) =>
  FirebaseKnowledgeRepository(ref.watch(firebaseAuthProvider)),
);

final knowledgePageProvider = FutureProvider<KnowledgePage>((ref) {
  ref.watch(authStateProvider);
  return ref.watch(knowledgeRepositoryProvider).list();
});
