import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// What the backend says Kawuri's media tools can do for this member, right
/// now.
///
/// Read from `getKawuriCapabilities` and never assumed: a tool the server does
/// not advertise is not offered, so nobody fills in a form and finds at the
/// last button that nothing is behind it. [none] is what the app believes
/// before the server has answered, and what it falls back to when it cannot
/// be reached.
@immutable
class KawuriCapabilities {
  const KawuriCapabilities({
    this.chat = false,
    this.translation = false,
    this.imageGeneration = false,
    this.videoGeneration = false,
    this.speechToText = false,
    this.mediaAnalysis = false,
    this.unavailableReasons = const {},
    this.speechToTextLanguages = const [],
    this.imageAspectRatios = const [],
    this.imageReferenceInput = false,
    this.videoAspectRatios = const [],
    this.videoDurations = const [],
    this.videoResolutions = const {},
    this.videoReferenceImage = false,
    this.videoNegativePrompt = false,
    this.videoQualityOptions = const [],
    this.videoAudio = false,
    this.analysisIntentions = const [],
    this.transcriptionSeconds = 120,
    this.transcriptionBytes = 10 * 1024 * 1024,
    this.referenceImageBytes = 20 * 1024 * 1024,
    this.analysisBytes = const {},
    this.promptChars = 2000,
    this.loaded = false,
  });

  static const none = KawuriCapabilities();

  final bool chat;
  final bool translation;
  final bool imageGeneration;
  final bool videoGeneration;
  final bool speechToText;
  final bool mediaAnalysis;

  /// Why a tool is off: `sign_in_required`, `not_eligible`, `disabled`,
  /// `model_unavailable` or `not_configured`.
  final Map<String, String> unavailableReasons;
  final List<String> speechToTextLanguages;
  final List<String> imageAspectRatios;
  final bool imageReferenceInput;
  final List<String> videoAspectRatios;
  final List<int> videoDurations;
  final Map<String, List<String>> videoResolutions;
  final bool videoReferenceImage;
  final bool videoNegativePrompt;
  final List<String> videoQualityOptions;

  /// Whether the backend honours the sound switch. A backend that predates it
  /// makes every video silent, so the switch is only offered when this is on.
  final bool videoAudio;
  final List<String> analysisIntentions;
  final int transcriptionSeconds;
  final int transcriptionBytes;
  final int referenceImageBytes;
  final Map<String, int> analysisBytes;
  final int promptChars;

  /// False until the server has answered at least once.
  final bool loaded;

  static List<String> _strings(Object? raw) =>
      raw is List ? raw.whereType<String>().toList(growable: false) : const [];

  factory KawuriCapabilities.fromMap(Map<Object?, Object?> raw) {
    final limits = raw['limits'] is Map
        ? Map<Object?, Object?>.from(raw['limits']! as Map)
        : const <Object?, Object?>{};
    int limit(String key, int fallback) =>
        limits[key] is num ? (limits[key]! as num).toInt() : fallback;
    return KawuriCapabilities(
      chat: raw['chat'] == true,
      translation: raw['translation'] == true,
      imageGeneration: raw['imageGeneration'] == true,
      videoGeneration: raw['videoGeneration'] == true,
      speechToText: raw['speechToText'] == true,
      mediaAnalysis: raw['mediaAnalysis'] == true,
      unavailableReasons: raw['unavailableReasons'] is Map
          ? (raw['unavailableReasons']! as Map).map(
              (key, value) => MapEntry('$key', '$value'),
            )
          : const {},
      speechToTextLanguages: _strings(raw['speechToTextLanguages']),
      imageAspectRatios: _strings(raw['imageAspectRatios']),
      imageReferenceInput: raw['imageReferenceInput'] == true,
      videoAspectRatios: _strings(raw['videoAspectRatios']),
      videoDurations: raw['videoDurations'] is List
          ? (raw['videoDurations']! as List)
                .whereType<num>()
                .map((value) => value.toInt())
                .toList(growable: false)
          : const [],
      videoResolutions: raw['videoResolutions'] is Map
          ? (raw['videoResolutions']! as Map).map(
              (key, value) => MapEntry('$key', _strings(value)),
            )
          : const {},
      videoReferenceImage: raw['videoReferenceImage'] == true,
      videoNegativePrompt: raw['videoNegativePrompt'] == true,
      videoQualityOptions: _strings(raw['videoQualityOptions']),
      videoAudio: raw['videoAudio'] == true,
      analysisIntentions: _strings(raw['analysisIntentions']),
      transcriptionSeconds: limit('transcriptionSeconds', 120),
      transcriptionBytes: limit('transcriptionBytes', 10 * 1024 * 1024),
      referenceImageBytes: limit('referenceImageBytes', 20 * 1024 * 1024),
      analysisBytes: limits['analysisBytes'] is Map
          ? (limits['analysisBytes']! as Map).map(
              (key, value) =>
                  MapEntry('$key', value is num ? value.toInt() : 0),
            )
          : const {},
      promptChars: limit('promptChars', 2000),
      loaded: true,
    );
  }

