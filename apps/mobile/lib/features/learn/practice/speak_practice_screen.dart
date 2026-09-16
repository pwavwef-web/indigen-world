import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/learn/daily_word.dart';
import 'package:indigen_world_mobile/features/learn/learn_progress.dart';
import 'package:indigen_world_mobile/features/learn/practice/learn_recorder.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_decks.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_widgets.dart';

/// Sends a Speak recording to `submitPronunciationRecording`.
class PronunciationRecordingRepository {
  const PronunciationRecordingRepository(this._functions);

  final FirebaseFunctions _functions;

  Future<void> submit({
    required String uid,
    required DictionaryEntry entry,
    required LearnRecording recording,
    required bool publishConsent,
  }) async {
    final uploaded = await const ContributionUploader().upload(
      uid: uid,
      file: PickedContributionFile(
        path: recording.path,
        name: 'pronunciation.m4a',
        sizeBytes: recording.sizeBytes,
        kind: ContributionMediaKind.audio,
      ),
    );
    await _functions
        .httpsCallable(
          'submitPronunciationRecording',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
        )
        .call<Map<Object?, Object?>>({
          'entryId': entry.id,
          'storagePath': uploaded.storagePath,
          'durationMs': recording.duration.inMilliseconds,
          'publishConsent': publishConsent,
        });
  }
}

final pronunciationRecordingRepositoryProvider =
    Provider<PronunciationRecordingRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return PronunciationRecordingRepository(FirebaseFunctions.instance);
    });

/// Speaking practice.
///
/// Two honest halves, labelled as what they are:
///
///   * **Say it in Kasem.** Record, listen back, and send the take to a person.
///     No model transcribes Kasem accurately, so nothing here pretends to score
///     it — a reviewer listens.
///   * **Say the meaning in English.** Transcribed on the server by Vertex AI,
///     English being the one language speech-to-text is offered for, and
///     compared with the dictionary's meaning. Marked experimental.
class SpeakPracticeScreen extends ConsumerStatefulWidget {
  const SpeakPracticeScreen({this.initialEntry, super.key});

  final DictionaryEntry? initialEntry;

  @override
  ConsumerState<SpeakPracticeScreen> createState() =>
      _SpeakPracticeScreenState();
}

class _SpeakPracticeScreenState extends ConsumerState<SpeakPracticeScreen> {
  DictionaryEntry? _entry;
  final _kasemRecorder = GlobalKey<LearnRecorderState>();
  LearnRecording? _kasemTake;
  var _publishConsent = false;
  var _sending = false;
  String? _sendError;
  var _sent = false;

  final _englishRecorder = GlobalKey<LearnRecorderState>();
  LearnRecording? _englishTake;
  var _checking = false;
  String? _checkError;
  KawuriTranscript? _transcript;
  String? _requestId;

  DictionaryEntry? _resolveEntry(List<DictionaryEntry> entries) {
    if (_entry != null) return _entry;
    final daily = ref.read(dailyWordProvider)?.entry;
    return _entry = widget.initialEntry ??
        (daily != null && isPractisable(daily) ? daily : null) ??
        entries.where(isPractisable).firstOrNull;
  }

  void _changeEntry(DictionaryEntry entry) {
    unawaited(_kasemRecorder.currentState?.reset());
    unawaited(_englishRecorder.currentState?.reset());
    setState(() {
      _entry = entry;
      _kasemTake = null;
      _englishTake = null;
      _sent = false;
      _sendError = null;
      _transcript = null;
      _checkError = null;
      _requestId = null;
    });
  }

