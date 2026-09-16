import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_learning_context.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_offline_guide.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';

@immutable
class KawuriAnswer {
  const KawuriAnswer({
    required this.text,
    this.fromOfflineGuide = false,
    this.failed = false,
    this.incomplete = false,
    this.sources = const [],
    this.taskId,
    this.analysis,
  });
  final String text;
  final bool fromOfflineGuide;
  final bool failed;
  final bool incomplete;
  final List<Map<String, Object?>> sources;
  final String? taskId;
  final KawuriAnalysisResult? analysis;
}

/// Kawuri's conversation adapter. No UI knows a provider URL or credential:
/// text goes to `kawuriChat`, and media analysis goes through
/// [KawuriMediaRepository] to `analyseKawuriMedia`, both server-side.
class KawuriService {
  const KawuriService(
    this.functions, {
    this.dictionary,
    this.userId,
    this.online = true,
    this.media,
    this.capabilities = KawuriCapabilities.none,
  });
  final FirebaseFunctions? functions;
  final Future<List<DictionaryEntry>> Function()? dictionary;
  final String? userId;
  final bool online;
  final KawuriMediaRepository? media;
  final KawuriCapabilities capabilities;
  static const contextWindow = 12;

  Future<KawuriAnswer> ask(List<KawuriMessage> conversation) async {
    final last = conversation.lastWhere((m) => m.isYou);
    if (!last.taskType.available) {
      return const KawuriAnswer(
        text: 'This capability is coming soon.',
        failed: true,
      );
    }
    if (last.taskType == KawuriTaskType.mediaAnalysis) {
      return _analyse(conversation, last);
    }
    if (_routedPrompt(last).length > 4000) {
      return const KawuriAnswer(
        text: 'This request exceeds the current 4,000-character limit. Split it into smaller messages; your full text is preserved above.',
        failed: true,
      );
    }
    if (last.taskType == KawuriTaskType.translation && dictionary != null) {
      try {
        final entries = await dictionary!().timeout(const Duration(seconds: 8));
        final matches = verifiedMatches(
          entries,
          last.text,
          toKasem: last.options['direction'] != 'Kasem → English',
        );
        if (matches.isNotEmpty) {
          return KawuriAnswer(
            text: matches
                .map(
                  (entry) =>
                      '${entry.headword} — ${entry.translation}\nSource: ${entry.attribution.isEmpty ? 'Published Indigen World dictionary' : entry.attribution}',
                )
                .join('\n\n'),
            sources: [
              for (final entry in matches)
                {
                  'id': entry.id,
                  'headword': entry.headword,
                  'translation': entry.translation,
                  'alternatives': entry.translations,
                  'pronunciation': entry.pronunciation,
                  'audioUrl': entry.audioUrl,
                  'source': entry.attribution,
                  'dialect': entry.dialect,
                  'sourceText': last.text,
                  'direction': last.options['direction'] ?? 'English → Kasem',
                  'verification': 'Published dictionary',
                },
            ],
          );
        }
      } on Object {
        // The callable still searches the approved dictionary and sentence corpus.
      }
    }
    final functions = this.functions;
    if (functions == null || !online) return _offline(last.text);
    final request = KawuriRequest(
      id: last.id,
      conversationId: last.conversationId,
      userId: userId,
      type: last.taskType,
      prompt: last.text,
      createdAt: last.sentAt,
      updatedAt: DateTime.now(),
      languageContext: last.options,
    );
    try {
      final result = await functions
          .httpsCallable(
            'kawuriChat',
            options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
          )
          .call<Map<Object?, Object?>>({
            'request': request.toJson(),
            // Retain compatibility with deployed text-only kawuriChat.
            'messages': recentTurns(conversation)
                .map(
                  (m) => {
                    'role': m.isYou ? 'user' : 'model',
                    'text': m.id == last.id ? _routedPrompt(last) : m.text,
                  },
                )
                .toList(),
          });
      final data = result.data;
      if (data['configured'] == false) {
        return KawuriAnswer(
          text:
              'Online Kawuri is unavailable for this deployment.\n\n${offlineGuideAnswer(last.text)}',
          fromOfflineGuide: true,
        );
      }
      final reply = data['reply'];
      if (reply is! String || reply.trim().isEmpty) {
        return const KawuriAnswer(
          text: 'The provider returned no answer. Try rephrasing your request.',
          failed: true,
        );
      }
      return KawuriAnswer(
        text: reply,
        incomplete:
            data['finishReason'] == 'MAX_TOKENS' || data['incomplete'] == true,
      );
    } on FirebaseFunctionsException catch (error) {
      return KawuriAnswer(text: errorMessage(error.code), failed: true);
    } on Object {
      return const KawuriAnswer(
        text: 'Kawuri could not connect. Your conversation is saved on this device. Check your connection and retry.',
        failed: true,
      );
    }
  }