  /// A sentence for a tool that is off, or null when it is on.
  String? unavailableMessage(String capability) {
    final enabled = switch (capability) {
      'imageGeneration' => imageGeneration,
      'videoGeneration' => videoGeneration,
      'speechToText' => speechToText,
      'mediaAnalysis' => mediaAnalysis,
      _ => false,
    };
    if (enabled) return null;
    if (!loaded) {
      return 'Kawuri is still checking which tools are available. Try again in a moment.';
    }
    return switch (unavailableReasons[capability]) {
      'sign_in_required' => 'Sign in to use this Kawuri tool.',
      'not_eligible' =>
        'Video creation is for approved creators and the Indigen Creator plan.',
      'disabled' => 'This tool is switched off at the moment.',
      'model_unavailable' =>
        'This tool is temporarily unavailable. Please try again later.',
      _ => 'This tool is not available yet.',
    };
  }

  /// A short tag for a carousel tile, or null when the tool is on.
  String? unavailableTag(String capability) {
    if (unavailableMessage(capability) == null) return null;
    return switch (unavailableReasons[capability]) {
      'sign_in_required' => 'Sign in',
      'not_eligible' => 'Creators',
      'model_unavailable' || 'disabled' => 'Unavailable',
      _ => loaded ? 'Coming soon' : 'Checking…',
    };
  }
}

/// The statuses a task moves through, as the backend writes them.
enum KawuriMediaStatus {
  draft,
  uploading,
  queued,
  generating,
  processing,
  ready,
  failed,
  rejected,
  cancelled,
  expired;

  static KawuriMediaStatus parse(Object? raw) => values.firstWhere(
    (status) => status.name == raw,
    orElse: () => KawuriMediaStatus.failed,
  );

  bool get terminal => switch (this) {
    ready || failed || rejected || cancelled || expired => true,
    _ => false,
  };

  bool get inFlight => !terminal && this != draft;

  String get label => switch (this) {
    draft => 'Draft',
    uploading => 'Uploading',
    queued => 'Queued',
    generating => 'Generating',
    processing => 'Processing',
    ready => 'Ready',
    failed => 'Failed',
    rejected => 'Declined',
    cancelled => 'Cancelled',
    expired => 'Expired',
  };
}

/// One stored file a task produced or used.
@immutable
class KawuriMedia {
  const KawuriMedia({
    required this.storagePath,
    required this.mimeType,
    this.sizeBytes = 0,
    this.width,
    this.height,
    this.durationSeconds,
    this.url,
    this.downloadUrl,
  });

  final String storagePath;
  final String mimeType;
  final int sizeBytes;
  final int? width;
  final int? height;
  final num? durationSeconds;

  /// A short-lived signed link. Only present on answers from a callable, never
  /// on a Firestore snapshot.
  final String? url;
  final String? downloadUrl;

  bool get isVideo => mimeType.startsWith('video/');
  bool get isImage => mimeType.startsWith('image/');

  double? get aspectRatio =>
      (width ?? 0) > 0 && (height ?? 0) > 0 ? width! / height! : null;

  static KawuriMedia? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final path = raw['storagePath'];
    if (path is! String || path.isEmpty) return null;
    int? whole(Object? value) => value is num ? value.toInt() : null;
    return KawuriMedia(
      storagePath: path,
      mimeType: raw['mimeType'] as String? ?? '',
      sizeBytes: whole(raw['sizeBytes']) ?? 0,
      width: whole(raw['width']),
      height: whole(raw['height']),
      durationSeconds: raw['durationSeconds'] as num?,
      url: raw['url'] as String?,
      downloadUrl: raw['downloadUrl'] as String?,
    );
  }
}

