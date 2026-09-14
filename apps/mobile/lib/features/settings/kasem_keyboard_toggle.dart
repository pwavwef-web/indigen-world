import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

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
  bool _busy = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.platform.supported) {
      unawaited(_refresh());
      // The Android keyboard picker can close without a lifecycle transition.
      _poll = Timer.periodic(const Duration(seconds: 1), (_) {
        if (ModalRoute.of(context)?.isCurrent ?? false) unawaited(_refresh());
      });
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
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SafeArea(
      top: false,
      child: SwitchListTile.adaptive(
        dense: true,
        title: const Text('Use Kasem keyboard'),
        subtitle: Text(
          _selected
              ? 'Choose another keyboard to switch off'
              : 'Set up or choose your keyboard',
        ),
        secondary: const Icon(Icons.keyboard_alt_outlined),
        value: _selected,
        onChanged: _busy ? null : _change,
      ),
    ),
  );
}
