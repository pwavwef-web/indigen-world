import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/contribute/language_loop_analytics.dart';
import 'package:indigen_world_mobile/features/contribute/words/help_add_word.dart';
import 'package:indigen_world_mobile/features/contribute/words/word_queue_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:indigen_world_mobile/features/profile/saved_words_sync.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// "Practise with Kawuri": a short lesson built from something verified.
///
/// Two starting points. A published dictionary entry, which is verified by
/// construction; or something from Explore, where the post supplies the topic
/// and the Kasem taught is only what the published dictionary holds for it —
/// a post's own Kasem has not been through review, and Kawuri labels it that
/// way whenever it quotes it. The server rebuilds the lesson from the archive
/// on every turn, so nothing here can widen what counts as verified.

@immutable
class KawuriLesson {
  const KawuriLesson({
    required this.kind,
    required this.id,
    required this.title,
  });

  /// A published dictionary entry.
  const KawuriLesson.entry({required String id, required String title})
    : this(kind: 'entry', id: id, title: title);

  /// A published Explore reel (`publishedContent`).
  const KawuriLesson.post({required String id, required String title})
    : this(kind: 'post', id: id, title: title);

  /// A community post shown in Explore.
  const KawuriLesson.community({required String id, required String title})
    : this(kind: 'community', id: id, title: title);

  final String kind;
  final String id;

  /// What the lesson is about, for the heading.
  final String title;

  bool get isEntry => kind == 'entry';

  Map<String, Object?> toPayload() => {'kind': kind, 'id': id};
}

/// One turn of a lesson, as the screen draws it.
@immutable
class LessonTurn {
  const LessonTurn({
    required this.fromKawuri,
    required this.text,
    this.lookups = const [],
  });

  final bool fromKawuri;
  final String text;
  final List<Map<String, Object?>> lookups;
}

/// What one call to the lesson produced.
@immutable
class LessonReply {
  const LessonReply({
    required this.text,
    this.lookups = const [],
    this.complete = false,
  });

  final String text;
  final List<Map<String, Object?>> lookups;
  final bool complete;
}

class LessonFailure implements Exception {
  const LessonFailure(this.message);

  final String message;
}

abstract class KawuriLessonApi {
  Future<LessonReply> next(KawuriLesson lesson, List<LessonTurn> turns);
}

class FirebaseKawuriLessonApi implements KawuriLessonApi {
  const FirebaseKawuriLessonApi(this._functions);

  final FirebaseFunctions _functions;

  @override
  Future<LessonReply> next(KawuriLesson lesson, List<LessonTurn> turns) async {
    try {
      final result = await _functions
          .httpsCallable(
            'kawuriChat',
            options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
          )
          .call<Map<Object?, Object?>>({
            'lesson': lesson.toPayload(),
            'messages': [
              for (final turn in turns.length > 16
                  ? turns.sublist(turns.length - 16)
                  : turns)
                {
                  'role': turn.fromKawuri ? 'model' : 'user',
                  'text': turn.text,
                },
            ],
          });
      final data = result.data;
      final reply = '${data['reply'] ?? ''}'.trim();
      if (data['configured'] == false || reply.isEmpty) {
        throw const LessonFailure(
          'Kawuri could not run the lesson just now. Try again in a moment.',
        );
      }
      return LessonReply(
        text: reply,
        lookups: kawuriLookupsFrom(data),
        complete: data['lessonComplete'] == true,
      );
    } on LessonFailure {
      rethrow;
    } on FirebaseFunctionsException catch (error) {
      throw LessonFailure(switch (error.code) {
        'not-found' =>
          error.message?.trim().isNotEmpty == true
              ? error.message!.trim()
              : 'That is no longer published, so there is no lesson for it.',
        'resource-exhausted' =>
          'You have used today’s Kawuri messages. The lesson will be here tomorrow.',
        _ => 'The lesson did not load. Check your connection and try again.',
      });
    } on Object {
      throw const LessonFailure(
        'The lesson did not load. Check your connection and try again.',
      );
    }
  }
}

