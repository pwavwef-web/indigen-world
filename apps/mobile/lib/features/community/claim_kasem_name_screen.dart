import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/kasem_name_panel.dart';

/// Taking a Kassena name, once.
///
/// A handle is frozen after signup, which is right — it is how people find each
/// other — but it also meant everybody already in the community was locked out
/// of the kente ring for good. This is the one exception: one change, only ever
/// to a name on the curated list, and it says so plainly before it is spent.
class ClaimKasemNameScreen extends ConsumerStatefulWidget {
  const ClaimKasemNameScreen({required this.profile, super.key});

  final CommunityProfile profile;

  @override
  ConsumerState<ClaimKasemNameScreen> createState() =>
      _ClaimKasemNameScreenState();
}

class _ClaimKasemNameScreenState extends ConsumerState<ClaimKasemNameScreen> {
  late final _handle = TextEditingController(text: widget.profile.username);
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    _handle.dispose();
    super.dispose();
  }

  Future<void> _claim() async {
    final handle = _handle.text.trim();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseFunctions.instance
          .httpsCallable('claimKasemHandle')
          .call<Object?>({'handle': handle});
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      Navigator.of(context).pop(true);
    } on FirebaseFunctionsException catch (error) {
      if (!mounted) return;
      setState(() {
        // The callable's own words: they say whether the handle was taken, off
        // the list, or the one change already spent.
        _error = error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That did not go through. Try again shortly.';
        _busy = false;
      });
    } on Object {
      if (!mounted) return;
      setState(() {
        _error = 'That did not go through. Try again shortly.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final names = ref.watch(kasemHandleSetProvider);
    final handle = _handle.text.trim();
    final carries = isKasemHandle(handle, names);

    return Scaffold(
      appBar: AppBar(title: const Text('Take a Kassena name')),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
              children: [
                Text(
                  'Your handle can change once, and only to a Kassena name. '
                  'After that it is fixed again — people find you by it.',
                  style: TextStyle(color: brand.mutedInk, height: 1.5),
                ),
                const SizedBox(height: 18),
                KasemNamePanel(
                  currentHandle: handle,
                  title: 'Names to take',
                  onPick: (ascii) {
                    _handle.text = ascii;
                    setState(() => _error = null);
                  },
                ),
                const SizedBox(height: 18),
                TextField(
                  key: const Key('claim-handle-field'),
                  controller: _handle,
                  autocorrect: false,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'New handle',
                    prefixText: '@',
                    helperText: 'Lowercase letters, numbers and underscores.',
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    CommunityAvatar(
                      initials: widget.profile.initials,
                      imageUrl: widget.profile.avatarUrl,
                      size: 44,
                      kasem: carries,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        carries
                            ? 'This one carries a Kassena name. Your picture '
                                  'gets the ring.'
                            : 'Not a Kassena name yet — pick one above, or '
                                  'build your handle around one.',
                        style: TextStyle(
                          color: carries ? brand.accent : brand.mutedInk,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_error case final message?) ...[
                  const SizedBox(height: 14),
                  Text(
                    message,
                    style: TextStyle(
                      color: brand.danger,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  key: const Key('claim-handle-action'),
                  onPressed: _busy || !carries || handle == widget.profile.username
                      ? null
                      : _confirm,
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
                  child: Text(_busy ? 'Taking it…' : 'Take @$handle'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// One confirmation, because this cannot be undone and the member only gets
  /// to do it once.
  Future<void> _confirm() async {
    final handle = _handle.text.trim();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Become @$handle?'),
        content: const Text(
          'This is your one name change. Your handle cannot be changed again '
          'afterwards.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Take it'),
          ),
        ],
      ),
    );
    if (confirmed ?? false) await _claim();
  }
}
