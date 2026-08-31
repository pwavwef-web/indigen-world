import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// The names that earn a member the kente ring.
///
/// ── Why a curated list ────────────────────────────────────────────────────
/// A handle is `[a-z0-9_]{3,20}`, so `ɛ`, `ɔ`, `ŋ`, `ə`, `ʋ` and `ɩ` — six
/// letters of the alphabet Kasem is written in — can never appear in one. The
/// ring cannot be awarded for *spelling* something in Kasem, because nobody can.
///
/// So it is awarded for taking a real Kassena name: a given name, a clan name
/// or a place, folded to the ASCII a handle can hold. The list is curated in the
/// admin console rather than derived from the dictionary, because a dictionary
/// headword is a common noun and taking one as a handle is not the same act as
/// carrying a name your grandmother would recognise.
///
/// Nothing is bundled with the app, and nothing may be. `claimKasemHandle`
/// checks a claim against `kasemNames where published == true` and against
/// nothing else, so a name offered from any other source is a name the server
/// then refuses. A list shipped in the app once did exactly that: nine names on
/// offer that the callable had never heard of, every one of them turned away at
/// the door. The published collection is the only list there is.
class KasemName {
  const KasemName({
    required this.name,
    required this.ascii,
    this.meaning = '',
    this.kind = 'given',
  });

  /// As it is properly written, diacritics and all — `Awɛlɩmwɛ`.
  final String name;

  /// The folded form a handle can actually be — `awelimwe`.
  final String ascii;

  /// What it means, where the project has recorded one. Often blank, and left
  /// blank rather than guessed at.
  final String meaning;

  /// `given`, `clan` or `place`.
  final String kind;

  static KasemName? fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final name = data['name'];
    if (name is! String || name.trim().isEmpty) return null;
    final stored = data['ascii'];
    final ascii = stored is String && stored.isNotEmpty
        ? foldKasemToAscii(stored)
        : foldKasemToAscii(name);
    if (ascii.length < 3) return null;
    return KasemName(
      name: name.trim(),
      ascii: ascii,
      meaning: data['meaning'] is String ? (data['meaning'] as String).trim() : '',
      kind: switch (data['kind']) {
        'clan' => 'clan',
        'place' => 'place',
        _ => 'given',
      },
    );
  }
}

/// Precomposed accented vowels, folded to the letter underneath.
///
/// Tone is written over a vowel, and a name may reach this either as a vowel
/// plus a combining mark or as a single precomposed character — the composer's
/// tone keys produce the first, most keyboards and most pasted text the second.
/// Both have to end at the same handle, or `Bá` becomes `b`.
///
/// This table covers the Latin accents Kasem material actually uses rather than
/// every precomposed letter in Unicode. It does not have to be exhaustive: a
/// curated name carries its own `ascii`, which is already plain ASCII, so the
/// server and this agree on what a name folds to without either having to
/// derive it.
const _precomposed = <String, String>{
  'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'ā': 'a',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ō': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u',
  'ñ': 'n', 'ç': 'c', 'ý': 'y', 'ÿ': 'y',
};

/// The ASCII a handle can hold, from a name written properly.
///
/// The six letters an ordinary keyboard cannot type are folded to the closest
/// thing it can: `ŋ` becomes `ng` because that is how the sound is written when
/// the letter is unavailable, and the rest become their bare vowel. Tone is
/// dropped, however it was written — a handle cannot carry it either way.
String foldKasemToAscii(String raw) {
  final buffer = StringBuffer();
  for (final rune in raw.toLowerCase().runes) {
    final char = String.fromCharCode(rune);
    buffer.write(switch (rune) {
      0x025B || 0x0259 || 0x0246 => 'e', // ɛ ə Ɇ
      0x0254 => 'o', // ɔ
      0x014B => 'ng', // ŋ
      0x028B => 'v', // ʋ
      0x0269 || 0x026A => 'i', // ɩ ɪ
      // Combining marks (tone) carry no letter of their own.
      >= 0x0300 && <= 0x036F => '',
      _ => _precomposed[char] ?? char,
    });
  }
  return buffer.toString().replaceAll(RegExp('[^a-z0-9_]'), '');
}

/// Whether [username] carries a name from [names].
///
/// The whole handle counts, and so does any underscore-separated part of it
/// with trailing digits stripped — so `nyaaba`, `nyaaba_paga` and `nyaaba7` all
/// carry one, and somebody is not punished for adding a village or a number to
/// a name that was already taken.
bool isKasemHandle(String username, Set<String> names) {
  if (names.isEmpty) return false;
  final handle = foldKasemToAscii(username);
  if (handle.isEmpty) return false;
  if (names.contains(handle)) return true;
  for (final part in handle.split('_')) {
    final bare = part.replaceAll(RegExp(r'\d+$'), '');
    if (bare.length >= 3 && names.contains(bare)) return true;
  }
  return false;
}

class KasemNamesRepository {
  const KasemNamesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<KasemName>> watchPublished() => _firestore
      .collection('kasemNames')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(KasemName.fromDoc)
            .whereType<KasemName>()
            .toList(growable: false),
      );
}

final kasemNamesRepositoryProvider = Provider<KasemNamesRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return KasemNamesRepository(FirebaseFirestore.instance);
});

/// The published list, and nothing beside it.
///
/// This used to merge a list bundled with the app underneath the published one,
/// which meant the bundled names were always in the offered set — the panel
/// offered nine names the callable had never heard of, and every claim on one
/// came back "This is only for taking a Kassena name." Before Firebase answers,
/// and while the collection is empty, this is empty, and the screens above say
/// so rather than offering a name that will be refused.
final kasemNamesProvider = Provider<List<KasemName>>(
  (ref) =>
      ref.watch(_publishedKasemNamesProvider).asData?.value ??
      const <KasemName>[],
);

final _publishedKasemNamesProvider = StreamProvider<List<KasemName>>((ref) {
  final repository = ref.watch(kasemNamesRepositoryProvider);
  if (repository == null) return Stream.value(const <KasemName>[]);
  return repository.watchPublished();
});

/// Just the folded forms, for the check every avatar in the app runs.
final kasemHandleSetProvider = Provider<Set<String>>(
  (ref) => {for (final name in ref.watch(kasemNamesProvider)) name.ascii},
);

/// Whether this member's handle carries a Kassena name.
final handleIsKasemProvider = Provider.family<bool, String>(
  (ref, username) => isKasemHandle(username, ref.watch(kasemHandleSetProvider)),
);
