import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/contribute/grammar/grammar_note_screen.dart';
import 'package:indigen_world_mobile/features/validate/data/grammar_note_queue.dart';
import 'package:indigen_world_mobile/features/validate/grammar_claims_screen.dart';
import 'package:just_audio/just_audio.dart';

const evidenceReviewLabels = {
  'meaning': {
    'cannot-judge': 'Cannot judge meaning',
    'faithful': 'Meaning is faithful',
    'partial': 'Part of the meaning is missing',
    'different': 'Meaning is different',
  },
  'grammar': {
    'cannot-judge': 'Cannot judge grammar',
    'acceptable': 'Grammatically acceptable',
    'unacceptable': 'Grammatically unacceptable',
    'context-dependent': 'Grammar depends on context',
  },
  'naturalness': {
    'cannot-judge': 'Cannot judge naturalness',
    'natural': 'Natural',
    'awkward': 'Understandable but awkward',
    'unnatural': 'Unnatural',
  },
  'contextFit': {
    'cannot-judge': 'Cannot judge context',
    'fits': 'Fits the situation',
    'does-not-fit': 'Does not fit the situation',
    'context-missing': 'Need more context',
  },
};

class GrammarNoteReviewScreen extends ConsumerStatefulWidget {
  const GrammarNoteReviewScreen({required this.note, super.key});
  final GrammarNote note;
  @override
  ConsumerState<GrammarNoteReviewScreen> createState() =>
      _GrammarNoteReviewScreenState();
}

