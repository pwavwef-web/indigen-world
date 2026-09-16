import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_analysis_card.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_controller.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_create_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_creation_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_feedback.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_home.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_learning_context.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_library_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_report.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_translation_card.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_voice_input.dart';
import 'package:indigen_world_mobile/features/subscriptions/membership_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:share_plus/share_plus.dart';

/// Kawuri — the Indigen World guide.
///
/// A full-screen conversation over the brand's night palette: navy deepening
/// into ink, cyan as the light. The visual language is
/// deliberately the launch screen's — orbiting rings, cultural glyphs — so
/// Kawuri reads as part of this project rather than a chat window bolted on.
class KawuriScreen extends ConsumerStatefulWidget {
  const KawuriScreen({this.learningContext, super.key});

  /// Set when Kawuri is opened from the Learn tab: the course, unit, lesson
  /// and word the learner was on, offered as ready-made requests.
  final KawuriLearningContext? learningContext;

  @override
  ConsumerState<KawuriScreen> createState() => _KawuriScreenState();
}

class _KawuriScreenState extends ConsumerState<KawuriScreen>
    with WidgetsBindingObserver {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _inputFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ref.listenManual(kawuriControllerProvider.select((s) => s.draft), (
      _,
      draft,
    ) {
      if (_input.text != draft) {
        _input.value = TextEditingValue(
          text: draft,
          selection: TextSelection.collapsed(offset: draft.length),
        );
      }
    }, fireImmediately: true);
    _input.addListener(
      () =>
          ref.read(kawuriControllerProvider.notifier).updateDraft(_input.text),
    );
    if (widget.learningContext != null) {
      // Opened from a lesson: the learning card lives on the home view, so an
      // unrelated conversation left open is put away into history first.
      ref.listenManual(kawuriControllerProvider.select((s) => s.restored), (
        _,
        restored,
      ) {
        if (!restored || _learningPrepared) return;
        _learningPrepared = true;
        Future.microtask(() {
          if (!mounted) return;
          final state = ref.read(kawuriControllerProvider);
          if (!state.isEmpty && !state.thinking) {
            unawaited(
              ref.read(kawuriControllerProvider.notifier).startNewConversation(),
            );
          }
        });
      }, fireImmediately: true);
    }
  }

  var _learningPrepared = false;

  /// One of the Learn tab's ready-made requests, sent with its grounding.
  Future<void> _learningAction(KawuriLearningAction action) async {
    final learning = widget.learningContext;
    if (learning == null) return;
    ref
        .read(kawuriControllerProvider.notifier)
        .configure(
          action.mode,
          draft: action.promptFor(learning),
          options: learning.toOptions(),
        );
    await _send(action.promptFor(learning));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _input.dispose();
    _scroll.dispose();
    _inputFocus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(ref.read(kawuriControllerProvider.notifier).flush());
    }
  }

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    final state = ref.read(kawuriControllerProvider);
    final attachmentOnly =
        state.mode == KawuriTaskType.mediaAnalysis && state.attachment != null;
    if ((text.isEmpty && !attachmentOnly) ||
        state.thinking ||
        !state.restored ||
        !state.mode.available ||
        !state.mode.conversational) {
      return;
    }
    _input.clear();
    HapticFeedback.lightImpact();
    _scrollToLatest();
    await ref.read(kawuriControllerProvider.notifier).send(text);
  }

  /// The list is reversed, so "latest" is offset zero.
  void _scrollToLatest() {
    if (!_scroll.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        0,
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  KawuriCapabilities get _caps =>
      ref.read(kawuriCapabilitiesProvider).value ?? KawuriCapabilities.none;

  Widget _build(BuildContext context) {
    final state = ref.watch(kawuriControllerProvider);
    final caps =
        ref.watch(kawuriCapabilitiesProvider).value ?? KawuriCapabilities.none;
    final pinNotice =
        MediaQuery.viewInsetsOf(context).bottom == 0 &&
        MediaQuery.textScalerOf(context).scale(1) <= 1.3 &&
        MediaQuery.sizeOf(context).height >= 600;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: context.brand.nightGround,
        resizeToAvoidBottomInset: true,
        body: DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              radius: 1.35,
              center: const Alignment(0, -0.55),
              colors: [context.brand.nightGlow, context.brand.nightGround, const Color(0xFF05080F)],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              const _AmbientWeave(),
              SafeArea(
                child: Column(
                  children: [
                    _KawuriBar(
                      thinking: state.thinking,
                      historyCount: state.history.length,
                      canStartNew: state.restored,
                      onNew: () => ref
                          .read(kawuriControllerProvider.notifier)
                          .startNewConversation(),
                      onHistory: _openHistory,
                    ),
                    if (!ref.watch(isOnlineProvider))
                      const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 4,
                        ),
                        child: Text(
                          'Offline · Saved history and the on-device guide are available.',
                          style: TextStyle(
                            color: Color(0xFFE7C574),
                            fontSize: 12,
                          ),
                        ),
                      ),
                    Expanded(
                      child: state.isEmpty
                          ? KawuriHome(
                              restored: state.restored,
                              learning: widget.learningContext,
                              onLearningAction: _learningAction,
                              showNotice: !pinNotice,
                              capabilities: caps,
                              mode: state.mode,
                              onMode: _selectMode,
                              onPrompt: (mode, prompt) {
                                ref
                                    .read(kawuriControllerProvider.notifier)
                                    .configure(mode, draft: prompt);
                                _inputFocus.requestFocus();
                              },
                              onLibrary: _openLibrary,
                            )
                          : _Conversation(
                              state: state,
                              showNotice: !pinNotice,
                              controller: _scroll,
                              onRetry: () => ref
                                  .read(kawuriControllerProvider.notifier)
                                  .retryLast(),
                            ),
                    ),
                    if (pinNotice)
                      const Padding(
                        padding: EdgeInsets.fromLTRB(12, 4, 12, 4),
                        child: KawuriAccuracyNotice(),
                      ),
                    if (state.storageError case final error?)
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          error,
                          style: const TextStyle(color: Colors.amber),
                        ),
                      ),
                    KawuriComposer(
                      controller: _input,
                      focusNode: _inputFocus,
                      busy: state.thinking,
                      onSend: _send,
                      mode: state.mode,
                      onStop: () =>
                          ref.read(kawuriControllerProvider.notifier).stop(),
                      onTools: _openTools,
                      onConfigure: () => _selectMode(state.mode),
                      onUnavailable: (capability) => _unavailable(
                        _capabilityTitle(capability),
                        capability,
                      ),
                      capabilities: caps,
                      attachment: state.attachment,
                      onAttach: _attach,
                      onCamera: _capturePhoto,
                      onMic: _voice,
                      onRemoveAttachment: () => ref
                          .read(kawuriControllerProvider.notifier)
                          .clearAttachment(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _capabilityTitle(String capability) => switch (capability) {
    'imageGeneration' => 'Create image',
    'videoGeneration' => 'Create video',
    'speechToText' => 'Voice input',
    'mediaAnalysis' => 'Analyse media',
    _ => capability,
  };

  /// Explains why a tool is off, in the server's terms, without opening a
  /// flow that has nothing behind it.
  void _unavailable(String title, [String? capability]) {
    final caps = _caps;
    final tag = capability == null
        ? 'Coming soon'
        : caps.unavailableTag(capability);
    showGlassPopup<void>(
      context: context,
      title: '$title · ${tag ?? 'Unavailable'}',
      builder: (_) => Text(
        (capability == null ? null : caps.unavailableMessage(capability)) ?? 'This capability is not available in Kawuri yet. You can keep chatting or develop your idea as a story.',
      ),
    );
  }

  /// Picks an image, video or audio file for Kawuri to analyse.
  Future<void> _attach() async {
    if (!_caps.mediaAnalysis) {
      _unavailable('Analyse media', 'mediaAnalysis');
      return;
    }
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const [
          'jpg',
          'jpeg',
          'png',
          'webp',
          'heic',
          'heif',
          'mp4',
          'mov',
          'webm',
          '3gp',
          'm4a',
          'aac',
          'mp3',
          'wav',
          'ogg',
          'flac',
        ],
      );
      final picked = result?.files.singleOrNull;
      if (picked?.path == null) return;
      await _useAttachment(picked!.path!, picked.name);
    } on Object {
      if (mounted) showGlassToast(context, 'That file could not be opened.');
    }
  }

  Future<void> _capturePhoto() async {
    if (!_caps.mediaAnalysis) {
      _unavailable('Analyse media', 'mediaAnalysis');
      return;
    }
    try {
      final photo = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: 2400,
        maxHeight: 2400,
        imageQuality: 88,
      );
      if (photo == null) return;
      await _useAttachment(photo.path, photo.name);
    } on Object {
      if (mounted) showGlassToast(context, 'The camera could not be opened.');
    }
  }

  Future<void> _useAttachment(String path, String name) async {
    final mimeType = kawuriMimeTypeFor(path);
    if (mimeType == null) {
      if (mounted) {
        showGlassToast(context, 'Kawuri can analyse images, video and audio.');
      }
      return;
    }
    final size = await File(path).length();
    final kind = mimeType.split('/').first;
    final limit = _caps.analysisBytes[kind] ?? 0;
    if (limit > 0 && size > limit) {
      if (mounted) {
        showGlassToast(
          context,
          'That file is larger than ${limit ~/ (1024 * 1024)} MB.',
        );
      }
      return;
    }
    ref
        .read(kawuriControllerProvider.notifier)
        .attach(
          KawuriAttachment(
            path: path,
            name: name,
            mimeType: mimeType,
            sizeBytes: size,
          ),
        );
    _inputFocus.requestFocus();
  }

  /// English voice input. The transcript lands in the composer to be edited;
  /// nothing is sent until the member sends it.
  Future<void> _voice() async {
    if (!_caps.speechToText) {
      _unavailable('Voice input', 'speechToText');
      return;
    }
    final transcript = await showKawuriVoiceInput(context);
    if (transcript == null || !mounted) return;
    final existing = _input.text.trimRight();
    final text = existing.isEmpty
        ? transcript.text
        : '$existing ${transcript.text}';
    _input.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
    _inputFocus.requestFocus();
    if (transcript.unclearSegments.isNotEmpty) {
      showGlassToast(
        context,
        'Some words were unclear and are marked [unclear]. Check them before sending.',
      );
    }
  }

  void _openTools() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .65,
          child: ListView(
            children: [
              ListTile(
                leading: const Icon(Icons.workspace_premium_outlined),
                title: const Text('Membership'),
                subtitle: const Text('View your plan and Kawuri allowance'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.of(this.context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const MembershipScreen(),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.collections_outlined),
                title: const Text('Your creations'),
                subtitle: const Text('Images, videos and analyses'),
                onTap: () {
                  Navigator.pop(context);
                  _openLibrary();
                },
              ),
              for (final type in kawuriCapabilities)
                ListTile(
                  leading: Icon(capabilityIcon(type)),
                  title: Text(type.label),
                  subtitle: switch (kawuriUnavailableTag(type, _caps)) {
                    final tag? => Text(tag),
                    null => null,
                  },
                  onTap: () {
                    Navigator.pop(context);
                    _selectMode(type);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _selectMode(KawuriTaskType type) {
    final caps = _caps;
    if (!type.offeredBy(
      (capability) => caps.unavailableMessage(capability) == null,
    )) {
      _unavailable(type.label, type.serverCapability);
      return;
    }
    if (type == KawuriTaskType.imageGeneration ||
        type == KawuriTaskType.videoGeneration) {
      // A creation is a lasting thing with its own screen, not a reply.
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => KawuriCreateScreen(
            kind: type == KawuriTaskType.videoGeneration
                ? KawuriCreateKind.video
                : KawuriCreateKind.image,
            draft: KawuriCreateDraft(prompt: _input.text.trim()),
            conversationId: ref.read(kawuriControllerProvider).conversationId,
          ),
        ),
      );
      return;
    }
    ref.read(kawuriControllerProvider.notifier).configure(type);
    if (type != KawuriTaskType.translation &&
        type != KawuriTaskType.languagePractice &&
        type != KawuriTaskType.mediaAnalysis) {
      return;
    }
    final options = Map<String, String>.of(
      ref.read(kawuriControllerProvider).options,
    );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, update) {
          Widget choice(String key, String label, List<String> values) =>
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: DropdownButtonFormField<String>(
                  initialValue: options[key] ?? values.first,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: label),
                  items: [
                    for (final value in values)
                      DropdownMenuItem(value: value, child: Text(value)),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    update(() => options[key] = value);
                    ref
                        .read(kawuriControllerProvider.notifier)
                        .configure(type, options: Map.of(options));
                  },
                ),
              );
          return SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                20,
                20,
                20,
                20 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    type.label,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  if (type == KawuriTaskType.translation)
                    choice('direction', 'Language direction', [
                      'English → Kasem',
                      'Kasem → English',
                    ])
                  else if (type == KawuriTaskType.mediaAnalysis) ...[
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: DropdownButtonFormField<String>(
                        initialValue: options['intention'] ?? 'describe',
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'What should Kawuri do?',
                        ),
                        items: [
                          for (final entry in kawuriAnalysisIntentions.entries)
                            DropdownMenuItem(
                              value: entry.key,
                              child: Text(entry.value),
                            ),
                        ],
                        onChanged: (value) {
                          if (value == null) return;
                          update(() => options['intention'] = value);
                          ref
                              .read(kawuriControllerProvider.notifier)
                              .configure(type, options: Map.of(options));
                        },
                      ),
                    ),
                    const Text(
                      'Attach an image, video or audio file with + or the camera, then ask a question if you have one. Follow-up questions continue the same analysis. Kawuri separates what it sees from what it guesses, and cultural meaning always needs the community.',
                    ),
                    const SizedBox(height: 16),
                  ] else ...[
                    const Text(
                      'Language: Kasem · Published examples are the record.',
                    ),
                    const SizedBox(height: 16),
                    choice('level', 'Level', [
                      'Beginner',
                      'Intermediate',
                      'Advanced',
                    ]),
                    choice('practice', 'Practice type', [
                      'Guided conversation',
                      'Vocabulary',
                      'Role-play',
                      'Explain a correction',
                    ]),
                    const Text(
                      'Use your message to choose a topic. Nothing is saved to Learn automatically.',
                    ),
                  ],
                  FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _openLibrary() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const KawuriLibraryScreen()),
    );
  }

  Future<void> _openHistory() async {
    final sessions = ref.read(kawuriControllerProvider).history;
    if (sessions.isEmpty) {
      showGlassToast(
        context,
        'Past conversations appear here once you start one.',
      );
      return;
    }

    final chosen = await showGlassPopup<KawuriSession>(
      context: context,
      title: 'Past conversations',
      // The list scrolls itself, so the card must not wrap it in a second
      // scroll view.
      scrollable: false,
      builder: (popupContext) => _HistoryList(
        sessions: sessions,
        onDelete: (session) =>
            ref.read(kawuriControllerProvider.notifier).deleteSession(session),
      ),
    );
    if (chosen == null) return;
    await ref.read(kawuriControllerProvider.notifier).openSession(chosen);
    _scrollToLatest();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Top bar
// ═══════════════════════════════════════════════════════════════════════════

class _KawuriBar extends StatelessWidget {
  const _KawuriBar({
    required this.thinking,
    required this.historyCount,
    required this.canStartNew,
    required this.onNew,
    required this.onHistory,
  });

  final bool thinking;
  final int historyCount;
  final bool canStartNew;
  final VoidCallback onNew;
  final VoidCallback onHistory;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 6, 10, 4),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Back',
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
        ),
        const KawuriOrb(size: 34),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Kawuri',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.3,
                ),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: Text(
                  thinking ? 'Thinking…' : 'Ask · Create · Learn',
                  key: ValueKey(thinking),
                  style: TextStyle(
                    color: thinking
                        ? context.brand.highlight
                        : Colors.white.withValues(alpha: 0.55),
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
            ],
          ),
        ),
        _BarAction(
          icon: Icons.history_rounded,
          tooltip: 'Past conversations',
          badge: historyCount,
          onTap: onHistory,
        ),
        const SizedBox(width: 6),
        _BarAction(
          icon: Icons.add_comment_outlined,
          tooltip: 'New conversation',
          enabled: canStartNew,
          onTap: onNew,
        ),
      ],
    ),
  );
}

