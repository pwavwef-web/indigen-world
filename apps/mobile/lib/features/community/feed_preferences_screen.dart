import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';

class FeedPreferencesScreen extends ConsumerStatefulWidget {
  const FeedPreferencesScreen({super.key});
  @override
  ConsumerState<FeedPreferencesScreen> createState() => _FeedPreferencesState();
}

class _FeedPreferencesState extends ConsumerState<FeedPreferencesScreen> {
  final _fields = {
    for (final key in ['cultures', 'languages', 'countries', 'communities'])
      key: TextEditingController(),
  };
  final _topics = <String>{};
  final _muted = <String>{};
  bool _loaded = false, _saving = false, _behavioral = false, _location = false;
  String? _error;

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await FirebaseFunctions.instance
          .httpsCallable('saveCommunityFeedPreferences')
          .call<Object?>({
            'topics': _topics.toList(),
            'mutedTopics': _muted.toList(),
            for (final field in _fields.entries)
              field.key: field.value.text
                  .split(',')
                  .map((s) => s.trim().toLowerCase())
                  .where((s) => s.isNotEmpty)
                  .toSet()
                  .toList(),
            'behavioralConsent': _behavioral,
            'locationConsent': _location,
          });
      if (!mounted) return;
      ref.invalidate(communityFeedClientProvider);
      Navigator.pop(context);
    } on FirebaseFunctionsException catch (error) {
      if (mounted) {
        setState(
          () => _error = error.message ?? 'Could not save your interests.',
        );
      }
    } on Object {
      if (mounted) {
        setState(
          () => _error = 'Could not save your interests. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preferences = ref.watch(communityFeedPreferencesProvider);
    final uid = ref.watch(currentUidProvider);
    if (!_loaded && preferences.asData != null) {
      final p = preferences.asData!.value;
      for (final entry in _fields.entries) {
        entry.value.text = (p[entry.key] as List? ?? []).join(', ');
      }
      _topics.addAll((p['topics'] as List? ?? []).whereType<String>());
      _muted.addAll((p['mutedTopics'] as List? ?? []).whereType<String>());
      _behavioral = p['behavioralConsent'] == true;
      _location = p['locationConsent'] == true;
      _loaded = true;
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Your feed interests')),
      body: uid == null
          ? const Center(child: Text('Sign in to choose your feed interests.'))
          : preferences.hasError
          ? const Center(
              child: Text('Could not load your interests. Please try again.'),
            )
          : !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  'Choose what you want to follow. For you also makes room for discovery. You can change or clear these choices anytime.',
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final topic in [
                      'question',
                      'language',
                      'culture',
                      'music',
                      'story',
                    ])
                      FilterChip(
                        label: Text(topic),
                        selected: _topics.contains(topic),
                        onSelected: _saving
                            ? null
                            : (on) => setState(() {
                                on ? _topics.add(topic) : _topics.remove(topic);
                              }),
                      ),
                  ],
                ),
                for (final field in _fields.entries)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: TextField(
                      controller: field.value,
                      enabled: !_saving,
                      maxLength: 1000,
                      decoration: InputDecoration(
                        labelText: switch (field.key) {
                          'cultures' => 'Cultures (for example, Akan)',
                          'languages' => 'Languages (for example, Ga)',
                          'countries' => 'Countries (for example, Ghana)',
                          _ => 'Public community IDs',
                        },
                        helperText: 'Separate names with commas; up to 30.',
                      ),
                    ),
                  ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Use my selected countries'),
                  subtitle: const Text(
                    'Uses only the countries you enter here. Never your device location.',
                  ),
                  value: _location,
                  onChanged: _saving
                      ? null
                      : (v) => setState(() => _location = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Personalize from my activity'),
                  subtitle: const Text(
                    'Use recent likes, saves, replies and reshares to suggest related posts in For you. Recommendation events expire after 30 days. Turn this off to use only your chosen interests.',
                  ),
                  value: _behavioral,
                  onChanged: _saving
                      ? null
                      : (v) => setState(() => _behavioral = v),
                ),
                if (_muted.isNotEmpty) ...[
                  const Text('Muted topics — tap to restore'),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final topic in _muted.toList())
                        InputChip(
                          label: Text(topic),
                          onDeleted: _saving
                              ? null
                              : () => setState(() => _muted.remove(topic)),
                        ),
                    ],
                  ),
                ],
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: Text(_saving ? 'Saving…' : 'Save interests'),
                ),
              ],
            ),
    );
  }
}