class _GrammarNoteReviewScreenState
    extends ConsumerState<GrammarNoteReviewScreen> {
  late final _judgments = List.generate(
    widget.note.examples.length,
    (_) => <String, dynamic>{
      for (final key in evidenceReviewLabels.keys) key: 'cannot-judge',
      'annotationApproved': false,
    },
  );
  late final _explanations = List.generate(
    widget.note.examples.length,
    (_) => TextEditingController(),
  );
  AudioPlayer? _player;
  bool _competent = false, _busy = false;
  String _preference = 'cannot-judge';
  String? _error;
  Future<void> _play(int index) async {
    try {
      final response = await FirebaseFunctions.instance
          .httpsCallable('readGrammarAudio')
          .call({
            'noteId': widget.note.id,
            'revision': widget.note.data['revision'],
            'example': index,
          });
      if (!mounted) return;
      final data = Map<String, dynamic>.from(response.data as Map);
      final bytes = base64Decode(data['audio'] as String);
      final player = _player ??= AudioPlayer();
      await player.setAudioSource(
        _PrivateAudio(bytes, data['contentType'] as String? ?? 'audio/mpeg'),
      );
      await player.play();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not play the private recording.');
      }
    }
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await FirebaseFunctions.instance
          .httpsCallable('decideGrammarNote')
          .call({
            'noteId': widget.note.id,
            'revision': widget.note.data['revision'] ?? 1,
            'dialectCompetent': _competent,
            'preference': _preference,
            'judgments': [
              for (var i = 0; i < _judgments.length; i++)
                {..._judgments[i], 'explanation': _explanations[i].text},
            ],
          });
      if (!mounted) return;
      final responseData = Map<String, dynamic>.from(response.data as Map);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Review recorded: ${responseData['status'] as String? ?? 'saved'}',
          ),
        ),
      );
      Navigator.pop(context, true);
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(() => _error = error.message ?? 'Could not record review.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not record review. Try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _quality() async {
    try {
      final response = await FirebaseFunctions.instance
          .httpsCallable('grammarQualityReport')
          .call();
      if (!mounted) return;
      final d = Map<String, dynamic>.from(response.data as Map);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Dataset quality'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Sentences: ${d['examples']}'),
                Text('Eligible for training: ${d['eligible']}'),
                Text('With disagreement: ${d['disputed']}'),
                const SizedBox(height: 12),
                const Text('Reasons examples are not eligible:'),
                for (final item in Map<String, dynamic>.from(
                  d['exclusions'] as Map,
                ).entries)
                  Text('${item.key.replaceAll('-', ' ')}: ${item.value}'),
                const SizedBox(height: 12),
                const Text('Coverage by dialect and construction:'),
                for (final item in Map<String, dynamic>.from(
                  d['coverage'] as Map,
                ).entries)
                  Text('${item.key}: ${item.value}'),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not load the quality report.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final note = widget.note, mode = widget.note.data['mode'];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Review sentences'),
        actions: [
          IconButton(
            tooltip: 'Grammar rules and evidence',
            icon: const Icon(Icons.menu_book),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => GrammarClaimsScreen(
                  evidenceId: note.id,
                  dialect: note.examples.first.dialect,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Dataset quality',
            onPressed: _quality,
            icon: const Icon(Icons.assessment),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(note.title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text(
            'Judge each version independently. Other reviewers’ answers are hidden. An unexplained particle does not make a sentence incorrect.',
          ),
          if (note.explanation.isNotEmpty)
            Text(
              'Contributor explanation (not yet established grammar): ${note.explanation}',
            ),
          if (note.question.isNotEmpty)
            Text('Original question: ${note.question}'),
          if (note.answer.isNotEmpty)
            Text('Answer being corrected: ${note.answer}'),
          if (note.data['comparisonNote'] is String)
            Text(note.data['comparisonNote'] as String),
          for (var i = 0; i < note.examples.length; i++) _example(i),
          if (mode == 'comparison')
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _preference,
              decoration: const InputDecoration(
                labelText: 'Which version fits this situation better?',
              ),
              items:
                  const {
                        'cannot-judge': 'Cannot judge',
                        'first': 'First version',
                        'second': 'Second version',
                        'tie': 'Both equally good',
                        'context-dependent': 'Depends on context',
                      }.entries
                      .map(
                        (e) => DropdownMenuItem(
                          value: e.key,
                          child: Text(e.value),
                        ),
                      )
                      .toList(),
              onChanged: (v) => setState(() => _preference = v!),
            ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'I am able to judge the dialect used in these examples',
            ),
            value: _competent,
            onChanged: (v) => setState(() => _competent = v ?? false),
          ),
          if (_error != null)
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          FilledButton(
            onPressed:
                _busy ||
                    !_competent ||
                    ['withdrawn', 'needs-permission'].contains(note.status)
                ? null
                : _save,
            child: Text(_busy ? 'Saving…' : 'Save independent review'),
          ),
          TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<bool>(
                builder: (_) => GrammarNoteScreen(
                  prefillData: {
                    ...note.data,
                    'mode': 'correction',
                    'title': 'Suggested correction',
                    'permissions': <String, bool>{},
                    'question': note.examples.first.english,
                    'answer': note.examples.first.kasem,
                    'examples': [note.examples.first.data],
                    'groups': [
                      ...(note.data['groups'] as List? ?? []),
                      'correction:${note.id}',
                    ],
                  },
                ),
              ),
            ),
            child: const Text('Suggest a corrected version'),
          ),
        ],
      ),
    );
  }

  Widget _example(int i) {
    final e = widget.note.examples[i],
        contextData = Map<String, dynamic>.from(
          (widget.note.examples[i].data['context'] ?? {}) as Map,
        );
    final annotations =
        widget.note.examples[i].data['annotations'] as List? ?? [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Version ${i + 1}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            SelectableText(
              e.kasem,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text(e.english),
            Text('Dialect: ${e.dialect.isEmpty ? 'unknown' : e.dialect}'),
            Text(
              'Situation: ${contextData['situation'] as String? ?? 'unspecified'}',
            ),
            if ((contextData['preceding'] as String? ?? '').isNotEmpty)
              Text('Before this: ${contextData['preceding'] as String}'),
            if (e.literal.isNotEmpty) Text('Literal paraphrase: ${e.literal}'),
            if (e.note.isNotEmpty) Text('Speaker explanation: ${e.note}'),
            if ((e.data['source'] as String? ?? '').isNotEmpty)
              Text('Source: ${e.data['source'] as String}'),
            for (final raw in annotations)
              Builder(
                builder: (context) {
                  final a = Map<String, dynamic>.from(raw as Map);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Words ${(a['start'] as num).toInt() + 1}–${a['end']}: ${a['gloss'] as String? ?? ''} (${a['kind']})',
                      ),
                      if ((a['role'] as String? ?? '').isNotEmpty)
                        Text('Role or focus scope: ${a['role']}'),
                      if ((a['senseId'] as String? ?? '').isNotEmpty)
                        Text('Dictionary sense: ${a['senseId']}'),
                      for (final hypothesis
                          in (a['hypotheses'] as List? ?? [])
                              .whereType<String>())
                        Text('Possible explanation: $hypothesis'),
                    ],
                  );
                },
              ),
            if ((e.data['audioPath'] as String? ?? '').isNotEmpty)
              TextButton.icon(
                onPressed: () => _play(i),
                icon: const Icon(Icons.play_arrow),
                label: const Text('Play speaker recording'),
              ),
            for (final dimension in evidenceReviewLabels.entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: _judgments[i][dimension.key] as String,

                  items: dimension.value.entries
                      .map(
                        (v) => DropdownMenuItem(
                          value: v.key,
                          child: Text(v.value),
                        ),
                      )
                      .toList(),
                  onChanged: (v) =>
                      setState(() => _judgments[i][dimension.key] = v!),
                ),
              ),
            TextField(
              controller: _explanations[i],
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Explain any concern or context difference',
              ),
            ),
            if (annotations.isNotEmpty ||
                e.note.isNotEmpty ||
                e.literal.isNotEmpty)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'I also confirm the annotation and explanation, within this example',
                ),
                value: _judgments[i]['annotationApproved'] == true,
                onChanged: (v) => setState(
                  () => _judgments[i]['annotationApproved'] = v ?? false,
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    for (final c in _explanations) {
      c.dispose();
    }
    _player?.dispose();
    super.dispose();
  }
}

// just_audio's authenticated byte source avoids issuing a public download URL.
// ignore: experimental_member_use
class _PrivateAudio extends StreamAudioSource {
  _PrivateAudio(this.bytes, this.contentType);
  final Uint8List bytes;
  final String contentType;
  @override
  // ignore: experimental_member_use
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    final from = start ?? 0, to = end ?? bytes.length;
    // ignore: experimental_member_use
    return StreamAudioResponse(
      sourceLength: bytes.length,
      contentLength: to - from,
      offset: from,
      stream: Stream.value(bytes.sublist(from, to)),
      contentType: contentType,
    );
  }
}