class _BarAction extends StatelessWidget {
  const _BarAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.badge = 0,
    this.enabled = true,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final int badge;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: Semantics(
      button: true,
      label: tooltip,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: enabled ? 0.09 : 0.04),
            border: Border.all(
              color: Colors.white.withValues(alpha: enabled ? 0.18 : 0.07),
            ),
          ),
          child: Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Icon(
                icon,
                size: 18,
                color: Colors.white.withValues(alpha: enabled ? 0.92 : 0.35),
              ),
              if (badge > 0)
                Positioned(
                  right: 4,
                  top: 4,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: context.brand.highlight,
                      shape: BoxShape.circle,
                    ),
                    child: const SizedBox(width: 7, height: 7),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The orb — a small, always-alive Kawuri mark
// ═══════════════════════════════════════════════════════════════════════════

/// Kawuri's face: a slow-turning ring with the ✣ motif at its centre.
///
/// Shared with the Learn tab's floating button so the same mark that invites
/// you in is the one that greets you.
class KawuriOrb extends StatefulWidget {
  const KawuriOrb({this.size = 34, this.glow = true, super.key});

  final double size;
  final bool glow;

  @override
  State<KawuriOrb> createState() => _KawuriOrbState();
}

class _KawuriOrbState extends State<KawuriOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 9),
  )..repeat();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: AnimatedBuilder(
      animation: _controller,
      builder: (context, child) => CustomPaint(
        painter: _OrbitPainter(
          progress: _controller.value,
          glow: widget.glow,
          brand: context.brand,
        ),
        size: Size.square(widget.size),
        child: child,
      ),
      child: SizedBox.square(
        dimension: widget.size,
        child: Center(
          child: Text(
            '✣',
            style: TextStyle(
              color: context.brand.highlight,
              fontSize: widget.size * 0.42,
              fontFamilyFallback: const [
                'Noto Sans Symbols',
                'Noto Sans Symbols 2',
              ],
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
        ),
      ),
    ),
  );
}

