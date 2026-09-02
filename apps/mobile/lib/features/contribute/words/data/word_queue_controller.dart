import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_repository.dart';

/// Where the queue is, from the screen's point of view.
enum WordQueueStage {
  /// Nothing to show yet, and something is on its way.
  loading,

  /// A word is on screen.
  ready,

  /// The scan reached the end of the open rows. Every word we have is
  /// answered — by this member or by somebody else — and that is worth saying
  /// as a finish rather than as an absence.
  finished,

  /// The batch came back with nothing in it but the queue is not empty.
  ///
  /// Kept apart from [finished] because the backend is careful to distinguish
  /// them and the two deserve completely different sentences. This one means
  /// the scan ran out of budget before it found rows this member had not
  /// already dealt with; trying again in a moment genuinely works.
  quiet,

  /// No Firebase, or a guest. Not an error — the state a widget test and a
  /// first offline launch both land in.
  unavailable,

  /// The first fetch failed. There is nothing on screen and a retry is the
  /// only sensible control.
  failed,
}

@immutable
class WordQueueState {
  const WordQueueState({
    this.stage = WordQueueStage.loading,
    this.word,
    this.buffered = 0,
    this.sending = false,
    this.answered = 0,
    this.skipped = 0,
    this.receipt,
    this.message,
  });

  final WordQueueStage stage;

  /// The word being answered right now, or null in every stage but
  /// [WordQueueStage.ready].
  final QueueWord? word;

  /// How many words are already in hand behind this one.
  ///
  /// Exposed so the screen can say so, quietly. A member on a bad connection
  /// who can see that nineteen more words are already on the phone answers
  /// them; one who cannot tell stops as soon as the signal wavers.
  final int buffered;

  final bool sending;

  /// What this sitting has produced. Deliberately not the member's lifetime
  /// totals, which the callable also returns: the number that makes somebody
  /// answer a fourth word is the three they just did, not the forty from last
  /// month.
  final int answered;
  final int skipped;

  /// The last answer that landed, shown above the next word and then left
  /// behind as the queue moves on.
  final WordTranslationReceipt? receipt;

  /// Something that went wrong, in words. Cleared by the next action.
  final String? message;

  /// What this sitting will be worth if every answer is approved.
  ///
  /// *If*. The wording everywhere this is shown has to keep the conditional —
  /// see [kApprovedWordPoints].
  int get pointsIfApproved => answered * kApprovedWordPoints;

  WordQueueState copyWith({
    WordQueueStage? stage,
    QueueWord? word,
    bool clearWord = false,
    int? buffered,
    bool? sending,
    int? answered,
    int? skipped,
    WordTranslationReceipt? receipt,
    bool clearReceipt = false,
    String? message,
    bool clearMessage = false,
  }) => WordQueueState(
    stage: stage ?? this.stage,
    word: clearWord ? null : (word ?? this.word),
    buffered: buffered ?? this.buffered,
    sending: sending ?? this.sending,
    answered: answered ?? this.answered,
    skipped: skipped ?? this.skipped,
    receipt: clearReceipt ? null : (receipt ?? this.receipt),
    message: clearMessage ? null : (message ?? this.message),
  );
}

/// One word at a time, with the next nineteen already on the phone.
///
/// ── The buffer is the feature ────────────────────────────────────────────
/// Everything else on this screen is a form. What makes the guided queue worth
/// building is that answering a word and getting the next one is instant, and
/// that is only true if the next one was already here. So: fetch twenty, serve
/// them one at a time from memory, and go and get twenty more while five are
/// still in hand. A member on rural mobile data never sees the fetch, which is
/// the entire point — the version that fetched one word per answer was tried
/// and it turned a two-minute sitting into ninety seconds of spinner.
///
/// ── Why the served ids are remembered ────────────────────────────────────
/// `nextQueueWords` filters against what the member has *answered or skipped*,
/// which is written when they act. A prefetch fired while five words are still
/// unanswered therefore asks a backend that has not heard about those five
/// yet, and hands back some of them again. Keeping the ids this sitting has
/// already put on screen and dropping repeats is a line of code; the
/// alternative — waiting until the buffer is empty so the backend is up to
/// date — is exactly the stall the buffer exists to prevent.
class WordQueueController extends Notifier<WordQueueState> {
  /// Upcoming words, oldest first. The one on screen is not in here.
  final _buffer = <QueueWord>[];

