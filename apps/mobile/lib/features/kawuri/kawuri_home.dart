import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_creation_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_library_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';

const kawuriMint = Color(0xFF80F4CF);
const kawuriNotice =
    'Kawuri can be wrong. For the language itself, the dictionary and the community are the record.';
const kawuriCapabilities = [
  KawuriTaskType.chat,
  KawuriTaskType.translation,
  KawuriTaskType.imageGeneration,
  KawuriTaskType.videoGeneration,
  KawuriTaskType.mediaAnalysis,
  KawuriTaskType.languagePractice,
  KawuriTaskType.contributionHelp,
  KawuriTaskType.storyHelp,
];
IconData capabilityIcon(KawuriTaskType type) => switch (type) {
  KawuriTaskType.chat => Icons.chat_bubble_outline_rounded,
  KawuriTaskType.translation => Icons.translate_rounded,
  KawuriTaskType.imageGeneration ||
  KawuriTaskType.imageEdit => Icons.auto_awesome_outlined,
  KawuriTaskType.videoGeneration => Icons.videocam_outlined,
  KawuriTaskType.mediaAnalysis => Icons.image_search_rounded,
  KawuriTaskType.languagePractice ||
  KawuriTaskType.pronunciation => Icons.record_voice_over_outlined,
  KawuriTaskType.contributionHelp => Icons.volunteer_activism_outlined,
  _ => Icons.auto_stories_outlined,
};

/// The tag a carousel tile or tools row carries when its task cannot be used
/// right now, or null when it can.
String? kawuriUnavailableTag(KawuriTaskType type, KawuriCapabilities caps) {
  if (!type.available) return 'Coming soon';
  final capability = type.serverCapability;
  return capability == null ? null : caps.unavailableTag(capability);
}

class KawuriHome extends StatelessWidget {
  const KawuriHome({
    required this.restored,
    this.showNotice = false,
    required this.mode,
    required this.onMode,
    required this.onPrompt,
    required this.onLibrary,
    this.capabilities = KawuriCapabilities.none,
    super.key,
  });
  final bool restored;
  final bool showNotice;
  final KawuriCapabilities capabilities;
  final KawuriTaskType mode;
  final ValueChanged<KawuriTaskType> onMode;
  final void Function(KawuriTaskType, String) onPrompt;
  final VoidCallback onLibrary;
  @override
  Widget build(BuildContext context) {
    if (!restored) return const Center(child: CircularProgressIndicator());
    final scale = MediaQuery.textScalerOf(context).scale(1);
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 16),
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            'What shall we create or discover?',
            style: TextStyle(
              fontSize: 25,
              height: 1.15,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 10, 20, 24),
          child: Text(
            'Ask about culture, practise a language, or bring an idea to life.',
            style: TextStyle(
              color: Color(0xFFABC8BE),
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = ((constraints.maxWidth - 28) / 4.35).clamp(
              70.0,
              110.0,
            );
            return SizedBox(
              height: 136 * scale.clamp(1.0, 2.3),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: kawuriCapabilities.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final type = kawuriCapabilities[index];
                  final selected = mode == type;
                  final tag = kawuriUnavailableTag(type, capabilities);
                  return Semantics(
                    button: true,
                    selected: selected,
                    label: '${type.label}${tag == null ? '' : ', $tag'}',
                    child: SizedBox(
                      width: width,
                      child: Material(
                        color: selected
                            ? const Color(0xFF124838)
                            : const Color(0xFF102F27),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(
                            color: selected
                                ? kawuriMint
                                : const Color(0xFF3C5C51),
                            width: selected ? 1.5 : 1,
                          ),
                        ),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: () => onMode(type),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 10,
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  capabilityIcon(type),
                                  size: 27,
                                  color: kawuriMint,
                                ),
                                const SizedBox(height: 9),
                                Text(
                                  type.label,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    height: 1.25,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                                if (tag != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 5),
                                    child: Text(
                                      tag,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontSize: 9,
                                        color: Color(0xFFE7C574),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Text(
            'Try something',
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ),
        SizedBox(
          height: 132 * scale.clamp(1.0, 2.3),
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              _Suggestion(
                title: 'Explain the meaning of this festival',
                icon: Icons.festival_outlined,
                onTap: () => onPrompt(
                  KawuriTaskType.chat,
                  'Explain the meaning of this festival: ',
                ),
              ),
              _Suggestion(
                title: 'Develop a folktale into a storyboard',
                icon: Icons.auto_stories_outlined,
                onTap: () => onPrompt(
                  KawuriTaskType.storyHelp,
                  'Help me develop this folktale into a short-video storyboard: ',
                ),
              ),
              _Suggestion(
                title: 'Help me record a word from an elder',
                icon: Icons.record_voice_over_outlined,
                onTap: () => onPrompt(
                  KawuriTaskType.contributionHelp,
                  'Help me record a word from an elder with their consent: ',
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 12, 0),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Recent',
                  style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
              TextButton(
                onPressed: onLibrary,
                child: const Text(
                  'See all',
                  style: TextStyle(color: kawuriMint, fontFamily: 'Noto Sans'),
                ),
              ),
            ],
          ),
        ),
        const KawuriRecentCreations(),
        if (showNotice)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: KawuriAccuracyNotice(),
          ),
      ],
    );
  }
}

class _Suggestion extends StatelessWidget {
  const _Suggestion({
    required this.title,
    required this.icon,
    required this.onTap,
  });
  final String title;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Container(
    width: 168,
    margin: const EdgeInsets.only(right: 10),
    child: Material(
      color: const Color(0xFF15372D),
      borderRadius: BorderRadius.circular(15),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF3A6250), Color(0xFF14372E)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Icon(icon, color: const Color(0xFFE5C678), size: 38),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class KawuriAccuracyNotice extends StatelessWidget {
  const KawuriAccuracyNotice({super.key});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: const Color(0xFF172924),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: const Color(0xFF3D5149)),
    ),
    child: const Row(
      children: [
        Icon(Icons.menu_book_outlined, color: Color(0xFFE7C574), size: 24),
        SizedBox(width: 12),
        Expanded(
          child: Text(
            kawuriNotice,
            style: TextStyle(
              fontSize: 11.5,
              height: 1.45,
              color: Color(0xFFB8C9C2),
            ),
          ),
        ),
      ],
    ),
  );
}