class _OrbitPainter extends CustomPainter {
  _OrbitPainter({
    required this.progress,
    required this.glow,
    required this.brand,
  });

  final double progress;
  final bool glow;

  /// Read once by the widget and handed over: a painter has no context.
  final BrandPalette brand;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = size.center(Offset.zero);
    final radius = size.width / 2;

    if (glow) {
      canvas.drawCircle(
        centre,
        radius,
        Paint()
          ..shader = RadialGradient(
            colors: [
              brand.heroLit.withValues(alpha: 0.85),
              brand.heroMid.withValues(alpha: 0.95),
            ],
          ).createShader(Rect.fromCircle(center: centre, radius: radius)),
      );
    }

    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.035
      ..strokeCap = StrokeCap.round
      ..color = brand.highlight.withValues(alpha: 0.75);

    // Two arcs turning against each other read as "alive" far more cheaply
    // than a spinner, and hold up at 34px as well as at 130px.
    const sweep = math.pi * 0.75;
    canvas.drawArc(
      Rect.fromCircle(center: centre, radius: radius * 0.9),
      progress * 2 * math.pi,
      sweep,
      false,
      ring,
    );
    canvas.drawArc(
      Rect.fromCircle(center: centre, radius: radius * 0.68),
      -progress * 2.4 * math.pi,
      sweep * 0.8,
      false,
      ring
        ..color = brand.accentFill.withValues(alpha: 0.7)
        ..strokeWidth = size.width * 0.028,
    );
  }

  @override
  bool shouldRepaint(_OrbitPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.glow != glow ||
      oldDelegate.brand != brand;
}

