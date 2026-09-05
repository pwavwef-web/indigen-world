import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/contribute/grammar/grammar_note_screen.dart';

/// Marking a Kawuri answer right or wrong, and — the part that matters —
/// saying what it should have said instead.
///
/// ── Why a thumb is not the feature ────────────────────────────────────────
/// A thumbs-down on its own records that somebody was unhappy. It cannot be
/// acted on, it cannot be checked, and it cannot teach anybody anything: a
/// scalar is not a correction. What is worth collecting is the *fix* — the
/// sentence that should have been there, with a word-for-word line under it —
/// because that goes to the same review desk a contributed sentence does, and
/// once a validator confirms it, the next member who asks that question gets
/// the right answer out of the corpus instead of an invention.
///
/// So the thumb is the gesture and the correction is the payload. Down opens
/// the sheet. Up writes a verdict and stops, because "that was right" needs no
/// elaboration and asking for one would make praise cost more than complaint.
///
/// ── Why this asks for the word-for-word line ──────────────────────────────
/// It is one more field on a form somebody is filling in while annoyed, and it
/// is still worth insisting on. A bare pair — Kasem in, English out — records
/// that a translation exists and nothing about why, so nobody can check it and
/// no rule can be written from it. The line under it is what makes the
/// correction teachable rather than merely true, and `alignGloss` on the
/// backend will refuse the pair if the two lines do not have the same number
/// of words. That refusal is surfaced here as the reason string it came with,
/// which names both counts, rather than as "something went wrong".
class KawuriFeedbackService {
  const KawuriFeedbackService(this.functions);

  final FirebaseFunctions? functions;

  static const _timeout = Duration(seconds: 30);

  /// Records a verdict. Returns the reason it was refused, or null on success.
  ///
  /// A refusal is a string rather than an exception because every refusal this
  /// callable produces is written to be read by the person who caused it —
  /// "6 Kasem words against 5 English" is the whole message, and wrapping it
  /// in an error class only to unwrap it at the call site would lose it.
  Future<String?> rate({
    required String question,
    required String answer,
    required bool wasRight,
    String wrongSpan = '',
    String comment = '',
    KawuriCorrection? correction,
  }) async {
    final functions = this.functions;
    if (functions == null) {
      return 'You are offline. Try again when you have signal.';
    }

    try {
      await functions
          .httpsCallable(
            'rateKawuriAnswer',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>({
            'question': question,
            'answer': answer,
            'verdict': wasRight ? 'right' : 'wrong',
            'wrongSpan': wrongSpan,
            'comment': comment,
            if (correction != null) 'correction': correction.toJson(),
          });
      return null;
    } on FirebaseFunctionsException catch (error) {
      if (error.code == 'unauthenticated') {
        return 'Sign in first — a correction has to be traceable to somebody.';
      }
      if (error.code == 'resource-exhausted') {
        return 'That is a lot of feedback at once. Try again shortly.';
      }
      // `invalid-argument` carries the alignment reason, which is the useful
      // one and the only one the member can act on.
      return error.message?.trim().isNotEmpty ?? false
          ? error.message!.trim()
          : 'That could not be sent.';
    } on Object {
      return 'That could not be sent. Check your connection.';
    }
  }
}

final kawuriFeedbackServiceProvider = Provider<KawuriFeedbackService>((ref) {
  if (!ref.watch(firebaseReadyProvider)) {
    return const KawuriFeedbackService(null);
  }
  return KawuriFeedbackService(FirebaseFunctions.instance);
});

/// What a member says Kawuri should have answered.
@immutable
class KawuriCorrection {
  const KawuriCorrection({
    required this.english,
    required this.kasem,
    required this.literal,
  });

  /// What was being asked for, in ordinary English.
  final String english;

  /// The Kasem that should have been given.
  final String kasem;

  /// One English word under each Kasem word, in the Kasem order.
  final String literal;

  Map<String, Object?> toJson() => {
    'english': english,
    'kasem': kasem,
    'literal': literal,
  };
}

/// The strip under a Kawuri answer. Two thumbs, then whatever happened next.
///
/// Deliberately quiet until touched: an answer with a scoring widget bolted
/// under it reads as a survey, and this screen is a conversation. It also
/// renders nothing at all for a signed-out member rather than a locked
/// control, on the same principle as the review desk card on Contribute — a
/// door somebody cannot open is worse than no door.
class KawuriFeedbackBar extends ConsumerStatefulWidget {
  const KawuriFeedbackBar({
    required this.question,
    required this.answer,
    super.key,
  });

  /// The turn that produced [answer]. Sent so a reviewer reading the verdict
  /// can see what was asked without going and finding the conversation.
  final String question;

  final String answer;

  @override
  ConsumerState<KawuriFeedbackBar> createState() => _KawuriFeedbackBarState();
}

class _KawuriFeedbackBarState extends ConsumerState<KawuriFeedbackBar> {
  bool _busy = false;
  String? _settled;

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(isSignedInProvider)) return const SizedBox.shrink();
    if (widget.question.trim().isEmpty) return const SizedBox.shrink();

    if (_settled case final settled?) {
      return Padding(
        padding: const EdgeInsets.only(top: 6, left: 4),
        child: Text(
          settled,
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _FeedbackButton(
            icon: Icons.check_rounded,
            label: 'Right',
            enabled: !_busy,
            onTap: _markRight,
          ),
          const SizedBox(width: 4),
          _FeedbackButton(
            icon: Icons.edit_rounded,
            label: 'Not right',
            enabled: !_busy,
            onTap: _markWrong,
          ),
        ],
      ),
    );
  }

  Future<void> _markRight() async {
    setState(() => _busy = true);
    HapticFeedback.selectionClick();
    final error = await ref
        .read(kawuriFeedbackServiceProvider)
        .rate(question: widget.question, answer: widget.answer, wasRight: true);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _settled = error ?? 'Marked right. Thank you.';
    });
  }

  Future<void> _markWrong() async {
    HapticFeedback.selectionClick();
    final outcome = await showModalBottomSheet<_CorrectionOutcome>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) =>
          _CorrectionSheet(question: widget.question, answer: widget.answer),
    );
    if (!mounted || outcome == null) return;
    setState(() => _settled = outcome.message);
  }
}