/// A structured analysis, with what was seen kept apart from what it might
/// mean.
@immutable
class KawuriAnalysisResult {
  const KawuriAnalysisResult({
    required this.summary,
    this.answer = '',
    this.observations = const [],
    this.possibleContext = const [],
    this.detectedText = const [],
    this.suggestedLanguages = const [],
    this.suggestedTopics = const [],
    this.confidenceNotes = const [],
    this.requiresCommunityVerification = true,
  });

  final String summary;
  final String answer;
  final List<String> observations;
  final List<String> possibleContext;
  final List<String> detectedText;
  final List<String> suggestedLanguages;
  final List<String> suggestedTopics;
  final List<String> confidenceNotes;
  final bool requiresCommunityVerification;

  static List<String> _strings(Object? raw) =>
      raw is List ? raw.whereType<String>().toList(growable: false) : const [];

  static KawuriAnalysisResult? fromMap(Object? raw) {
    if (raw is! Map || raw['summary'] is! String) return null;
    return KawuriAnalysisResult(
      summary: raw['summary']! as String,
      answer: raw['answer'] as String? ?? '',
      observations: _strings(raw['observations']),
      possibleContext: _strings(raw['possibleContext']),
      detectedText: _strings(raw['detectedText']),
      suggestedLanguages: _strings(raw['suggestedLanguages']),
      suggestedTopics: _strings(raw['suggestedTopics']),
      confidenceNotes: _strings(raw['confidenceNotes']),
      requiresCommunityVerification:
          raw['requiresCommunityVerification'] != false,
    );
  }

  Map<String, Object?> toJson() => {
    'summary': summary,
    'answer': answer,
    'observations': observations,
    'possibleContext': possibleContext,
    'detectedText': detectedText,
    'suggestedLanguages': suggestedLanguages,
    'suggestedTopics': suggestedTopics,
    'confidenceNotes': confidenceNotes,
    'requiresCommunityVerification': requiresCommunityVerification,
  };

  /// Plain text for copying, sharing and the conversation history.
  String get plainText {
    final buffer = StringBuffer(answer.isNotEmpty ? answer : summary);
    void section(String title, List<String> lines) {
      if (lines.isEmpty) return;
      buffer.write('\n\n$title');
      for (final line in lines) {
        buffer.write('\n• $line');
      }
    }

    if (answer.isNotEmpty && summary.isNotEmpty) {
      buffer.write('\n\n$summary');
    }
    section('Seen directly', observations);
    section('Possible context (not verified)', possibleContext);
    section('Text found', detectedText);
    section('Suggested languages (not verified)', suggestedLanguages);
    section('Suggested topics', suggestedTopics);
    section('What cannot be known', confidenceNotes);
    return buffer.toString();
  }
}

/// The kinds of task the creation library shows.
enum KawuriCreationFilter {
  all('All'),
  image('Images'),
  video('Videos'),
  analysis('Analysis');

  const KawuriCreationFilter(this.label);
  final String label;
}

/// One Kawuri media task, from a callable answer or a live Firestore snapshot.
@immutable
class KawuriCreation {
  const KawuriCreation({
    required this.id,
    required this.type,
    required this.status,
    required this.createdAt,
    this.prompt = '',
    this.negativePrompt = '',
    this.aspectRatio,
    this.duration,
    this.resolution,
    this.generateAudio,
    this.progress,
    this.outputMedia = const [],
    this.sourceMedia = const [],
    this.errorCode,
    this.errorMessage,
    this.serverActions,
    this.intention,
    this.result,
    this.turns = const [],
    this.sourceTaskId = '',
    this.conversationId = '',
    this.updatedAt,
  });

  final String id;

  /// `image_generation`, `video_generation`, `speech_to_text`,
  /// `image_analysis`, `video_analysis` or `audio_analysis`.
  final String type;
  final KawuriMediaStatus status;
  final String prompt;
  final String negativePrompt;
  final String? aspectRatio;
  final int? duration;
  final String? resolution;

  /// Whether a video was asked for with sound. Null on images, and on videos
  /// made before the switch existed — all of which were silent.
  final bool? generateAudio;

