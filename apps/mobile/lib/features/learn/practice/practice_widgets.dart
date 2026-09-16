import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/learn/practice/speak_practice_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The frame every practice screen shares.
class PracticeScaffold extends StatelessWidget {
  const PracticeScaffold({
    required this.title,
    required this.child,
    this.actions = const [],
    super.key,
  });

  final String title;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: brandOverlayStyle(context.brand),
    child: Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: Text(title),
        backgroundColor: context.brand.background,
        surfaceTintColor: Colors.transparent,
        actions: actions,
      ),
      body: SafeArea(
        top: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: child,
          ),
        ),
      ),
    ),
  );
}

/// An empty, offline or error state: one icon, one sentence, one way on.
class PracticeMessage extends StatelessWidget {
  const PracticeMessage({
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
    this.secondaryLabel,
    this.onSecondary,
    this.debugError,
    super.key,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  /// Logged, never shown: the member gets the sentence, the log gets the cause.
  final Object? debugError;

  @override
  Widget build(BuildContext context) {
    if (debugError != null) debugPrint('Practice unavailable: $debugError');
    final brand = context.brand;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: brand.gold),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: brand.ink,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: TextStyle(color: brand.mutedInk, height: 1.4),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 18),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
            if (secondaryLabel != null && onSecondary != null)
              TextButton(onPressed: onSecondary, child: Text(secondaryLabel!)),
          ],
        ),
      ),
    );
  }
}

class PracticeProgressBar extends StatelessWidget {
  const PracticeProgressBar({required this.done, required this.total, super.key});

  final int done;
  final int total;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      label: '$done of $total done',
      excludeSemantics: true,
      child: Row(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: total == 0 ? 0 : done / total,
                minHeight: 6,
                color: brand.accent,
                backgroundColor: brand.divider,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '$done / $total',
            style: TextStyle(
              color: brand.mutedInk,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }
}

class PracticeSummary extends StatelessWidget {
  const PracticeSummary({
    required this.title,
    required this.lines,
    required this.onDone,
    super.key,
  });

  final String title;
  final List<String> lines;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                color: brand.gold,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.check_rounded,
                size: 42,
                color: brand.pick(Colors.white, brand.background),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              style: TextStyle(
                color: brand.ink,
                fontSize: 21,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            for (final line in lines)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  line,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: brand.mutedInk),
                ),
              ),
            const SizedBox(height: 22),
            FilledButton(
              key: const Key('practice-done'),
              onPressed: onDone,
              style: FilledButton.styleFrom(minimumSize: const Size(160, 48)),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }
}

/// The honest answer to "play" on a word nobody has recorded.
///
/// No synthetic voice is offered in its place. There is no text-to-speech
/// voice for Kasem, and an English one reading Kasem spelling aloud would teach
/// a pronunciation no speaker uses. What is offered instead is the way to fix
/// it: record the word and send it for review.
Future<void> showPronunciationUnavailable(
  BuildContext context, {
  required DictionaryEntry entry,
}) => showGlassPopup<void>(
  context: context,
  title: 'Pronunciation unavailable',
  subtitle: entry.headword,
  builder: (popupContext) {
    final brand = popupContext.brand;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Nobody has recorded “${entry.headword}” for the dictionary yet. '
          'Indigen World does not play a computer voice for Kasem, because it '
          'would not say the word the way speakers do.',
          style: TextStyle(color: brand.mutedInk, height: 1.4),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('record-pronunciation'),
          onPressed: () {
            Navigator.of(popupContext).pop();
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => SpeakPracticeScreen(initialEntry: entry),
              ),
            );
          },
          icon: const Icon(Icons.mic_rounded),
          label: const Text('Record it for review'),
        ),
        const SizedBox(height: 6),
        Text(
          'A community reviewer listens before any recording is published.',
          textAlign: TextAlign.center,
          style: TextStyle(color: brand.faintInk, fontSize: 11.5),
        ),
      ],
    );
  },
);
