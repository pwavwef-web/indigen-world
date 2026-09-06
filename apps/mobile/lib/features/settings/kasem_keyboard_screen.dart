import 'dart:async';

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard.dart';
import 'package:indigen_world_mobile/features/settings/settings_widgets.dart';

class KasemKeyboardScreen extends StatefulWidget {
  const KasemKeyboardScreen({
    this.platform = const MethodChannelKasemKeyboard(),
    super.key,
  });

  final KasemKeyboardPlatform platform;

  @override
  State<KasemKeyboardScreen> createState() => _KasemKeyboardScreenState();
}

class _KasemKeyboardScreenState extends State<KasemKeyboardScreen>
    with WidgetsBindingObserver {
  KasemKeyboardState? _state;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    if (!widget.platform.supported) return;
    try {
      final value = await widget.platform.readState();
      if (mounted) setState(() => _state = value);
    } on Object {
      if (mounted) setState(() => _error = 'Keyboard status is unavailable.');
    }
  }

  Future<void> _setPreference(String key, Object value) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final state = await widget.platform.setPreference(key, value);
      if (mounted) setState(() => _state = state);
    } on Object {
      if (mounted) setState(() => _error = 'Could not save that setting.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openSettings() async {
    try {
      await widget.platform.openInputMethodSettings();
    } on Object {
      if (mounted) setState(() => _error = 'Could not open Android settings.');
    }
  }

  Future<void> _showPicker() async {
    try {
      await widget.platform.showInputMethodPicker();
    } on Object {
      if (mounted) {
        setState(() => _error = 'Could not open the keyboard picker.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    if (!widget.platform.supported) {
      return Scaffold(
        appBar: AppBar(title: const Text('Kasem keyboard')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(28),
            child: Text(
              'The system-wide Kasem keyboard is available on Android.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Kasem keyboard')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 40),
        children: [
          _KeyboardStatusCard(enabled: state?.enabled ?? false),
          const SizedBox(height: 22),
          const SettingsSectionLabel('SET UP'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              ListTile(
                minVerticalPadding: 14,
                leading: Icon(
                  Icons.keyboard_alt_outlined,
                  color: context.brand.accent,
                ),
                title: const Text(
                  '1. Enable Kasem keyboard',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: const Text(
                  'Android will show the keyboards installed on this phone',
                ),
                trailing: const Icon(Icons.open_in_new_rounded),
                onTap: _openSettings,
              ),
              ListTile(
                enabled: state?.enabled ?? false,
                minVerticalPadding: 14,
                leading: Icon(
                  Icons.language_rounded,
                  color: context.brand.accent,
                ),
                title: const Text(
                  '2. Choose Kasem keyboard',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  state?.enabled ?? false
                      ? 'Open the Android keyboard picker'
                      : 'Enable it in step 1 first',
                ),
                trailing: const Icon(Icons.keyboard_arrow_right_rounded),
                onTap: state?.enabled ?? false ? _showPicker : null,
              ),
            ],
          ),
          const SizedBox(height: 22),
          const SettingsSectionLabel('LAYOUT'),
          const SizedBox(height: 9),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 15, 16, 17),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Default language',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    'The EN / KA key switches language while you type.',
                    style: TextStyle(color: context.brand.mutedInk),
                  ),
                  const SizedBox(height: 14),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'kasem', label: Text('Kasem')),
                      ButtonSegment(value: 'english', label: Text('English')),
                    ],
                    selected: {state?.defaultLanguage ?? 'kasem'},
                    onSelectionChanged: _busy
                        ? null
                        : (selection) => _setPreference(
                            'defaultLanguage',
                            selection.first,
                          ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          SettingsGroup(
            children: [
              SwitchListTile.adaptive(
                secondary: Icon(
                  Icons.vibration_rounded,
                  color: context.brand.accent,
                ),
                title: const Text(
                  'Key vibration',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: const Text('A light response when a key is pressed'),
                value: state?.vibration ?? true,
                onChanged: _busy
                    ? null
                    : (value) => _setPreference('vibration', value),
              ),
              SwitchListTile.adaptive(
                secondary: Icon(
                  Icons.volume_up_outlined,
                  color: context.brand.accent,
                ),
                title: const Text(
                  'Key sounds',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: const Text('Use the Android keyboard click sound'),
                value: state?.sound ?? false,
                onChanged: _busy
                    ? null
                    : (value) => _setPreference('sound', value),
              ),
            ],
          ),
          const SizedBox(height: 22),
          const SettingsSectionLabel('TRY IT'),
          const SizedBox(height: 9),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: TextField(
                minLines: 3,
                maxLines: 5,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: 'Type a Kasem phrase',
                  hintText: 'Tap here after choosing the keyboard',
                ),
              ),
            ),
          ),
          const SizedBox(height: 22),
          _LanguageNote(),
          const SizedBox(height: 10),
          _PrivacyNote(),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(
                color: context.brand.danger,
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}

class _KeyboardStatusCard extends StatelessWidget {
  const _KeyboardStatusCard({required this.enabled});

  final bool enabled;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: BrandGradients.heritage,
      borderRadius: BorderRadius.circular(24),
      boxShadow: BrandShadows.card(context.brand),
    ),
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(17),
            ),
            alignment: Alignment.center,
            child: const Text(
              'Ɛ Ɔ\nŊ',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 17,
                height: 1.05,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 15),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Kasem, wherever you write',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  enabled
                      ? 'Enabled on this phone'
                      : 'Two Android steps to begin',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            enabled ? Icons.check_circle_rounded : Icons.circle_outlined,
            color: enabled ? const Color(0xFFE3B84F) : Colors.white70,
          ),
        ],
      ),
    ),
  );
}

class _LanguageNote extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.touch_app_outlined, color: context.brand.gold),
              const SizedBox(width: 10),
              const Text(
                'Kasem shortcuts',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Ɛ, Ɔ and Ŋ have direct keys. Hold C, N, K, G, P or Ŋ for '
            'Ch, Ny, Kw, Gw, Pw or Ŋw.',
          ),
          const SizedBox(height: 9),
          Text(
            'This is the project draft layout. Its alphabet, digraphs and '
            'key positions still need review with fluent Kasem speakers '
            'before the production layout is frozen.',
            style: TextStyle(color: context.brand.mutedInk),
          ),
        ],
      ),
    ),
  );
}

class _PrivacyNote extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      minVerticalPadding: 15,
      leading: Icon(Icons.lock_outline_rounded, color: context.brand.accent),
      title: const Text(
        'Private by design',
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: const Text(
        'The keyboard has no predictions or telemetry. It does not save or '
        'send what you type.',
      ),
    ),
  );
}