  /// A percentage only when Vertex reported one. Null means "working", and the
  /// app shows an indeterminate indicator rather than a guess.
  final int? progress;
  final List<KawuriMedia> outputMedia;
  final List<KawuriMedia> sourceMedia;
  final String? errorCode;
  final String? errorMessage;
  final List<String>? serverActions;
  final String? intention;
  final KawuriAnalysisResult? result;
  final List<KawuriAnalysisTurn> turns;
  final String sourceTaskId;
  final String conversationId;
  final DateTime createdAt;
  final DateTime? updatedAt;

  bool get isImage => type == 'image_generation';
  bool get isVideo => type == 'video_generation';
  bool get isAnalysis => type.endsWith('_analysis');

  KawuriMedia? get primaryOutput => outputMedia.firstOrNull;

  String get typeLabel => switch (type) {
    'image_generation' => 'Image',
    'video_generation' => 'Video',
    'image_analysis' => 'Image analysis',
    'video_analysis' => 'Video analysis',
    'audio_analysis' => 'Audio analysis',
    'speech_to_text' => 'Voice message',
    _ => 'Task',
  };

  /// "Image · Ready", the line Recent and the library show.
  String get subtitle => '$typeLabel · ${status.label}';

  /// "42%" when a real figure exists, otherwise null.
  String? get progressLabel =>
      status.inFlight && progress != null ? '$progress%' : null;

  String get title {
    final text = (prompt.isNotEmpty ? prompt : result?.summary ?? '').trim();
    if (text.isEmpty) return typeLabel;
    final single = text.replaceAll(RegExp(r'\s+'), ' ');
    return single.length <= 60 ? single : '${single.substring(0, 59)}…';
  }

  /// What may be done with this task in its current state.
  ///
  /// The server sends the list with every callable answer; a Firestore
  /// snapshot carries none, so the same rule is applied here. Both follow
  /// `actionsForTask` in `kawuri-media-policy.ts`.
  List<String> get actions {
    if (serverActions != null) return serverActions!;
    if (!status.terminal) return const ['cancel'];
    if (status == KawuriMediaStatus.ready) {
      if (isImage) {
        return const [
          'download',
          'share',
          'regenerate',
          'edit_prompt',
          'use_in_contribution',
          'use_as_reel_cover',
          'delete',
        ];
      }
      if (isVideo) {
        return const [
          'play',
          'download',
          'share',
          'regenerate',
          'edit_prompt',
          'use_in_reel',
          'use_in_contribution',
          'delete',
        ];
      }
      return const ['ask_follow_up', 'delete'];
    }
    return isImage || isVideo
        ? const ['retry', 'edit_prompt', 'delete']
        : const ['delete'];
  }

  static DateTime _time(Object? raw) {
    if (raw is String) return DateTime.tryParse(raw) ?? DateTime(1970);
    if (raw is DateTime) return raw;
    return DateTime(1970);
  }

  static KawuriCreation fromMap(Map<Object?, Object?> raw, {String? id}) {
    List<KawuriMedia> media(Object? value) => value is List
        ? value.map(KawuriMedia.fromMap).whereType<KawuriMedia>().toList()
        : const [];
    return KawuriCreation(
      id: id ?? raw['id'] as String? ?? '',
      type: raw['type'] as String? ?? '',
      status: KawuriMediaStatus.parse(raw['status']),
      prompt: raw['prompt'] as String? ?? '',
      negativePrompt: raw['negativePrompt'] as String? ?? '',
      aspectRatio: raw['aspectRatio'] as String?,
      duration: (raw['duration'] as num?)?.toInt(),
      resolution: raw['resolution'] as String?,
      generateAudio: raw['generateAudio'] as bool?,
      progress: (raw['progress'] as num?)?.toInt(),
      outputMedia: media(raw['outputMedia']),
      sourceMedia: media(raw['sourceMedia']),
      errorCode: raw['errorCode'] as String?,
      errorMessage: raw['errorMessage'] as String?,
      serverActions: raw['actions'] is List
          ? (raw['actions']! as List).whereType<String>().toList()
          : null,
      intention: raw['intention'] as String?,
      result: KawuriAnalysisResult.fromMap(raw['result']),
      turns: raw['turns'] is List
          ? (raw['turns']! as List)
                .map(KawuriAnalysisTurn.fromMap)
                .whereType<KawuriAnalysisTurn>()
                .toList()
          : const [],
      sourceTaskId: raw['sourceTaskId'] as String? ?? '',
      conversationId: raw['conversationId'] as String? ?? '',
      createdAt: _time(raw['createdAt']),
      updatedAt: raw['updatedAt'] == null ? null : _time(raw['updatedAt']),
    );
  }

