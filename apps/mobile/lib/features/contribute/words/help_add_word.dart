import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/contribute/language_loop_analytics.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/queue_lookup.dart';

/// Where "Help add this word" was tapped: the dictionary's search, a topic
/// page, or under one of Kawuri's answers.
enum HelpAddSource {
  search('search'),
  topic('topic'),
  kawuri('kawuri');

  const HelpAddSource(this.wire);

  final String wire;
}

/// Opens the queue item for an English word the dictionary does not have.
///
/// Every door leads to the same item: the word's queue id is the same however
/// it is reached, so a search for "goat" and the Animals page asking for it
/// open one form, and their answers go to one reviewer.
///
///   * An open queue word opens straight away — no sign-in needed to look.
///   * A word the queue does not hold yet has to be asked for, which needs an
///     account; a guest is asked to sign in and the request then carries on
///     by itself (asking for a word is not a submission).
///   * A word that already has a verified translation is the dictionary's to
///     show, and [onAlreadyVerified] is how the caller shows it.
///
/// Returns true when the member was taken to the form.
Future<bool> openHelpAddWord(
  BuildContext context,
  WidgetRef ref, {
  required String english,
  required HelpAddSource source,
  String? topic,
  VoidCallback? onAlreadyVerified,
}) async {
  final word = normaliseQueueEnglish(english);
  if (!isQueueableEnglish(word)) return false;
  final lookup = ref.read(queueLookupProvider);
  final messenger = ScaffoldMessenger.of(context);
  final analytics = ref.read(loopAnalyticsProvider);
  if (lookup == null) {
    messenger.showSnackBar(
      const SnackBar(content: Text('Adding words needs a connection.')),
    );
    return false;
  }

  void go(String wordId) {
    analytics.log(
      LoopEvent.promptOpen,
      parameters: loopParameters({
        'origin': source.wire,
        'word_id': wordId,
        'word': word,
        'topic': topic,
      }),
    );
    context.push('/contribute/word/$wordId?origin=${source.wire}');
  }

  try {
    final open = await lookup.byEnglish(word);
    if (!context.mounted) return false;
    if (open != null) {
      go(open.id);
      return true;
    }
  } on Object {
    // Could not tell; asking for it below finds the row if it is there.
  }

  if (!ref.read(isSignedInProvider)) {
    await showSignInSheet(context);
    if (!context.mounted || !ref.read(isSignedInProvider)) return false;
  }

  try {
    final request = await lookup.request(
      word,
      topic: topic,
      source: source.wire,
    );
    analytics.log(
      LoopEvent.wordRequest,
      parameters: loopParameters({
        'origin': source.wire,
        'word_id': request.wordId,
        'word': word,
        'topic': topic,
        'created': request.created ? 1 : 0,
      }),
    );
    if (!context.mounted) return false;
    switch (request.state) {
      case QueueWordState.open:
        go(request.wordId);
        return true;
      case QueueWordState.translated:
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              '“${request.word}” already has a verified translation in the '
              'dictionary.',
            ),
          ),
        );
        onAlreadyVerified?.call();
        return false;
      case QueueWordState.unavailable:
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              '“${request.word}” is not taking answers at the moment.',
            ),
          ),
        );
        return false;
    }
  } on QueueLookupFailure catch (failure) {
    messenger.showSnackBar(SnackBar(content: Text(failure.message)));
    return false;
  }
}

/// The offer itself, for an empty search, a topic page or under Kawuri.
class HelpAddWordCard extends ConsumerStatefulWidget {
  const HelpAddWordCard({
    required this.english,
    required this.source,
    this.topic,
    this.onAlreadyVerified,
    this.dense = false,
    super.key,
  });

  final String english;
  final HelpAddSource source;
  final String? topic;
  final VoidCallback? onAlreadyVerified;

  /// A single button row, for under a Kawuri answer.
  final bool dense;

  @override
  ConsumerState<HelpAddWordCard> createState() => _HelpAddWordCardState();
}

class _HelpAddWordCardState extends ConsumerState<HelpAddWordCard> {
  bool _busy = false;

  Future<void> _open() async {
    setState(() => _busy = true);
    try {
      await openHelpAddWord(
        context,
        ref,
        english: widget.english,
        source: widget.source,
        topic: widget.topic,
        onAlreadyVerified: widget.onAlreadyVerified,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final word = normaliseQueueEnglish(widget.english);
    final button = FilledButton.tonalIcon(
      onPressed: _busy ? null : _open,
      icon: _busy
          ? const SizedBox.square(
              dimension: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.add_comment_outlined, size: 18),
      label: Text('Help add “$word”'),
    );
    if (widget.dense)
      return Align(alignment: Alignment.centerLeft, child: button);
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(
          'HELP ADD THIS WORD',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: theme.colorScheme.tertiary,
            fontSize: 9,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          widget.source == HelpAddSource.search
              // A search box takes Kasem as well as English, so the offer says
              // which it means rather than assume.
              ? 'Looking for the Kasem for the English word “$word”? Nobody '
                    'has verified it yet. If you know it from a speaker, you '
                    'can answer it — a reviewer checks every answer before '
                    'anybody else sees it.'
              : 'Nobody has verified “$word” in Kasem yet. If you know it '
                    'from a speaker, you can answer it — a reviewer checks '
                    'every answer before anybody else sees it.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(height: 1.45),
        ),
        const SizedBox(height: 12),
        Center(child: button),
      ],
    );
  }
}
