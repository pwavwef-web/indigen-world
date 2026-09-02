import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';

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

/// The shape a handle has to have, mirroring `HANDLE_SHAPE` on the server.
///
/// Checked on the way *out* rather than on the way in: a screen that offers to
/// ask for `@7nyaaba` is a screen offering a request the callable will refuse,
/// and the member has no way of knowing why.
final _handleShape = RegExp(r'^[a-z][a-z0-9_]{2,19}$');

/// Whether [handle] could be a handle at all.
bool isHandleShaped(String handle) => _handleShape.hasMatch(handle);

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

// ─────────────────────────────────────────────────────────────────────────────
// Asking for a name that is not on the list
// ─────────────────────────────────────────────────────────────────────────────

/// A member's ask for a name to be added, and what became of it.
///
/// ── Why members can ask at all ────────────────────────────────────────────
/// The published list is the project's list, and it was always going to be
/// missing somebody's grandmother. Before this existed, a member who typed a
/// real Kassena name into the handle field was told "This is only for taking a
/// Kassena name" — a refusal that was both true and useless, because there was
/// nowhere to say the list was wrong.
///
/// `ascii` is written by the server and only ever read here. It is what the
/// ring is awarded on, so a phone that could name its own fold could award the
/// ring for anything.
@immutable
class KasemNameRequest {
  const KasemNameRequest({
    required this.id,
    required this.uid,
    required this.name,
    required this.ascii,
    required this.status,
    this.meaning = '',
    this.kind = 'given',
    this.note = '',
    this.handle = '',
    this.requesterHandle = '',
    this.requesterName = '',
    this.reviewNote = '',
    this.handleOutcome = 'not-requested',
    this.createdAt,
  });

  final String id;
  final String uid;

  /// As it is properly written, diacritics and all.
  final String name;

  /// The folded form, derived on the server.
  final String ascii;

  /// `pending`, `approved` or `rejected`.
  final String status;

  final String meaning;

  /// `given`, `clan` or `place`.
  final String kind;

  /// Why this is a real name, and who bears it. The whole of what a reviewer
  /// has to go on.
  final String note;

  /// The handle the member wants if this is also a whitelist-my-claim request.
  final String handle;

  /// Who asked, stamped at request time so the desk can name them without a
  /// profile read per row.
  final String requesterHandle;
  final String requesterName;

  final String reviewNote;

  /// `not-requested`, `pending`, `applied`, or the reason the claim was
  /// refused — `already-changed`, `taken`, `no-profile`, `already-yours`.
  final String handleOutcome;

  final DateTime? createdAt;

  bool get isPending => status == 'pending';

  /// What the kind is called on a card.
  String get kindLabel => switch (kind) {
    'clan' => 'Clan name',
    'place' => 'Place',
    _ => 'Given name',
  };

  static KasemNameRequest? fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    final name = data['name'];
    if (name is! String || name.trim().isEmpty) return null;
    final requester = data['requester'];
    final createdAt = data['createdAt'];
    return KasemNameRequest(
      id: doc.id,
      uid: data['uid'] is String ? data['uid'] as String : '',
      name: name.trim(),
      // Trusted as stored: the callable derived it. Folding again here would
      // only matter if the two ever disagreed, and if they do the ring is
      // already wrong wherever it is drawn.
      ascii: data['ascii'] is String ? (data['ascii'] as String) : '',
      status: switch (data['status']) {
        'approved' => 'approved',
        'rejected' => 'rejected',
        _ => 'pending',
      },
      meaning: _string(data['meaning']),
      kind: switch (data['kind']) {
        'clan' => 'clan',
        'place' => 'place',
        _ => 'given',
      },
      note: _string(data['note']),
      handle: _string(data['handle']),
      requesterHandle: requester is Map ? _string(requester['username']) : '',
      requesterName: requester is Map ? _string(requester['displayName']) : '',
      reviewNote: _string(data['reviewNote']),
      handleOutcome: _string(
        data['handleOutcome'],
        fallback: 'not-requested',
      ),
      createdAt: createdAt is Timestamp ? createdAt.toDate() : null,
    );
  }
}

String _string(Object? value, {String fallback = ''}) =>
    value is String && value.trim().isNotEmpty ? value.trim() : fallback;

/// A refusal from `requestKasemName`, in the callable's own words.
class KasemNameRequestFailure implements Exception {
  const KasemNameRequestFailure(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Reads a member's own requests and sends new ones.
class KasemNameRequestsRepository {
  const KasemNameRequestsRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  /// This member's requests, newest first.
  ///
  /// Sorted on the device so the query stays a single-field equality and needs
  /// no composite index — the same trade every other queue in the app makes.
  Stream<List<KasemNameRequest>> watchMine(String uid) => _firestore
      .collection('kasemNameRequests')
      .where('uid', isEqualTo: uid)
      .limit(50)
      .snapshots()
      .map(_sorted);

  Future<void> submit({
    required String name,
    required String meaning,
    required String kind,
    required String note,
    required String handle,
  }) async {
    try {
      await _functions.httpsCallable('requestKasemName').call<Object?>({
        'name': name.trim(),
        'meaning': meaning.trim(),
        'kind': kind,
        'note': note.trim(),
        'handle': handle.trim(),
      });
    } on FirebaseFunctionsException catch (error) {
      // The callable's own message says whether the name is already published,
      // whether they have asked before, or what is wrong with the handle —
      // which is exactly what the member needs to read.
      throw KasemNameRequestFailure(
        error.message?.trim().isNotEmpty ?? false
            ? error.message!.trim()
            : 'That did not go through. Try again shortly.',
      );
    } on Object {
      throw const KasemNameRequestFailure(
        'That did not go through. Try again shortly.',
      );
    }
  }
}

/// Newest first, on the device.
List<KasemNameRequest> _sorted(
  QuerySnapshot<Map<String, dynamic>> snapshot,
) {
  final rows = snapshot.docs
      .map(KasemNameRequest.fromDoc)
      .whereType<KasemNameRequest>()
      .toList(growable: true)
    ..sort((left, right) {
      final leftAt = left.createdAt ?? DateTime(1970);
      final rightAt = right.createdAt ?? DateTime(1970);
      return rightAt.compareTo(leftAt);
    });
  return List<KasemNameRequest>.unmodifiable(rows);
}

final kasemNameRequestsRepositoryProvider =
    Provider<KasemNameRequestsRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return KasemNameRequestsRepository(
        FirebaseFirestore.instance,
        FirebaseFunctions.instance,
      );
    });

/// This member's own requests, so a screen can say "you already asked for this"
/// rather than letting somebody spend a day's quota asking twice.
final myKasemNameRequestsProvider = StreamProvider<List<KasemNameRequest>>((
  ref,
) {
  final repository = ref.watch(kasemNameRequestsRepositoryProvider);
  final uid = ref.watch(currentUidProvider);
  if (repository == null || uid == null) {
    return Stream.value(const <KasemNameRequest>[]);
  }
  return repository.watchMine(uid);
});

/// The folds this member already has a request in the queue for.
final pendingKasemNameAsciiProvider = Provider<Set<String>>((ref) {
  final requests =
      ref.watch(myKasemNameRequestsProvider).asData?.value ??
      const <KasemNameRequest>[];
  return {
    for (final request in requests)
      if (request.isPending) request.ascii,
  };
});