  /// Every id served this sitting, answered or skipped or still on screen.
  final _served = <String>{};

  /// True once the backend has said the open rows are finished.
  ///
  /// Only ever set from `exhausted` on the callable's own reply. It is the
  /// difference between telling somebody they have finished the queue and
  /// telling them nothing came back, and the backend is careful about which
  /// of those it is claiming, so the client must not improve on it.
  var _exhausted = false;

  /// True when a fetch came back with nothing this member has not already
  /// dealt with — the scan ran out of budget rather than out of words.
  ///
  /// Stops the automatic prefetch, because asking again immediately produces
  /// the same answer and spends the member's data doing it, and puts a *Try
  /// again* in front of them instead. Cleared by any successful fetch.
  var _stalled = false;

  /// Guards against two overlapping fetches — the prefetch that fires as the
  /// buffer drains and a retry the member tapped a moment later.
  var _fetching = false;

  @override
  WordQueueState build() {
    // Fired from build rather than from the screen's initState so the queue is
    // already filling while the first frame is being laid out, and so a test
    // that pumps the screen exercises the real path instead of a variant with
    // its own start button.
    //
    // Deferred to a microtask rather than started inline. `_fill` reaches a
    // `state =` before its first await on the one path that needs no network —
    // no Firebase, so nothing to ask — and assigning to `state` while `build`
    // is still running is a "provider depends on itself" error rather than an
    // empty queue. The microtask runs the instant this returns.
    Future.microtask(() => _fill(first: true));
    return const WordQueueState();
  }

  WordQueueApi? get _api => ref.read(wordQueueApiProvider);

  /// Loads the first batch, or tries again after a failure.
  Future<void> refresh() {
    _buffer.clear();
    _served.clear();
    _exhausted = false;
    _stalled = false;
    state = state.copyWith(
      stage: WordQueueStage.loading,
      clearWord: true,
      buffered: 0,
      clearMessage: true,
    );
    return _fill(first: true);
  }

  /// Passes on the word on screen.
  ///
  /// ── Advances before the callable answers, on purpose ─────────────────
  /// A skip that made somebody wait for a network round trip would be a skip
  /// with a cost, and a skip with a cost is one people stop using — after
  /// which they either invent a translation or close the app. `skipQueueWord`
  /// is idempotent and records nothing that reads as a judgement, so the worst
  /// case when the call is lost is that the word comes round again another
  /// day. That is a much smaller price than a hesitation.
  Future<void> skip(WordQueueSkipReason reason) async {
    final word = state.word;
    if (word == null || state.sending) return;
    _advance(skipped: true);
    final api = _api;
    if (api == null) return;
    try {
      await api.skip(wordId: word.id, reason: reason);
    } on WordQueueFailure catch (failure) {
      // Said quietly and without taking the new word away: the member has
      // already moved on and there is nothing for them to do about it.
      if (ref.mounted) state = state.copyWith(message: failure.message);
    }
  }

  /// Sends an answer for the word on screen.
  ///
  /// Returns true when it landed. The screen uses that to decide where to put
  /// the member's eyes next; the emptying of the fields hangs off the word
  /// changing rather than off this, because a skip changes the word too and a
  /// half-typed answer must not follow it.
  Future<bool> submit(WordTranslationDraft draft) async {
    final word = state.word;
    if (word == null || state.sending) return false;
    final api = _api;
    if (api == null) {
      state = state.copyWith(
        message:
            'Translations cannot be sent right now. '
            'Check your connection and try again.',
      );
      return false;
    }

    state = state.copyWith(sending: true, clearMessage: true);
    try {
      final receipt = await api.submit(word, draft);
      if (!ref.mounted) return true;
      state = state.copyWith(
        sending: false,
        answered: state.answered + 1,
        receipt: receipt,
      );
      _advance(keepReceipt: true);
      return true;
    } on WordQueueFailure catch (failure) {
      if (!ref.mounted) return false;
      state = state.copyWith(sending: false, message: failure.message);
      // Some failures mean this word is finished rather than that the send
      // is: already answered, approved elsewhere, retired. Keeping it on
      // screen would invite a retry that can only fail the same way.
      if (failure.movePastWord) _advance();
      return failure.movePastWord;
    }
  }

