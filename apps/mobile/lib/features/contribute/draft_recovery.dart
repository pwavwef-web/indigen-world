import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local recovery is account-scoped. It never calls a submission repository.
class AccountDraftSession {
  AccountDraftSession({
    required this.account,
    required this.area,
    required this.snapshot,
    required this.meaningful,
    required this.version,
    required this.changed,
  }) {
    _timer = Timer.periodic(
      const Duration(milliseconds: 500),
      (_) => unawaited(flush()),
    );
    unawaited(flush());
  }
  final String Function() account;
  final String area;
  final Map<String, dynamic> Function() snapshot;
  final bool Function() meaningful;
  final String Function() version;
  final VoidCallback changed;
  Timer? _timer;
  String _owner = '', _last = '';
  bool _ready = false, _busy = false, _disabled = false, _disposed = false;
  Map<String, dynamic>? recovery;
  String status = 'Checking draft recovery…';
  String get owner => _owner;
  bool get accountChanged => _owner.isNotEmpty && account() != _owner;
  bool get canSubmit => !accountChanged && recovery == null && _ready;
  bool get conflict => recovery != null && recovery!['version'] != version();
  String get key =>
      'indigen:draft:v1:${Uri.encodeComponent(_owner)}:${Uri.encodeComponent(area)}';
  void _notify() {
    if (!_disposed) changed();
  }

  Future<void> flush() async {
    if (_busy || _disposed || _disabled || accountChanged) return;
    final uid = account();
    if (uid.isEmpty) {
      status = 'Sign in to keep a recovery copy for your account.';
      _notify();
      return;
    }
    final hasEdits = meaningful();
    final captured = hasEdits ? jsonDecode(jsonEncode(snapshot())) : null;
    final capturedVersion = version();
    _busy = true;
    try {
      if (_owner.isEmpty) _owner = uid;
      final prefs = await SharedPreferences.getInstance();
      if (!_ready) {
        final raw = prefs.getString(key);
        if (raw != null) {
          final data = jsonDecode(raw);
          if (data is Map &&
              data['schema'] == 1 &&
              data['owner'] == uid &&
              data['value'] is Map) {
            recovery = Map<String, dynamic>.from(data);
          }
        }
        _ready = true;
      }
      if (recovery != null || accountChanged || _disabled) return;
      if (!hasEdits) {
        status = 'Recovery ready for this account.';
        return;
      }
      final payload = jsonEncode({
        'schema': 1,
        'owner': uid,
        'version': capturedVersion,
        'value': captured,
      });
      if (payload == _last) return;
      status = 'Saving recovery…';
      _notify();
      if (!await prefs.setString(key, payload)) {
        throw StateError('Storage refused the draft.');
      }
      _last = payload;
      status = 'Saved on this device';
    } on Object {
      _ready = true;
      status = 'Recovery could not be saved. Keep this screen open and retry.';
    } finally {
      _busy = false;
      _notify();
    }
  }

  Map<String, dynamic>? continueDraft() {
    if (accountChanged || recovery == null) return null;
    final value = Map<String, dynamic>.from(recovery!['value'] as Map);
    recovery = null;
    _last = '';
    _disabled = false;
    _notify();
    return value;
  }

  Future<void> clear({bool restart = false}) async {
    _disabled = true;
    // Finish an in-flight write before disposal; no later timer may recreate it.
    while (_busy) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    try {
      if (_owner.isNotEmpty) {
        await (await SharedPreferences.getInstance()).remove(key);
      }
      recovery = null;
      _last = '';
      status = 'Recovery cleared.';
    } on Object {
      status = 'Could not clear recovery. Try again before starting another.';
    }
    _disabled = !restart || status.startsWith('Could not');
    _notify();
  }

  void dispose() {
    _timer?.cancel();
    _disposed = true;
  }
}

class DraftRecoveryPanel extends StatelessWidget {
  const DraftRecoveryPanel({
    required this.session,
    required this.restore,
    super.key,
  });
  final AccountDraftSession session;
  final ValueChanged<Map<String, dynamic>> restore;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            session.recovery != null
                ? session.conflict
                      ? 'A newer account version differs from this saved draft. Choose what to continue.'
                      : 'An unfinished draft is saved for this account.'
                : session.status,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (session.recovery != null) ...[
            const Text(
              'Nothing is sent automatically. Reselect unfinished attachments; uploaded references are retained.',
            ),
            FilledButton(
              onPressed: () {
                final value = session.continueDraft();
                if (value != null) restore(value);
              },
              child: const Text('Continue draft'),
            ),
            TextButton(
              onPressed: () => session.clear(restart: true),
              child: const Text('Use current version / discard draft'),
            ),
          ] else if (session.status.contains('could not'))
            TextButton(
              onPressed: session.flush,
              child: const Text('Retry saving recovery'),
            ),
        ],
      ),
    ),
  );
}

Widget accountChangedDraftScreen(BuildContext context) => Scaffold(
  appBar: AppBar(title: const Text('Account changed')),
  body: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      children: [
        const Text(
          'This form belongs to the previous account. Its recovery copy stays with that account. Reopen Contribute to use your current account.',
        ),
        TextButton(
          onPressed: () => Navigator.of(context).maybePop(),
          child: const Text('Close this form'),
        ),
      ],
    ),
  ),
);