final kawuriLessonApiProvider = Provider<KawuriLessonApi?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return FirebaseKawuriLessonApi(FirebaseFunctions.instance);
});

/// What the member types first, on the member's behalf, to begin.
const kLessonOpening = 'Start the lesson.';

class KawuriLessonScreen extends ConsumerStatefulWidget {
  const KawuriLessonScreen({required this.lesson, super.key});

  final KawuriLesson lesson;

  @override
  ConsumerState<KawuriLessonScreen> createState() => _KawuriLessonScreenState();
}

class _KawuriLessonScreenState extends ConsumerState<KawuriLessonScreen> {
  final _answer = TextEditingController();
  final _scroll = ScrollController();
  final _turns = <LessonTurn>[];
  bool _waiting = false;
  bool _complete = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    ref.read(loopAnalyticsProvider).log(
      LoopEvent.lessonStart,
      parameters: loopParameters({
        'lesson_kind': widget.lesson.kind,
        'lesson_id': widget.lesson.id,
      }),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _send(kLessonOpening));
  }

  @override
  void dispose() {
    _answer.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    final api = ref.read(kawuriLessonApiProvider);
    if (api == null || _waiting || _complete) return;
    final asked = LessonTurn(fromKawuri: false, text: text);
    setState(() {
      _turns.add(asked);
      _waiting = true;
      _error = null;
    });
    try {
      final reply = await api.next(widget.lesson, _turns);
      if (!mounted) return;
      setState(() {
        _turns.add(
          LessonTurn(fromKawuri: true, text: reply.text, lookups: reply.lookups),
        );
        _complete = reply.complete;
      });
      if (reply.complete) {
        ref.read(loopAnalyticsProvider).log(
          LoopEvent.lessonComplete,
          parameters: loopParameters({
            'lesson_kind': widget.lesson.kind,
            'lesson_id': widget.lesson.id,
            'turns': _turns.where((turn) => !turn.fromKawuri).length,
          }),
        );
      }
    } on LessonFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        // The question stays unanswered rather than vanishing, so a retry
        // asks the same thing again.
        _turns.remove(asked);
        _error = failure.message;
        if (text != kLessonOpening) _answer.text = text;
      });
    } finally {
      if (mounted) setState(() => _waiting = false);
    }
    await Future<void>.delayed(const Duration(milliseconds: 60));
    if (_scroll.hasClients) {
      unawaited(
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOut,
        ),
      );
    }
  }

  void _submitAnswer() {
    final text = _answer.text.trim();
    if (text.isEmpty) return;
    _answer.clear();
    unawaited(_send(text));
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final visible = _turns.where((turn) => turn.text != kLessonOpening).toList();
    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(title: const Text('Practise with Kawuri')),
      body: ScreenContainer(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 18),
                children: [
                  Text(
                    widget.lesson.title,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'A short lesson from the published dictionary. Kawuri '
                    'teaches only verified words, and says so when something '
                    'is not verified.',
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 12.5,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: 16),
                  for (final turn in visible) _LessonBubble(turn: turn),
                  if (_waiting)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Column(
                        children: [
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: TextStyle(color: brand.danger),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            onPressed: () => _send(
                              _turns.isEmpty ? kLessonOpening : _answer.text,
                            ),
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('Try again'),
                          ),
                        ],
                      ),
                    ),
                  if (_complete) ...[
                    const SizedBox(height: 18),
                    _NextSteps(lesson: widget.lesson),
                  ],
                ],
              ),
            ),
            if (!_complete)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _answer,
                          enabled: !_waiting,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _submitAnswer(),
                          decoration: const InputDecoration(
                            hintText: 'Your answer',
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        tooltip: 'Send',
                        onPressed: _waiting ? null : _submitAnswer,
                        icon: const Icon(Icons.send_rounded),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _LessonBubble extends StatelessWidget {
  const _LessonBubble({required this.turn});

  final LessonTurn turn;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final fromKawuri = turn.fromKawuri;
    return Align(
      alignment: fromKawuri ? Alignment.centerLeft : Alignment.centerRight,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(
            crossAxisAlignment: fromKawuri
                ? CrossAxisAlignment.start
                : CrossAxisAlignment.end,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: fromKawuri ? brand.surface : brand.accentSoft,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(13, 10, 13, 10),
                  child: SelectableText(
                    turn.text,
                    style: TextStyle(color: brand.ink, height: 1.45),
                  ),
                ),
              ),
              if (fromKawuri && turn.lookups.isNotEmpty)
                KawuriWordLinks(lookups: turn.lookups, origin: 'kawuri_lesson'),
            ],
          ),
        ),
      ),
    );
  }
}