// ═══════════════════════════════════════════════════════════════════════════
// Welcome
// ═══════════════════════════════════════════════════════════════════════════

class _Conversation extends StatelessWidget {
  const _Conversation({
    required this.state,
    required this.controller,
    required this.onRetry,
    required this.showNotice,
  });

  final KawuriState state;
  final ScrollController controller;
  final VoidCallback onRetry;
  final bool showNotice;

  @override
  Widget build(BuildContext context) {
    // Reversed so new turns appear at the bottom without measuring anything,
    // and so the keyboard opening never scrolls the thread away.
    final rows = <Widget>[
      if (showNotice) const KawuriAccuracyNotice(),
      if (state.thinking) const _ThinkingBubble(),
      for (final entry in state.messages.asMap().entries.toList().reversed)
        _MessageBubble(
          message: entry.value,
          // The turn that produced this answer. Resolved here rather than in
          // the bubble because this is the only place that can see the thread:
          // a bubble knows what it says and nothing about what was asked, and
          // a correction with no question attached is one a reviewer cannot
          // judge.
          question: entry.value.isYou
              ? ''
              : _questionBefore(state.messages, entry.key),
          onRetry:
              !state.thinking &&
                  entry.value == state.messages.last &&
                  !entry.value.isYou
              ? onRetry
              : null,
        ),
    ];

    return ListView.separated(
      controller: controller,
      reverse: true,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      itemCount: rows.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) => rows[index],
    );
  }
}

