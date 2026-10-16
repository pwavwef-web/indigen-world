import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';

class QuietHoursSettings extends ConsumerStatefulWidget {
  const QuietHoursSettings({super.key});
  @override
  ConsumerState<QuietHoursSettings> createState() => _QuietHoursSettingsState();
}

class _QuietHoursSettingsState extends ConsumerState<QuietHoursSettings> {
  final _start = TextEditingController(text: '22:00'),
      _end = TextEditingController(text: '07:00'),
      _zone = TextEditingController(text: 'Africa/Accra');
  bool _enabled = false, _busy = false;
  String? _error, _uid;
  @override
  void dispose() {
    _start.dispose();
    _end.dispose();
    _zone.dispose();
    super.dispose();
  }

  Future<void> _load(String uid) async {
    try {
      final profile = await FirebaseFirestore.instance
          .collection('communityProfiles')
          .doc(uid)
          .get();
      final data = profile.data()?['notificationQuietHours'];
      if (!mounted || _uid != uid || data is! Map) return;
      setState(() {
        _enabled = data['enabled'] == true;
        _start.text = data['start'] ?? '22:00';
        _end.text = data['end'] ?? '07:00';
        _zone.text = data['timeZone'] ?? 'Africa/Accra';
      });
    } on Object {
      /* defaults remain editable */
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(currentUidProvider);
    if (uid == null) return const SizedBox.shrink();
    if (_uid != uid) {
      _uid = uid;
      WidgetsBinding.instance.addPostFrameCallback((_) => _load(uid));
    }
    return ExpansionTile(
      title: const Text('Quiet hours'),
      subtitle: const Text(
        'Defer community and promotional push alerts; orders remain transactional.',
      ),
      childrenPadding: const EdgeInsets.all(16),
      children: [
        SwitchListTile(
          value: _enabled,
          onChanged: (v) => setState(() => _enabled = v),
          title: const Text('Use quiet hours'),
        ),
        TextField(
          controller: _start,
          decoration: const InputDecoration(labelText: 'Start (24-hour HH:mm)'),
        ),
        TextField(
          controller: _end,
          decoration: const InputDecoration(labelText: 'End (24-hour HH:mm)'),
        ),
        TextField(
          controller: _zone,
          decoration: const InputDecoration(
            labelText: 'Time zone (e.g. Africa/Accra)',
          ),
        ),
        if (_error != null) Text(_error!),
        FilledButton(
          onPressed: _busy
              ? null
              : () async {
                  setState(() {
                    _busy = true;
                    _error = null;
                  });
                  try {
                    await FirebaseFunctions.instance
                        .httpsCallable('notificationDeliveryPreferences')
                        .call<dynamic>({
                          'enabled': _enabled,
                          'start': _start.text.trim(),
                          'end': _end.text.trim(),
                          'timeZone': _zone.text.trim(),
                        });
                  } on Object catch (e) {
                    if (mounted) setState(() => _error = '$e');
                  } finally {
                    if (mounted) setState(() => _busy = false);
                  }
                },
          child: Text(_busy ? 'Saving…' : 'Save quiet hours'),
        ),
      ],
    );
  }
}