  Future<String?> _signedInUid() async {
    var user = ref.read(firebaseAuthProvider)?.currentUser;
    if (user == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !mounted) return null;
      user = ref.read(firebaseAuthProvider)?.currentUser;
    }
    return user?.uid;
  }

  Future<void> _send() async {
    final entry = _entry;
    final take = _kasemTake;
    final repository = ref.read(pronunciationRecordingRepositoryProvider);
    if (entry == null || take == null || _sending) return;
    if (repository == null || !ref.read(isOnlineProvider)) {
      setState(
        () => _sendError =
            'Sending needs a connection. Your take is kept while this screen is open.',
      );
      return;
    }
    final uid = await _signedInUid();
    if (uid == null || !mounted) return;
    setState(() {
      _sending = true;
      _sendError = null;
    });
    try {
      await repository.submit(
        uid: uid,
        entry: entry,
        recording: take,
        publishConsent: _publishConsent,
      );
      await ref
          .read(learnProgressProvider.notifier)
          .completePractice(PracticeKind.speak);
      await _kasemRecorder.currentState?.reset();
      if (mounted) {
        setState(() {
          _sent = true;
          _kasemTake = null;
        });
      }
    } on ContributionUploadFailure catch (error) {
      if (mounted) setState(() => _sendError = error.message);
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _sendError =
              error.message ?? 'The recording could not be sent. Try again.',
        );
      }
    } on Object {
      if (mounted) {
        setState(() => _sendError = 'The recording could not be sent. Try again.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _check() async {
    final take = _englishTake;
    final repository = ref.read(kawuriMediaRepositoryProvider);
    if (take == null || repository == null || _checking) return;
    final uid = await _signedInUid();
    if (uid == null || !mounted) return;
    final requestId = _requestId ??= KawuriMediaRepository.newRequestId('stt');
    setState(() {
      _checking = true;
      _checkError = null;
      _transcript = null;
    });
    try {
      final path = await repository.upload(
        purpose: 'audio',
        filePath: take.path,
        contentType: 'audio/mp4',
      );
      final transcript = await repository.transcribe(
        requestId: requestId,
        storagePath: path,
        durationSeconds: take.duration.inSeconds.clamp(1, 10),
      );
      if (!mounted) return;
      setState(() {
        _transcript = transcript;
        _requestId = null;
      });
      await ref
          .read(learnProgressProvider.notifier)
          .completePractice(PracticeKind.speak);
    } on KawuriMediaException catch (error) {
      if (mounted) {
        setState(() {
          _checkError = error.message;
          _requestId = null;
        });
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(publishedDictionaryEntriesProvider);
    return PracticeScaffold(
      title: 'Speak',
      child: switch (entries) {
        AsyncValue(:final value?) => _body(value),
        AsyncValue(:final error?) => PracticeMessage(
          icon: Icons.cloud_off_rounded,
          title: 'Words could not be loaded',
          body: 'Check your connection and try again.',
          actionLabel: 'Try again',
          onAction: () => ref.invalidate(publishedDictionaryEntriesProvider),
          debugError: error,
        ),
        _ when widget.initialEntry != null => _body(const []),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _body(List<DictionaryEntry> entries) {
    final entry = _resolveEntry(entries);
    if (entry == null) {
      return const PracticeMessage(
        icon: Icons.mic_none_rounded,
        title: 'No words to practise yet',
        body: 'Speaking practice uses words from the published dictionary.',
      );
    }
    final brand = context.brand;
    final caps =
        ref.watch(kawuriCapabilitiesProvider).asData?.value ??
        KawuriCapabilities.none;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: [
        _WordHeader(
          entry: entry,
          onChange: entries.isEmpty
              ? null
              : () async {
                  final picked = await _pickWord(context, entries);
                  if (picked != null) _changeEntry(picked);
                },
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Say it in Kasem',
          badge: 'Community review',
          children: [
            Text(
              'Record the word, listen back, and send it to a reviewer. Kasem speech is not transcribed or scored automatically — a person listens.',
              style: TextStyle(color: brand.mutedInk, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 14),
            LearnRecorder(
              key: _kasemRecorder,
              enabled: !_sending,
              recordLabel: 'Record “${entry.headword}”',
              onRecorded: (take) => setState(() {
                _kasemTake = take;
                _sent = false;
                _sendError = null;
              }),
              onCleared: () => setState(() => _kasemTake = null),
            ),
            if (_kasemTake != null) ...[
              const SizedBox(height: 10),
              CheckboxListTile(
                key: const Key('speak-publish-consent'),
                value: _publishConsent,
                onChanged: _sending
                    ? null
                    : (value) => setState(() => _publishConsent = value ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text(
                  'Reviewers may publish my recording as this word’s pronunciation',
                  style: TextStyle(fontSize: 13),
                ),
                subtitle: const Text(
                  'Only if the word has no recording yet. Leave unticked for feedback only.',
                  style: TextStyle(fontSize: 11.5),
                ),
              ),
              FilledButton.icon(
                key: const Key('speak-send'),
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_rounded),
                label: Text(_sending ? 'Sending…' : 'Send for review'),
              ),
            ],
            if (_sent)
              _Note(
                icon: Icons.check_circle_rounded,
                color: brand.success,
                text: 'Sent for community review. A reviewer will listen to it; nothing is scored automatically.',
              ),
            if (_sendError != null)
              _Note(
                icon: Icons.error_outline_rounded,
                color: brand.danger,
                text: _sendError!,
              ),
          ],
        ),
        const SizedBox(height: 14),
        _Section(
          title: 'Say the meaning in English',
          badge: 'Experimental',
          children: [
            Text(
              'Say what “${entry.headword}” means, in English. Vertex AI transcribes it and Kawuri compares it with the dictionary. Automated feedback is experimental, and speech-to-text supports English only.',
              style: TextStyle(color: brand.mutedInk, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 14),
            if (!caps.speechToText)
              _Note(
                icon: Icons.info_outline_rounded,
                color: brand.mutedInk,
                text:
                    caps.unavailableMessage('speechToText') ??
                    'English speech-to-text is not available right now.',
              )
            else ...[
              LearnRecorder(
                key: _englishRecorder,
                enabled: !_checking,
                maxLength: const Duration(seconds: 10),
                recordLabel: 'Record the meaning',
                onRecorded: (take) => setState(() {
                  _englishTake = take;
                  _transcript = null;
                  _checkError = null;
                }),
                onCleared: () => setState(() {
                  _englishTake = null;
                  _transcript = null;
                }),
              ),
              if (_englishTake != null && _transcript == null) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  key: const Key('speak-check'),
                  onPressed: _checking ? null : _check,
                  icon: _checking
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome_rounded),
                  label: Text(_checking ? 'Checking…' : 'Check my answer'),
                ),
              ],
              if (_transcript case final transcript?) ...[
                const SizedBox(height: 12),
                _EnglishFeedback(entry: entry, transcript: transcript),
              ],
              if (_checkError != null)
                _Note(
                  icon: Icons.error_outline_rounded,
                  color: brand.danger,
                  text: _checkError!,
                ),
            ],
          ],
        ),
      ],
    );
  }
}

Future<DictionaryEntry?> _pickWord(
  BuildContext context,
  List<DictionaryEntry> entries,
) => showModalBottomSheet<DictionaryEntry>(
  context: context,
  isScrollControlled: true,
  builder: (sheetContext) => _WordPicker(entries: entries),
);

class _WordPicker extends StatefulWidget {
  const _WordPicker({required this.entries});

  final List<DictionaryEntry> entries;

  @override
  State<_WordPicker> createState() => _WordPickerState();
}

class _WordPickerState extends State<_WordPicker> {
  var _query = '';

  @override
  Widget build(BuildContext context) {
    final query = _query.trim().toLowerCase();
    final matches = widget.entries
        .where(isPractisable)
        .where(
          (entry) =>
              query.isEmpty ||
              entry.headword.toLowerCase().contains(query) ||
              entry.translation.toLowerCase().contains(query),
        )
        .take(60)
        .toList();
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  autofocus: true,
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search_rounded),
                    hintText: 'Find a word in Kasem or English',
                  ),
                  onChanged: (value) => setState(() => _query = value),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: matches.length,
                  itemBuilder: (context, index) {
                    final entry = matches[index];
                    return ListTile(
                      title: Text(entry.headword),
                      subtitle: Text(entry.translation),
                      trailing: entry.audioUrl.isEmpty
                          ? null
                          : const Icon(Icons.volume_up_rounded, size: 18),
                      onTap: () => Navigator.of(context).pop(entry),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WordHeader extends StatelessWidget {
  const _WordHeader({required this.entry, required this.onChange});

  final DictionaryEntry entry;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 10, 14),
      decoration: BoxDecoration(
        color: brand.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: brand.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.headword,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(entry.translation, style: TextStyle(color: brand.mutedInk)),
                const SizedBox(height: 4),
                Text(
                  entry.audioUrl.isEmpty
                      ? 'No reference recording yet'
                      : 'Hear a speaker first',
                  style: TextStyle(color: brand.faintInk, fontSize: 11.5),
                ),
              ],
            ),
          ),
          if (entry.audioUrl.isNotEmpty)
            PronunciationButton(audioUrl: entry.audioUrl),
          if (onChange != null)
            TextButton(onPressed: onChange, child: const Text('Change')),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.badge,
    required this.children,
  });

  final String title;
  final String badge;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: brand.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: brand.gold.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  badge,
                  style: TextStyle(
                    color: brand.gold,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Semantics(
      liveRegion: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color, fontSize: 13)),
          ),
        ],
      ),
    ),
  );
}

class _EnglishFeedback extends StatelessWidget {
  const _EnglishFeedback({required this.entry, required this.transcript});

  final DictionaryEntry entry;
  final KawuriTranscript transcript;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final matched = transcriptMatchesMeaning(transcript.text, entry);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: (matched ? brand.success : brand.terracotta).withValues(
          alpha: 0.1,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'EXPERIMENTAL FEEDBACK',
            style: TextStyle(
              color: brand.gold,
              fontSize: 10.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Heard: “${transcript.text.isEmpty ? '…' : transcript.text}”',
            style: TextStyle(color: brand.ink, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            matched
                ? 'That matches the dictionary meaning.'
                : 'That doesn’t match. The dictionary says: ${entry.translation}.',
            style: TextStyle(
              color: matched ? brand.success : brand.terracotta,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (transcript.unclearSegments.isNotEmpty)
            Text(
              'Some of the recording was unclear.',
              style: TextStyle(color: brand.mutedInk, fontSize: 12),
            ),
        ],
      ),
    );
  }
}
