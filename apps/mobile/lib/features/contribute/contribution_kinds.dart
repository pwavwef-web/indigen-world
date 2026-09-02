import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_upload.dart';

/// What the Contribute flow knows about each kind of work.
///
/// These four helpers used to be private to the one 1400-line screen that held
/// the hub, the picker, the form and the activity list all at once. Splitting
/// that screen up left four callers needing the same answers, so they live
/// here rather than being copied — an icon that disagrees with itself between
/// the chooser and the submissions list is exactly the sort of drift a shared
/// file prevents.

/// The kinds a member may contribute from the phone.
///
/// Audiobooks are curated in the admin console instead. A narration is not one
/// upload but a production — a manuscript somebody else owns, a reader whose
/// permission is separate from the author's, and a running time measured in
/// hours rather than minutes. Every one we received from a phone had to be
/// taken apart and rebuilt by hand before it could be published, which is work
/// the console does properly and a form on a rural connection does badly.
///
/// [CollectionKind.audiobooks] deliberately stays in the enum: the Collection
/// tab still has an audiobooks shelf, the music player still plays what is on
/// it, and the review pipeline still carries narrations submitted before this.
/// Only the *offer* has been withdrawn.
const kMobileContributionKinds = <CollectionKind>[
  CollectionKind.music,
  CollectionKind.dictionary,
  CollectionKind.literature,
  CollectionKind.video,
];

/// What kind of lexical thing a dictionary contribution is.
///
/// This is a second axis, not four more [CollectionKind] values, and the
/// distinction is worth stating plainly because bolting them onto the shelf
/// enum was the first thing tried. `CollectionKind` answers "which shelf does
/// this end up on" — it drives the Collection tab, the review desk's filters,
/// the icon on a submissions row and the player. A proverb and a noun go on
/// the same shelf. What separates them is how they can be *asked for*, and
/// that is a different question with a different answer per contribution.
///
/// The distinction is the whole reason the guided queue can exist:
///
///   word    — has a headword, a word class and a translation, so it can be
///             put in front of somebody: "here is 'water', what is it in
///             Kasem?". This is the only kind the queue serves.
///   phrase  — a fixed multi-word expression that still behaves
///             compositionally ("in the morning"). Answerable, but not from a
///             single English word.
///   idiom   — means something its words do not, so nobody can be prompted for
///             one. It has to be remembered.
///   proverb — something somebody's grandmother said. It carries an occasion
///             and often a story, and there is no English word that would
///             elicit it.
///
/// So the queue offers `word` and the open form carries everything else. These
/// names are the wire values `submitCollectionContribution` and the word-queue
/// callables read: they must stay in step with `LEXICAL_KINDS` in
/// `services/functions/src/lexical-kinds.ts`.
enum LexicalKind {
  word,
  phrase,
  idiom,
  proverb;

  /// What the callables expect. Identical to [name] today, and named
  /// separately so a future rename of the Dart symbol cannot silently change
  /// what goes over the wire.
  String get wire => name;

  String get label => switch (this) {
    LexicalKind.word => 'Word',
    LexicalKind.phrase => 'Phrase',
    LexicalKind.idiom => 'Idiom',
    LexicalKind.proverb => 'Proverb',
  };
}

/// One card on "What are you contributing?".
///
/// An offer is not the same thing as a [CollectionKind], which is why this
/// exists at all. Dictionary is one shelf and two completely different acts:
/// answering a word we hand you, and bringing us a proverb nobody could have
/// asked you for. Those were one card for a long time, and the card led to a
/// blank field labelled "English or source word" — an open question with tens
/// of thousands of right answers, which is the same as no question at all.
/// Most people picked it, froze, and left.
///
/// Splitting the card is the fix, and the offer is what makes the split
/// cheap: the chooser renders a list of these rather than a list of enum
/// values, so a kind can appear twice with two different asks behind it
/// without anything else in the app learning a second enum.
@immutable
class ContributionOffer {
  const ContributionOffer({
    required this.kind,
    required this.title,
    required this.blurb,
    this.lexicalKind,
    this.icon,
  });

  /// The shelf this contribution ends up on.
  final CollectionKind kind;

  /// The lexical axis, for the kinds that have one. Null everywhere but the
  /// dictionary, where a song has no word class to speak of.
  final LexicalKind? lexicalKind;

  /// What the card is called. Deliberately a verb phrase on the split
  /// dictionary offers ("Translate a word") and the shelf's own name
  /// everywhere else, because those cards have not changed and renaming them
  /// would make four familiar tiles look new for no reason.
  final String title;

  final String blurb;

  /// Overrides the kind's glyph where two offers share a kind and would
  /// otherwise share an icon.
  final IconData? icon;

  IconData get glyph => icon ?? contributionKindIcon(kind);

