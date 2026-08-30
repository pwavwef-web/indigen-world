import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_controller.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// Kawuri — the Indigen World guide.
///
/// A full-screen conversation over the brand's night palette: heritage green
/// deepening into ink, kente gold as the light. The visual language is
/// deliberately the launch screen's — orbiting rings, cultural glyphs — so
/// Kawuri reads as part of this project rather than a chat window bolted on.
class KawuriScreen extends ConsumerStatefulWidget {
  const KawuriScreen({super.key});

  @override
  ConsumerState<KawuriScreen> createState() => _KawuriScreenState();
}

class _KawuriScreenState extends ConsumerState<KawuriScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _inputFocus = FocusNode();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    _inputFocus.dispose();
    super.dispose();
  }

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty) return;
    _input.clear();
    HapticFeedback.lightImpact();
    _scrollToLatest();
    await ref.read(kawuriControllerProvider.notifier).send(text);
    _scrollToLatest();
  }

  /// The list is reversed, so "latest" is offset zero.
  void _scrollToLatest() {
    if (!_scroll.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        0,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    final state = ref.watch(kawuriControllerProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: const Color(0xFF071D17),
        resizeToAvoidBottomInset: true,
        body: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              radius: 1.35,
              center: Alignment(0, -0.55),
              colors: [Color(0xFF175340), Color(0xFF08221B), Color(0xFF050807)],
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
                      canStartNew: state.messages.isNotEmpty,
                      onNew: () => ref
                          .read(kawuriControllerProvider.notifier)
                          .startNewConversation(),
                      onHistory: _openHistory,
                    ),
                    Expanded(
                      child: state.isEmpty
                          ? _Welcome(restored: state.restored, onPrompt: _send)
                          : _Conversation(
                              state: state,
                              controller: _scroll,
                              onRetry: () => ref
                                  .read(kawuriControllerProvider.notifier)
                                  .retryLast(),
                            ),
                    ),
                    _Composer(
                      controller: _input,
                      focusNode: _inputFocus,
                      busy: state.thinking,
                      onSend: _send,
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
                  thinking ? 'Thinking…' : 'Your guide through Indigen World',
                  key: ValueKey(thinking),
                  style: TextStyle(
                    color: thinking
                        ? BrandColors.kenteGold
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
          width: 38,
          height: 38,
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
                const Positioned(
                  right: 4,
                  top: 4,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: BrandColors.kenteGold,
                      shape: BoxShape.circle,
                    ),
                    child: SizedBox(width: 7, height: 7),
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
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: AnimatedBuilder(
      animation: _controller,
      builder: (context, child) => CustomPaint(
        painter: _OrbitPainter(progress: _controller.value, glow: widget.glow),
        size: Size.square(widget.size),
        child: child,
      ),
      child: SizedBox.square(
        dimension: widget.size,
        child: Center(
          child: Text(
            '✣',
            style: TextStyle(
              color: BrandColors.kenteGold,
              fontSize: widget.size * 0.42,
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
  _OrbitPainter({required this.progress, required this.glow});

  final double progress;
  final bool glow;

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
              BrandColors.savannahGreen.withValues(alpha: 0.85),
              BrandColors.heritageGreen.withValues(alpha: 0.95),
            ],
          ).createShader(Rect.fromCircle(center: centre, radius: radius)),
      );
    }

    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.035
      ..strokeCap = StrokeCap.round
      ..color = BrandColors.kenteGold.withValues(alpha: 0.75);

    // Two arcs turning against each other read as "alive" far more cheaply
    // than a spinner, and hold up at 34px as well as at 130px.
    final sweep = math.pi * 0.75;
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
        ..color = BrandColors.terracotta.withValues(alpha: 0.7)
        ..strokeWidth = size.width * 0.028,
    );
  }

  @override
  bool shouldRepaint(_OrbitPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.glow != glow;
}

// ═══════════════════════════════════════════════════════════════════════════
// Welcome
// ═══════════════════════════════════════════════════════════════════════════

class _Welcome extends StatelessWidget {
  const _Welcome({required this.restored, required this.onPrompt});

  final bool restored;
  final ValueChanged<String> onPrompt;

  @override
  Widget build(BuildContext context) => AnimatedOpacity(
    // Waits for the restore read so a saved chat does not flash the welcome.
    opacity: restored ? 1 : 0,
    duration: const Duration(milliseconds: 260),
    child: ListView(
      padding: const EdgeInsets.fromLTRB(24, 18, 24, 12),
      children: [
        const Center(child: KawuriOrb(size: 118)),
        const SizedBox(height: 26),
        const Text(
          'Ask me anything.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white,
            fontSize: 27,
            height: 1.12,
            letterSpacing: -0.9,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'I am Kawuri. I can walk you through Kasena culture, help you learn, '
          'and show you how to contribute well.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.68),
            fontSize: 13.5,
            height: 1.5,
          ),
        ),
        const SizedBox(height: 26),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          alignment: WrapAlignment.center,
          children: [
            for (final prompt in kawuriPrompts)
              _PromptChip(prompt: prompt, onTap: () => onPrompt(prompt.prompt)),
          ],
        ),
        const SizedBox(height: 24),
        Center(
          child: Text(
            'Kawuri can be wrong. For the language itself, the dictionary and '
            'the community are the record.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.36),
              fontSize: 10.5,
              height: 1.5,
            ),
          ),
        ),
      ],
    ),
  );
}

