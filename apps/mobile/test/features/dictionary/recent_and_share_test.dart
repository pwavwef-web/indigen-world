// Recent lookups under the empty search box, and sharing a word with the page
// anybody can open — carrying the sentence's credit when it owes one.
//
// Synthetic placeholders only: no Kasem is invented for a fixture.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/share_text.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/dictionary/recent_lookups.dart';
import 'package:shared_preferences/shared_preferences.dart';

DictionaryEntry _entry(
  String id, {
  String example = '',
  String exampleTranslation = '',
  String tatoebaId = '',
}) => DictionaryEntry(
  id: id,
  headword: 'headword-$id',
  translation: 'meaning of $id',
  partOfSpeech: 'noun',
  dialect: '',
  pronunciation: '',
  example: example,
  exampleTranslation: exampleTranslation,
  attribution: '',
  audioUrl: '',
  tatoebaId: tatoebaId,
  tatoebaContributor: tatoebaId.isEmpty ? '' : 'CK',
  sentenceLicence: tatoebaId.isEmpty ? '' : 'CC BY 2.0 FR',
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  group('recent lookups', () {
    test(
      'the newest goes first, a repeat moves up, and the strip is capped',
      () {
        var ids = <String>[];
        for (var index = 0; index < 15; index++) {
          ids = withRecentLookup(ids, 'w$index');
        }
        expect(ids, hasLength(recentLookupsLimit));
        expect(ids.first, 'w14');
        ids = withRecentLookup(ids, 'w10');
        expect(ids.first, 'w10');
        expect(ids.where((id) => id == 'w10'), hasLength(1));
      },
    );

    test('a word that left the dictionary leaves the strip', () {
      final shown = resolveRecentLookups(
        ['b', 'gone', 'a'],
        [_entry('a'), _entry('b')],
      );
      expect([for (final entry in shown) entry.id], ['b', 'a']);
    });

    test('recording is kept on the phone and Clear empties it', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final lookups = container.read(recentLookupsProvider.notifier);
      await lookups.record('a');
      await lookups.record('b');
      expect(container.read(recentLookupsProvider), ['b', 'a']);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getStringList(recentLookupsPreferenceKey), ['b', 'a']);
      await lookups.clear();
      expect(container.read(recentLookupsProvider), isEmpty);
    });
  });

  group('sharing a word', () {
    test('sends the word, its meaning and the public page for it', () {
      final text = dictionaryShareText(_entry('e1'));
      expect(text, startsWith('headword-e1 — meaning of e1'));
      expect(text, contains('https://www.venacula.com/?entry=e1'));
    });

    test('an example travels with its translation', () {
      final text = dictionaryShareText(
        _entry('e2', example: 'example-sentence', exampleTranslation: 'gloss'),
      );
      expect(text, contains('“example-sentence” — gloss'));
      expect(text, isNot(contains('Tatoeba')));
    });

    test('a Tatoeba sentence keeps its credit', () {
      final text = dictionaryShareText(
        _entry('e3', example: 'example-sentence', tatoebaId: '1818'),
      );
      expect(text, contains('(Tatoeba #1818 · CK · CC BY 2.0 FR)'));
    });

    test('an id is encoded into the link, not pasted raw', () {
      expect(
        dictionaryEntryWebLink('a b&c').toString(),
        'https://www.venacula.com/?entry=a+b%26c',
      );
    });
  });
}
