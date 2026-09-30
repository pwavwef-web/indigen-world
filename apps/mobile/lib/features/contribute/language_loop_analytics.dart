import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// The language loop's measurements: how many people see a word that needs
/// them, open it, start answering, send, and what the review desk made of it;
/// how often a verified entry is read; how many Kawuri lessons start and end.
///
/// Through the analytics the app already starts, which `FirebaseBootstrap`
/// enables in production only.
///
/// ── What is deliberately not sent ───────────────────────────────────────
/// No member id, no answer, no search text. A word's queue id and the English
/// word itself are sent (they are public, and "which words do people reach
/// for" is the whole question); what anybody typed is not.
enum LoopEvent {
  /// A word prompt was shown in Explore.
  promptImpression('loop_prompt_impression'),

  /// A word prompt, or a "Help add this word", was tapped through.
  promptOpen('loop_prompt_open'),

  /// A prompt was dismissed for good.
  promptDismiss('loop_prompt_dismiss'),

  /// The member began typing an answer to a word.
  formStart('loop_form_start'),

  /// An answer was sent (new or revised).
  submit('loop_submit'),

  /// A missing word was asked for, from search, a topic page or Kawuri.
  wordRequest('loop_word_request'),

  /// A reviewer decided on an answer.
  reviewOutcome('loop_review_outcome'),

  /// A verified dictionary entry was opened.
  verifiedEntryView('loop_verified_entry_view'),

  /// A Kawuri practice lesson began.
  lessonStart('loop_lesson_start'),

  /// A Kawuri practice lesson reached its end.
  lessonComplete('loop_lesson_complete');

  const LoopEvent(this.wire);

  /// The Firebase event name: at most 40 characters of letters, digits and
  /// underscores.
  final String wire;
}

abstract class LoopAnalytics {
  const LoopAnalytics();

  void log(LoopEvent event, {Map<String, Object> parameters = const {}});
}

/// Values clipped to Firebase's hundred characters, so a long id can never
/// make the SDK drop the whole event.
Map<String, Object> loopParameters(Map<String, Object?> raw) => {
  for (final MapEntry(:key, :value) in raw.entries)
    if (value != null && !(value is String && value.isEmpty))
      key: value is String && value.length > 100
          ? value.substring(0, 100)
          : value,
};

class FirebaseLoopAnalytics extends LoopAnalytics {
  const FirebaseLoopAnalytics();

  @override
  void log(LoopEvent event, {Map<String, Object> parameters = const {}}) {
    // Never awaited and never allowed to throw into a tap handler: counting a
    // submission must not be able to break the submission.
    FirebaseAnalytics.instance
        .logEvent(name: event.wire, parameters: parameters)
        .catchError((Object error) {
          if (kDebugMode) debugPrint('loop analytics: $error');
        });
  }
}

class NoopLoopAnalytics extends LoopAnalytics {
  const NoopLoopAnalytics();

  @override
  void log(LoopEvent event, {Map<String, Object> parameters = const {}}) {}
}

/// Nothing is sent before Firebase is up (or at all in widget tests, which
/// swap this for a recorder).
final loopAnalyticsProvider = Provider<LoopAnalytics>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return const NoopLoopAnalytics();
  return const FirebaseLoopAnalytics();
});
