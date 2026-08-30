import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// The people the Kassena remember.
///
/// Chiefs, linguists, musicians, writers, elders — the names a community
/// teaches its children, gathered in one place because an archive of a
/// language that never says who spoke it is a dictionary, not a heritage.
///
/// Admin-curated, exactly like the Apps and Shop directories it sits beside in
/// Collection. Nobody contributes here from the app: a claim about who somebody
/// was is not something to crowd-source in a feed, and the project answers for
/// every word of it.
@immutable
class KasemHero {
  const KasemHero({
    required this.id,
    required this.name,
    this.alsoKnownAs = '',
    this.era = '',
    this.field = '',
    this.summary = '',
    this.story = '',
    this.birthplace = '',
    this.portraitUrl = '',
    this.sourceUrl = '',
  });

  final String id;
  final String name;

  /// A praise name, a title, a stage name — whatever else they are known by.
  final String alsoKnownAs;

  /// Free text rather than dates: `c. 1890–1961`, `nineteenth century`, or a
  /// living person's `born 1948`. Much of what is known is approximate, and a
  /// date field would force somebody to invent precision.
  final String era;

  /// What they are remembered for — `Chief`, `Linguist`, `Musician`.
  final String field;

  /// One or two sentences, for the list.
  final String summary;

  /// The whole account, for their own page.
  final String story;

  final String birthplace;
  final String portraitUrl;

  /// Where the account came from, so a reader can go further and a claim can be
  /// checked. Shown as a link on the hero's page.
  final String sourceUrl;

  /// The two initials drawn when there is no portrait — and there usually is
  /// not, for people who lived before cameras reached Paga.
  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '··';
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return parts.first
        .substring(0, parts.first.length >= 2 ? 2 : 1)
        .toUpperCase();
  }

  /// `Chief · c. 1890–1961`, with whichever halves exist.
  String get subtitle =>
      [field, era].where((part) => part.isNotEmpty).join(' · ');

  static KasemHero? fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final name = data['name'];
    if (name is! String || name.trim().isEmpty) return null;
    return KasemHero(
      id: doc.id,
      name: name.trim(),
      alsoKnownAs: _text(data['alsoKnownAs']),
      era: _text(data['era']),
      field: _text(data['field']),
      summary: _text(data['summary']),
      story: _text(data['story']),
      birthplace: _text(data['birthplace']),
      portraitUrl: _text(data['portraitUrl']),
      sourceUrl: _text(data['sourceUrl']),
    );
  }
}

String _text(Object? value) =>
    value is String && value.trim().isNotEmpty ? value.trim() : '';

class KasemHeroesRepository {
  const KasemHeroesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<KasemHero>> watchPublished() => _firestore
      .collection('kasemHeroes')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map(KasemHero.fromDoc)
            .whereType<KasemHero>()
            .toList(growable: false),
      );
}

final kasemHeroesRepositoryProvider = Provider<KasemHeroesRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return KasemHeroesRepository(FirebaseFirestore.instance);
});

/// Everyone the project has published, in the order it chose.
///
/// An unavailable Firebase launch is an empty list rather than an error, the
/// same way every other collection here behaves: the screen then says nobody
/// has been added yet, which is true and useful, instead of showing a spinner
/// that will never stop.
final kasemHeroesProvider = StreamProvider<List<KasemHero>>((ref) {
  final repository = ref.watch(kasemHeroesRepositoryProvider);
  if (repository == null) return Stream.value(const <KasemHero>[]);
  return repository.watchPublished();
});

/// One hero, the same for everybody, for the whole of one week.
///
/// By the week rather than the day, because a life is worth more than a
/// glance — somebody who opens the app on Tuesday and again on Friday should
/// still be with the same person. Chosen by the calendar rather than at random
/// so two people in a room see the same name, and it walks the list as the
/// weeks pass rather than circling the same few.
final heroOfTheWeekProvider = Provider<KasemHero?>((ref) {
  final heroes = ref.watch(kasemHeroesProvider).asData?.value;
  if (heroes == null || heroes.isEmpty) return null;
  final today = DateTime.now();
  final weeks =
      DateTime(
        today.year,
        today.month,
        today.day,
      ).difference(DateTime(2020)).inDays ~/
      7;
  return heroes[weeks.abs() % heroes.length];
});
