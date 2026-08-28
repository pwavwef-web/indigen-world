import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/community/mentions.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Full-screen composer for a new post or a reply.
///
/// Attachments are staged locally and only uploaded when the member publishes,
/// so backing out of the screen never leaves orphaned files in Storage.
class ComposePostScreen extends ConsumerStatefulWidget {
  const ComposePostScreen({
    this.replyTo,
    this.quoteTo,
    this.initialText = '',
    super.key,
  });

  /// When set, the composer publishes a reply threaded under this post.
  final CommunityPost? replyTo;
  final CommunityPost? quoteTo;

  /// Seeds the field — used when another screen sends somebody here with
  /// something to say, so they land on a draft rather than a blank page.
  final String initialText;

  @override
  ConsumerState<ComposePostScreen> createState() => _ComposePostScreenState();
}

class _ComposePostScreenState extends ConsumerState<ComposePostScreen> {
  late final _controller = TextEditingController(text: widget.initialText);
  // Watches the caret so an `@` being typed offers handles to complete —
  // including Kawuri's, which answers in the thread.
  late final _mentions = MentionComposerController(_controller);
  final _attachments = <PendingUpload>[];
  final _pollOptions = [TextEditingController(), TextEditingController()];
  final _recorder = AudioRecorder();

  var _kasemConfirmed = false;
  var _publishing = false;
  var _showPoll = false;
  var _pollDuration = const Duration(days: 1);
  var _recording = false;
  DateTime? _recordingStartedAt;
  Timer? _recordingTicker;
  double? _progress;

  bool get _isReply => widget.replyTo != null;
  bool get _isQuote => widget.quoteTo != null;