  /// Keeps signed links from an earlier callable answer when a live snapshot,
  /// which never carries them, reports the same finished file.
  KawuriCreation withLinksFrom(KawuriCreation? earlier) {
    if (earlier == null || earlier.id != id) return this;
    final links = {
      for (final media in earlier.outputMedia) media.storagePath: media,
    };
    return KawuriCreation(
      id: id,
      type: type,
      status: status,
      prompt: prompt,
      negativePrompt: negativePrompt,
      aspectRatio: aspectRatio,
      duration: duration,
      resolution: resolution,
      generateAudio: generateAudio,
      progress: progress,
      outputMedia: [
        for (final media in outputMedia)
          media.url != null || links[media.storagePath] == null
              ? media
              : KawuriMedia(
                  storagePath: media.storagePath,
                  mimeType: media.mimeType,
                  sizeBytes: media.sizeBytes,
                  width: media.width,
                  height: media.height,
                  durationSeconds: media.durationSeconds,
                  url: links[media.storagePath]!.url,
                  downloadUrl: links[media.storagePath]!.downloadUrl,
                ),
      ],
      sourceMedia: sourceMedia,
      errorCode: errorCode,
      errorMessage: errorMessage,
      serverActions: serverActions,
      intention: intention,
      result: result,
      turns: turns,
      sourceTaskId: sourceTaskId,
      conversationId: conversationId,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}

@immutable
class KawuriAnalysisTurn {
  const KawuriAnalysisTurn({
    required this.intention,
    required this.question,
    required this.result,
  });

  final String intention;
  final String question;
  final KawuriAnalysisResult result;

  static KawuriAnalysisTurn? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final result = KawuriAnalysisResult.fromMap(raw['result']);
    if (result == null) return null;
    return KawuriAnalysisTurn(
      intention: raw['intention'] as String? ?? 'describe',
      question: raw['question'] as String? ?? '',
      result: result,
    );
  }
}

/// An English voice message, ready for the composer.
@immutable
class KawuriTranscript {
  const KawuriTranscript({
    required this.text,
    this.unclearSegments = const [],
    this.durationSeconds = 0,
  });

  final String text;
  final List<String> unclearSegments;
  final int durationSeconds;
}

/// The analysis intentions, in the words the app uses for them.
const kawuriAnalysisIntentions = <String, String>{
  'describe': 'Describe this',
  'extract_text': 'Extract visible text',
  'transcribe_english': 'Transcribe English speech',
  'generate_captions': 'Generate captions',
  'summarise': 'Summarise',
  'identify_objects': 'Identify objects or activities',
  'suggest_metadata': 'Suggest contribution metadata',
  'cultural_context': 'Explain possible cultural context',
  'suggest_tags': 'Suggest language or topic tags',
  'check_quality': 'Check media quality',
};

/// A failure the app can explain, keyed by the backend's stable reason code.
class KawuriMediaException implements Exception {
  const KawuriMediaException(this.reason, this.message);

  final String reason;
  final String message;

  static KawuriMediaException from(Object error) {
    if (error is KawuriMediaException) return error;
    if (error is FirebaseFunctionsException) {
      final details = error.details;
      final reason = details is Map && details['reason'] is String
          ? details['reason']! as String
          : _reasonForCode(error.code);
      return KawuriMediaException(reason, messageFor(reason, error.message));
    }
    if (error is FirebaseException) {
      return KawuriMediaException(
        'UPLOAD_FAILED',
        messageFor('UPLOAD_FAILED', null),
      );
    }
    return const KawuriMediaException(
      'NETWORK',
      'Kawuri could not be reached. Check your connection and try again.',
    );
  }

  static String _reasonForCode(String code) => switch (code) {
    'unauthenticated' => 'UNAUTHENTICATED',
    'resource-exhausted' => 'RATE_LIMITED',
    'deadline-exceeded' => 'OPERATION_TIMEOUT',
    'unavailable' => 'NETWORK',
    'permission-denied' => 'PERMISSION_DENIED',
    'not-found' => 'NOT_FOUND',
    _ => 'GENERATION_FAILED',
  };

