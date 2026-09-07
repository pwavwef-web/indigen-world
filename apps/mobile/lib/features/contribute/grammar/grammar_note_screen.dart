import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

const sentenceConstructionLabels = {
  'word-order': 'Word order',
  'focus': 'Focus / emphasis',
  'experiencer': 'Feeling or state',
  'pronoun': 'Pronouns',
  'possession': 'Possession',
  'definiteness': 'The / a',
  'plural': 'Plural',
  'numeral': 'Counting',
  'adjective': 'Description',
  'negation': 'Negation',
  'question': 'Questions',
  'command': 'Commands',
  'tense': 'Time',
  'aspect': 'Ongoing / completed',
  'serial-verb': 'Several verbs',
  'comparison': 'Comparison',
  'conditional': 'Conditions',
  'relative-clause': 'Relative clauses',
  'greeting': 'Greetings',
};
const evidencePermissionLabels = {
  'sourceConfirmed': 'I have the right to contribute this material',
  'review': 'Allow community reviewers to check this contribution',
  'publication': 'Allow the reviewed sentence to appear publicly',
  'providerRetrieval':
      'Allow Kawuri to send this sentence to its AI provider when answering',
  'modelTraining': 'Allow this contribution to train language models',
  'evaluation': 'Allow this contribution to evaluate language models',
  'audio': 'Allow the attached recording to be stored for review',
};

class GrammarNoteScreen extends ConsumerStatefulWidget {
  const GrammarNoteScreen({super.key, this.initialData, this.prefillData});
  final Map<String, dynamic>? initialData;
  final Map<String, dynamic>? prefillData;
  @override
  ConsumerState<GrammarNoteScreen> createState() => _GrammarNoteScreenState();
}

class _GrammarNoteScreenState extends ConsumerState<GrammarNoteScreen> {
  final _fields = <String, TextEditingController>{};
  final _examples = List.generate(6, (_) => <String, TextEditingController>{});
  final _annotations = List.generate(6, (_) => <Map<String, dynamic>>[]);
  final _audio = <int, (Uint8List, String, String)>{};
  final _audioPaths = List.filled(6, '');
  final _naturalness = List.filled(6, 'cannot-judge');
  int _exampleCount = 1;
  List<Map<String, dynamic>> _originalExamples = [];
  Map<String, dynamic> _sharedOriginal = {};
  final _permissions = {
    for (final key in evidencePermissionLabels.keys) key: false,
  };
  final _tags = <String>{};
  String _mode = 'sentence', _sourceType = 'speaker';
  String _requestId = DateTime.now().microsecondsSinceEpoch.toString();
  bool _busy = false;
  String? _error;
  TextEditingController f(String key) =>
      _fields.putIfAbsent(key, TextEditingController.new);
  TextEditingController e(int i, String key) =>
      _examples[i].putIfAbsent(key, TextEditingController.new);
  String get _uid => ref.read(firebaseReadyProvider)
      ? FirebaseAuth.instance.currentUser?.uid ?? 'offline'
      : 'offline';
  String get _draftKey =>
      'kasem-evidence-v2-$_uid-${widget.initialData?['id'] as String? ?? 'new'}';

  @override
  void initState() {
    super.initState();
    if (widget.initialData != null) _restore(widget.initialData!);
    if (widget.prefillData != null) _restore(widget.prefillData!);
  }

