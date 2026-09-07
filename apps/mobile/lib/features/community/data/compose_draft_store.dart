import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// What somebody was writing when Android took the app away.
///
/// ── The bug this exists for ──────────────────────────────────────────────
/// Opening the camera from the composer hands the screen to another activity.
/// On a phone with little memory to spare — which is most of the phones this
/// app is for — Android is entitled to destroy the whole Flutter process while
/// it is in the background, and it frequently does: the camera itself is a
/// heavy activity, and this app may be holding a video decoder and an image
/// cache at the same moment. The member takes a photograph, the camera hands
/// it back, and the app cold-starts on the home tab with the post they were
/// writing gone and the photograph gone with it.
///
/// Nothing about that is fixable inside the composer, because the composer no
/// longer exists. It is fixable only by writing the draft down *before*
/// leaving for the camera, and looking for it again on the way back in.
///
/// ── Why the draft is written before the picker and not on every keystroke ─
/// Because the only moment the app is knowingly about to be suspended is the
/// moment it launches somebody else's activity. Saving on every keystroke
/// would write to disk a hundred times per post to guard against a crash that
/// is far rarer than the case this is for, and would leave a draft behind
/// after every abandoned half-sentence — so the app would offer to restore
/// something nobody wants back.
///
/// ── Why a surviving draft means "interrupted" and not "abandoned" ────────
/// The composer clears this on the way out, whichever way it goes: posted,
/// cancelled, backed out of. So a draft that is still here on the next launch
/// is one whose composer never got to run its own teardown — which is exactly
/// and only the case where Android killed the process.
@immutable
class ComposeDraft {
  const ComposeDraft({
    required this.text,
    this.replyToId,
    this.quoteToId,
    this.attachmentPaths = const <String>[],
    this.kasemConfirmed = false,
  });

  final String text;

  /// The post this was a reply to, or the one it quoted.
  ///
  /// Held as ids rather than as the posts themselves. The post is a live
  /// document that may have been edited or deleted while the app was gone, and
  /// restoring a stale copy of it would show somebody replying to writing that
  /// no longer says that. The id is fetched again; an id that no longer
  /// resolves restores as an ordinary post, which is the honest fallback.
  final String? replyToId;
  final String? quoteToId;

  /// Files already staged before the interruption.
  ///
  /// Paths, not bytes. They point into the app's own cache directory, which
  /// survives a process death and is cleared by the system on its own terms —
  /// so a path here may well be dead by the time it is read, and the restore
  /// drops anything that no longer exists rather than presenting an attachment
  /// that cannot be uploaded.
  final List<String> attachmentPaths;

  final bool kasemConfirmed;

  bool get isEmpty =>
      text.trim().isEmpty && attachmentPaths.isEmpty && quoteToId == null;

  Map<String, Object?> toJson() => {
    'text': text,
    'replyToId': replyToId,
    'quoteToId': quoteToId,
    'attachmentPaths': attachmentPaths,
    'kasemConfirmed': kasemConfirmed,
  };

  static ComposeDraft? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final text = raw['text'];
    return ComposeDraft(
      text: text is String ? text : '',
      replyToId: raw['replyToId'] is String ? raw['replyToId'] as String : null,
      quoteToId: raw['quoteToId'] is String ? raw['quoteToId'] as String : null,
      attachmentPaths: [
        if (raw['attachmentPaths'] case final List<Object?> paths)
          for (final path in paths)
            if (path is String && path.isNotEmpty) path,
      ],
      kasemConfirmed: raw['kasemConfirmed'] == true,
    );
  }
}

/// Reads and writes the one draft the app keeps across a process death.
///
/// One, not a list. Two unfinished posts is not a situation a member can be in
/// — the composer is a full screen and only one is ever up — and a queue of
/// them would turn a rescue into an inbox.
class ComposeDraftStore {
  const ComposeDraftStore();

  static const _key = 'community.composeDraft.v1';

  Future<void> save(ComposeDraft draft) async {
    if (draft.isEmpty) return unawaitedClear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(draft.toJson()));
  }

  Future<ComposeDraft?> read() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final draft = ComposeDraft.fromJson(jsonDecode(raw));
      return draft == null || draft.isEmpty ? null : draft;
    } on FormatException {
      // A draft written by a version that stored a different shape. Nothing to
      // rescue and nothing worth reporting — it is cleared so the next launch
      // does not try again.
      await prefs.remove(_key);
      return null;
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  /// [clear], for the one caller that is already inside a future it cannot
  /// meaningfully fail.
  Future<void> unawaitedClear() => clear();
}