class _FeedbackButton extends StatelessWidget {
  const _FeedbackButton({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: enabled ? onTap : null,
    style: TextButton.styleFrom(
      foregroundColor: context.brand.onAccentFill,
      padding: const EdgeInsets.symmetric(horizontal: 9),
      minimumSize: const Size(0, 30),
      visualDensity: VisualDensity.compact,
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    ),
    icon: Icon(icon, size: 14),
    label: Text(
      label,
      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800),
    ),
  );
}

/// What the sheet reports back, so the bar can say what became of it.
@immutable
class _CorrectionOutcome {
  const _CorrectionOutcome(this.message);
  final String message;
}

/// The correction form.
///
/// Three fields, and the third one is the reason this is a sheet rather than a
/// thumbs-down. A member who only wants to register displeasure can send the
/// verdict with the Kasem fields empty; a member who knows the answer can
/// leave something a validator can confirm and the corpus can hold.
class _CorrectionSheet extends ConsumerStatefulWidget {
  const _CorrectionSheet({required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  ConsumerState<_CorrectionSheet> createState() => _CorrectionSheetState();
}

class _CorrectionSheetState extends ConsumerState<_CorrectionSheet> {
  final _english = TextEditingController();
  final _kasem = TextEditingController();
  final _literal = TextEditingController();
  final _comment = TextEditingController();

  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Pre-filled with what they asked for, because in the overwhelming case
    // the correction is a translation of that exact sentence and retyping it
    // is friction for nothing. Editable, because sometimes the question was
    // loose and the sentence they can actually attest is a tighter one.
    _english.text = widget.question.trim();
  }

  @override
  void dispose() {
    _english.dispose();
    _kasem.dispose();
    _literal.dispose();
    _comment.dispose();
    super.dispose();
  }

  /// True once there is enough Kasem to be worth a validator's time.
  bool get _hasCorrection =>
      _kasem.text.trim().isNotEmpty || _literal.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: BoxDecoration(
          color: brand.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: brand.faintInk,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'What should it have said?',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'You can send this with the Kasem blank — that records that the '
                'answer was wrong. Filling it in does much more: a speaker '
                'reviews it, and once they confirm it, everyone who asks this '
                'gets your answer instead.',
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 12.5,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 18),
              _Field(
                controller: _english,
                label: 'What you were asking for',
                hint: 'the big boy is hungry',
              ),
              const SizedBox(height: 12),
              _Field(
                controller: _kasem,
                label: 'The Kasem',
                hint: 'kana mo jege bakeira kamunu kom',
              ),
              const SizedBox(height: 12),
              _Field(
                controller: _literal,
                label: 'Literal paraphrase (optional)',
                hint: 'Leave unexplained words blank',
                helper:
                    'You can contribute a natural sentence without explaining '
                    'every particle. Context and permissions come next.',
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              _Field(
                controller: _comment,
                label: 'Anything else (optional)',
                hint: 'Why is it built this way?',
                maxLines: 3,
              ),
              if (_error case final error?) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  decoration: BoxDecoration(
                    color: BrandColors.terracotta.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: BrandColors.terracotta.withValues(alpha: 0.45),
                    ),
                  ),
                  child: Text(
                    error,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 12.5,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _busy ? null : _send,
                child: Text(
                  _hasCorrection ? 'Send correction' : 'Just mark it wrong',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _send() async {
    if (_hasCorrection) {
      final submitted = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => GrammarNoteScreen(
            prefillData: {
              'mode': 'correction',
              'question': widget.question,
              'answer': widget.answer,
              'explanation': _comment.text,
              'examples': [
                {
                  'english': _english.text,
                  'kasem': _kasem.text,
                  'literal': _literal.text,
                },
              ],
            },
          ),
        ),
      );
      if (!mounted || submitted != true) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });

    // Sent only when there is Kasem to send. A half-filled correction — an
    // English sentence with no Kasem under it — would be refused by the
    // backend for having no sentence in it, which is a confusing way to tell
    // somebody that the thing they left blank was the point.
    final correction = _hasCorrection
        ? KawuriCorrection(
            english: _english.text.trim(),
            kasem: _kasem.text.trim(),
            literal: _literal.text.trim(),
          )
        : null;

    final error = await ref
        .read(kawuriFeedbackServiceProvider)
        .rate(
          question: widget.question,
          answer: widget.answer,
          wasRight: false,
          comment: _comment.text.trim(),
          // The shared evidence form has already recorded the correction,
          // its context, and its permissions. This call only records feedback.
          correction: null,
        );

    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
      return;
    }

    Navigator.of(context).pop(
      _CorrectionOutcome(
        correction != null
            ? 'Sent for review. Thank you — this is how it gets better.'
            : 'Marked wrong. Thank you.',
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.hint,
    this.helper,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final String? helper;
  final int maxLines;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    maxLines: maxLines,
    textCapitalization: TextCapitalization.none,
    decoration: InputDecoration(
      labelText: label,
      hintText: hint,
      helperText: helper,
      helperMaxLines: 4,
      border: const OutlineInputBorder(),
    ),
  );
}
