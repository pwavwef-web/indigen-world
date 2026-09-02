/// The word classes a contributor may choose from, mirrored for the phone.
///
/// ── This file has a twin, and they must agree ────────────────────────────
/// The canonical list is `PARTS_OF_SPEECH` in
/// `services/functions/src/lexical-kinds.ts`. Every id below appears there,
/// spelled identically, and `submitWordTranslation` REJECTS an id it does not
/// recognise rather than storing `unknown` — deliberately, so a drift between
/// the two files shows up as a loud error on the first submission instead of
/// as a few hundred entries with a quietly wrong word class. If you add a
/// class here, add it there in the same commit.
///
/// Generating this from the backend at runtime was the obvious alternative and
/// it was wrong for this screen: the picker has to open instantly on a rural
/// connection, before any callable has answered, and a list that arrives late
/// is a list somebody has already scrolled past. The list is also *stable* —
/// it describes a language, not a configuration — so shipping it in the binary
/// costs a few hundred bytes and buys an offline-capable picker.
///
/// ── Why this list is long, and why ideophone is on it ────────────────────
/// The old dictionary form offered six: noun, verb, adjective, expression,
/// other, unknown. That is not a description of Kasem, it is a description of
/// a dropdown somebody wrote in an afternoon, and everything it could not name
/// landed in "Other" — which is where data goes to stop being searchable.
///
/// Kasem, like the Gur languages generally, has a large and productive
/// ideophone class: expressive words that depict manner, sound, texture or
/// intensity. Leaving it out would push several hundred perfectly ordinary
/// words into "Other" and then quietly teach contributors that their language
/// has an enormous "Other" category. It does not; it has ideophones.
/// `postposition`, `classifier`, `particle`, `quantifier`, `prefix` and
/// `suffix` are here for the same reason at smaller scale — a bound morpheme
/// is a real lexical entry and it is not a noun.
library;

import 'package:flutter/foundation.dart';

/// One selectable word class: a stable id to store, a label to show.
@immutable
class PartOfSpeech {
  const PartOfSpeech(this.id, this.label);

  /// Lowercase and hyphenated, because it is stored and queried. This is the
  /// value that goes over the wire as `partOfSpeech`.
  final String id;

  /// What a person reads. Free to be re-worded; the id is not.
  final String label;

  /// Everything a search in the picker may match against.
  ///
  /// Precomputed rather than built per keystroke: the list is 25 long and the
  /// filter runs on every character, and lowercasing 25 strings 25 times while
  /// somebody types "interjection" is work nobody asked for.
  String get haystack => '$label $id'.toLowerCase();

  @override
  String toString() => 'PartOfSpeech($id)';
}

/// The canonical list, in the canonical order.
///
/// Ordered roughly by how often a contributor reaches for it rather than
/// alphabetically: a member answering "water" wants Noun in the first row, not
/// after Article, Auxiliary verb and Classifier. The searchable picker makes
/// the tail reachable in two keystrokes, so the head is free to be useful.
const kPartsOfSpeech = <PartOfSpeech>[
  PartOfSpeech('noun', 'Noun'),
  PartOfSpeech('proper-noun', 'Proper noun'),
  PartOfSpeech('pronoun', 'Pronoun'),
  PartOfSpeech('verb', 'Verb'),
  PartOfSpeech('auxiliary-verb', 'Auxiliary verb'),
  PartOfSpeech('adjective', 'Adjective'),
  PartOfSpeech('adverb', 'Adverb'),
  PartOfSpeech('preposition', 'Preposition'),
  PartOfSpeech('postposition', 'Postposition'),
  PartOfSpeech('conjunction', 'Conjunction'),
  PartOfSpeech('determiner', 'Determiner'),
  PartOfSpeech('article', 'Article'),
  PartOfSpeech('numeral', 'Numeral'),
  PartOfSpeech('quantifier', 'Quantifier'),
  PartOfSpeech('particle', 'Particle'),
  PartOfSpeech('interjection', 'Interjection'),
  PartOfSpeech('ideophone', 'Ideophone'),
  PartOfSpeech('classifier', 'Classifier'),
  PartOfSpeech('prefix', 'Prefix'),
  PartOfSpeech('suffix', 'Suffix'),
  PartOfSpeech('phrase', 'Phrase'),
  PartOfSpeech('idiom', 'Idiom'),
  PartOfSpeech('proverb', 'Proverb'),
  PartOfSpeech('other', 'Other'),
  PartOfSpeech('unknown', 'Not sure'),
];

/// The class with this id, or null when nothing matches.
PartOfSpeech? partOfSpeechById(String? id) {
  if (id == null || id.isEmpty) return null;
  for (final entry in kPartsOfSpeech) {
    if (entry.id == id) return entry;
  }
  return null;
}

/// The classes matching what somebody typed into the picker's search box.
///
/// Substring rather than prefix matching, and against the id as well as the
/// label, because the two spellings people reach for are the middle of a word
/// ("noun" finds *Proper noun* and *Pronoun*) and the hyphenated id a linguist
/// already knows. An empty query returns the whole list rather than nothing,
/// so the picker opens showing its contents instead of showing a void that has
/// to be typed at before it admits it has any.
List<PartOfSpeech> filterPartsOfSpeech(String query) {
  final needle = query.trim().toLowerCase();
  if (needle.isEmpty) return kPartsOfSpeech;
  return [
    for (final entry in kPartsOfSpeech)
      if (entry.haystack.contains(needle)) entry,
  ];
}
