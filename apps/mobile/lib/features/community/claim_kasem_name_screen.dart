import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/request_kasem_name_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/kasem_name_panel.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

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

  /// Opens the request screen, and refreshes this one when it comes back.
  ///
  /// [handle] is what approval should hand over, [name] what the member has
  /// already typed — which is a handle, and therefore missing the letters the
  /// name is actually written with. They rewrite it there; the fold is shown as
  /// they do, so they can see it still comes back to the handle they wanted.
  Future<void> _ask({String handle = '', String name = ''}) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) =>
            RequestKasemNameScreen(initialName: name, handle: handle),
      ),
    );
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final offered = ref.watch(kasemNamesProvider);
    final names = ref.watch(kasemHandleSetProvider);
    final handle = _handle.text.trim();
    final carries = isKasemHandle(handle, names);
    final ascii = foldKasemToAscii(handle);

    // A handle that could be asked for: shaped like a handle, and not already
    // carrying a published name.
    final askable = !carries && isHandleShaped(ascii);
    final alreadyAsked = ref
        .watch(pendingKasemNameAsciiProvider)
        .contains(ascii);

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
                if (offered.isEmpty)
                  // The panel draws nothing when it has nothing to offer, and
                  // the list is the admin console's alone — so an empty one is
                  // a real state, not a moment of loading to be hidden. Left
                  // unsaid, this screen is a bare handle field with no hint of
                  // what is supposed to go in it.
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                    decoration: BoxDecoration(
                      color: brand.surfaceMuted,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: brand.border),
                    ),
                    child: Text(
                      'No Kassena names have been published yet. When they '
                      'are, they will appear here to choose from — your one '
                      'change keeps until then.',
                      style: TextStyle(color: brand.mutedInk, height: 1.5),
                    ),
                  )
                else
                  KasemNamePanel(
                    currentHandle: handle,
                    title: 'Names to take',
                    onPick: (picked) {
                      _handle.text = picked;
                      setState(() => _error = null);
                    },
                  ),
                const SizedBox(height: 12),
                // The list is curated, so it was always going to be missing
                // somebody's grandmother. Offered whether or not the list is
                // empty: "I cannot find mine" is the same problem as "there is
                // nothing here", and both used to end the screen.
                GlassRow(
                  key: const Key('claim-ask-for-name'),
                  icon: Icons.add_circle_outline_rounded,
                  color: brand.terracotta,
                  title: "My name isn't here",
                  detail: 'Ask for it to be added to the list',
                  onTap: () => _ask(),
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
                            : offered.isEmpty
                            ? 'No names to pick from yet — pick one once some '
                                  'are published, or ask for yours.'
                            : 'Not a Kassena name yet — pick one above, build '
                                  'your handle around one, or ask for yours.',
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
                // The old dead end. A member who typed a real name was told
                // "Not a Kassena name yet" and given nothing to do about it —
                // which was the moment the list's gaps became the member's
                // problem. Now the same moment is where the request is made,
                // with the handle already attached so approval does both halves
                // at once.
                if (alreadyAsked) ...[
                  const SizedBox(height: 14),
                  GlassRow(
                    key: const Key('claim-request-pending'),
                    icon: Icons.hourglass_bottom_rounded,
                    color: brand.gold,
                    title: 'You already asked for this',
                    detail: 'It is with the reviewers',
                  ),
                ] else if (askable) ...[
                  const SizedBox(height: 14),
                  GlassRow(
                    key: const Key('claim-ask-for-handle'),
                    icon: Icons.workspace_premium_outlined,
                    color: brand.accent,
                    title: 'Ask for @$ascii to be recognised',
                    detail: 'Approval adds the name and gives you the handle',
                    onTap: () => _ask(handle: ascii, name: handle),
                  ),
                ],
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
