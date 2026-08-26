import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Opens the sign-in / create-account card. Resolves to `true` when the user
/// finished signing in, `null`/`false` when they dismissed it.
///
/// Kept under its original name because five screens call it; only the
/// presentation moved — from a bottom sheet clinging to the edge under the
/// floating rail, to a centered glass card. The heading lives inside the body
/// rather than in the popup header because it changes with the mode.
Future<bool?> showSignInSheet(BuildContext context) => showGlassPopup<bool>(
  context: context,
  // The form scrolls itself, so the card must not wrap it in a second
  // viewport — nesting two would hand the inner one unbounded height.
  scrollable: false,
  builder: (_) => const _SignInSheet(),
);

enum _Mode { signIn, register }

class _SignInSheet extends ConsumerStatefulWidget {
  const _SignInSheet();

  @override
  ConsumerState<_SignInSheet> createState() => _SignInSheetState();
}

class _SignInSheetState extends ConsumerState<_SignInSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  _Mode _mode = _Mode.signIn;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _isRegister => _mode == _Mode.register;

  Future<void> _run(Future<void> Function(AuthRepository repo) action) async {
    final repo = ref.read(authRepositoryProvider);
    if (repo == null) {
      // Name the actual obstacle rather than blaming the connection: a member
      // on full signal reading "you are offline" has no way to act on it.
      final block = ref.read(connectionBlockProvider);
      setState(
        () => _error =
            block?.message ??
            'Sign-in is not available right now. Please try again shortly.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action(repo);
      if (mounted) Navigator.of(context).pop(true);
    } on AuthCancelled {
      // Legacy callers can still deliberately dismiss a provider flow.
    } on AuthFailure catch (failure) {
      // Android Credential Manager can report a real package/certificate
      // configuration failure as `canceled` after an account was selected.
      // Always surface the mapped result so the flow never appears to do
      // nothing; provider details are recorded separately in Crashlytics.
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitEmail() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    await _run((repo) async {
      if (_isRegister) {
        await repo.registerWithEmail(
          email: _email.text,
          password: _password.text,
          displayName: _name.text,
        );
      } else {
        await repo.signInWithEmail(
          email: _email.text,
          password: _password.text,
        );
      }
    });
  }

  Future<void> _google() => _run((repo) => repo.signInWithGoogle());

  Future<void> _forgotPassword() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your email first, then tap reset.');
      return;
    }
    final repo = ref.read(authRepositoryProvider);
    if (repo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await repo.sendPasswordReset(email);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Password reset link sent to $email.')),
        );
      }
    } on AuthFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  // The glass card supplies the body padding and lifts itself clear of the
  // keyboard, so neither is this widget's job any more.
  Widget build(BuildContext context) => SingleChildScrollView(
    child: Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _isRegister ? 'Create your account' : 'Welcome back',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            _isRegister
                ? 'Save words, contribute, and carry your learning across devices.'
                : 'Sign in to sync your saved words and contributions.',
            style: const TextStyle(color: BrandColors.mutedInk, fontSize: 13),
          ),
          const SizedBox(height: 20),
          if (_isRegister) ...[
            TextFormField(
              controller: _name,
              textInputAction: TextInputAction.next,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Name',
                prefixIcon: Icon(Icons.person_outline_rounded),
              ),
              validator: (value) => (value == null || value.trim().isEmpty)
                  ? 'Please enter your name'
                  : null,
            ),
            const SizedBox(height: 12),
          ],
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email',
              prefixIcon: Icon(Icons.mail_outline_rounded),
            ),
            validator: (value) {
              final text = value?.trim() ?? '';
              if (text.isEmpty) return 'Please enter your email';
              if (!text.contains('@') || !text.contains('.')) {
                return 'Enter a valid email address';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onFieldSubmitted: (_) => _submitEmail(),
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(
                tooltip: _obscure ? 'Show password' : 'Hide password',
                icon: Icon(
                  _obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) {
                return 'Please enter your password';
              }
              if (_isRegister && value.length < 6) {
                return 'Use at least 6 characters';
              }
              return null;
            },
          ),
          if (!_isRegister)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: _busy ? null : _forgotPassword,
                child: const Text('Forgot password?'),
              ),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            _ErrorBanner(message: _error!),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submitEmail,
            child: _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(_isRegister ? 'Create account' : 'Sign in'),
          ),
          const SizedBox(height: 16),
          const Row(
            children: [
              Expanded(child: Divider()),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  'or',
                  style: TextStyle(color: BrandColors.mutedInk),
                ),
              ),
              Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _busy ? null : _google,
            icon: const _GoogleGlyph(),
            label: const Text('Continue with Google'),
          ),
          const SizedBox(height: 16),
          Center(
            child: TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                      _mode = _isRegister ? _Mode.signIn : _Mode.register;
                      _error = null;
                    }),
              child: Text(
                _isRegister
                    ? 'Already have an account? Sign in'
                    : 'New here? Create an account',
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: BrandColors.terracotta.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: BrandColors.terracotta.withValues(alpha: 0.4)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.error_outline_rounded,
          color: BrandColors.terracotta,
          size: 20,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(
              color: BrandColors.terracotta,
              fontWeight: FontWeight.w600,
              height: 1.3,
            ),
          ),
        ),
      ],
    ),
  );
}

/// Small "G" mark so the Google button reads correctly without a network asset.
class _GoogleGlyph extends StatelessWidget {
  const _GoogleGlyph();

  @override
  Widget build(BuildContext context) => const Text(
    'G',
    style: TextStyle(
      fontWeight: FontWeight.w900,
      fontSize: 18,
      color: Color(0xFF4285F4),
    ),
  );
}