  /// One analysis question: a new file, or a follow-up on the analysis the
  /// conversation already holds.
  Future<KawuriAnswer> _analyse(
    List<KawuriMessage> conversation,
    KawuriMessage last,
  ) async {
    final media = this.media;
    if (media == null || !online) {
      return const KawuriAnswer(
        text: 'Media analysis needs a connection. Your question is saved; try again when you are online.',
        failed: true,
      );
    }
    final unavailable = capabilities.unavailableMessage('mediaAnalysis');
    if (unavailable != null) {
      return KawuriAnswer(text: unavailable, failed: true);
    }
    final attachment = last.attachment;
    final followUp = attachment != null
        ? null
        : conversation.reversed
              .where((m) => !m.isYou && !m.failed && m.taskId != null)
              .map((m) => m.taskId)
              .firstOrNull;
    if (attachment == null && followUp == null) {
      return const KawuriAnswer(
        text: 'Attach an image, video or audio file for Kawuri to analyse.',
        failed: true,
      );
    }
    final intention = last.options['intention'] ?? 'describe';
    try {
      String? storagePath;
      if (attachment != null) {
        if (!File(attachment.path).existsSync()) {
          return const KawuriAnswer(
            text: 'That file is no longer on this device. Attach it again.',
            failed: true,
          );
        }
        final limit = capabilities.analysisBytes[attachment.kind] ?? 0;
        if (limit > 0 && attachment.sizeBytes > limit) {
          return KawuriAnswer(
            text:
                'That file is larger than ${limit ~/ (1024 * 1024)} MB. Choose a shorter or smaller one.',
            failed: true,
          );
        }
        storagePath = await media.upload(
          purpose: 'media',
          filePath: attachment.path,
          contentType: attachment.mimeType,
        );
      }
      final question = last.text == kawuriAnalysisIntentions[intention]
          ? ''
          : last.text;
      final creation = await media.analyse(
        // The message id: resending this very message is the same request.
        requestId: 'ana_${last.id}',
        intention: intention,
        question: question,
        storagePath: storagePath,
        followUpTaskId: followUp,
        conversationId: last.conversationId,
      );
      final result = creation.turns.lastOrNull?.result ?? creation.result;
      if (creation.status != KawuriMediaStatus.ready || result == null) {
        return KawuriAnswer(
          text: creation.errorMessage ?? 'Kawuri could not analyse that file.',
          failed: true,
        );
      }
      return KawuriAnswer(
        text: result.plainText,
        taskId: creation.id,
        analysis: result,
      );
    } on KawuriMediaException catch (error) {
      return KawuriAnswer(text: error.message, failed: true);
    }
  }

  static KawuriAnswer _offline(String prompt) =>
      KawuriAnswer(text: offlineGuideAnswer(prompt), fromOfflineGuide: true);

  @visibleForTesting
  static String errorMessage(String code) => switch (code) {
    'resource-exhausted' => 'Your Kawuri allowance or request limit has been reached. Check Membership for your plan, or try again later. The server has not supplied a reset time.',
    'unauthenticated' => 'Sign in again to continue this request.',
    'permission-denied' =>
      'Permission denied. Check your account access and try again.',
    'deadline-exceeded' =>
      'The request timed out. Your question is preserved; you can retry.',
    'invalid-argument' =>
      'The request was rejected. Check your message and try again.',
    'failed-precondition' => 'This capability is not currently available for your account or deployment.',
    'unavailable' || 'not-found' => 'The Kawuri service is unavailable. Check your connection and try again later.',
    _ => 'Kawuri could not complete this request. Your question is preserved; you can retry.',
  };

  static String _routedPrompt(KawuriMessage message) {
    final routed = _routedTask(message);
    // Opened from the Learn tab: the published course and dictionary records
    // the learner was looking at travel with every turn, marked verified.
    final learning = KawuriLearningContext.fromOptions(message.options);
    if (learning == null) return routed;
    return [routed, learning.routedBlock()].join('\n');
  }

  static String _routedTask(KawuriMessage message) {
    final text = message.text;
    return switch (message.taskType) {
      KawuriTaskType.translation =>
        'Translate from ${message.options['direction'] ?? 'English → Kasem'}: "$text". Use published dictionary and approved sentence records; attribute matches. Label any inference unverified. Never assemble unattested Kasem sentences; invite community verification when unknown.',
      KawuriTaskType.languagePractice =>
        'Help me practise Kasem. Level: ${message.options['level'] ?? 'Beginner'}. Practice: ${message.options['practice'] ?? 'Guided conversation'}. Topic: $text. Use approved examples; label uncertain grammar and do not invent attested language.',
      KawuriTaskType.storyHelp =>
        'Help develop this story idea: $text. Distinguish original fiction from documented cultural knowledge; do not invent traditions or attribute fiction to a community.',
      KawuriTaskType.contributionHelp =>
        'Help me prepare a contribution: $text. Preserve my authorship. Ask for source, community, language, rights and AI-assistance disclosure. Do not fabricate knowledge or claim a contribution has been submitted.',
      _ => text,
    };
  }

  /// Exact matches only: a fuzzy word suggestion is not a verified translation.
  @visibleForTesting
  static List<DictionaryEntry> verifiedMatches(
    List<DictionaryEntry> entries,
    String text, {
    bool toKasem = true,
  }) {
    String key(String value) => value.trim().toLowerCase();
    final query = key(text);
    return entries
        .where(
          (entry) => (toKasem
              ? [
                  entry.translation,
                  ...entry.translations,
                ].any((meaning) => key(meaning) == query)
              : [
                  entry.headword,
                  ...entry.renderings,
                ].any((word) => key(word) == query)),
        )
        .toList();
  }

  @visibleForTesting
  static List<KawuriMessage> recentTurns(List<KawuriMessage> conversation) {
    final spoken = conversation
        .where(
          (m) => m.text.trim().isNotEmpty && !m.failed && !m.fromOfflineGuide,
        )
        .toList();
    return spoken.length <= contextWindow
        ? spoken
        : spoken.sublist(spoken.length - contextWindow);
  }
}

final kawuriServiceProvider = Provider<KawuriService>(
  (ref) => KawuriService(
    ref.watch(firebaseReadyProvider) ? FirebaseFunctions.instance : null,
    userId: ref.watch(currentUidProvider),
    online: ref.watch(isOnlineProvider),
    dictionary: () => ref.read(publishedDictionaryEntriesProvider.future),
    media: ref.watch(kawuriMediaRepositoryProvider),
    capabilities:
        ref.watch(kawuriCapabilitiesProvider).value ?? KawuriCapabilities.none,
  ),
);