/// The ground both speakers' turns are drawn on.
///
/// One gradient rather than two surfaces. Kawuri's answers used to sit on a
/// near-white card, which is unreadable here: this screen is always the night
/// theme, so the palette ink inside the bubble resolved to near-white as well
/// and the answer was white on white. Sharing the theme's hero band fixes the
/// contrast outright — every theme holds white text on it — and the highlight
/// rule down the leading edge plus the mirrored corner still say which of the
/// two is speaking.
LinearGradient kawuriBubbleGradient(BrandPalette brand) => LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [brand.heroLit, brand.heroMid],
);

/// Text drawn on [kawuriBubbleGradient]: white, which every theme's hero band
/// is held to carrying.
const kKawuriBubbleInk = Colors.white;

/// The member's turn that an answer at [index] is answering, or `''`.
///
/// Walks backwards rather than assuming the turn before it, because a failed
/// send can leave two of Kawuri's turns adjacent and the question is still the
/// last thing the member actually said.
String _questionBefore(List<KawuriMessage> messages, int index) {
  for (var i = index - 1; i >= 0; i--) {
    if (messages[i].isYou && messages[i].text.trim().isNotEmpty) {
      return messages[i].text.trim();
    }
  }
  return '';
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    this.question = '',
    this.onRetry,
  });

  final KawuriMessage message;

  /// What was asked. Empty on the member's own turns and on an answer with no
  /// question before it, both of which are cases with nothing to rate.
  final String question;

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final isYou = message.isYou;
    return Align(
      alignment: isYou ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.86,
        ),
        child: Column(
          crossAxisAlignment: isYou
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: [
            if (isYou && message.attachment != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.attach_file_rounded,
                      size: 14,
                      color: context.brand.nightAccent,
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        message.attachment!.name,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: context.brand.nightAccent, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            GestureDetector(
              onLongPress: () => _copy(context),
              child: isYou ? _yourBubble(context) : _kawuriBubble(context),
            ),
            if (!isYou && message.taskId != null && message.analysis != null)
              TextButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        KawuriCreationScreen(taskId: message.taskId!),
                  ),
                ),
                icon: const Icon(Icons.open_in_new_rounded, size: 16),
                label: const Text('Open analysis'),
              ),
            if (!isYou && message.sources.isNotEmpty)
              for (final source in message.sources)
                KawuriTranslationCard(source: source),
            if (!isYou &&
                !message.failed &&
                !message.fromOfflineGuide &&
                message.sources.isEmpty &&
                message.analysis == null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'AI guidance · Verify cultural and language claims with the dictionary or community.',
                  style: TextStyle(color: context.brand.mutedInk, fontSize: 11),
                ),
              ),
            if (!isYou)
              Wrap(
                children: [
                  IconButton(
                    tooltip: 'Copy response',
                    onPressed: () => _copy(context),
                    icon: const Icon(Icons.copy_outlined, size: 18),
                  ),
                  IconButton(
                    tooltip: 'Share response',
                    onPressed: () => Share.share(
                      'Kawuri · AI-assisted response\n\n${message.text}\n\n$kawuriNotice',
                    ),
                    icon: const Icon(Icons.ios_share_rounded, size: 18),
                  ),
                ],
              ),
            if (!isYou &&
                !message.failed &&
                !message.fromOfflineGuide &&
                (message.taskType == KawuriTaskType.contributionHelp ||
                    message.taskType == KawuriTaskType.storyHelp))
              TextButton.icon(
                onPressed: () => _contribution(context),
                icon: const Icon(Icons.edit_note_rounded),
                label: const Text('Use in contribution'),
              ),
            if (!isYou &&
                !message.fromOfflineGuide &&
                !message.failed &&
                question.isNotEmpty)
              TextButton.icon(
                onPressed: () => showGlassPopup<void>(
                  context: context,
                  title: 'Report response',
                  builder: (_) => KawuriReportForm(
                    question: question,
                    answer: message.text,
                  ),
                ),
                icon: const Icon(Icons.flag_outlined, size: 16),
                label: const Text('Report response'),
              ),
            if (message.incomplete)
              const Padding(
                padding: EdgeInsets.all(8),
                child: Text(
                  'This response reached its output limit. Ask “Continue response” to continue from the saved text.',
                  style: TextStyle(color: Colors.amber),
                ),
              ),
            if (message.fromOfflineGuide) ...[
              const SizedBox(height: 6),
              const _OfflineTag(),
            ],
            // Only on a real answer. The on-device guide is a fixed script and
            // rating it would collect an opinion about a fallback rather than
            // about the model, and a streaming turn is not finished being
            // wrong yet.
            if (!isYou &&
                !message.isStreaming &&
                !message.failed &&
                !message.fromOfflineGuide &&
                question.isNotEmpty)
              KawuriFeedbackBar(question: question, answer: message.text),
            if (onRetry != null) ...[
              const SizedBox(height: 6),
              TextButton.icon(
                onPressed: onRetry,
                style: TextButton.styleFrom(
                  foregroundColor: context.brand.onAccentFill,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 32),
                  visualDensity: VisualDensity.compact,
                ),
                icon: const Icon(Icons.refresh_rounded, size: 15),
                label: Text(
                  message.failed ? 'Retry' : 'Regenerate',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _yourBubble(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(15, 12, 15, 12),
    decoration: BoxDecoration(
      gradient: kawuriBubbleGradient(context.brand),
      borderRadius: const BorderRadius.only(
        topLeft: Radius.circular(20),
        topRight: Radius.circular(20),
        bottomLeft: Radius.circular(20),
        bottomRight: Radius.circular(6),
      ),
      border: Border.all(color: context.brand.highlight.withValues(alpha: 0.28)),
    ),
    child: Text(
      message.text,
      style: const TextStyle(
        color: kKawuriBubbleInk,
        fontSize: 14.5,
        height: 1.45,
      ),
    ),
  );

  Widget _kawuriBubble(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(15, 13, 15, 13),
    decoration: BoxDecoration(
      // The same navy ground the member's own turn is drawn on. It used to be
      // near-white, which was legible in daylight and invisible at night: this
      // screen is always the night theme, so the ink inside the bubble was
      // near-white too, and the answer read as white on white.
      gradient: kawuriBubbleGradient(context.brand),
      borderRadius: const BorderRadius.only(
        topLeft: Radius.circular(6),
        topRight: Radius.circular(20),
        bottomLeft: Radius.circular(20),
        bottomRight: Radius.circular(20),
      ),
      // Kawuri's turn keeps the cyan rule down its leading edge, which is what
      // still tells the two speakers apart now that they share a ground.
      border: Border(
        left: BorderSide(color: context.brand.highlight, width: 3),
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.22),
          blurRadius: 18,
          offset: const Offset(0, 8),
        ),
      ],
    ),
    child: message.analysis != null
        ? KawuriAnalysisCard(result: message.analysis!)
        : KawuriText(text: message.text),
  );

  Future<void> _contribution(BuildContext context) async {
    final kind = await showDialog<CollectionKind>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Prepare a contribution draft'),
        children: [
          const Padding(
            padding: EdgeInsets.all(20),
            child: Text(
              'The response becomes an editable working note with AI assistance disclosed. Add your sources, community context and rights before submitting for review.',
            ),
          ),
          for (final kind in [
            CollectionKind.dictionary,
            CollectionKind.literature,
            CollectionKind.music,
            CollectionKind.video,
          ])
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, kind),
              child: Text(kind.label),
            ),
        ],
      ),
    );
    if (kind == null || !context.mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ContributionFormScreen(
          kind: kind,
          initialAiDraft:
              'My request: $question\n\nKawuri working note (verify before use):\n${message.text}',
        ),
      ),
    );
  }

  void _copy(BuildContext context) {
    Clipboard.setData(ClipboardData(text: message.text));
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text('Copied.'),
        ),
      );
  }
}

