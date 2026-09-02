import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Asking for a Kassena name the list has never heard of.
///
/// ── Why this screen exists ────────────────────────────────────────────────
/// The published list is the only list there is, and it was always going to be
/// missing somebody's grandmother. Until now the answer a member got for typing
/// a real name into the handle field was "This is only for taking a Kassena
/// name" — true, and useless, because there was nowhere to say the list was
/// wrong. This is that place.
///
/// ── Why the fold is shown ─────────────────────────────────────────────────
/// The whole feature turns on one invisible step: `Awɛlɩmwɛ` is a name, and
/// `awelimwe` is what a handle can hold. A member who cannot see that happening
/// has no way to know what they will end up being called, and no way to tell
/// that the two names they are choosing between fold to the same thing. So the
/// fold is drawn as it is typed, beside the ring it earns.
class RequestKasemNameScreen extends ConsumerStatefulWidget {
  const RequestKasemNameScreen({
    this.initialName = '',
    this.handle = '',
    super.key,
  });

  /// Pre-fills the name field — the handle a member typed on the claim screen,
  /// which they can then rewrite properly with the letters it is missing.
  final String initialName;

  /// The handle to hand over on approval, when this request came from somebody
  /// who had already chosen one. Empty for an ordinary "add this name" ask.
  final String handle;

  @override
  ConsumerState<RequestKasemNameScreen> createState() =>
      _RequestKasemNameScreenState();
}

