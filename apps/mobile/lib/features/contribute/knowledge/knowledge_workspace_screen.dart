import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/features/contribute/knowledge/knowledge_models.dart';
import 'package:indigen_world_mobile/features/contribute/knowledge/knowledge_repository.dart';
import 'package:indigen_world_mobile/features/contribute/pronunciation_recorder.dart';
import 'package:just_audio/just_audio.dart';
import 'package:url_launcher/url_launcher.dart';

class KnowledgeWorkspaceScreen extends ConsumerStatefulWidget {
  const KnowledgeWorkspaceScreen({super.key});
  @override
  ConsumerState<KnowledgeWorkspaceScreen> createState() => _KnowledgeWorkspaceScreenState();
}

class _KnowledgeWorkspaceScreenState extends ConsumerState<KnowledgeWorkspaceScreen> {
  final _more = <Map<String, dynamic>>[];
  String? _cursor, _error;
  bool _loadingMore = false;

  Future<void> _refresh() async {
    setState(() { _more.clear(); _cursor = null; _error = null; });
    ref.invalidate(knowledgePageProvider);
    await ref.read(knowledgePageProvider.future).catchError((Object error) {
      throw error;
    });
  }

  Future<void> _open(Map<String, dynamic> area, {Map<String, dynamic>? record}) async {
    await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) =>
      KnowledgeRecordScreen(area: area, initialRecord: record),
    ));
    if (mounted) {
      setState(() { _more.clear(); _cursor = null; });
      ref.invalidate(knowledgePageProvider);
    }
  }

  Future<void> _loadMore(String cursor) async {
    setState(() { _loadingMore = true; _error = null; });
    try {
      final page = await ref.read(knowledgeRepositoryProvider).list(cursor: cursor);
      if (mounted) setState(() { _more.addAll(page.records); _cursor = page.nextCursor ?? ''; });
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Kasem knowledge')),
    body: ref.watch(knowledgePageProvider).when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off_outlined, size: 40),
          const SizedBox(height: 16),
          Text(error.toString(), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: () => ref.invalidate(knowledgePageProvider), child: const Text('Try again')),
        ]),
      )),
      data: (page) {
        final records = [...page.records, ..._more];
        final next = _cursor ?? page.nextCursor;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Text('Preserve the meaning, not just the words', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 10),
            const Text('Build a careful record of Kasem with its context, source, regional forms and recordings. Save a private draft, then ask people who know the language to check it.'),
            const SizedBox(height: 20),
            Text('Start a record', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final area in page.catalog)
              Card(child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                title: Text('${area['label']}'),
                subtitle: Text('${area['description']}'),
                trailing: const Icon(Icons.add_rounded),
                onTap: () => _open(area),
              )),
            const SizedBox(height: 24),
            Text('Your records', style: Theme.of(context).textTheme.titleLarge),
            const Text('Drafts and reviewed records stay private in this workspace. A review does not publish a record or add it to model training.'),
            const SizedBox(height: 12),
            if (records.isEmpty) const Text('Your first saved record will appear here.'),
            for (final record in records)
              Card(child: ListTile(
                title: Text((record['title'] as String?)?.isNotEmpty == true ? '${record['title']}' : 'Untitled draft'),
                subtitle: Text('${knowledgeStatus(record['status'])}\n${record['id']} · revision ${record['revision']}'),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  final area = page.catalog.where((item) => item['id'] == record['datasetType']).firstOrNull;
                  if (area != null) _open(area, record: record);
                },
              )),
            if (_error != null) _ErrorNotice(_error!),
            if (next != null && next.isNotEmpty)
              OutlinedButton(onPressed: _loadingMore ? null : () => _loadMore(next), child: Text(_loadingMore ? 'Loading…' : 'Load more records')),
            if (page.canReview) ...[
              const SizedBox(height: 24),
              const Text('Independent reviewers use TribeStudio to compare evidence, record disagreements and check the current revision.'),
              OutlinedButton.icon(
                onPressed: () async {
                  final opened = await launchUrl(Uri.parse('https://tribestudio.indigenworld.com/studio/knowledge'), mode: LaunchMode.externalApplication);
                  if (!opened && mounted) setState(() => _error = 'Could not open TribeStudio. Visit tribestudio.indigenworld.com in your browser.');
                },
                icon: const Icon(Icons.open_in_new), label: const Text('Open review workspace'),
              ),
            ],
          ]),
        );
      },
    ),
  );
}