class _OfflineTag extends StatelessWidget {
  const _OfflineTag();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(9, 4, 11, 4),
    decoration: BoxDecoration(
      color: BrandColors.warning.withValues(alpha: 0.22),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: BrandColors.warning.withValues(alpha: 0.5)),
    ),
    child: const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.cloud_off_rounded, size: 11, color: Colors.white),
        SizedBox(width: 6),
        Text(
          'Answered from what is on your phone',
          style: TextStyle(
            color: Colors.white,
            fontSize: 9.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

/// Renders Kawuri's plain-text answers with the light structure the model is
/// asked to use: a bold-looking first line for headings, and hanging indents
/// for bullets and numbered steps.
///
/// A full markdown renderer would be a dependency for four glyphs of syntax;
/// this handles what the system prompt actually asks for and degrades to plain
/// text for everything else.
class KawuriText extends StatelessWidget {
  const KawuriText({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final lines = text.trim().split('\n');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < lines.length; index++)
          _line(context, lines[index], isFirst: index == 0),
      ],
    );
  }

  Widget _line(BuildContext context, String raw, {required bool isFirst}) {
    final line = raw.trimRight();
    if (line.trim().isEmpty) return const SizedBox(height: 9);

    final bullet = RegExp(r'^\s*[•\-\*]\s+(.*)$').firstMatch(line);
    final numbered = RegExp(r'^\s*(\d+)[.)]\s+(.*)$').firstMatch(line);

    if (bullet != null) {
      return _hanging(context, '•', bullet.group(1) ?? '');
    }
    if (numbered != null) {
      return _hanging(
        context,
        '${numbered.group(1)}.',
        numbered.group(2) ?? '',
      );
    }

    // A short opening line with no sentence-ending punctuation is a heading.
    final looksLikeHeading =
        isFirst &&
        line.length <= 60 &&
        !line.endsWith('.') &&
        !line.endsWith('?');

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text(
        _stripEmphasis(line),
        style: TextStyle(
          color: kKawuriBubbleInk,
          fontSize: looksLikeHeading ? 15 : 14.5,
          height: 1.5,
          fontWeight: looksLikeHeading ? FontWeight.w900 : FontWeight.w500,
        ),
      ),
    );
  }

  Widget _hanging(BuildContext context, String marker, String body) =>
      Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 22,
          child: Text(
            marker,
            style: TextStyle(
              // Cyan is the brand's own highlight on navy, the colour the
              // websites light their brand mark with.
              color: context.brand.highlight,
              fontSize: 14,
              height: 1.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        Expanded(
          child: Text(
            _stripEmphasis(body),
            style: const TextStyle(
              color: kKawuriBubbleInk,
              fontSize: 14.5,
              height: 1.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    ),
  );

  /// Drops markdown emphasis markers the model may still emit, so an answer
  /// never shows raw `**` to a reader.
  ///
  /// `replaceAllMapped`, not `replaceAll`: Dart's plain `replaceAll` treats the
  /// replacement as a literal, so a `$1` backreference there would print the
  /// characters `$1` where the emphasised words should be.
  static String _stripEmphasis(String value) => value
      .replaceAll(RegExp(r'^#{1,6}\s*'), '')
      .replaceAllMapped(
        RegExp(r'\*\*(.+?)\*\*'),
        (match) => match.group(1) ?? '',
      )
      .replaceAllMapped(
        RegExp(r'(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)'),
        (match) => match.group(1) ?? '',
      );
}

class _ThinkingBubble extends StatefulWidget {
  const _ThinkingBubble();

  @override
  State<_ThinkingBubble> createState() => _ThinkingBubbleState();
}

class _ThinkingBubbleState extends State<_ThinkingBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Semantics(
      liveRegion: true,
      label: 'Kawuri is thinking',
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 15, 18, 15),
        decoration: BoxDecoration(
          gradient: kawuriBubbleGradient(context.brand),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(6),
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(20),
          ),
          border: Border(
            left: BorderSide(color: context.brand.highlight, width: 3),
          ),
        ),
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) => Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var index = 0; index < 3; index++) ...[
                if (index > 0) const SizedBox(width: 6),
                Opacity(
                  // Staggered thirds, so the dots chase rather than blink
                  // together.
                  opacity:
                      0.28 +
                      0.72 *
                          (0.5 +
                              0.5 *
                                  math.sin(
                                    (_controller.value - index / 3) *
                                        2 *
                                        math.pi,
                                  )),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: context.brand.highlight,
                      shape: BoxShape.circle,
                    ),
                    child: const SizedBox(width: 7, height: 7),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Composer
// ═══════════════════════════════════════════════════════════════════════════

class _HistoryList extends ConsumerStatefulWidget {
  const _HistoryList({required this.sessions, required this.onDelete});
  final List<KawuriSession> sessions;
  final ValueChanged<KawuriSession> onDelete;
  @override
  ConsumerState<_HistoryList> createState() => _HistoryListState();
}

class _HistoryListState extends ConsumerState<_HistoryList> {
  String _search = '';
  int _limit = 20;
  @override
  Widget build(BuildContext context) {
    final sessions = ref
        .watch(kawuriControllerProvider)
        .history
        .where(
          (s) =>
              s.title.toLowerCase().contains(_search) ||
              s.messages.any((m) => m.text.toLowerCase().contains(_search)),
        )
        .toList();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          decoration: const InputDecoration(
            labelText: 'Search history',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (value) => setState(() {
            _search = value.toLowerCase();
            _limit = 20;
          }),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 10),
          child: Text('Private history on this device'),
        ),
        Flexible(
          child: ListView.builder(
            shrinkWrap: true,
            itemCount:
                sessions.length.clamp(0, _limit) +
                (sessions.length > _limit ? 1 : 0),
            itemBuilder: (context, index) {
              if (index == _limit) {
                return TextButton(
                  onPressed: () => setState(() => _limit += 20),
                  child: const Text('Load more'),
                );
              }
              final session = sessions[index];
              final type =
                  session.messages.firstOrNull?.taskType ?? KawuriTaskType.chat;
              return ListTile(
                leading: Icon(capabilityIcon(type)),
                title: Text(
                  session.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  '${type.label} · ${session.messages.length} messages',
                ),
                onTap: () => Navigator.pop(context, session),
                trailing: PopupMenuButton<String>(
                  tooltip: 'Conversation options',
                  onSelected: (action) =>
                      action == 'delete' ? _delete(session) : _rename(session),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'rename', child: Text('Rename')),
                    PopupMenuItem(value: 'delete', child: Text('Delete')),
                  ],
                ),
              );
            },
          ),
        ),
        if (sessions.isEmpty)
          const Padding(
            padding: EdgeInsets.all(20),
            child: Text('No matching conversations.'),
          ),
      ],
    );
  }

  Future<void> _delete(KawuriSession session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete conversation?'),
        content: Text('“${session.title}” will be removed from this device.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) widget.onDelete(session);
  }

  Future<void> _rename(KawuriSession session) async {
    final input = TextEditingController(text: session.title);
    final title = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rename conversation'),
        content: TextField(
          controller: input,
          maxLength: 80,
          decoration: const InputDecoration(labelText: 'Title'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, input.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (title != null && mounted) {
      await ref
          .read(kawuriControllerProvider.notifier)
          .renameSession(session, title);
    }
    // The dialog's closing transition can still read its controller.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    input.dispose();
  }
}

class _AmbientWeave extends StatelessWidget {
  const _AmbientWeave();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Opacity(
      opacity: 0.05,
      child: GridPaper(
        color: context.brand.highlight,
        interval: 54,
        divisions: 2,
        subdivisions: 1,
        child: const SizedBox.expand(),
      ),
    ),
  );
}