  /// The server's own sentence when it sent one — it is written for members
  /// and never carries provider text — otherwise the app's.
  static String messageFor(String reason, String? serverMessage) {
    final fromServer = serverMessage?.trim() ?? '';
    const internal = {'INTERNAL', 'internal', 'unavailable', 'UNAVAILABLE'};
    if (fromServer.isNotEmpty && !internal.contains(fromServer)) {
      return fromServer;
    }
    return switch (reason) {
      'UNAUTHENTICATED' => 'Sign in again to use this Kawuri tool.',
      'RATE_LIMITED' => 'That was a lot of requests in a short time. Wait a moment and try again.',
      'ALLOWANCE_EXHAUSTED' => 'You have reached your Kawuri allowance for today. It resets within 24 hours.',
      'QUOTA_EXCEEDED' =>
        'Kawuri is very busy right now. Please try again in a few minutes.',
      'SAFETY_REJECTED' => 'This request was declined by the safety filters. Try describing it differently.',
      'UNSUPPORTED_LANGUAGE' => 'Voice transcription currently supports English only. You can still type in another language.',
      'INVALID_MEDIA' =>
        'That file cannot be used. Check its type, size and length.',
      'UPLOAD_MISSING' || 'UPLOAD_FAILED' =>
        'The file did not upload. Check your connection and attach it again.',
      'NOT_ELIGIBLE' => 'Your membership does not include this tool.',
      'CONFIRMATION_REQUIRED' =>
        'Confirm that you want to use a video generation before starting.',
      'OPERATION_TIMEOUT' => 'This took too long and was stopped. Nothing was delivered, so try again.',
      'MODEL_UNAVAILABLE' ||
      'CAPABILITY_UNAVAILABLE' ||
      'VERTEX_AUTH_FAILED' ||
      'VERTEX_API_DISABLED' ||
      'UNSUPPORTED_REGION' => 'This Kawuri tool is not available right now.',
      'STORAGE_FAILED' => 'The result could not be saved. Try again.',
      'NOT_FOUND' => 'That item could not be found.',
      'NETWORK' =>
        'Kawuri could not be reached. Check your connection and try again.',
      _ => 'Kawuri could not finish this one. Try again.',
    };
  }

  @override
  String toString() => 'KawuriMediaException($reason)';
}

/// The content type Kawuri's upload rules expect for a file, from its
/// extension, or null when Kawuri does not accept that kind of file.
///
/// The backend re-reads the stored object's type and checks it against the
/// file name, so the two have to agree.
String? kawuriMimeTypeFor(String path) {
  final dot = path.lastIndexOf('.');
  final extension = dot < 0 ? '' : path.substring(dot + 1).toLowerCase();
  return switch (extension) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'heic' => 'image/heic',
    'heif' => 'image/heif',
    'mp4' || 'm4v' => 'video/mp4',
    'mov' => 'video/quicktime',
    'webm' => 'video/webm',
    '3gp' => 'video/3gpp',
    'm4a' || 'aac' => 'audio/mp4',
    'mp3' => 'audio/mpeg',
    'wav' => 'audio/wav',
    'ogg' || 'opus' => 'audio/ogg',
    'flac' => 'audio/flac',
    _ => null,
  };
}

/// A file the member has attached to an analysis but not yet sent.
@immutable
class KawuriAttachment {
  const KawuriAttachment({
    required this.path,
    required this.name,
    required this.mimeType,
    required this.sizeBytes,
  });

  final String path;
  final String name;
  final String mimeType;
  final int sizeBytes;

  String get kind => mimeType.split('/').first;

  Map<String, Object?> toJson() => {
    'path': path,
    'name': name,
    'mimeType': mimeType,
    'sizeBytes': sizeBytes,
  };

  static KawuriAttachment? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final path = raw['path'];
    final mimeType = raw['mimeType'];
    if (path is! String || mimeType is! String) return null;
    return KawuriAttachment(
      path: path,
      name: raw['name'] as String? ?? 'Attachment',
      mimeType: mimeType,
      sizeBytes: (raw['sizeBytes'] as num?)?.toInt() ?? 0,
    );
  }
}