class KnowledgeRecordScreen extends ConsumerStatefulWidget {
  const KnowledgeRecordScreen({required this.area, this.initialRecord, super.key});
  final Map<String, dynamic> area;
  final Map<String, dynamic>? initialRecord;
  @override
  ConsumerState<KnowledgeRecordScreen> createState() => _KnowledgeRecordScreenState();
}

class _KnowledgeRecordScreenState extends ConsumerState<KnowledgeRecordScreen> {
  late KnowledgeDraft _draft;
  Map<String, dynamic>? _saved;
  List<Map<String, dynamic>> _reviews = [], _history = [];
  String? _error, _notice, _requestFingerprint;
  String _requestId = '';
  int _section = 0;
  bool _busy = false, _dirty = false, _allowPop = false;
  PickedContributionFile? _recording;
  AudioPlayer? _player;
  int? _playing;

  static const _sections = ['Original & meaning', 'Language details', 'Context & source', 'Recordings', 'Permissions & review'];
  bool get _withdrawn => _saved?['status'] == 'withdrawn';
  String? get _id => _saved?['id'] as String?;
  int? get _revision => (_saved?['revision'] as num?)?.toInt();

  @override
  void initState() {
    super.initState();
    _saved = widget.initialRecord;
    _draft = _saved == null ? KnowledgeDraft.newRecord('${widget.area['id']}') : KnowledgeDraft.fromRecord(_saved!);
    if (_saved != null) _loadFeedback();
  }

  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  Future<void> _loadFeedback() async {
    try {
      final result = await ref.read(knowledgeRepositoryProvider).get(_id!);
      if (mounted) setState(() {
        _reviews = knowledgeRows(result['reviews']);
        _history = knowledgeRows(result['history']);
      });
    } on Object catch (error) {
      if (mounted) setState(() => _error = 'Feedback could not be loaded. ${error.toString()}');
    }
  }

  void _changed() {
    if (!_dirty) setState(() { _dirty = true; _notice = null; });
  }