/// Where to go after a lesson: keep the word, practise more, or give back.
class _NextSteps extends ConsumerWidget {
  const _NextSteps({required this.lesson});

  final KawuriLesson lesson;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    return GlassSurface(
      blur: false,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.emoji_events_outlined, color: brand.success),
              const SizedBox(width: 8),
              Text(
                'Lesson complete',
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'What next?',
            style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          if (lesson.isEntry)
            _StepButton(
              icon: Icons.bookmark_add_outlined,
              label: 'Save this word to revise later',
              onTap: () async {
                final saved = await ref
                    .read(savedEntryRepositoryProvider)
                    .toggle(lesson.id);
                ref.invalidate(savedEntryIdsProvider);
                unawaited(pushSavedWords(ref));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        saved ? 'Saved to your words.' : 'Removed from saved words.',
                      ),
                    ),
                  );
                }
              },
            ),
          if (lesson.isEntry)
            _StepButton(
              icon: Icons.menu_book_outlined,
              label: 'Read the full entry',
              onTap: () => context.push('/entry/${lesson.id}'),
            ),
          _StepButton(
            icon: Icons.translate_rounded,
            label: 'Help the dictionary: answer a word',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const WordQueueScreen(),
              ),
            ),
          ),
          _StepButton(
            icon: Icons.chat_bubble_outline_rounded,
            label: 'Ask Kawuri something else',
            onTap: () => context.push('/kawuri'),
          ),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Align(alignment: Alignment.centerLeft, child: Text(label)),
      style: OutlinedButton.styleFrom(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    ),
  );
}

/// Under an answer: the verified entries it drew on, each one tap from its
/// page, and the words it could not verify, each with the way to add it.
class KawuriWordLinks extends ConsumerWidget {
  const KawuriWordLinks({
    required this.lookups,
    required this.origin,
    super.key,
  });

  final List<Map<String, Object?>> lookups;

  /// For the analytics: `kawuri` or `kawuri_lesson`.
  final String origin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final verified = [
      for (final row in lookups)
        if (row['kind'] == 'verified') row,
    ];
    final unverified = [
      for (final row in lookups)
        if (row['kind'] == 'unverified') row,
    ].take(2).toList();
    if (verified.isEmpty && unverified.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (verified.isNotEmpty)
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final row in verified)
                  ActionChip(
                    avatar: Icon(
                      Icons.verified_outlined,
                      size: 16,
                      color: brand.success,
                    ),
                    label: Text(
                      [
                        '${row['kasem'] ?? ''}',
                        '${row['english'] ?? ''}',
                      ].where((part) => part.isNotEmpty).join(' — '),
                    ),
                    tooltip: 'Open the verified entry',
                    // The entry page counts the view, told where it came from.
                    onPressed: () =>
                        context.push('/entry/${row['entryId']}?from=$origin'),
                  ),
              ],
            ),
          for (final row in unverified) ...[
            const SizedBox(height: 6),
            Text(
              row['state'] == 'waiting-review'
                  ? '“${row['term']}”: answers are waiting for a reviewer — not verified yet.'
                  : '“${row['term']}”: not verified yet.',
              style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
            ),
            const SizedBox(height: 4),
            HelpAddWordCard(
              english: '${row['term']}',
              source: HelpAddSource.kawuri,
              dense: true,
            ),
          ],
        ],
      ),
    );
  }
}