  void _restore(Map<String, dynamic> data) {
    _mode = data['mode'] as String? ?? 'sentence';
    _requestId = data['requestId'] as String? ?? _requestId;
    for (final key in [
      'title',
      'explanation',
      'comparisonNote',
      'question',
      'answer',
      'modelVersion',
      'promptVersion',
    ]) {
      f(key).text = data[key] as String? ?? '';
    }
    final rows = data['examples'] as List? ?? [];
    _originalExamples = rows
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList();
    _exampleCount = rows.length.clamp(1, 6);
    _audio.clear();
    final first = rows.isEmpty
        ? <String, dynamic>{}
        : Map<String, dynamic>.from(rows.first as Map);
    final context = Map<String, dynamic>.from(
      (data['context'] ?? first['context'] ?? {}) as Map,
    );
    for (final key in ['situation', 'preceding', 'intent', 'register']) {
      f(key).text = context[key] as String? ?? '';
    }
    f('dialect').text = first['dialect'] as String? ?? '';
    f('source').text = first['source'] as String? ?? '';
    _sourceType = first['sourceType'] as String? ?? 'speaker';
    final permissions = Map<String, dynamic>.from(
      (data['permissions'] ?? {}) as Map,
    );
    f('licence').text = permissions['licence'] as String? ?? '';
    f('expiresAt').text = permissions['expiresAt'] as String? ?? '';
    for (final key in _permissions.keys) {
      _permissions[key] = permissions[key] == true;
    }
    for (var i = 0; i < 6; i++) {
      for (final controller in _examples[i].values) {
        controller.clear();
      }
      _annotations[i].clear();
      _audioPaths[i] = '';
      _naturalness[i] = 'cannot-judge';
    }
    for (var i = 0; i < rows.length && i < 6; i++) {
      final row = Map<String, dynamic>.from(rows[i] as Map);
      for (final key in ['english', 'kasem', 'literal', 'note']) {
        e(i, key).text = row[key] as String? ?? '';
      }
      _naturalness[i] = row['naturalness'] as String? ?? 'cannot-judge';
      _audioPaths[i] = row['audioPath'] as String? ?? '';
      _annotations[i].clear();
      _annotations[i].addAll(
        (row['annotations'] as List? ?? []).map(
          (a) => Map<String, dynamic>.from(a as Map),
        ),
      );
    }
    _tags.clear();
    _tags.addAll((first['constructions'] as List? ?? []).whereType<String>());
    _sharedOriginal = {
      'context': {
        for (final key in ['situation', 'preceding', 'intent', 'register'])
          key: f(key).text,
      },
      'dialect': f('dialect').text,
      'source': f('source').text,
      'sourceType': _sourceType,
      'constructions': _tags.toList(),
    };
  }

  dynamic _exampleMetadata(int index, String key, dynamic sharedValue) {
    if (index < _originalExamples.length &&
        _originalExamples[index].containsKey(key) &&
        jsonEncode(sharedValue) == jsonEncode(_sharedOriginal[key])) {
      return _originalExamples[index][key];
    }
    return sharedValue;
  }

  Map<String, dynamic> _payload() {
    final context = {
      for (final key in ['situation', 'preceding', 'intent', 'register'])
        key: f(key).text,
    };
    return {
      'schemaVersion': 2,
      'requestId': _requestId,
      'mode': _mode,
      for (final key in [
        'title',
        'explanation',
        'comparisonNote',
        'question',
        'answer',
        'modelVersion',
        'promptVersion',
      ])
        key: f(key).text,
      'context': context,
      'permissions': {
        ..._permissions,
        'licence': f('licence').text,
        'expiresAt': f('expiresAt').text,
      },
      'groups':
          widget.initialData?['groups'] ?? widget.prefillData?['groups'] ?? [],
      'examples': [
        for (var i = 0; i < (_mode == 'comparison' ? 2 : _exampleCount); i++)
          {
            for (final key in ['english', 'kasem', 'literal', 'note'])
              key: e(i, key).text,
            'context': _exampleMetadata(i, 'context', context),
            'dialect': _exampleMetadata(i, 'dialect', f('dialect').text),
            'sourceType': _exampleMetadata(i, 'sourceType', _sourceType),
            'source': _exampleMetadata(i, 'source', f('source').text),
            'naturalness': _naturalness[i],
            'constructions': _exampleMetadata(
              i,
              'constructions',
              _tags.toList(),
            ),
            'annotations': _annotations[i],
            'audioPath': _audioPaths[i],
          },
      ],
    };
  }