  Widget _field(String key, String label, {Map<String, dynamic>? map, String? hint, bool multiline = false, bool required = false}) {
    final target = map ?? _draft.data;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        key: ValueKey('$_section-${identityHashCode(target)}-$key'),
        initialValue: target[key] as String? ?? '',
        enabled: !_busy && !_withdrawn,
        minLines: multiline ? 3 : 1,
        maxLines: multiline ? 10 : 3,
        maxLength: multiline ? 30000 : 2000,
        decoration: InputDecoration(labelText: '$label${required ? ' *' : ''}', helperText: hint, helperMaxLines: 6, counterText: '', border: const OutlineInputBorder()),
        onChanged: (value) { target[key] = value; _changed(); },
      ),
    );
  }

  Widget _select(String key, String label, Map<String, String> options, {Map<String, dynamic>? map, VoidCallback? afterChange}) {
    final target = map ?? _draft.data;
    final value = target[key] as String?;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: DropdownButtonFormField<String>(
        key: ValueKey('$_section-${identityHashCode(target)}-$key'),
        initialValue: options.containsKey(value) ? value : options.keys.first,
        isExpanded: true,
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
        items: options.entries.map((entry) => DropdownMenuItem(value: entry.key, child: Text(entry.value, overflow: TextOverflow.ellipsis))).toList(),
        onChanged: _busy || _withdrawn ? null : (value) => setState(() {
          target[key] = value;
          _changed();
          afterChange?.call();
        }),
      ),
    );
  }

  Future<void> _save(bool submit) async {
    setState(() { _busy = true; _error = null; _notice = null; });
    final record = _draft.toRecord();
    final fingerprint = jsonEncode({'record': record, 'submit': submit, 'revision': _revision});
    if (_requestFingerprint != fingerprint) {
      _requestFingerprint = fingerprint;
      _requestId = 'mobile-${DateTime.now().microsecondsSinceEpoch}';
    }
    try {
      final saved = await ref.read(knowledgeRepositoryProvider).save(record: record, requestId: _requestId, submit: submit, id: _id, revision: _revision);
      if (!mounted) return;
      setState(() {
        _saved = saved;
        _draft = KnowledgeDraft.fromRecord(saved);
        _dirty = false;
        _notice = submit ? 'Sent for independent review. Your record remains private.' : 'Draft saved to your account. You can continue on another device.';
      });
      await _loadFeedback();
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _upload(PickedContributionFile file) async {
    if (_draft.permissions['audio'] != true) {
      setState(() => _error = 'First allow recordings to be stored and reviewed in Permissions & review.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final path = await ref.read(knowledgeRepositoryProvider).upload(file);
      if (mounted) setState(() {
        _draft.audio.add({'path': path, 'label': file.name, 'transcript': '', 'speakerId': '', 'region': _draft.text('region'), 'kind': 'isolated', 'environment': '', 'quality': ''});
        _recording = null;
        _dirty = true;
      });
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickAudio() async {
    try {
      final file = await const ContributionUploader().pick(ContributionMediaKind.audio, maxBytes: 20 * 1024 * 1024 - 1);
      if (file != null && mounted) await _upload(file);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<void> _play(int index) async {
    if (_playing != null) {
      await _player?.stop();
      if (mounted) setState(() => _playing = null);
      return;
    }
    setState(() { _playing = index; _error = null; });
    try {
      final audio = await ref.read(knowledgeRepositoryProvider).readAudio(_id!, _revision!, index);
      if (!mounted) return;
      _player ??= AudioPlayer();
      await _player!.setAudioSource(_PrivateAudioSource(base64Decode(audio['audio'] as String), audio['contentType'] as String));
      await _player!.play();
    } on Object {
      if (mounted) setState(() => _error = 'This recording could not be played. Check the connection and current recording permission.');
    } finally {
      if (mounted) setState(() => _playing = null);
    }
  }

  Future<void> _withdraw() async {
    final confirmed = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Withdraw this record?'),
      content: const Text('This closes review and recording access in the workspace. The record and its history remain, but it cannot be edited again.'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep record')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Withdraw'))],
    ));
    if (confirmed != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await _player?.stop();
      final saved = await ref.read(knowledgeRepositoryProvider).withdraw(_id!, _revision!);
      if (mounted) setState(() { _saved = saved; _draft = KnowledgeDraft.fromRecord(saved); _dirty = false; _notice = 'Record withdrawn.'; });
    } on Object catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave() async {
    if (_busy) return;
    final discard = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Leave unsaved changes?'),
      content: const Text('Save a draft to keep these edits in your account. Changes on this screen are not saved automatically.'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep editing')), TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Leave without saving'))],
    ));
    if (discard == true && mounted) {
      setState(() => _allowPop = true);
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) Navigator.of(context).pop(); });
    }
  }

  List<Widget> _content() => switch (_section) {
    0 => [
      _field('title', 'A short title', required: true),
      _field('original', 'Original Kasem', multiline: true, required: true, hint: 'Keep the speaker’s wording, spelling, tone marks and line breaks. Do not replace it with a corrected version.'),
      _field('english', 'Natural English meaning', multiline: true, required: true, hint: 'Translate the intended meaning. Put word-for-word explanations in the language details.'),
      _field('french', 'French meaning (optional)', multiline: true),
    ],
    1 => [
      const Padding(padding: EdgeInsets.only(bottom: 16), child: Text('Add what you can support. Write “unknown” when an analysis is uncertain; reviewers should be able to see the gap. Fields marked * are needed before review.')),
      for (final field in knowledgeRows(widget.area['fields']))
        _field('${field['key']}', '${field['label']}', map: _draft.details, hint: field['hint'] as String?, multiline: field['multiline'] == true, required: field['required'] == true),
      Text('Regional or alternative forms', style: Theme.of(context).textTheme.titleMedium),
      const Text('Keep each form with its own context; an alternative is not automatically a correction.'),
      const SizedBox(height: 12),
      for (var i = 0; i < _draft.variants.length; i++)
        Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [
          _field('form', 'Variant ${i + 1}', map: _draft.variants[i]),
          _field('context', 'Where or when this form is used', map: _draft.variants[i]),
          _field('note', 'Meaning, difference or uncertainty', map: _draft.variants[i], multiline: true),
          TextButton(onPressed: _busy || _withdrawn ? null : () => setState(() { _draft.variants.removeAt(i); _dirty = true; }), child: const Text('Remove variant')),
        ]))),
      OutlinedButton.icon(onPressed: _busy || _withdrawn ? null : () => setState(() { _draft.variants.add({'form': '', 'context': '', 'note': ''}); _dirty = true; }), icon: const Icon(Icons.add), label: const Text('Add a variant')),
      const SizedBox(height: 16),
      TextFormField(
        key: const ValueKey('related-records'),
        initialValue: (_draft.data['relatedRecordIds'] as List? ?? []).join('\n'),
        enabled: !_busy && !_withdrawn, minLines: 2, maxLines: 6,
        decoration: const InputDecoration(labelText: 'Related record IDs (one per line)', helperText: 'Use a permanent workspace ID or dictionaryEntries:ID. Linking a record does not transfer its permissions.', helperMaxLines: 5, border: OutlineInputBorder()),
        onChanged: (value) { _draft.data['relatedRecordIds'] = value.split('\n').map((id) => id.trim()).where((id) => id.isNotEmpty).toList(); _changed(); },
      ),
    ],
    2 => [
      _field('context', 'Situation and intended meaning', required: true, multiline: true, hint: 'Who is speaking to whom? What came before, what is happening, and what is the speaker trying to express?'),
      _field('region', 'Region or dialect', required: true),
      _select('sourceType', 'Source type', const {'speaker': 'Speaker', 'literature': 'Written work', 'recording': 'Existing recording', 'other': 'Other source'}),
      _field('source', 'Source attribution', required: true, hint: 'Use a consented name or a speaker code. Avoid unnecessary personal details.'),
      _field('sourceReference', 'Source reference', hint: 'For a written work or recording, add its title, page or time, date and a reference a reviewer can check.', multiline: true),
    ],
    3 => _audioContent(),
    _ => _permissionsContent(),
  };

  List<Widget> _audioContent() => [
    const Text('Record a short pronunciation here, or attach a longer recording smaller than 20 MB. Capture an isolated form and a natural sentence separately when useful. Each clip keeps its own transcript and speaker metadata.'),
    const SizedBox(height: 12),
    if (!_withdrawn) ...[
      if (_draft.permissions['audio'] != true)
        TextButton(onPressed: () => setState(() => _section = 4), child: const Text('Set recording permission first')),
      PronunciationRecorderField(file: _recording, enabled: !_busy && _draft.permissions['audio'] == true, onRecorded: (file) => setState(() => _recording = file), onCleared: () => setState(() => _recording = null)),
      if (_recording != null)
        FilledButton(onPressed: _busy ? null : () => _upload(_recording!), child: const Text('Attach this recording')),
      OutlinedButton.icon(onPressed: _busy || _draft.permissions['audio'] != true ? null : _pickAudio, icon: const Icon(Icons.attach_file), label: const Text('Choose an audio file')),
    ],
    for (var i = 0; i < _draft.audio.length; i++)
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Recording ${i + 1}', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        _field('label', 'Recording label', map: _draft.audio[i]),
        _field('transcript', 'What is said in this clip', map: _draft.audio[i], multiline: true),
        _field('speakerId', 'Speaker code', map: _draft.audio[i], hint: 'Use a stable consented code, rather than a private contact detail.'),
        _field('region', 'Speaker’s region or dialect', map: _draft.audio[i]),
        _select('kind', 'Recording context', const {'isolated': 'Isolated word or form', 'in_context': 'In a natural sentence or conversation'}, map: _draft.audio[i]),
        _field('environment', 'Recording environment', map: _draft.audio[i], hint: 'For example: indoors, quiet room, background voices.'),
        _field('quality', 'Quality or uncertainties', map: _draft.audio[i]),
        if (_id != null && !_dirty && !_withdrawn)
          OutlinedButton.icon(onPressed: _busy ? null : () => _play(i), icon: Icon(_playing == i ? Icons.stop : Icons.play_arrow), label: Text(_playing == i ? 'Stop recording' : 'Play saved recording')),
        if (_dirty) const Text('Save the draft to listen to attached recordings here.'),
        TextButton(onPressed: _busy || _withdrawn ? null : () => setState(() { _draft.audio.removeAt(i); _dirty = true; }), child: const Text('Remove from this record')),
      ]))),
  ];

  List<Widget> _permissionsContent() {
    final restricted = _draft.permissions['culturalAccess'] != 'open';
    return [
      const Text('Choose each use separately. Only source rights and community review permission are required to submit. A saved permission is not a claim that publication, AI retrieval or training has happened.'),
      const SizedBox(height: 16),
      _select('culturalAccess', 'Cultural access', const {'open': 'Open to permitted uses', 'restricted': 'Restricted cultural knowledge', 'sensitive': 'Sensitive cultural knowledge'}, map: _draft.permissions, afterChange: () {
        if (_draft.permissions['culturalAccess'] != 'open') {
          for (final key in ['publication', 'providerRetrieval', 'modelTraining']) { _draft.permissions[key] = false; }
        }
      }),
      if (restricted) const Padding(padding: EdgeInsets.only(bottom: 12), child: Text('Restricted and sensitive records cannot grant public sharing, AI-provider retrieval or model training. Cultural expertise is required for Gold verification.')),
      for (final entry in knowledgePermissionLabels.entries)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(entry.value),
          subtitle: entry.key == 'sourceConfirmed' || entry.key == 'review' ? const Text('Required to send for review') : null,
          value: _draft.permissions[entry.key] == true,
          onChanged: _busy || _withdrawn || restricted && ['publication', 'providerRetrieval', 'modelTraining'].contains(entry.key) ? null : (value) => setState(() { _draft.permissions[entry.key] = value == true; _dirty = true; }),
        ),
      _field('licence', 'Licence or permission notes', map: _draft.permissions, multiline: true, hint: 'Record any agreed limits or attribution requirements.'),
      const Text('Gold requires two independent, qualified human approvals of the same revision. A disagreement blocks Gold. Editing starts a new revision and a new review.'),
      if (_saved != null) ...[
        const SizedBox(height: 24),
        Text('Review feedback', style: Theme.of(context).textTheme.titleMedium),
        if (_reviews.isEmpty) const Text('No review feedback has been loaded for this record.'),
        for (final review in _reviews) ListTile(contentPadding: EdgeInsets.zero, title: Text(knowledgeStatus(review['decision'] == 'approve' ? 'reviewed' : review['decision'])), subtitle: Text('Revision ${review['revision']}\n${review['note'] ?? ''}')),
        TextButton(onPressed: _busy ? null : _loadFeedback, child: const Text('Refresh feedback')),
        Text('Revision history', style: Theme.of(context).textTheme.titleMedium),
        for (final revision in _history) ListTile(contentPadding: EdgeInsets.zero, title: Text('Revision ${revision['revision']} · ${knowledgeStatus(revision['status'])}'), subtitle: Text('${revision['createdAt'] ?? ''}')),
        if (!_withdrawn) TextButton(onPressed: _busy ? null : _withdraw, child: const Text('Withdraw this record')),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _allowPop || !_dirty && !_busy,
    onPopInvokedWithResult: (didPop, result) { if (!didPop) _leave(); },
    child: Scaffold(
      appBar: AppBar(title: Text('${widget.area['label']}')),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(20), children: [
        if (_saved != null) ...[
          SelectableText(_id!, style: Theme.of(context).textTheme.labelLarge),
          Text('${knowledgeStatus(_saved?['status'])} · revision $_revision'),
          const SizedBox(height: 12),
        ],
        const Text('Save a draft at any point. Fields marked * are required for review.'),
        const SizedBox(height: 16),
        DropdownButtonFormField<int>(
          key: ValueKey('section-$_section'), initialValue: _section, isExpanded: true,
          decoration: const InputDecoration(labelText: 'Record section', border: OutlineInputBorder()),
          items: [for (var i = 0; i < _sections.length; i++) DropdownMenuItem(value: i, child: Text('${i + 1}. ${_sections[i]}', overflow: TextOverflow.ellipsis))],
          onChanged: _busy ? null : (value) => setState(() => _section = value!),
        ),
        const SizedBox(height: 24),
        ..._content(),
        const SizedBox(height: 20),
        if (_error != null) _ErrorNotice(_error!),
        if (_notice != null) Padding(padding: const EdgeInsets.only(bottom: 16), child: Text(_notice!, style: TextStyle(color: Theme.of(context).colorScheme.primary))),
        for (final warning in (_saved?['warnings'] as List? ?? [])) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('To improve this record: $warning')),
        if (_busy) const Padding(padding: EdgeInsets.only(bottom: 16), child: LinearProgressIndicator()),
        if (!_withdrawn) Wrap(spacing: 12, runSpacing: 12, children: [
          OutlinedButton(onPressed: _busy ? null : () => _save(false), child: const Text('Save draft')),
          if (_section < 4) FilledButton(onPressed: _busy ? null : () => setState(() => _section++), child: const Text('Continue')),
          if (_section == 4) FilledButton(onPressed: _busy ? null : () => _save(true), child: const Text('Send for review')),
        ]),
        const SizedBox(height: 32),
      ])),
    ),
  );
}

class _ErrorNotice extends StatelessWidget {
  const _ErrorNotice(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 16),
    child: Semantics(liveRegion: true, child: Text(message, style: TextStyle(color: Theme.of(context).colorScheme.error))),
  );
}

class _PrivateAudioSource extends StreamAudioSource {
  _PrivateAudioSource(this.bytes, this.contentType);
  final Uint8List bytes;
  final String contentType;
  @override
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    start ??= 0;
    end ??= bytes.length;
    return StreamAudioResponse(sourceLength: bytes.length, contentLength: end - start, offset: start, stream: Stream.value(bytes.sublist(start, end)), contentType: contentType);
  }
}
