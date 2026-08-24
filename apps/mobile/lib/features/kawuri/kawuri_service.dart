import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_offline_guide.dart';

/// One answer from Kawuri, plus where it came from.
@immutable
class KawuriAnswer {
  const KawuriAnswer({required this.text, this.fromOfflineGuide = false});

  final String text;

  /// True when the model was unreachable and the on-device guide answered
  /// instead. Surfaced in the UI so a fallback is never mistaken for the real
  /// thing.
  final bool fromOfflineGuide;
}

/// Talks to the `kawuriChat` callable, with an on-device guide as the floor.
///
/// The guide matters: Kawuri is reachable on the Learn tab of every build,
/// including internal-testing builds where the model key may not be bound yet
/// and on handsets with no signal. Rather than showing an error wall, the
/// assistant answers what it genuinely can from local knowledge and says so.
class KawuriService {
  const KawuriService(this.functions);

  /// The callable entry point, or `null` when Firebase is unavailable this
  /// launch. Public so tests can substitute the whole service.
  final FirebaseFunctions? functions;

  static const _timeout = Duration(seconds: 45);

  /// Turns to send as context. Enough for the model to follow a thread without
  /// paying for the whole history on every call.
  static const contextWindow = 12;

  Future<KawuriAnswer> ask(List<KawuriMessage> conversation) async {
    final functions = this.functions;
    if (functions == null) {
      return KawuriAnswer(
        text: offlineGuideAnswer(_lastQuestion(conversation)),
        fromOfflineGuide: true,
      );
    }

    try {
      final callable = functions.httpsCallable(
        'kawuriChat',
        options: HttpsCallableOptions(timeout: _timeout),
      );
      final result = await callable.call<Map<Object?, Object?>>({
        'messages': _recentTurns(conversation)
            .map(
              (message) => {
                'role': message.isYou ? 'user' : 'model',
                'text': message.text,
              },
            )
            .toList(growable: false),
      });

      final data = result.data;
      final reply = data['reply'];
      // `configured: false` means the deployment has no model key bound. That
      // is a deployment state, not a failure, so it falls through to the guide
      // exactly like being offline does.
      if (data['configured'] == false || reply is! String || reply.isEmpty) {
        return KawuriAnswer(
          text: offlineGuideAnswer(_lastQuestion(conversation)),
          fromOfflineGuide: true,
        );
      }
      return KawuriAnswer(text: reply);
    } on FirebaseFunctionsException catch (error) {
      if (error.code == 'resource-exhausted') {
        return const KawuriAnswer(
          text:
              'You have asked me a lot in a short time. Give me a minute to '
              'catch my breath, then ask again.',
        );
      }
      debugPrint('kawuriChat failed (${error.code}): ${error.message}');
      return KawuriAnswer(
        text: offlineGuideAnswer(_lastQuestion(conversation)),
        fromOfflineGuide: true,
      );
    } on Object catch (error) {
      debugPrint('kawuriChat failed: $error');
      return KawuriAnswer(
        text: offlineGuideAnswer(_lastQuestion(conversation)),
        fromOfflineGuide: true,
      );
    }
  }

  /// The tail of the conversation, oldest-first, capped at [contextWindow].
  @visibleForTesting
  static List<KawuriMessage> recentTurns(List<KawuriMessage> conversation) =>
      _recentTurns(conversation);

  static List<KawuriMessage> _recentTurns(List<KawuriMessage> conversation) {
    final spoken = conversation
        .where((message) => message.text.trim().isNotEmpty)
        .toList(growable: false);
    if (spoken.length <= contextWindow) return spoken;
    return spoken.sublist(spoken.length - contextWindow);
  }

  static String _lastQuestion(List<KawuriMessage> conversation) => conversation
      .lastWhere(
        (message) => message.isYou,
        orElse: () => KawuriMessage(
          id: 'none',
          role: KawuriRole.you,
          text: '',
          sentAt: DateTime.now(),
        ),
      )
      .text;
}

final kawuriServiceProvider = Provider<KawuriService>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return const KawuriService(null);
  return KawuriService(FirebaseFunctions.instance);
});
