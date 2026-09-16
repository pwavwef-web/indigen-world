import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_decks.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_widgets.dart';
import 'package:indigen_world_mobile/features/learn/practice/speak_practice_screen.dart';

/// Listening practice, from real recordings only.
///
/// With enough published recordings it is a quiz: hear a word said by a
/// speaker, pick what it means. With too few for a fair quiz — three wrong
/// answers have to be real meanings too — it becomes a list to listen to and
/// repeat, and says why, rather than padding the options with invented ones.
class ListenPracticeScreen extends ConsumerStatefulWidget {
  const ListenPracticeScreen({super.key});

  @override
  ConsumerState<ListenPracticeScreen> createState() =>
      _ListenPracticeScreenState();
}

class _ListenPracticeScreenState extends ConsumerState<ListenPracticeScreen> {
  static const _rounds = 8;

  List<DictionaryEntry>? _pool;
  var _round = 0;
  int? _chosen;
  var _correct = 0;
  var _plays = 0;
  bool? _paid;

  Future<void> _finish() async {
    final paid = await ref
        .read(learnProgressProvider.notifier)
        .completePractice(PracticeKind.listen);
    if (mounted) setState(() => _paid = paid);
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(publishedDictionaryEntriesProvider);
    return PracticeScaffold(
      title: 'Listen',
      child: switch (entries) {
        AsyncValue(:final value?) => _body(value),
        AsyncValue(:final error?) => PracticeMessage(
          icon: Icons.cloud_off_rounded,
          title: 'Recordings could not be loaded',
          body: 'Check your connection and try again.',
          actionLabel: 'Try again',
          onAction: () => ref.invalidate(publishedDictionaryEntriesProvider),
          debugError: error,
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _body(List<DictionaryEntry> entries) {
    final pool = _pool ??= listenableEntries(entries);
    if (pool.isEmpty) {
      return PracticeMessage(
        icon: Icons.headphones_rounded,
        title: 'No recordings published yet',
        body:
            'Listening practice uses words recorded by Kasem speakers, and none are published yet. You can record one for review.',
        actionLabel: 'Record a word',
        onAction: () => Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => const SpeakPracticeScreen()),
        ),
      );
    }
    if (pool.length < listenQuizMinimum) return _listenAndRepeat(pool);
    return _quiz(pool);
  }

  Widget _listenAndRepeat(List<DictionaryEntry> pool) {
    final brand = context.brand;
    if (_paid != null) {
      return PracticeSummary(
        title: 'Well listened',
        lines: [
          if (_paid!) '+${LearnProgress.xpPerPracticeDay} XP for today’s listening.'
          else 'Today’s listening XP was already earned.',
        ],
        onDone: () => Navigator.of(context).pop(),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: brand.surfaceMuted,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            'Only ${pool.length} ${pool.length == 1 ? 'word has' : 'words have'} a published recording so far — too few for a fair quiz. Listen, then say each one aloud.',
            style: TextStyle(color: brand.mutedInk, height: 1.4, fontSize: 13),
          ),
        ),
        const SizedBox(height: 14),
        for (final entry in pool)
          Card(
            elevation: 0,
            color: brand.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: brand.border),
            ),
            child: ListTile(
              title: Text(
                entry.headword,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(entry.translation),
              trailing: PronunciationButton(
                audioUrl: entry.audioUrl,
                onPlay: () => setState(() => _plays++),
              ),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _plays == 0 ? null : _finish,
          style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
          child: Text(_plays == 0 ? 'Play a word to begin' : 'I’ve listened'),
        ),
        TextButton.icon(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const SpeakPracticeScreen()),
          ),
          icon: const Icon(Icons.mic_rounded),
          label: const Text('Record another word for review'),
        ),
      ],
    );
  }

  Widget _quiz(List<DictionaryEntry> pool) {
    final rounds = pool.length < _rounds ? pool.length : _rounds;
    if (_round >= rounds) {
      return PracticeSummary(
        title: 'Listening complete',
        lines: [
          '$_correct of $rounds right.',
          if (_paid == true) '+${LearnProgress.xpPerPracticeDay} XP for today’s listening.',
          if (_paid == false) 'Today’s listening XP was already earned.',
        ],
        onDone: () => Navigator.of(context).pop(),
      );
    }
    final brand = context.brand;
    final answer = pool[_round % pool.length];
    final options = listenOptions(answer: answer, pool: pool, round: _round);
    final right = options.indexOf(answer.translation.trim());
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        PracticeProgressBar(done: _round, total: rounds),
        const SizedBox(height: 26),
        Text(
          'What does this word mean?',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: brand.ink,
            fontSize: 19,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: PronunciationButton(
            key: ValueKey('listen-${answer.id}'),
            audioUrl: answer.audioUrl,
            dimension: 84,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _chosen == null ? 'Tap to hear it' : answer.headword,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: _chosen == null ? brand.mutedInk : brand.ink,
            fontWeight: _chosen == null ? FontWeight.w500 : FontWeight.w800,
            fontSize: _chosen == null ? 13 : 20,
          ),
        ),
        const SizedBox(height: 20),
        for (var index = 0; index < options.length; index++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _Option(
              label: options[index],
              state: _chosen == null
                  ? _OptionState.open
                  : index == right
                  ? _OptionState.right
                  : index == _chosen
                  ? _OptionState.wrong
                  : _OptionState.idle,
              onTap: _chosen != null
                  ? null
                  : () {
                      HapticFeedback.selectionClick();
                      setState(() {
                        _chosen = index;
                        if (index == right) _correct++;
                      });
                    },
            ),
          ),
        if (_chosen != null)
          FilledButton(
            key: const Key('listen-next'),
            onPressed: () {
              setState(() {
                _round++;
                _chosen = null;
              });
              if (_round >= rounds) unawaited(_finish());
            },
            style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
            child: Text(_round + 1 >= rounds ? 'Finish' : 'Next'),
          ),
      ],
    );
  }
}

enum _OptionState { open, idle, right, wrong }

class _Option extends StatelessWidget {
  const _Option({required this.label, required this.state, this.onTap});

  final String label;
  final _OptionState state;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final edge = switch (state) {
      _OptionState.right => brand.success,
      _OptionState.wrong => brand.danger,
      _ => brand.border,
    };
    return Material(
      color: brand.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: edge, width: state == _OptionState.open ? 1 : 2),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: brand.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
              if (state == _OptionState.right)
                Icon(Icons.check_circle_rounded, color: brand.success),
              if (state == _OptionState.wrong)
                Icon(Icons.cancel_rounded, color: brand.danger),
            ],
          ),
        ),
      ),
    );
  }
}
