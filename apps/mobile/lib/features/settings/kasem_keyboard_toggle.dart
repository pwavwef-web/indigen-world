import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Uses Android's picker: only the member can select a system keyboard.
class KasemKeyboardToggle extends StatefulWidget {
  const KasemKeyboardToggle({
    this.focusNode,
    this.targets = const {},
    this.platform = const MethodChannelKasemKeyboard(),
    super.key,
  });

  final FocusNode? focusNode;
  final Map<TextEditingController, FocusNode> targets;
  final KasemKeyboardPlatform platform;

  @override
  State<KasemKeyboardToggle> createState() => _KasemKeyboardToggleState();
}

class _KasemKeyboardToggleState extends State<KasemKeyboardToggle>
    with WidgetsBindingObserver {
  bool _selected = false;
  bool _dismissed = true;
  static const dismissalKey = 'indigen_kasem_keyboard_prompt_dismissed_v1';
  Iterable<FocusNode> get _targets => {
    ...widget.targets.values,
    if (widget.focusNode != null) widget.focusNode!,
  };
  bool _busy = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    for (final node in _targets) {
      node.addListener(_focusChanged);
    }
    unawaited(_readDismissal());
    if (widget.platform.supported) {
      unawaited(_refresh());
      // The Android keyboard picker can close without a lifecycle transition.
      _poll = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!_dismissed &&
            _targets.any((node) => node.hasFocus) &&
            (ModalRoute.of(context)?.isCurrent ?? false)) {
          unawaited(_refresh());
        }
      });
    }
  }

  void _focusChanged() {
    if (mounted) setState(() {});
    if (widget.platform.supported && _targets.any((node) => node.hasFocus)) {
      unawaited(_refresh());
    }
  }

  Future<void> _readDismissal() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      if (mounted) {
        setState(() => _dismissed = preferences.getBool(dismissalKey) ?? false);
      }
    } on Object {
      if (mounted) setState(() => _dismissed = false);
    }
  }

  Future<void> _dismiss() async {
    setState(() => _dismissed = true);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(dismissalKey, true);
    } on Object {
      /* The session dismissal still applies. */
    }
  }

  Future<void> _refresh() async {
    try {
      final state = await widget.platform.readState();
      if (mounted && _selected != state.selected) {
        setState(() => _selected = state.selected);
      }
    } on Object {
      // Setup remains available if the platform status cannot be read.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && widget.platform.supported) {
      unawaited(_refresh());
    }
  }

  Future<void> _change(bool useKasem) async {
    if (_busy) return;
    final target =
        widget.focusNode ??
        widget.targets.values.where((node) => node.hasFocus).firstOrNull ??
        widget.targets.values.firstOrNull;
    setState(() => _busy = true);
    try {
      if (!widget.platform.supported ||
          (useKasem && !(await widget.platform.readState()).enabled)) {
        if (!mounted) return;
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => KasemKeyboardScreen(platform: widget.platform),
          ),
        );
        if (!mounted || !widget.platform.supported) return;
        if (!(await widget.platform.readState()).enabled) return;
      }
      if (!mounted) return;
      target?.requestFocus();
      await SystemChannels.textInput.invokeMethod<void>('TextInput.show');
      await widget.platform.showInputMethodPicker();
      await _refresh();
    } on Object {
      if (mounted) {
        showGlassToast(context, 'Could not open the keyboard. Try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    for (final node in _targets) {
      node.removeListener(_focusChanged);
    }
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_selected || _dismissed || !_targets.any((node) => node.hasFocus)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: ListTile(
                leading: const Icon(Icons.keyboard_alt_outlined),
                title: const Text('Use Kasem keyboard'),
                dense: true,
                minTileHeight: 56,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                onTap: _busy ? null : () => _change(true),
              ),
            ),
            IconButton(
              tooltip: 'Dismiss keyboard prompt',
              onPressed: _dismiss,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    );
  }
}
