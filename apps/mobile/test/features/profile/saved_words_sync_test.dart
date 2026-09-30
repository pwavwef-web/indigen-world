// Saved words follow the account — and only the account they belong to.
//
// A phone can be shared. Words saved as a guest join the first account that
// signs in; words already reconciled with one account never join another; and
// once a phone has reconciled with an account, that account's list is the
// latest, because every change since was written through to it.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/profile/saved_words_sync.dart';

void main() {
  test('a guest\'s words become the account\'s when it has none', () {
    final result = reconcileSavedWords(
      uid: 'amina',
      local: {'a', 'b'},
      cloud: null,
      syncedUid: null,
    );
    expect(result.ids, {'a', 'b'});
    expect(result.writeCloud, isTrue);
  });

  test('a guest\'s words join the account\'s own on first sign-in', () {
    final result = reconcileSavedWords(
      uid: 'amina',
      local: {'a', 'b'},
      cloud: {'b', 'c'},
      syncedUid: null,
    );
    expect(result.ids, {'a', 'b', 'c'});
    expect(result.writeCloud, isTrue);
  });

  test('nothing is written when the guest brought nothing new', () {
    final result = reconcileSavedWords(
      uid: 'amina',
      local: {'b'},
      cloud: {'b', 'c'},
      syncedUid: null,
    );
    expect(result.ids, {'b', 'c'});
    expect(result.writeCloud, isFalse);
  });

  test('after the first time, the account\'s list is the latest', () {
    // Unsaved on another phone since: this phone's copy must not bring it
    // back.
    final result = reconcileSavedWords(
      uid: 'amina',
      local: {'a', 'b'},
      cloud: {'b'},
      syncedUid: 'amina',
    );
    expect(result.ids, {'b'});
    expect(result.writeCloud, isFalse);
  });

  test('another account\'s words never join a new one', () {
    final result = reconcileSavedWords(
      uid: 'kofi',
      local: {'amina-word'},
      cloud: {'kofi-word'},
      syncedUid: 'amina',
    );
    expect(result.ids, {'kofi-word'});
    expect(result.writeCloud, isFalse);
  });

  test('another account\'s words are not handed to an empty one either', () {
    final result = reconcileSavedWords(
      uid: 'kofi',
      local: {'amina-word'},
      cloud: null,
      syncedUid: 'amina',
    );
    expect(result.ids, isEmpty);
    expect(result.writeCloud, isTrue);
  });
}