class KawuriComposer extends StatelessWidget {
  const KawuriComposer({
    required this.controller,
    required this.focusNode,
    required this.busy,
    required this.mode,
    required this.onSend,
    required this.onStop,
    required this.onTools,
    required this.onUnavailable,
    required this.onConfigure,
    this.capabilities = KawuriCapabilities.none,
    this.attachment,
    this.onAttach,
    this.onCamera,
    this.onMic,
    this.onRemoveAttachment,
    super.key,
  });
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool busy;
  final KawuriTaskType mode;
  final VoidCallback onSend;
  final VoidCallback onStop;
  final VoidCallback onTools;
  final VoidCallback onConfigure;

  /// Called with the capability name (`mediaAnalysis`, `speechToText`) of a
  /// control whose tool is not available right now.
  final ValueChanged<String> onUnavailable;
  final KawuriCapabilities capabilities;
  final KawuriAttachment? attachment;
  final VoidCallback? onAttach;
  final VoidCallback? onCamera;
  final VoidCallback? onMic;
  final VoidCallback? onRemoveAttachment;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 5, 12, 8),
    child: Container(
      padding: const EdgeInsets.fromLTRB(12, 4, 8, 6),
      decoration: BoxDecoration(
        color: const Color(0xFF20302B),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: const Color(0xFF53645C)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (mode != KawuriTaskType.chat)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: onConfigure,
                icon: Icon(capabilityIcon(mode), size: 16),
                label: Text(
                  '${mode.label} · ${kawuriUnavailableTag(mode, capabilities) ?? 'Options'}',
                  style: const TextStyle(fontSize: 12, color: kawuriMint),
                ),
              ),
            ),
          if (attachment case final file?)
            _AttachmentChip(attachment: file, onRemove: onRemoveAttachment),
          TextField(
            controller: controller,
            focusNode: focusNode,
            minLines: 1,
            maxLines: 4,
            textInputAction: TextInputAction.newline,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            cursorColor: kawuriMint,
            decoration: const InputDecoration(
              hintText: 'Message Kawuri…',
              hintStyle: TextStyle(color: Color(0xFFA6B8B0)),
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 12),
            ),
          ),
          Row(
            children: [
              IconButton(
                tooltip: capabilities.mediaAnalysis
                    ? 'Attach media to analyse'
                    : 'Attach media · ${capabilities.unavailableTag('mediaAnalysis') ?? 'Unavailable'}',
                onPressed: capabilities.mediaAnalysis && onAttach != null
                    ? onAttach
                    : () => onUnavailable('mediaAnalysis'),
                icon: const Icon(Icons.add_rounded, color: Colors.white),
              ),
              IconButton(
                tooltip: capabilities.mediaAnalysis
                    ? 'Take a photo to analyse'
                    : 'Camera · ${capabilities.unavailableTag('mediaAnalysis') ?? 'Unavailable'}',
                onPressed: capabilities.mediaAnalysis && onCamera != null
                    ? onCamera
                    : () => onUnavailable('mediaAnalysis'),
                icon: const Icon(
                  Icons.photo_camera_outlined,
                  color: Colors.white,
                ),
              ),
              IconButton(
                tooltip: capabilities.speechToText
                    ? 'Voice input · English only'
                    : 'Voice input · ${capabilities.unavailableTag('speechToText') ?? 'Unavailable'}',
                onPressed: capabilities.speechToText && onMic != null
                    ? onMic
                    : () => onUnavailable('speechToText'),
                icon: const Icon(Icons.mic_none_rounded, color: Colors.white),
              ),
              Expanded(
                child: TextButton(
                  onPressed: onTools,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(48, 48),
                  ),
                  child: const Text(
                    'Tools',
                    style: TextStyle(
                      color: kawuriMint,
                      fontFamily: 'Noto Sans',
                    ),
                  ),
                ),
              ),
              ValueListenableBuilder(
                valueListenable: controller,
                builder: (context, value, _) => IconButton.filled(
                  tooltip: busy ? 'Stop waiting' : 'Send to Kawuri',
                  onPressed: busy
                      ? onStop
                      : ((value.text.trim().isNotEmpty ||
                                    (mode == KawuriTaskType.mediaAnalysis &&
                                        attachment != null)) &&
                                mode.available &&
                                mode.conversational
                            ? onSend
                            : null),
                  style: IconButton.styleFrom(
                    backgroundColor: kawuriMint,
                    foregroundColor: const Color(0xFF083729),
                    minimumSize: const Size(48, 48),
                  ),
                  icon: Icon(
                    busy ? Icons.stop_rounded : Icons.arrow_upward_rounded,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _AttachmentChip extends StatelessWidget {
  const _AttachmentChip({required this.attachment, this.onRemove});

  final KawuriAttachment attachment;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 6),
    child: Row(
      children: [
        Icon(
          switch (attachment.kind) {
            'video' => Icons.videocam_outlined,
            'audio' => Icons.graphic_eq_rounded,
            _ => Icons.image_outlined,
          },
          color: kawuriMint,
          size: 20,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            attachment.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
        ),
        IconButton(
          tooltip: 'Remove attachment',
          onPressed: onRemove,
          icon: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
        ),
      ],
    ),
  );
}

/// The two newest creations, with their real status and — only when Vertex
/// reported one — their real progress.
class KawuriRecentCreations extends ConsumerWidget {
  const KawuriRecentCreations({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(kawuriMediaRepositoryProvider)?.uid != null;
    final recent = ref.watch(kawuriRecentCreationsProvider);
    const hint = TextStyle(
      fontSize: 13,
      height: 1.45,
      color: Color(0xFFABC8BE),
    );
    if (!signedIn) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(20, 2, 20, 16),
        child: Text(
          'Sign in to keep the images, videos and media analyses you make with Kawuri.',
          style: hint,
        ),
      );
    }
    final items = recent.value ?? const <KawuriCreation>[];
    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 2, 20, 16),
        child: Text(
          recent.isLoading
              ? 'Loading your creations…'
              : 'Your images, videos and media analyses will appear here.',
          style: hint,
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
      child: Column(
        children: [
          for (final creation in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RecentRow(creation: creation),
            ),
        ],
      ),
    );
  }
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({required this.creation});

  final KawuriCreation creation;

  @override
  Widget build(BuildContext context) => Material(
    color: const Color(0xFF102F27),
    borderRadius: BorderRadius.circular(14),
    child: InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) =>
              KawuriCreationScreen(taskId: creation.id, initial: creation),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(kawuriCreationIcon(creation), color: kawuriMint),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    creation.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    creation.subtitle,
                    style: const TextStyle(
                      color: Color(0xFFABC8BE),
                      fontSize: 12.5,
                    ),
                  ),
                  if (creation.status.inFlight) ...[
                    const SizedBox(height: 6),
                    LinearProgressIndicator(
                      value: creation.progress == null
                          ? null
                          : creation.progress! / 100,
                      minHeight: 3,
                    ),
                  ],
                ],
              ),
            ),
            if (creation.progressLabel case final progress?)
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Text(
                  progress,
                  style: const TextStyle(color: kawuriMint),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
