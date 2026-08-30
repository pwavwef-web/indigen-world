import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/phone_verification_repository.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';

/// Proving a number, in two steps.
///
/// The number is asked for once and never shown again — not on the profile, not
/// in Settings, not to staff. What comes out the other side is a flag and a
/// one-way hash, which is all the community needs in order to say that somebody
/// real is behind an account.
class PhoneVerificationScreen extends ConsumerStatefulWidget {
  const PhoneVerificationScreen({super.key});

  @override
  ConsumerState<PhoneVerificationScreen> createState() =>
      _PhoneVerificationScreenState();
}

enum _Step { number, code, done }

class _PhoneVerificationScreenState
    extends ConsumerState<PhoneVerificationScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();

  var _step = _Step.number;
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  PhoneVerificationRepository? get _repository =>
      ref.read(phoneVerificationRepositoryProvider);

  Future<void> _run(Future<void> Function(PhoneVerificationRepository) action,
      {required _Step onSuccess}) async {
    final repository = _repository;
    if (repository == null) {
      setState(() => _error = 'Indigen World could not be reached right now.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action(repository);
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() {
        _step = onSuccess;
        _busy = false;
      });
    } on PhoneVerificationFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure.message;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your number')),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              children: [
                _Explainer(step: _step),
                const SizedBox(height: 22),
                if (_step == _Step.number) ...[
                  TextField(
                    key: const Key('phone-number-field'),
                    controller: _phone,
                    autofocus: true,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Mobile number',
                      // The example carries the shape the server accepts, so
                      // nobody has to discover it from a refusal.
                      hintText: '0244 123 456 · or +226 70 12 34 56',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Outside Ghana, start with your country code.',
                    style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                  ),
                ] else if (_step == _Step.code) ...[
                  TextField(
                    key: const Key('phone-code-field'),
                    controller: _code,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 8,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Six-digit code',
                      counterText: '',
                    ),
                  ),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () => setState(() {
                            _step = _Step.number;
                            _error = null;
                          }),
                    child: const Text('Use a different number'),
                  ),
                ],
                if (_error case final message?) ...[
                  const SizedBox(height: 6),
                  Text(
                    message,
                    style: TextStyle(
                      color: brand.danger,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                if (_step != _Step.done)
                  FilledButton(
                    key: const Key('phone-verification-action'),
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 50),
                    ),
                    child: Text(
                      _busy
                          ? 'Working…'
                          : _step == _Step.number
                          ? 'Send me a code'
                          : 'Verify',
                    ),
                  )
                else
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 50),
                    ),
                    child: const Text('Done'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_step == _Step.number) {
      await _run(
        (repository) => repository.start(_phone.text),
        onSuccess: _Step.code,
      );
      return;
    }
    await _run(
      (repository) => repository.confirm(_code.text),
      onSuccess: _Step.done,
    );
    // The profile stream carries the new flag down on its own; invalidating the
    // suggestion caches is what makes the mark appear on rows already drawn.
    if (mounted && _step == _Step.done) {
      ref.invalidate(suggestedProfilesProvider);
    }
  }
}

/// What each step is for, said before it is asked for.
class _Explainer extends StatelessWidget {
  const _Explainer({required this.step});

  final _Step step;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    if (step == _Step.done) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const VerifiedBadge(
                mark: VerifiedMark.member,
                size: 26,
                explainOnTap: false,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Verified',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Your mark is on your name from now on. If the project has also '
            'recognised you as a creator or a custodian of the language, that '
            'mark appears now too.',
            style: TextStyle(color: brand.mutedInk, height: 1.45),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          step == _Step.number
              ? 'One number, one member'
              : 'Check your messages',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 10),
        Text(
          step == _Step.number
              // Says plainly what happens to the number, because asking for one
              // in a cultural archive deserves an answer before the question.
              ? 'A number tells the community somebody real is here. We store a '
                    'one-way fingerprint of it and nothing else — it is never '
                    'shown on your profile, never shared, and cannot be read '
                    'back out.'
              : 'We sent you a six-digit code. It is good for ten minutes.',
          style: TextStyle(color: brand.mutedInk, height: 1.45),
        ),
      ],
    );
  }
}
