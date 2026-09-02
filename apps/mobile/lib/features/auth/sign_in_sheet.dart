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

  /// The provider's own verdict behind [_error], when there was one.
  ///
  /// Held apart from the sentence so the banner can keep the sentence short
  /// and still let somebody reporting a fault read the code Google returned.
  String? _errorDetail;

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
      setState(() {
        _error =
            block?.message ??
            'Sign-in is not available right now. Please try again shortly.';
        _errorDetail = null;
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _errorDetail = null;
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
      // nothing — and carry the provider's own verdict with it, because
      // Crashlytics alone means the one person who can read the actual error
      // is not the person holding the phone.
      if (mounted) {
        setState(() {
          _error = failure.message;
          _errorDetail = failure.detail;
        });
      }
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
            style: TextStyle(color: context.brand.mutedInk, fontSize: 13),
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
            _ErrorBanner(message: _error!, detail: _errorDetail),
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
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  'or',
                  style: TextStyle(color: context.brand.mutedInk),
                ),
              ),
              const Expanded(child: Divider()),
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
                      _errorDetail = null;
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

/// What went wrong, and — folded away — exactly what the provider said.
///
/// The sentence is for the member: it says what to do next and never names a
/// code. The fold under it is for the report they send afterwards. Google
/// Sign-In has half a dozen distinct failures that all read as "it did not
/// work", and until this existed the only copy of the distinguishing detail
/// went to Crashlytics — visible to everybody except the person who could
/// describe what they had just done.
class _ErrorBanner extends StatefulWidget {
  const _ErrorBanner({required this.message, this.detail});

  final String message;

  /// The provider's own code and description, when the failure carried one.
  final String? detail;

  @override
  State<_ErrorBanner> createState() => _ErrorBannerState();
}

class _ErrorBannerState extends State<_ErrorBanner> {
  var _showDetail = false;

  @override
  void didUpdateWidget(_ErrorBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A new failure folds itself away again. Leaving the previous one open
    // would show a code belonging to an attempt that is no longer on screen.
    if (oldWidget.detail != widget.detail) _showDetail = false;
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final detail = widget.detail;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: brand.terracotta.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: brand.terracotta.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, color: brand.terracotta, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.message,
                  style: TextStyle(
                    color: brand.terracotta,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
                if (detail != null && detail.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  InkWell(
                    onTap: () => setState(() => _showDetail = !_showDetail),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _showDetail ? 'Hide details' : 'Details',
                            style: TextStyle(
                              color: brand.terracotta,
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                          Icon(
                            _showDetail
                                ? Icons.expand_less_rounded
                                : Icons.expand_more_rounded,
                            color: brand.terracotta,
                            size: 16,
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_showDetail)
                    SelectableText(
                      detail,
                      key: const Key('sign-in-error-detail'),
                      style: TextStyle(
                        color: brand.terracotta,
                        fontSize: 11.5,
                        height: 1.35,
                        // Selectable, because the only useful thing to do with
                        // it is send it to somebody.
                        fontFamily: 'monospace',
                      ),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
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