class _PromptChip extends StatelessWidget {
  const _PromptChip({required this.prompt, required this.onTap});

  final KawuriPrompt prompt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white.withValues(alpha: 0.07),
    borderRadius: BorderRadius.circular(999),
    child: InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(13, 9, 15, 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                prompt.glyph,
                style: const TextStyle(
                  color: BrandColors.kenteGold,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  height: 1,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                prompt.label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
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
// Conversation
// ═══════════════════════════════════════════════════════════════════════════

class _Conversation extends StatelessWidget {
  const _Conversation({
    required this.state,
    required this.controller,
    required this.onRetry,
  });

  final KawuriState state;
  final ScrollController controller;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    // Reversed so new turns appear at the bottom without measuring anything,
    // and so the keyboard opening never scrolls the thread away.
    final rows = <Widget>[
      if (state.thinking) const _ThinkingBubble(),
      for (final message in state.messages.reversed)
        _MessageBubble(
          message: message,
          onRetry: message == state.messages.last && !message.isYou
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
/// and the answer was white on white. Sharing the member's own green fixes the
/// contrast outright, and the gold rule down the leading edge plus the
/// mirrored corner still say which of the two is speaking.
const kKawuriBubbleGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [BrandColors.savannahGreen, BrandColors.heritageGreen],
);

/// Text drawn on [kKawuriBubbleGradient]. Stated rather than read off the
/// palette, because the bubble is one fixed pigment in both themes.
const kKawuriBubbleInk = Color(0xFFF4F7F5);

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, this.onRetry});

  final KawuriMessage message;
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
            GestureDetector(
              onLongPress: () => _copy(context),
              child: isYou ? _yourBubble() : _kawuriBubble(),
            ),
            if (message.fromOfflineGuide) ...[
              const SizedBox(height: 6),
              const _OfflineTag(),
            ],
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
                label: const Text(
                  'Ask again',
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _yourBubble() => Container(
    padding: const EdgeInsets.fromLTRB(15, 12, 15, 12),
    decoration: BoxDecoration(
      gradient: kKawuriBubbleGradient,
      borderRadius: const BorderRadius.only(
        topLeft: Radius.circular(20),
        topRight: Radius.circular(20),
        bottomLeft: Radius.circular(20),
        bottomRight: Radius.circular(6),
      ),
      border: Border.all(color: BrandColors.kenteGold.withValues(alpha: 0.28)),
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

  Widget _kawuriBubble() => Container(
    padding: const EdgeInsets.fromLTRB(15, 13, 15, 13),
    decoration: BoxDecoration(
      // The same green ground the member's own turn is drawn on. It used to be
      // near-white, which was legible in daylight and invisible at night: this
      // screen is always the night theme, so the ink inside the bubble was
      // near-white too, and the answer read as white on white.
      gradient: kKawuriBubbleGradient,
      borderRadius: const BorderRadius.only(
        topLeft: Radius.circular(6),
        topRight: Radius.circular(20),
        bottomLeft: Radius.circular(20),
        bottomRight: Radius.circular(20),
      ),
      // Kawuri's turn keeps the gold rule down its leading edge, which is what
      // still tells the two speakers apart now that they share a ground.
      border: const Border(
        left: BorderSide(color: BrandColors.kenteGold, width: 3),
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.22),
          blurRadius: 18,
          offset: const Offset(0, 8),
        ),
      ],
    ),
    child: KawuriText(text: message.text),
  );

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
      color: BrandColors.terracotta.withValues(alpha: 0.22),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: BrandColors.terracotta.withValues(alpha: 0.5)),
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
          _line(lines[index], isFirst: index == 0),
      ],
    );
  }

  Widget _line(String raw, {required bool isFirst}) {
    final line = raw.trimRight();
    if (line.trim().isEmpty) return const SizedBox(height: 9);

    final bullet = RegExp(r'^\s*[•\-\*]\s+(.*)$').firstMatch(line);
    final numbered = RegExp(r'^\s*(\d+)[.)]\s+(.*)$').firstMatch(line);

    if (bullet != null) {
      return _hanging('•', bullet.group(1) ?? '');
    }
    if (numbered != null) {
      return _hanging('${numbered.group(1)}.', numbered.group(2) ?? '');
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

  Widget _hanging(String marker, String body) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 22,
          child: Text(
            marker,
            style: const TextStyle(
              // Terracotta on deep green is mud on mud. Gold is the brand's
              // own highlight and the one this ground was built for.
              color: BrandColors.kenteGold,
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
        decoration: const BoxDecoration(
          gradient: kKawuriBubbleGradient,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(6),
            topRight: Radius.circular(20),
            bottomLeft: Radius.circular(20),
            bottomRight: Radius.circular(20),
          ),
          border: Border(
            left: BorderSide(color: BrandColors.kenteGold, width: 3),
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
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      color: BrandColors.kenteGold,
                      shape: BoxShape.circle,
                    ),
                    child: SizedBox(width: 7, height: 7),
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

class _Composer extends StatefulWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.busy,
    required this.onSend,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool busy;
  final VoidCallback onSend;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  var _hasText = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_syncHasText);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_syncHasText);
    super.dispose();
  }

  void _syncHasText() {
    final next = widget.controller.text.trim().isNotEmpty;
    if (next != _hasText) setState(() => _hasText = next);
  }

  @override
  Widget build(BuildContext context) {
    final canSend = _hasText && !widget.busy;
    return Padding(
      // The scaffold resizes for the keyboard, so the composer only needs its
      // own resting inset.
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
            ),
            padding: const EdgeInsets.fromLTRB(18, 5, 5, 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: widget.controller,
                    focusNode: widget.focusNode,
                    minLines: 1,
                    maxLines: 5,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => canSend ? widget.onSend() : null,
                    textCapitalization: TextCapitalization.sentences,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14.5,
                      height: 1.4,
                    ),
                    cursorColor: BrandColors.kenteGold,
                    decoration: InputDecoration(
                      isDense: true,
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 13),
                      hintText: 'Ask Kawuri…',
                      hintStyle: TextStyle(
                        color: Colors.white.withValues(alpha: 0.42),
                        fontSize: 14.5,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                _SendButton(
                  enabled: canSend,
                  busy: widget.busy,
                  onTap: widget.onSend,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({
    required this.enabled,
    required this.busy,
    required this.onTap,
  });

  final bool enabled;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    enabled: enabled,
    label: 'Send to Kawuri',
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: enabled
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [BrandColors.kenteGold, BrandColors.terracotta],
              )
            : null,
        color: enabled ? null : Colors.white.withValues(alpha: 0.08),
        boxShadow: enabled
            ? [
                BoxShadow(
                  color: BrandColors.kenteGold.withValues(alpha: 0.4),
                  blurRadius: 16,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? onTap : null,
          child: Center(
            child: busy
                ? const SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white70,
                    ),
                  )
                : Icon(
                    Icons.arrow_upward_rounded,
                    size: 21,
                    color: enabled
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.35),
                  ),
          ),
        ),
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// History
// ═══════════════════════════════════════════════════════════════════════════

/// The past conversations, inside the history popup.
///
/// The rows are ink on plaster rather than the screen's white-on-night: the
/// card they sit on now is cut from the app's light glass, and Kawuri's own
/// night palette would be invisible on it.
class _HistoryList extends StatefulWidget {
  const _HistoryList({required this.sessions, required this.onDelete});

  final List<KawuriSession> sessions;
  final ValueChanged<KawuriSession> onDelete;

  @override
  State<_HistoryList> createState() => _HistoryListState();
}

class _HistoryListState extends State<_HistoryList> {
  late var _sessions = widget.sessions;

  @override
  Widget build(BuildContext context) => ListView.separated(
    // The card gives this a bounded height and its own padding, so the list
    // only has to be as tall as its rows until it runs out of room.
    shrinkWrap: true,
    padding: EdgeInsets.zero,
    itemCount: _sessions.length,
    separatorBuilder: (context, index) => const SizedBox(height: 8),
    itemBuilder: (context, index) {
      final session = _sessions[index];
      return Material(
        color: context.brand.accent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        child: ListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          leading: const Icon(
            Icons.forum_outlined,
            color: BrandColors.terracotta,
            size: 20,
          ),
          title: Text(
            session.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: context.brand.ink,
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
            ),
          ),
          subtitle: Text(
            '${session.messages.length} messages',
            style: TextStyle(color: context.brand.mutedInk, fontSize: 11),
          ),
          trailing: IconButton(
            tooltip: 'Delete',
            onPressed: () {
              widget.onDelete(session);
              setState(
                () => _sessions = _sessions
                    .where((item) => item.id != session.id)
                    .toList(growable: false),
              );
            },
            icon: Icon(
              Icons.delete_outline_rounded,
              color: context.brand.mutedInk,
              size: 19,
            ),
          ),
          onTap: () => Navigator.pop(context, session),
        ),
      );
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Backdrop
// ═══════════════════════════════════════════════════════════════════════════

class _AmbientWeave extends StatelessWidget {
  const _AmbientWeave();

  @override
  Widget build(BuildContext context) => const IgnorePointer(
    child: Opacity(
      opacity: 0.05,
      child: GridPaper(
        color: BrandColors.kenteGold,
        interval: 54,
        divisions: 2,
        subdivisions: 1,
        child: SizedBox.expand(),
      ),
    ),
  );
}
