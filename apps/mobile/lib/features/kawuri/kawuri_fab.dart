import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_learning_context.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';

/// The floating Kawuri button.
///
/// Lives on the Learn tab, where a question is most likely to come up mid-
/// lesson. It arrives a beat after the screen settles rather than competing
/// with it, then breathes gently so it stays findable without ever demanding
/// attention.
class KawuriFab extends StatefulWidget {
  const KawuriFab({this.learningContext, this.showLabel = false, super.key});

  /// Read at the moment of the tap, so Kawuri is told where the learner is
  /// *now* — the lesson they are on, today's word — rather than where they
  /// were when the button was built.
  final KawuriLearningContext Function()? learningContext;

  /// "Kawuri AI" under the orb, as the Learn tab draws it.
  final bool showLabel;

  @override
  State<KawuriFab> createState() => _KawuriFabState();
}

class _KawuriFabState extends State<KawuriFab> with TickerProviderStateMixin {
  late final AnimationController _entry;
  late final AnimationController _breathe;

  @override
  void initState() {
    super.initState();
    _entry = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
    );
    _breathe = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);

    // Let the lesson path draw first; an element that lands after everything
    // else reads as an offer rather than as part of the furniture.
    Future<void>.delayed(const Duration(milliseconds: 420), () {
      if (mounted) _entry.forward();
    });
  }

  @override
  void dispose() {
    _entry.dispose();
    _breathe.dispose();
    super.dispose();
  }

  void _open() {
    HapticFeedback.mediumImpact();
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        transitionDuration: const Duration(milliseconds: 380),
        reverseTransitionDuration: const Duration(milliseconds: 260),
        pageBuilder: (context, animation, secondary) =>
            KawuriScreen(learningContext: widget.learningContext?.call()),
        transitionsBuilder: (context, animation, secondary, child) {
          final curve = CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
          );
          return FadeTransition(
            opacity: curve,
            child: ScaleTransition(
              scale: Tween(begin: 0.88, end: 1.0).animate(curve),
              child: child,
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ScaleTransition(
    scale: CurvedAnimation(parent: _entry, curve: Curves.elasticOut),
    child: FadeTransition(
      opacity: CurvedAnimation(parent: _entry, curve: Curves.easeIn),
      child: widget.showLabel
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _orb(context),
                const SizedBox(height: 4),
                ExcludeSemantics(
                  child: Text(
                    'Kawuri AI',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: context.brand.ink,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      shadows: [
                        Shadow(
                          color: context.brand.background,
                          blurRadius: 6,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            )
          : _orb(context),
    ),
  );

  Widget _orb(BuildContext context) => Semantics(
        button: true,
        label: 'Ask Kawuri, the Indigen World guide',
        excludeSemantics: true,
        child: Tooltip(
          message: 'Ask Kawuri',
          child: GestureDetector(
            onTap: _open,
            child: AnimatedBuilder(
              animation: _breathe,
              builder: (context, child) => Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      context.brand.heroMid,
                      context.brand.heroLit,
                    ],
                  ),
                  border: Border.all(
                    color: context.brand.highlight.withValues(
                      alpha: 0.55 + 0.35 * _breathe.value,
                    ),
                    width: 1.4,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: context.brand.highlight.withValues(
                        alpha: 0.22 + 0.18 * _breathe.value,
                      ),
                      blurRadius: 16 + 12 * _breathe.value,
                      spreadRadius: 1 + 2 * _breathe.value,
                    ),
                    BoxShadow(
                      color: context.brand.accent.withValues(alpha: 0.3),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: child,
              ),
              child: const Center(child: KawuriOrb(size: 40, glow: false)),
            ),
          ),
        ),
      );
}