  /// Clears the confirmation of the last answer.
  ///
  /// Offered because the strip is a receipt, not an alert, and somebody who
  /// wants it gone should be able to say so without leaving the screen.
  void dismissReceipt() => state = state.copyWith(clearReceipt: true);

  /// Takes the next word off the buffer, and tops the buffer up.
  ///
  /// [keepReceipt] is false everywhere but the send that produced one. The
  /// strip says "just sent", and leaving it up while somebody passes on three
  /// words in a row makes it say that about a word they answered a minute ago.
  void _advance({bool skipped = false, bool keepReceipt = false}) {
    final next = _buffer.isEmpty ? null : _buffer.removeAt(0);
    state = state.copyWith(
      clearReceipt: !keepReceipt,
      word: next,
      clearWord: next == null,
      buffered: _buffer.length,
      skipped: skipped ? state.skipped + 1 : null,
      stage: next != null ? WordQueueStage.ready : _emptyStage,
    );
    _maybePrefetch();
  }

  /// What to say when the buffer has run out. Three different sentences, and
  /// the wrong one is either a lie or a dead end — see [WordQueueStage].
  WordQueueStage get _emptyStage {
    if (_exhausted) return WordQueueStage.finished;
    if (_stalled) return WordQueueStage.quiet;
    return WordQueueStage.loading;
  }

  void _maybePrefetch() {
    if (_exhausted || _stalled || _fetching) return;
    if (_buffer.length > kQueuePrefetchThreshold) return;
    unawaited(_fill());
  }

  /// Fetches one batch and folds it into the buffer.
  ///
  /// [first] separates "there is nothing on screen and the fetch failed" —
  /// which needs a retry button and an explanation — from a background top-up
  /// failing, which the member should never hear about because they are
  /// looking at a word they can still answer.
  Future<void> _fill({bool first = false}) async {
    // The first call arrives from a microtask, by which time an auto-disposed
    // controller nobody kept watching may already be gone.
    if (_fetching || !ref.mounted) return;
    final api = _api;
    if (api == null) {
      if (first) state = state.copyWith(stage: WordQueueStage.unavailable);
      return;
    }

    _fetching = true;
    try {
      final batch = await api.next(limit: kQueueBatchSize);
      if (!ref.mounted) return;
      var added = 0;
      for (final word in batch.words) {
        if (!_served.add(word.id)) continue;
        _buffer.add(word);
        added++;
      }
      if (batch.exhausted) _exhausted = true;
      // Nothing usable came back: either the reply was empty, or everything in
      // it was already served this sitting. Another identical request will say
      // the same thing, so stop asking rather than spinning against the rate
      // limiter — but do NOT call that finishing the queue, which is a
      // different and much stronger claim that only the backend gets to make.
      _stalled = added == 0;

      if (state.word == null) {
        if (_buffer.isEmpty) {
          state = state.copyWith(stage: _emptyStage, buffered: 0);
        } else {
          _advance();
        }
      } else {
        state = state.copyWith(buffered: _buffer.length);
      }
    } on WordQueueFailure catch (failure) {
      if (!ref.mounted) return;
      if (first || state.word == null) {
        state = state.copyWith(
          stage: WordQueueStage.failed,
          message: failure.message,
        );
      }
      // Otherwise: swallowed deliberately. A top-up that failed while the
      // member is mid-word is not their problem yet, and it will be retried
      // the next time the buffer drains.
    } finally {
      _fetching = false;
    }
  }
}

/// Auto-disposed on purpose: leaving the screen ends the sitting.
///
/// The counters this holds are "what you did just now", and a member who comes
/// back tomorrow to a strip saying *3 words this sitting* would be reading a
/// sentence about yesterday. Dropping the buffer with it costs one fetch on
/// re-entry and keeps twenty stale rows out of memory for the rest of the
/// app's life.
final wordQueueControllerProvider =
    NotifierProvider.autoDispose<WordQueueController, WordQueueState>(
      WordQueueController.new,
    );