  Future<void> _draft(bool restore) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (restore) {
        final raw = prefs.getString(_draftKey);
        if (raw != null && mounted) {
          setState(
            () => _restore(Map<String, dynamic>.from(jsonDecode(raw) as Map)),
          );
        }
        if (mounted) {
          _notice(
            raw == null
                ? 'No saved draft.'
                : 'Draft restored. Reattach any pending audio.',
          );
        }
      } else {
        await prefs.setString(_draftKey, jsonEncode(_payload()));
        if (mounted) {
          _notice('Draft saved on this device. Pending audio is not saved.');
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'The draft could not be saved or restored.');
      }
    }
  }

  void _notice(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
  Future<void> _pickAudio(int index) async {
    if (_permissions['audio'] != true) {
      setState(
        () => _error = 'Choose recording permission before attaching audio.',
      );
      return;
    }
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp3', 'wav', 'm4a', 'ogg'],
      withData: true,
    );
    if (result == null || !mounted) return;
    final file = result.files.single, bytes = result.files.single.bytes;
    if (bytes == null || bytes.length > 20 * 1024 * 1024) {
      setState(() => _error = 'Choose an audio file smaller than 20 MB.');
      return;
    }
    final ext = file.extension ?? 'm4a';
    setState(() => _audio[index] = (bytes, ext, file.name));
  }

  Future<void> _annotate(int index) async {
    final start = TextEditingController(text: '1'),
        end = TextEditingController(text: '1'),
        gloss = TextEditingController();
    final role = TextEditingController(),
        sense = TextEditingController(),
        hypotheses = TextEditingController();
    var kind = 'unknown';
    final route = DialogRoute<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, state) => AlertDialog(
          title: const Text('Explain a word or phrase'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Number words from 1. A phrase can span several words. Unknown is a useful answer.',
                ),
                TextField(
                  controller: start,
                  decoration: const InputDecoration(
                    labelText: 'First word number',
                  ),
                  keyboardType: TextInputType.number,
                ),
                TextField(
                  controller: end,
                  decoration: const InputDecoration(
                    labelText: 'Last word number',
                  ),
                  keyboardType: TextInputType.number,
                ),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: kind,
                  items: const ['unknown', 'lexical', 'grammatical']
                      .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                      .toList(),
                  onChanged: (v) => state(() => kind = v!),
                ),
                TextField(
                  controller: gloss,
                  decoration: const InputDecoration(
                    labelText: 'Meaning or function (optional)',
                  ),
                ),
                ExpansionTile(
                  title: const Text('More annotation details (optional)'),
                  children: [
                    TextField(
                      controller: role,
                      decoration: const InputDecoration(
                        labelText: 'Phrase role or focus scope',
                      ),
                    ),
                    TextField(
                      controller: sense,
                      decoration: const InputDecoration(
                        labelText: 'Dictionary sense reference',
                      ),
                    ),
                    TextField(
                      controller: hypotheses,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Possible explanations, one per line',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final a = int.tryParse(start.text), b = int.tryParse(end.text);
                if (a == null || b == null || a < 1 || b < a) return;
                Navigator.pop(context, {
                  'start': a - 1,
                  'end': b,
                  'kind': kind,
                  'gloss': gloss.text,
                  'senseId': sense.text,
                  'role': role.text,
                  'hypotheses': hypotheses.text
                      .split('\n')
                      .map((line) => line.trim())
                      .where((line) => line.isNotEmpty)
                      .toList(),
                });
              },
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
    final annotation = await Navigator.of(context).push(route);
    await route.completed;
    start.dispose();
    end.dispose();
    gloss.dispose();
    role.dispose();
    sense.dispose();
    hypotheses.dispose();
    if (annotation != null && mounted) {
      setState(() => _annotations[index].add(annotation));
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    if (_permissions['review'] != true ||
        _permissions['sourceConfirmed'] != true) {
      setState(
        () => _error = 'Confirm your source and allow community review. Other uses are optional.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      for (final entry in _audio.entries.toList()) {
        if (_permissions['audio'] != true) {
          throw StateError('Recording permission is required.');
        }
        final (bytes, ext, _) = entry.value;
        final path =
            'grammarAudio/$_uid/${DateTime.now().microsecondsSinceEpoch}.$ext';
        await FirebaseStorage.instance
            .ref(path)
            .putData(
              bytes,
              SettableMetadata(
                contentType: ext == 'mp3'
                    ? 'audio/mpeg'
                    : ext == 'm4a'
                    ? 'audio/mp4'
                    : 'audio/$ext',
              ),
            );
        _audioPaths[entry.key] = path;
        _audio.remove(entry.key);
      }
      final payload = _payload();
      final editing = widget.initialData != null;
      if (editing) {
        payload['noteId'] = widget.initialData!['id'];
        payload['revision'] = widget.initialData!['revision'];
      }
      await FirebaseFunctions.instance
          .httpsCallable(editing ? 'reviseGrammarNote' : 'submitGrammarNote')
          .call(payload);
      await (await SharedPreferences.getInstance()).remove(_draftKey);
      if (!mounted) return;
      _notice(
        'Saved for independent review. Training permission alone does not approve a sentence.',
      );
      Navigator.pop(context, true);
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(() => _error = error.message ?? 'Could not submit.');
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Could not submit. Your text is still here; save a draft and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _text(String key, String label, {int lines = 1}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: f(key),
      maxLines: lines,
      decoration: InputDecoration(labelText: label),
    ),
  );
  Widget _example(int index) {
    final firstTokens = e(0, 'kasem').text.split(' ');
    final tokens = e(index, 'kasem').text.split(' ');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Version ${index + 1}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final (key, label) in [
              ('kasem', 'Sentence in Kasem'),
              ('english', 'Natural meaning in English'),
              ('literal', 'Literal paraphrase (optional)'),
              ('note', 'Explanation (optional)'),
            ])
              TextField(
                controller: e(index, key),
                maxLines: key == 'note' ? 3 : 2,
                onChanged: key == 'kasem' ? (_) => setState(() {}) : null,
                decoration: InputDecoration(labelText: label),
              ),
            if (index == 1)
              Wrap(
                spacing: 5,
                children: [
                  for (var i = 0; i < tokens.length; i++)
                    Chip(
                      label: Text(tokens[i]),
                      backgroundColor:
                          i >= firstTokens.length || firstTokens[i] != tokens[i]
                          ? Theme.of(context).colorScheme.secondaryContainer
                          : null,
                    ),
                ],
              ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _naturalness[index],
              decoration: const InputDecoration(
                labelText: 'How does it sound to you?',
              ),
              items:
                  const {
                        'cannot-judge': 'I cannot judge',
                        'natural': 'Natural',
                        'awkward': 'Understandable but awkward',
                        'unnatural': 'Unnatural',
                      }.entries
                      .map(
                        (v) => DropdownMenuItem(
                          value: v.key,
                          child: Text(v.value),
                        ),
                      )
                      .toList(),
              onChanged: (v) => setState(() => _naturalness[index] = v!),
            ),
            for (var i = 0; i < _annotations[index].length; i++)
              ListTile(
                dense: true,
                title: Text(
                  'Words ${(_annotations[index][i]['start'] as int) + 1}–${_annotations[index][i]['end']}: '
                  '${_annotations[index][i]['gloss'] ?? ''} (${_annotations[index][i]['kind']})',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Remove annotation',
                  onPressed: () =>
                      setState(() => _annotations[index].removeAt(i)),
                ),
              ),
            TextButton.icon(
              onPressed: () => _annotate(index),
              icon: const Icon(Icons.notes),
              label: const Text('Explain a word or phrase (optional)'),
            ),
            TextButton.icon(
              onPressed: () => _pickAudio(index),
              icon: const Icon(Icons.audio_file),
              label: Text(
                _audio[index]?.$3 ??
                    (_audioPaths[index].isEmpty
                        ? 'Attach your recording (optional)'
                        : 'Recording attached'),
              ),
            ),
            if (_audioPaths[index].isNotEmpty || _audio.containsKey(index))
              TextButton(
                onPressed: () => setState(() {
                  _audio.remove(index);
                  _audioPaths[index] = '';
                }),
                child: const Text('Remove recording from this version'),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(isSignedInProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.initialData == null
              ? 'Teach a sentence'
              : 'Revise your sentence',
        ),
        actions: [
          if (signedIn)
            IconButton(
              tooltip: 'My sentences',
              icon: const Icon(Icons.history),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => const GrammarContributionsScreen(),
                ),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Share how you would say it, and when. You can leave a word unexplained.',
          ),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _mode,
            decoration: const InputDecoration(labelText: 'Contribution type'),
            items:
                const {
                      'sentence': 'Teach a sentence',
                      'comparison': 'Compare two versions',
                      'correction': 'Correct an answer',
                    }.entries
                    .map(
                      (v) =>
                          DropdownMenuItem(value: v.key, child: Text(v.value)),
                    )
                    .toList(),
            onChanged: _exampleCount > 2
                ? null
                : (v) => setState(() {
                    _mode = v!;
                    if (_mode == 'comparison') _exampleCount = 2;
                  }),
          ),
          const SizedBox(height: 16),
          _text('title', 'Short title (optional)'),
          if (_exampleCount > 1)
            const Text(
              'Changing the shared context, dialect, source or tags updates every sentence in this contribution.',
            ),
          _text('dialect', 'Dialect or region (leave blank if unknown)'),
          _text('situation', 'When would you say this?', lines: 2),
          _text('preceding', 'What was said just before? (optional)', lines: 2),
          _text('intent', 'What are you trying to communicate? (optional)'),
          _text('register', 'Who are you speaking to? (optional)'),
          Wrap(
            spacing: 6,
            children: sentenceConstructionLabels.entries
                .map(
                  (tag) => FilterChip(
                    label: Text(tag.value),
                    selected: _tags.contains(tag.key),
                    onSelected: (v) => setState(() {
                      if (!v) {
                        _tags.remove(tag.key);
                      } else if (_tags.length < 4) {
                        _tags.add(tag.key);
                      }
                    }),
                  ),
                )
                .toList(),
          ),
          for (var i = 0; i < (_mode == 'comparison' ? 2 : _exampleCount); i++)
            _example(i),
          if (_mode != 'comparison' && _exampleCount < 6)
            TextButton.icon(
              onPressed: () => setState(() => _exampleCount++),
              icon: const Icon(Icons.add),
              label: const Text('Add another sentence'),
            ),
          if (_mode == 'comparison')
            _text(
              'comparisonNote',
              'What changes between these versions?',
              lines: 3,
            ),
          _text(
            'explanation',
            'Anything else reviewers should know? (optional)',
            lines: 3,
          ),
          if (_mode == 'correction') ...[
            _text('question', 'Original question', lines: 2),
            _text('answer', 'Answer being corrected', lines: 3),
          ],
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _sourceType,
            decoration: const InputDecoration(
              labelText: 'Where did this come from?',
            ),
            items:
                const {
                      'speaker': 'My own usage',
                      'literature': 'A written source',
                      'model': 'An AI suggestion I am submitting for review',
                    }.entries
                    .map(
                      (v) =>
                          DropdownMenuItem(value: v.key, child: Text(v.value)),
                    )
                    .toList(),
            onChanged: (v) => setState(() => _sourceType = v!),
          ),
          _text(
            'source',
            'Source or attribution (required for written / AI sources)',
            lines: 2,
          ),
          _text('licence', 'Source terms or restrictions (optional)', lines: 2),
          _text('expiresAt', 'Permission expiry (optional, YYYY-MM-DD)'),
          for (final permission in evidencePermissionLabels.entries)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(permission.value),
              value: _permissions[permission.key],
              onChanged: (v) =>
                  setState(() => _permissions[permission.key] = v ?? false),
            ),
          const Text(
            'Training and evaluation are optional. You can revise or withdraw your contribution from My sentences.',
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Wrap(
            spacing: 12,
            children: [
              TextButton(
                onPressed: () => _draft(false),
                child: const Text('Save draft'),
              ),
              TextButton(
                onPressed: () => _draft(true),
                child: const Text('Restore draft'),
              ),
            ],
          ),
          FilledButton(
            onPressed: signedIn && !_busy ? _submit : null,
            child: Text(
              _busy
                  ? 'Saving…'
                  : signedIn
                  ? 'Send for review'
                  : 'Sign in to contribute',
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    for (final c in [..._fields.values, ..._examples.expand((e) => e.values)]) {
      c.dispose();
    }
    super.dispose();
  }
}

class GrammarContributionsScreen extends StatelessWidget {
  const GrammarContributionsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    return Scaffold(
      appBar: AppBar(title: const Text('My sentences')),
      body: uid == null
          ? const Center(child: Text('Sign in to view your sentences.'))
          : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('grammarNotes')
                  .where('authUid', isEqualTo: uid)
                  .limit(100)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return const Center(child: Text('Could not load sentences.'));
                }
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.data!.docs.isEmpty) {
                  return const Center(
                    child: Text('Your submitted sentences will appear here.'),
                  );
                }
                return ListView(
                  children: snapshot.data!.docs.map((doc) {
                    final data = doc.data();
                    return Card(
                      child: Column(
                        children: [
                          ListTile(
                            title: Text(data['title'] as String? ?? 'Sentence'),
                            subtitle: Text(
                              data['status'] as String? ?? 'submitted',
                            ),
                          ),
                          Row(
                            children: [
                              TextButton(
                                onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute<bool>(
                                    builder: (_) => GrammarNoteScreen(
                                      initialData: {...data, 'id': doc.id},
                                    ),
                                  ),
                                ),
                                child: const Text('Revise'),
                              ),
                              TextButton(
                                onPressed: data['status'] == 'withdrawn'
                                    ? null
                                    : () async {
                                        try {
                                          await FirebaseFunctions.instance
                                              .httpsCallable(
                                                'withdrawGrammarNote',
                                              )
                                              .call({'noteId': doc.id});
                                          if (context.mounted) {
                                            ScaffoldMessenger.of(
                                              context,
                                            ).showSnackBar(
                                              const SnackBar(
                                                content: Text(
                                                  'Withdrawn from future use.',
                                                ),
                                              ),
                                            );
                                          }
                                        } catch (_) {
                                          if (context.mounted) {
                                            ScaffoldMessenger.of(context)
                                                .showSnackBar(
                                                  const SnackBar(
                                                    content: Text(
                                                      'Could not withdraw. Try again.',
                                                    ),
                                                  ),
                                                );
                                          }
                                        }
                                      },
                                child: const Text('Withdraw'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
    );
  }
}
