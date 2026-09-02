import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/my_submissions_screen.dart';

/// The moment a contribution lands.
///
/// This used to be a `showGlassPopup` — a small pane over the form the member
/// had just filled in, with the form's own controls still showing round the
/// edges. A dialog is what the app says when it needs something; this is the
/// app saying thank you, and the two should not look the same. Somebody who
/// has just handed over a song their grandmother sang gets the whole screen
/// for a second.
///
/// Popped with `true` from Done, and with nothing at all from anywhere else —
/// "See my submissions" replaces this route rather than returning through it,
/// so the form underneath must not read a dismissal into that.
class ContributionReceivedScreen extends StatelessWidget {
  const ContributionReceivedScreen({required this.kind, super.key});

  final CollectionKind kind;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Scaffold(
      backgroundColor: brand.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 32, 28, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: ContributionTick()),
                  const SizedBox(height: 30),
                  Text(
                    'Submission received',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '$_what is in the review queue. A reviewer reads every '
                    'submission before anything is published, and you can '
                    'follow it in Your submissions.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: brand.mutedInk, height: 1.55),
                  ),
                  const SizedBox(height: 30),
                  FilledButton.icon(
                    onPressed: () => Navigator.of(context).pushReplacement(
                      MaterialPageRoute<void>(
                        builder: (context) => const MySubmissionsScreen(),
                      ),
                    ),
                    icon: const Icon(Icons.outbox_rounded),
                    label: const Text('See my submissions'),
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Named rather than reusing `contributionLabel`, which is written to sit
  /// inside a sentence as "a song or recording" and would read here as
  /// "Your a song or recording is in the review queue".
  String get _what => switch (kind) {
    CollectionKind.music => 'Your song',
    CollectionKind.dictionary => 'Your word',
    CollectionKind.literature => 'Your written work',
    CollectionKind.audiobooks => 'Your narration',
    CollectionKind.video => 'Your film',
  };
}

/// A tick that draws itself, once.
///
/// Implicit rather than an [AnimationController]: there is exactly one run,
/// triggered by the screen existing, and a controller would mean a State, a
/// vsync and a dispose for a single half-second. [TweenAnimationBuilder] plays
/// from its `begin` to its `end` on the first build and then stops — which is
/// also why reduced motion is expressed as a tween that begins at the end
/// rather than as a duration of zero: there is no first frame drawn empty.
class ContributionTick extends StatefulWidget {
  const ContributionTick({this.size = 132, super.key});

  final double size;

  @override
  State<ContributionTick> createState() => _ContributionTickState();
}

class _ContributionTickState extends State<ContributionTick> {
  /// Fired once, when the stroke finishes drawing. A haptic on every rebuild
  /// would buzz through a rotation or a keyboard opening.
  var _tapped = false;

  void _confirm() {
    if (_tapped) return;
    _tapped = true;
    // The one physical note in the whole flow, and it belongs here: the
    // moment the tick closes is the moment the thing is done.
    HapticFeedback.mediumImpact();
  }

  @override
  Widget build(BuildContext context) {
    // `accessibleNavigation` is in here as well as the animation switch
    // because a screen reader moving through this page will not wait for a
    // stroke to finish drawing, and should not have to.
    final still =
        MediaQuery.disableAnimationsOf(context) ||
        MediaQuery.accessibleNavigationOf(context);
    return Semantics(
      label: 'Submission received',
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: still ? 1 : 0, end: 1),
        duration: still ? Duration.zero : const Duration(milliseconds: 820),
        curve: Curves.easeOutCubic,
        onEnd: _confirm,
        builder: (context, value, _) => SizedBox.square(
          dimension: widget.size,
          child: CustomPaint(
            painter: _TickPainter(
              progress: value,
              colour: context.brand.success,
            ),
          ),
        ),
      ),
    );
  }
}

/// Ring, disc, stroke — in that order, and overlapping.
class _TickPainter extends CustomPainter {
  const _TickPainter({required this.progress, required this.colour});

  /// 0 at the first frame, 1 when the tick is closed.
  final double progress;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = size.center(Offset.zero);
    final radius = size.shortestSide / 2;
    final value = progress.clamp(0.0, 1.0);

    // The ring leaves first and fades as it goes: a pulse spreading out from
    // under the disc, not a second circle sitting beside it.
    final ring = Curves.easeOut.transform(value);
    if (ring > 0 && ring < 1) {
      canvas.drawCircle(
        centre,
        radius * (0.68 + 0.32 * ring),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = colour.withValues(alpha: 0.34 * (1 - ring)),
      );
    }

    // The disc arrives on the front half of the run, scaling and fading in.
    final disc = Curves.easeOutBack.transform((value / 0.45).clamp(0.0, 1.0));
    canvas.drawCircle(
      centre,
      radius * 0.72 * disc,
      Paint()..color = colour.withValues(alpha: 0.14 * value.clamp(0.0, 1.0)),
    );
    canvas.drawCircle(
      centre,
      radius * 0.72 * disc,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = colour.withValues(alpha: 0.5 * value),
    );

    // Then the stroke itself, from the back half, extracted a fraction at a
    // time so the line is drawn rather than revealed.
    final drawn = Curves.easeOut.transform(
      ((value - 0.35) / 0.65).clamp(0.0, 1.0),
    );
    if (drawn <= 0) return;

    final tick = Path()
      ..moveTo(centre.dx - radius * 0.30, centre.dy + radius * 0.02)
      ..lineTo(centre.dx - radius * 0.07, centre.dy + radius * 0.25)
      ..lineTo(centre.dx + radius * 0.32, centre.dy - radius * 0.24);

    final pen = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = radius * 0.13
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = colour;

    for (final metric in tick.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * drawn), pen);
    }
  }

  @override
  bool shouldRepaint(_TickPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.colour != colour;
}