  /// Whether this offer opens the guided queue rather than the open form.
  ///
  /// Asked as a property of the offer rather than checked at the call site,
  /// so the chooser has one branch instead of a pair of equality tests that
  /// have to agree with each other.
  bool get isGuidedQueue =>
      kind == CollectionKind.dictionary && lexicalKind == LexicalKind.word;
}

/// What the phone offers, in the order it offers it.
///
/// The guided queue is first on purpose. It is the only card that asks nothing
/// of a member except an answer — no file, no title, no deciding what is worth
/// contributing — and putting the lowest-cost offer at the top of a list of
/// asks is the difference between a volunteer starting and a volunteer
/// scrolling. Music, Literature and Video are untouched below it.
///
/// [LexicalKind.phrase] has no card. It is a real distinction the backend
/// stores and a bad question to put to somebody at a chooser — "is this a
/// phrase or an idiom?" is a linguistics question, not a contribution — so the
/// idiom-or-proverb form asks it once, in context, where the member can see
/// what they have written.
const kContributionOffers = <ContributionOffer>[
  ContributionOffer(
    kind: CollectionKind.dictionary,
    lexicalKind: LexicalKind.word,
    title: 'Translate a word',
    blurb: 'We give you a word, you give us the Kasem. One after another.',
    icon: Icons.bolt_rounded,
  ),
  ContributionOffer(
    kind: CollectionKind.dictionary,
    lexicalKind: LexicalKind.proverb,
    title: 'Add an idiom or proverb',
    blurb: 'A saying you know, in Kasem, and what it means.',
    icon: Icons.format_quote_rounded,
  ),
  ContributionOffer(
    kind: CollectionKind.music,
    title: 'Music',
    blurb:
        'A song, drumming or any recording — with the artwork that goes with '
        'it.',
  ),
  ContributionOffer(
    kind: CollectionKind.literature,
    title: 'Literature',
    blurb: 'A story, a poem or an oral history, written down or attached.',
  ),
  ContributionOffer(
    kind: CollectionKind.video,
    title: 'Video',
    blurb:
        'Footage of a place, a performance, a ceremony or a conversation.',
  ),
];

/// The glyph that stands for a kind, wherever it appears.
IconData contributionKindIcon(CollectionKind kind) => switch (kind) {
  CollectionKind.music => Icons.music_note_rounded,
  CollectionKind.dictionary => Icons.translate_rounded,
  CollectionKind.literature => Icons.auto_stories_rounded,
  CollectionKind.audiobooks => Icons.headphones_rounded,
  CollectionKind.video => Icons.movie_creation_rounded,
};

/// One line saying what this kind actually is, for somebody choosing.
///
/// `contributionLabel` names the kind ("a song or recording") and is right in
/// a sentence; on a card that already carries the word *Music* in bold it
/// would only say the same thing twice. These say what to bring instead.
String contributionKindBlurb(CollectionKind kind) => switch (kind) {
  CollectionKind.music =>
    'A song, drumming or any recording — with the artwork that goes with it.',
  CollectionKind.dictionary =>
    'A Kasem word or phrase, said out loud if you can.',
  CollectionKind.literature =>
    'A story, a poem or an oral history, written down or attached.',
  CollectionKind.audiobooks => 'A narrated reading of a written work.',
  CollectionKind.video =>
    'Footage of a place, a performance, a ceremony or a conversation.',
};

/// The kind of file each contribution carries, or null where it carries none.
///
/// A song and a narration *are* recordings, so they cannot be described in
/// prose alone. A written work may arrive as a manuscript or as typed text,
/// so its upload is optional. A dictionary word is neither.
ContributionMediaKind? contributionUploadKind(CollectionKind kind) =>
    switch (kind) {
      CollectionKind.music ||
      CollectionKind.audiobooks => ContributionMediaKind.audio,
      CollectionKind.literature => ContributionMediaKind.document,
      CollectionKind.video => ContributionMediaKind.video,
      CollectionKind.dictionary => null,
    };

bool contributionRequiresUpload(CollectionKind kind) =>
    kind == CollectionKind.music ||
    kind == CollectionKind.audiobooks ||
    kind == CollectionKind.video;

/// What a stored review status is called in front of the member who sent it.
String contributionStatusLabel(String status) => switch (status.toLowerCase()) {
  'approved' => 'Approved',
  'needs_changes' || 'needs_revision' => 'Needs changes',
  'rejected' => 'Not approved',
  'published' => 'Published',
  'scheduled' => 'Scheduled',
  'under_review' => 'Under review',
  'withdrawn' => 'Withdrawn',
  'archived' => 'Approved privately',
  _ => 'Submitted for review',
};

/// The statuses a reviewer has finished with, one way or the other.
///
/// Everything else is still somebody's open tab, which is what the hub counts
/// when it says how many submissions are in review.
const _settledStatuses = {
  'approved',
  'published',
  'scheduled',
  'archived',
  'rejected',
  'withdrawn',
};

bool contributionAwaitingReview(String status) =>
    !_settledStatuses.contains(status.toLowerCase());