class _RequestKasemNameScreenState
    extends ConsumerState<RequestKasemNameScreen> {
  late final _name = TextEditingController(text: widget.initialName);
  final _meaning = TextEditingController();
  final _note = TextEditingController();
  var _kind = 'given';
  var _busy = false;
  var _sent = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _meaning.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final repository = ref.read(kasemNameRequestsRepositoryProvider);
    if (repository == null) {
      setState(
        () => _error = 'This device is offline. Try again when it is back.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await repository.submit(
        name: _name.text,
        meaning: _meaning.text,
        kind: _kind,
        note: _note.text,
        handle: widget.handle,
      );
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      setState(() {
        _sent = true;
        _busy = false;
      });
    } on KasemNameRequestFailure catch (failure) {
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
    final ascii = foldKasemToAscii(_name.text);
    // Asked for before and still waiting. Said here rather than discovered at
    // the callable, which refuses a second ask and would look like a bug.
    final alreadyAsked = ref.watch(pendingKasemNameAsciiProvider).contains(ascii);
    final ready =
        ascii.length >= 3 && _note.text.trim().length >= 10 && !alreadyAsked;

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(title: const Text('Ask for a name')),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: _sent
                ? _SentState(name: _name.text.trim(), handle: widget.handle)
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 32),
                    children: [
                      Text(
                        widget.handle.isEmpty
                            ? 'Names are added by hand, one at a time. Tell us '
                                  'the name and who bears it, and a reviewer '
                                  'will read it.'
                            : 'Approving this puts the name on the list and '
                                  'gives you @${widget.handle} in the same '
                                  'moment — you will not have to come back and '
                                  'claim it.',
                        style: TextStyle(color: brand.mutedInk, height: 1.5),
                      ),
                      const SizedBox(height: 18),
                      TextField(
                        key: const Key('request-name-field'),
                        controller: _name,
                        autocorrect: false,
                        textCapitalization: TextCapitalization.words,
                        onChanged: (_) => setState(() => _error = null),
                        decoration: const InputDecoration(
                          labelText: 'The name, properly written',
                          helperText: 'Diacritics and all — Awɛlɩmwɛ, Bɔŋɔ.',
                        ),
                      ),
                      const SizedBox(height: 14),
                      _FoldPreview(ascii: ascii, handle: widget.handle),
                      const SizedBox(height: 16),
                      _KindPicker(
                        selected: _kind,
                        onChanged: (kind) => setState(() => _kind = kind),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _meaning,
                        maxLength: 200,
                        decoration: const InputDecoration(
                          labelText: 'What it means (optional)',
                          helperText: 'Leave it blank rather than guessing.',
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        key: const Key('request-note-field'),
                        controller: _note,
                        minLines: 3,
                        maxLines: 6,
                        maxLength: 1000,
                        onChanged: (_) => setState(() => _error = null),
                        decoration: const InputDecoration(
                          labelText: 'Who bears this name?',
                          helperText:
                              'Where it is from, whose name it is. A reviewer '
                              'cannot tell from the spelling alone.',
                        ),
                      ),
                      if (alreadyAsked) ...[
                        const SizedBox(height: 6),
                        _Notice(
                          icon: Icons.hourglass_bottom_rounded,
                          color: brand.gold,
                          message:
                              'You already asked for this one — it is with the '
                              'reviewers.',
                        ),
                      ],
                      if (_error case final message?) ...[
                        const SizedBox(height: 10),
                        Text(
                          message,
                          style: TextStyle(
                            color: brand.danger,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            height: 1.4,
                          ),
                        ),
                      ],
                      const SizedBox(height: 18),
                      FilledButton(
                        key: const Key('request-name-action'),
                        onPressed: _busy || !ready ? null : _send,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 50),
                        ),
                        child: Text(_busy ? 'Sending…' : 'Send for review'),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// The fold, drawn as it happens.
///
/// Without this the member types a name and finds out what they will be called
/// after a reviewer has already decided. With it, the two halves of the trade —
/// the name as it is written, and the ASCII a handle can hold — are on screen
/// together, which is the only place they ever are.
class _FoldPreview extends StatelessWidget {
  const _FoldPreview({required this.ascii, required this.handle});

  final String ascii;
  final String handle;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final short = ascii.length < 3;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: brand.surfaceMuted,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: brand.border),
      ),
      child: Row(
        children: [
          CommunityAvatar(initials: '··', size: 38, kasem: !short),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ascii.isEmpty
                      ? 'A handle can hold none of it yet'
                      : short
                      ? 'That gives only "$ascii" — a handle needs three letters'
                      : 'A handle could be @$ascii',
                  key: const Key('request-fold-preview'),
                  style: TextStyle(
                    color: short ? brand.mutedInk : brand.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  handle.isEmpty
                      ? 'ɛ ɔ ŋ ʋ ɩ ə cannot appear in a handle, so they are '
                            'folded to the nearest letters that can.'
                      : 'Asked for with @$handle, which carries it.',
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _KindPicker extends StatelessWidget {
  const _KindPicker({required this.selected, required this.onChanged});

  final String selected;
  final ValueChanged<String> onChanged;

  static const _kinds = <(String, String, IconData)>[
    ('given', 'Given name', Icons.person_rounded),
    ('clan', 'Clan name', Icons.groups_rounded),
    ('place', 'Place', Icons.place_rounded),
  ];

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final (value, label, icon) in _kinds)
        GlassPill(
          label: label,
          icon: icon,
          selected: value == selected,
          onTap: () {
            HapticFeedback.selectionClick();
            onChanged(value);
          },
        ),
    ],
  );
}

/// Where the screen ends, rather than a toast on a screen that is popping.
///
/// Nothing happens next that the member can watch: a reviewer reads it when a
/// reviewer reads it. So the screen says what was sent and what will happen,
/// and stops.
class _SentState extends StatelessWidget {
  const _SentState({required this.name, required this.handle});

  final String name;
  final String handle;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 32),
      children: [
        Icon(
          Icons.mark_email_read_rounded,
          size: 54,
          color: brand.success,
        ),
        const SizedBox(height: 16),
        Text(
          'Sent for review',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 10),
        Text(
          handle.isEmpty
              ? '$name is with the reviewers. If it is added you will get a '
                    'message, and it will be on the list to take.'
              : '$name is with the reviewers. If it is added, @$handle becomes '
                    'yours at the same moment and you will get a message.',
          textAlign: TextAlign.center,
          style: TextStyle(color: brand.mutedInk, height: 1.5),
        ),
        const SizedBox(height: 26),
        FilledButton(
          key: const Key('request-name-done'),
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
          child: const Text('Done'),
        ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({
    required this.icon,
    required this.color,
    required this.message,
  });

  final IconData icon;
  final Color color;
  final String message;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          message,
          style: TextStyle(
            color: color,
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            height: 1.4,
          ),
        ),
      ),
    ],
  );
}