  @override
  void dispose() {
    _recordingTicker?.cancel();
    unawaited(_recorder.dispose());
    _mentions.dispose();
    _controller.dispose();
    for (final controller in _pollOptions) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _toggleRecording() async {
    if (_publishing) return;
    if (_recording) {
      final startedAt = _recordingStartedAt;
      final path = await _recorder.stop();
      _recordingTicker?.cancel();
      if (!mounted) return;
      setState(() {
        _recording = false;
        _recordingStartedAt = null;
        if (path != null) {
          _attachments.add(
            PendingUpload(
              path: path,
              isVideo: false,
              isAudio: true,
              durationSeconds: startedAt == null
                  ? null
                  : DateTime.now()
                        .difference(startedAt)
                        .inSeconds
                        .clamp(1, 600)
                        .toInt(),
            ),
          );
        }
      });
      return;
    }

    if (_attachments.length >= CommunityRepository.maxMediaPerPost) {
      showCommunityMessage(context, 'Remove an attachment before recording.');
      return;
    }
    if (!await _recorder.hasPermission()) {
      if (mounted) {
        showCommunityMessage(
          context,
          'Microphone permission is needed for a voice note.',
        );
      }
      return;
    }
    final directory = await getTemporaryDirectory();
    final path =
        '${directory.path}${Platform.pathSeparator}community_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
      path: path,
    );
    if (!mounted) return;
    setState(() {
      _recording = true;
      _recordingStartedAt = DateTime.now();
    });
    _recordingTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _addMedia() async {
    final remaining = CommunityRepository.maxMediaPerPost - _attachments.length;
    if (remaining <= 0) {
      showCommunityMessage(
        context,
        'You can attach up to ${CommunityRepository.maxMediaPerPost} items.',
      );
      return;
    }
    final picked = await showMediaPickerSheet(
      context,
      remainingSlots: remaining,
    );
    if (picked.isEmpty || !mounted) return;
    setState(() => _attachments.addAll(picked.take(remaining)));
  }

  Future<void> _publish() async {
    if (_recording) {
      await _toggleRecording();
      if (!mounted) return;
    }
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    final repository = ref.read(communityRepositoryProvider);
    if (profile == null || repository == null) {
      showCommunityMessage(context, 'Set up your community profile first.');
      return;
    }
    if (_controller.text.trim().isEmpty &&
        _attachments.isEmpty &&
        !_showPoll &&
        !_isQuote) {
      showCommunityMessage(context, 'Write something or add a photo first.');
      return;
    }
    if (!_kasemConfirmed) {
      showCommunityMessage(
        context,
        'Confirm this ${_isReply ? 'reply' : 'post'} is written in Kasem.',
      );
      return;
    }
    final pollChoices = _pollOptions
        .map((controller) => controller.text.trim())
        .where((text) => text.isNotEmpty)
        .toList(growable: false);
    if (_showPoll && pollChoices.length < 2) {
      showCommunityMessage(context, 'Add at least two poll choices.');
      return;
    }
    final poll = _showPoll
        ? CommunityPoll(
            options: [
              for (var index = 0; index < pollChoices.length; index++)
                CommunityPollOption(
                  id: 'option_$index',
                  text: pollChoices[index],
                ),
            ],
            endsAt: DateTime.now().add(_pollDuration),
          )
        : null;

    setState(() {
      _publishing = true;
      _progress = _attachments.isEmpty ? null : 0;
    });

    try {
      await repository.createPost(
        author: profile,
        text: _controller.text,
        attachments: _attachments,
        parentId: widget.replyTo?.id,
        rootId: widget.replyTo?.rootId ?? widget.replyTo?.id,
        quoteTo: widget.quoteTo,
        poll: poll,
        kasemConfirmed: _kasemConfirmed,
        onUploadProgress: (value) {
          if (mounted) setState(() => _progress = value);
        },
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.of(context).pop(true);
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() {
        _publishing = false;
        _progress = null;
      });
      showCommunityMessage(context, error.message);
    } on Object {
      if (!mounted) return;
      setState(() {
        _publishing = false;
        _progress = null;
      });
      showCommunityMessage(context, 'Could not publish. Please try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final length = _controller.text.characters.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _isReply ? 'Reply' : (_isQuote ? 'Quote post' : 'New post'),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton(
              key: const Key('community-publish'),
              onPressed: _publishing ? null : _publish,
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 18),
              ),
              child: Text(_publishing ? 'Posting…' : 'Post'),
            ),
          ),
        ],
        bottom: _progress != null
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(
                  value: _progress,
                  minHeight: 3,
                  backgroundColor: context.brand.divider,
                ),
              )
            : null,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            if (widget.replyTo case final parent?) ...[
              _ReplyContext(post: parent),
              const SizedBox(height: 14),
            ],
            if (widget.quoteTo case final quoted?) ...[
              _QuoteContext(post: quoted),
              const SizedBox(height: 14),
            ],
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CommunityAvatar(
                  initials: profile?.initials ?? '··',
                  imageUrl: profile?.avatarUrl,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    key: const Key('community-composer'),
                    controller: _controller,
                    autofocus: true,
                    minLines: 5,
                    maxLines: 14,
                    maxLength: CommunityRepository.maxPostLength,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: _isReply ? 'Reply in Kasem…' : 'Bəŋə Kasem…',
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      counterText: '',
                      contentPadding: EdgeInsets.zero,
                    ),
                    style: const TextStyle(fontSize: 17, height: 1.5),
                  ),
                ),
              ],
            ),
            AnimatedBuilder(
              animation: _mentions,
              builder: (context, _) => _mentions.query == null
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(left: 56, top: 8),
                      child: MentionSuggestions(
                        query: _mentions.query,
                        onSelected: _mentions.complete,
                      ),
                    ),
            ),
            if (_attachments.isNotEmpty) ...[
              const SizedBox(height: 14),
              _AttachmentStrip(
                attachments: _attachments,
                onRemove: (index) =>
                    setState(() => _attachments.removeAt(index)),
              ),
            ],
            if (_recording) ...[
              const SizedBox(height: 14),
              _RecordingBar(
                elapsed: DateTime.now().difference(
                  _recordingStartedAt ?? DateTime.now(),
                ),
                onStop: _toggleRecording,
              ),
            ],
            if (_showPoll) ...[
              const SizedBox(height: 14),
              _PollComposer(
                controllers: _pollOptions,
                duration: _pollDuration,
                onAdd: _pollOptions.length >= 4
                    ? null
                    : () => setState(
                        () => _pollOptions.add(TextEditingController()),
                      ),
                onRemove: (index) {
                  if (_pollOptions.length <= 2) return;
                  final removed = _pollOptions.removeAt(index);
                  removed.dispose();
                  setState(() {});
                },
                onDurationChanged: (duration) =>
                    setState(() => _pollDuration = duration),
                onClose: () => setState(() => _showPoll = false),
              ),
            ],
            const SizedBox(height: 18),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              value: _kasemConfirmed,
              onChanged: (value) =>
                  setState(() => _kasemConfirmed = value ?? false),
              title: Text(
                'I confirm this ${_isReply ? 'reply' : 'post'} is written in Kasem.',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              subtitle: const Text(
                'The community relies on a member pledge rather than automatic '
                'language detection.',
                style: TextStyle(fontSize: 10.5),
              ),
            ),
            const Divider(height: 26),
            Row(
              children: [
                IconButton.filledTonal(
                  tooltip: 'Add photo or video',
                  onPressed: _publishing ? null : _addMedia,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                ),
                const SizedBox(width: 6),
                IconButton.filledTonal(
                  tooltip: _recording ? 'Stop voice note' : 'Record voice note',
                  onPressed: _publishing ? null : _toggleRecording,
                  icon: Icon(
                    _recording ? Icons.stop_rounded : Icons.mic_none_rounded,
                    color: _recording ? context.brand.terracotta : null,
                  ),
                ),
                if (!_isReply && !_isQuote) ...[
                  const SizedBox(width: 6),
                  IconButton.filledTonal(
                    tooltip: _showPoll ? 'Remove poll' : 'Add poll',
                    onPressed: _publishing
                        ? null
                        : () => setState(() => _showPoll = !_showPoll),
                    icon: const Icon(Icons.poll_outlined),
                  ),
                ],
                const SizedBox(width: 8),
                Text(
                  '${_attachments.length}/${CommunityRepository.maxMediaPerPost}',
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                Text(
                  '$length/${CommunityRepository.maxPostLength}',
                  style: TextStyle(
                    color: length > CommunityRepository.maxPostLength - 40
                        ? context.brand.terracotta
                        : context.brand.mutedInk,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ReplyContext extends StatelessWidget {
  const _ReplyContext({required this.post});

  final CommunityPost post;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: context.brand.accent.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: context.brand.accent.withValues(alpha: 0.12)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CommunityAvatar(
          initials: post.initials,
          imageUrl: post.authorAvatarUrl,
          size: 32,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Replying to ${post.handle}',
                style: TextStyle(
                  color: context.brand.accent,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                post.text.isEmpty ? '(media post)' : post.text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _AttachmentStrip extends StatelessWidget {
  const _AttachmentStrip({required this.attachments, required this.onRemove});

  final List<PendingUpload> attachments;
  final ValueChanged<int> onRemove;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 128,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: attachments.length,
      separatorBuilder: (context, index) => const SizedBox(width: 10),
      itemBuilder: (context, index) {
        final attachment = attachments[index];
        return Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                width: 128,
                height: 128,
                child: attachment.isAudio
                    ? ColoredBox(
                        color: context.brand.accent,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.graphic_eq_rounded,
                              color: context.brand.gold,
                              size: 42,
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'VOICE NOTE',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.7,
                              ),
                            ),
                          ],
                        ),
                      )
                    : attachment.isVideo
                    ? ColoredBox(
                        color: context.brand.accent,
                        child: const Center(
                          child: Icon(
                            Icons.play_circle_fill_rounded,
                            color: Colors.white,
                            size: 40,
                          ),
                        ),
                      )
                    : Image.file(
                        File(attachment.path),
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) =>
                            ColoredBox(color: context.brand.divider),
                      ),
              ),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton.filled(
                tooltip: 'Remove',
                iconSize: 16,
                visualDensity: VisualDensity.compact,
                style: IconButton.styleFrom(
                  backgroundColor: Colors.black54,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => onRemove(index),
                icon: const Icon(Icons.close_rounded),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _QuoteContext extends StatelessWidget {
  const _QuoteContext({required this.post});

  final CommunityPost post;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: context.brand.surface,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: context.brand.divider),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.format_quote_rounded,
              size: 17,
              color: context.brand.terracotta,
            ),
            const SizedBox(width: 5),
            Text(
              'QUOTING',
              style: TextStyle(
                color: context.brand.terracotta,
                fontSize: 10,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
        const SizedBox(height: 9),
        Row(
          children: [
            CommunityAvatar(
              initials: post.initials,
              imageUrl: post.authorAvatarUrl,
              size: 30,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '${post.authorName}  ${post.handle}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
        if (post.text.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            post.text,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, height: 1.4),
          ),
        ],
      ],
    ),
  );
}

class _RecordingBar extends StatelessWidget {
  const _RecordingBar({required this.elapsed, required this.onStop});

  final Duration elapsed;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final seconds = elapsed.inSeconds.clamp(0, 599);
    final label =
        '${(seconds ~/ 60).toString().padLeft(2, '0')}:'
        '${(seconds % 60).toString().padLeft(2, '0')}';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(
        color: context.brand.terracotta.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.brand.terracotta.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.fiber_manual_record_rounded,
            color: context.brand.terracotta,
            size: 18,
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Recording voice note',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(width: 5),
          IconButton.filled(
            tooltip: 'Finish recording',
            onPressed: onStop,
            style: IconButton.styleFrom(
              backgroundColor: context.brand.terracotta,
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.stop_rounded),
          ),
        ],
      ),
    );
  }
}

class _PollComposer extends StatelessWidget {
  const _PollComposer({
    required this.controllers,
    required this.duration,
    required this.onAdd,
    required this.onRemove,
    required this.onDurationChanged,
    required this.onClose,
  });

  final List<TextEditingController> controllers;
  final Duration duration;
  final VoidCallback? onAdd;
  final ValueChanged<int> onRemove;
  final ValueChanged<Duration> onDurationChanged;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: context.brand.accent.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: context.brand.accent.withValues(alpha: 0.15)),
    ),
    child: Column(
      children: [
        Row(
          children: [
            Icon(Icons.poll_outlined, color: context.brand.accent),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                'COMMUNITY POLL',
                style: TextStyle(
                  color: context.brand.accent,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.7,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Remove poll',
              visualDensity: VisualDensity.compact,
              onPressed: onClose,
              icon: const Icon(Icons.close_rounded),
            ),
          ],
        ),
        for (var index = 0; index < controllers.length; index++) ...[
          const SizedBox(height: 8),
          TextField(
            controller: controllers[index],
            maxLength: 80,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'Choice ${index + 1}',
              counterText: '',
              suffixIcon: controllers.length > 2
                  ? IconButton(
                      tooltip: 'Remove choice',
                      onPressed: () => onRemove(index),
                      icon: const Icon(Icons.remove_circle_outline_rounded),
                    )
                  : null,
            ),
          ),
        ],
        const SizedBox(height: 10),
        Row(
          children: [
            TextButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add choice'),
            ),
            const Spacer(),
            Text(
              'Ends in',
              style: TextStyle(
                color: context.brand.mutedInk,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 8),
            DropdownButton<Duration>(
              value: duration,
              underline: const SizedBox.shrink(),
              onChanged: (value) {
                if (value != null) onDurationChanged(value);
              },
              items: const [
                DropdownMenuItem(
                  value: Duration(hours: 1),
                  child: Text('1 hour'),
                ),
                DropdownMenuItem(
                  value: Duration(days: 1),
                  child: Text('1 day'),
                ),
                DropdownMenuItem(
                  value: Duration(days: 3),
                  child: Text('3 days'),
                ),
                DropdownMenuItem(
                  value: Duration(days: 7),
                  child: Text('7 days'),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  );
}
