import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/kasem_morphology.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/parts_of_speech.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/translation_parser.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_controller.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/part_of_speech_picker.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/queue_word_card.dart';
import 'package:indigen_world_mobile/features/contribute/words/widgets/translation_field.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// One word at a time, until the member has had enough.
///
/// ── The problem this screen exists to solve ──────────────────────────────
/// The dictionary offer used to open a blank form whose first field was
/// labelled "English or source word". There are tens of thousands of English
/// words; asked to pick one, people freeze and leave. Every part of this
/// screen is a consequence of that: the app supplies the word, the sentence
/// says which sense of it is meant, the answer box takes a list because that
/// is how people answer, and passing on a word costs one tap and no
/// explanation.
///
/// ── Why the receipt is a strip and not a celebration ─────────────────────
/// [ContributionReceivedScreen] takes over the whole screen and draws a tick
/// that animates for eight hundred milliseconds. That is right for a song
/// somebody's grandmother sang, which is submitted once and is a moment. It
/// would be exhausting here: a member in the rhythm of this queue may answer
/// twenty words in a sitting, and twenty full-screen celebrations is twenty
/// interruptions of the one thing that makes the queue work — the next word
/// arriving *in place*. So the confirmation is an inline strip above the new
/// word, the queue advances past it, and nothing is dismissed.
class WordQueueScreen extends ConsumerStatefulWidget {
  const WordQueueScreen({super.key});

  @override
  ConsumerState<WordQueueScreen> createState() => _WordQueueScreenState();
}

class _WordQueueScreenState extends ConsumerState<WordQueueScreen> {
  final _formKey = GlobalKey<FormState>();
  final _translations = TextEditingController();
  final _kasemExample = TextEditingController();
  final _notes = TextEditingController();

  /// The noun said with *the*, and said for many.
  ///
  /// Both optional, both shown only for Noun. They are the answer to a
  /// question this app used to ask fifteen thousand times and could never get
  /// an answer to: definiteness in Kasem is a property of the noun rather than
  /// a word of its own, so there is no Kasem for "the" — there is only the
  /// form a speaker says. See `kasem_morphology.dart`.
  final _definiteForm = TextEditingController();
  final _pluralForm = TextEditingController();

  PartOfSpeech? _partOfSpeech;

  /// Kept across words on purpose.
  ///
  /// The dialect is a fact about the member, not about the word. Asking
  /// somebody from Paga to say so again on every single word is exactly the
  /// friction that ends a sitting at four words instead of twenty.
  String? _dialect;

  /// Whether the sentence above the form showed the word's plain meaning.
  ///
  /// Starts at [WordQueueSentenceFit.fits] for every word, because that is
  /// true of almost every word and because a control that starts unanswered
  /// is a control every member has to deal with. Reset with the rest of the
  /// answer — a remark about one word's sentence is nonsense on the next.
  WordQueueSentenceFit _sentenceFit = WordQueueSentenceFit.fits;

  /// The saying a member has just told us they saw, waiting to be offered.
  ///
  /// Held here rather than on the receipt because it is not a fact about the
  /// submission that was made — it is a fact about one the member might make
  /// next. Set only when they flagged the sentence as an idiom, cleared as
  /// soon as the offer stops being on screen.
  String? _idiomPrompt;

  /// Empties everything that was an answer to the word that has just gone.
  void _clearAnswer() {
    _translations.clear();
    _kasemExample.clear();
    _notes.clear();
    _definiteForm.clear();
    _pluralForm.clear();
    if (mounted) {
      setState(() {
        _partOfSpeech = null;
        _sentenceFit = WordQueueSentenceFit.fits;
      });
    }
  }

  @override
  void dispose() {
    _translations.dispose();
    _kasemExample.dispose();
    _notes.dispose();
    _definiteForm.dispose();
    _pluralForm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Read before the controller is watched, so a signed-out member never
    // triggers a fetch that can only come back `unauthenticated`. The queue
    // callables all require auth; asking anyway would spend a round trip on a
    // rural connection to learn something the phone already knew.
    final firebaseReady = ref.watch(firebaseReadyProvider);
    final signedIn = ref.watch(isSignedInProvider);
    if (firebaseReady && !signedIn) {
      return _shell(child: const _SignInFirst());
    }

    // One place decides that the form belongs to the word above it.
    //
    // Clearing at each call site was the first attempt and it leaked: sending
    // cleared the fields, and skipping did not, so a member who typed half an
    // answer and then passed on the word carried their half-answer onto the
    // next one — where it was very easy not to notice before tapping send. The
    // form empties whenever the question changes, whatever changed it.
    ref.listen(wordQueueControllerProvider, (previous, next) {
      if (previous?.word?.id == next.word?.id) return;
      _clearAnswer();
    });

    final state = ref.watch(wordQueueControllerProvider);
    return _shell(
      child: switch (state.stage) {
        WordQueueStage.loading => const _Waiting(),
        WordQueueStage.ready => _answering(state),
        WordQueueStage.finished => _StandingDown(
          state: state,
          title: 'That is the whole queue.',
          detail:
              'Every word we are holding has been answered — by you or by '
              'somebody else. More are added as the dictionary grows, so come '
              'back and there will be new ones.',
          icon: Icons.flag_rounded,
        ),
        WordQueueStage.quiet => _StandingDown(
          state: state,
          title: 'Nothing new came back.',
          detail:
              'You have already dealt with everything in the part of the '
              'queue we looked at. Try again in a moment.',
          icon: Icons.hourglass_empty_rounded,
          onRetry: () =>
              ref.read(wordQueueControllerProvider.notifier).refresh(),
        ),
        WordQueueStage.unavailable => _StandingDown(
          state: state,
          title: 'The queue needs a connection.',
          detail:
              'Words are fetched a batch at a time and none of them reached '
              'this phone. Everything else in Contribute still works offline '
              'until you are back.',
          icon: Icons.cloud_off_rounded,
        ),
        WordQueueStage.failed => _StandingDown(
          state: state,
          title: 'The words did not arrive.',
          detail: state.message ?? 'Check your connection and try again.',
          icon: Icons.error_outline_rounded,
          onRetry: () =>
              ref.read(wordQueueControllerProvider.notifier).refresh(),
        ),
      },
    );
  }

  Widget _shell({required Widget child}) => Scaffold(
    backgroundColor: context.brand.background,
    appBar: AppBar(title: const Text('Translate a word')),
    body: ScreenContainer(
      child: ListView(
        key: const PageStorageKey('word-queue-scroll'),
        // The mini-player floats above the Navigator and covers a pushed route
        // too, so the space it needs is asked for rather than assumed.
        padding: EdgeInsets.fromLTRB(20, 6, 20, 40 + musicInset(context)),
        children: [child],
      ),
    ),
  );

  Widget _answering(WordQueueState state) {
    final word = state.word!;
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Shown until the first thing is done and then never again. It is
        // orientation, not instruction: somebody four words in knows how this
        // works, and a sentence that keeps explaining it starts reading as an
        // apology for the screen.
        if (state.answered == 0 && state.skipped == 0) ...[
          Text(
            'We give you an English word. You give us the Kasem. '
            'Pass on anything you are not sure about.',
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 12.5,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 14),
        ] else ...[
          _SittingTally(state: state),
          const SizedBox(height: 12),
        ],

        if (state.receipt case final receipt?) ...[
          _JustSent(
            receipt: receipt,
            idiomPrompt: _idiomPrompt,
            onRecordIdiom: _recordIdiom,
            onDismiss: () {
              setState(() => _idiomPrompt = null);
              ref.read(wordQueueControllerProvider.notifier).dismissReceipt();
            },
          ),
          const SizedBox(height: 12),
        ],

        QueueWordCard(key: ValueKey(word.id), word: word),

        // Between the card and the form on purpose. The card is the question;
        // this is a remark *about* the question, and putting it down among the
        // answer fields would read as one more thing to fill in.
        if (word.sentence.isNotEmpty) ...[
          const SizedBox(height: 12),
          _SentenceFitControl(
            value: _sentenceFit,
            enabled: !state.sending,
            onChanged: (value) => setState(() => _sentenceFit = value),
          ),
        ],
        const SizedBox(height: 16),

        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TranslationField(
                controller: _translations,
                enabled: !state.sending,
              ),
              const SizedBox(height: 13),
              PartOfSpeechField(
                value: _partOfSpeech,
                enabled: !state.sending,
                onChanged: (value) => setState(() => _partOfSpeech = value),
              ),
              // Shown only for a noun, and never required. Everything else —
              // every verb, every adjective, every noun whose contributor does
              // not want to elaborate — costs exactly zero extra keystrokes.
              if (_partOfSpeech?.id == 'noun') ...[
                const SizedBox(height: 13),
                _NounForms(
                  definite: _definiteForm,
                  plural: _pluralForm,
                  enabled: !state.sending,
                ),
              ],
              const SizedBox(height: 13),
              DropdownButtonFormField<String>(
                initialValue: _dialect,
                decoration: const InputDecoration(
                  labelText: 'Dialect or region',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
                items: const [
                  DropdownMenuItem(value: 'Navrongo', child: Text('Navrongo')),
                  DropdownMenuItem(value: 'Paga', child: Text('Paga')),
                  DropdownMenuItem(value: 'Chiana', child: Text('Chiana')),
                  DropdownMenuItem(value: 'Other', child: Text('Other')),
                  DropdownMenuItem(value: 'Not sure', child: Text('Not sure')),
                ],
                onChanged: state.sending
                    ? null
                    : (value) => setState(() => _dialect = value),
                validator: (value) =>
                    value == null ? 'Choose a dialect.' : null,
              ),
              const SizedBox(height: 13),
              TextFormField(
                controller: _kasemExample,
                enabled: !state.sending,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Kasem example (optional)',
                  hintText: 'Use the word naturally in a sentence',
                  alignLabelWithHint: true,
                  prefixIcon: Icon(Icons.chat_bubble_outline_rounded),
                ),
              ),
              const SizedBox(height: 13),
              TextFormField(
                controller: _notes,
                enabled: !state.sending,
                minLines: 1,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Context for reviewers (optional)',
                  hintText: 'Spelling notes, who says it, when it is used',
                  alignLabelWithHint: true,
                  prefixIcon: Icon(Icons.fact_check_outlined),
                ),
              ),
            ],
          ),
        ),

        if (state.message != null) ...[
          const SizedBox(height: 14),
          _QueueMessage(message: state.message!),
        ],

        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: state.sending ? null : _submit,
          icon: state.sending
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.send_rounded),
          label: Text(state.sending ? 'Sending…' : 'Send and take the next'),
        ),
        const SizedBox(height: 9),
        const _PointsNote(),
        const SizedBox(height: 18),
        _SkipControls(enabled: !state.sending, onSkip: _skip),
        // Said only when it is reassuring. "1 more ready" would draw attention
        // to a buffer that is about to be topped up anyway; a healthy number
        // tells a member on a wavering signal that they can keep going.
        if (state.buffered > 1) ...[
          const SizedBox(height: 14),
          Text(
            '${state.buffered} more words are already on this phone.',
            textAlign: TextAlign.center,
            style: TextStyle(color: brand.faintInk, fontSize: 11),
          ),
        ],
      ],
    );
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final chosen = _partOfSpeech;
    if (chosen == null) return;

    // Read before sending: the word on screen is about to be replaced, and the
    // sentence is the one thing the offer afterwards needs.
    final fit = _sentenceFit;
    final sentence = ref.read(wordQueueControllerProvider).word?.sentence ?? '';

    final sent = await ref
        .read(wordQueueControllerProvider.notifier)
        .submit(
          WordTranslationDraft(
            wordId: ref.read(wordQueueControllerProvider).word?.id ?? '',
            translations: parseTranslations(_translations.text),
            partOfSpeech: chosen.id,
            dialect: _dialect ?? '',
            notes: _notes.text.trim(),
            kasemExample: _kasemExample.text.trim(),
            sentenceFit: fit,
            // Sent whatever the word class currently says. The fields are only
            // reachable for a noun, and the server drops them for anything
            // else rather than erroring — so a member who typed a definite
            // form and then changed their mind about the class loses the form
            // quietly instead of losing the whole submission.
            definiteForm: _definiteForm.text.trim(),
            pluralForm: _pluralForm.text.trim(),
          ),
        );
    if (!sent || !mounted) return;

    // Offered only after the send, never before it. Interrupting somebody
    // mid-word to ask for a second contribution is how the rhythm of this
    // queue dies; offering once the word is gone costs nothing to ignore.
    setState(() {
      _idiomPrompt = fit == WordQueueSentenceFit.idiom && sentence.isNotEmpty
          ? sentence
          : null;
    });

    // The fields have already emptied — the word changed, and the listener in
    // `build` owns that. All that is left is where the member is looking.
    await _scrollToTop();
  }

  /// Passes on the word on screen, and puts the next one in front of the eyes
  /// that asked for it.
  ///
  /// The skip controls sit at the *bottom* of a form that runs well past the
  /// bottom of a phone, so a member who has scrolled down to reach them is,
  /// the instant they tap, looking at an empty form with the new word out of
  /// sight above it — which reads as nothing having happened. A send already
  /// scrolled back for exactly this reason; a skip changes the word just as
  /// completely and had been left out.
  ///
  /// [WordQueueController.skip] advances the queue before it touches the
  /// network on purpose, so the next word is already on screen here and the
  /// scroll is never waiting on a round trip.
  Future<void> _skip(WordQueueSkipReason reason) async {
    FocusScope.of(context).unfocus();
    final recorded = ref
        .read(wordQueueControllerProvider.notifier)
        .skip(reason);
    await _scrollToTop();
    await recorded;
  }

  /// Puts the member's eyes back on the question.
  ///
  /// Guarded on `hasClients`: the controller exists in the tree whether or not
  /// this route's list is attached to it, and animating a controller with no
  /// clients throws.
  Future<void> _scrollToTop() async {
    final scroll = PrimaryScrollController.maybeOf(context);
    if (scroll == null || !scroll.hasClients) return;
    await scroll.animateTo(
      0,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
    );
  }

  /// Hands the saying the member just spotted to the open contribution form.
  ///
  /// Navigation rather than a second form on this screen, and no new backend
  /// surface at all: [ContributionFormScreen] already knows how to take an
  /// idiom, and `parseCollectionContributionInput` already accepts every field
  /// it sends. The English sentence seeds the title, so all the member types
  /// is what it means and the Kasem for it.
  ///
  /// This is where the "put in a good word for me" case finally goes somewhere
  /// instead of being thrown away by a skip.
  Future<void> _recordIdiom(String prompt) async {
    setState(() => _idiomPrompt = null);
    ref.read(wordQueueControllerProvider.notifier).dismissReceipt();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ContributionFormScreen(
          kind: CollectionKind.dictionary,
          lexicalKind: LexicalKind.idiom,
          initialSource: prompt,
        ),
      ),
    );
  }
}

/// The two forms that make "the" answerable, and the one that never needs to be.
///
/// ── Why this asks for words and not for a noun class ─────────────────────
/// The obvious design was a noun-class picker. It would have been far less
/// work and it would have collected almost nothing: most fluent speakers of
/// any language cannot name their own noun classes, and a picker somebody
/// cannot answer is a picker they set to the first item. So this asks two
/// questions any Kasem speaker answers without thinking — say it with *the*,
/// say it for many — and the class is worked out from the answer on the
/// server. Nobody using this app ever sees the phrase "noun class".
///
/// ── Why the plain form is stated rather than asked for ───────────────────
/// The indefinite is invariant: the noun, then `mo`. Asking fifteen thousand
/// times for a form that follows a single rule is exactly the pattern this
/// whole change exists to stop. Saying it out loud instead does two useful
/// things for free — it teaches the member something true about their own
/// language, and it stops them typing "bu mo" into the meaning box above.
class _NounForms extends StatelessWidget {
  const _NounForms({
    required this.definite,
    required this.plural,
    required this.enabled,
  });

  final TextEditingController definite;
  final TextEditingController plural;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(11, 9, 11, 9),
          decoration: BoxDecoration(
            color: brand.accent.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.lightbulb_outline_rounded, size: 15, color: brand.accent),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'The plain form is just the word and $kIndefiniteParticle — '
                  'that is automatic in Kasem, so you never need to type it. '
                  'These two are the ones that change.',
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 11.5,
                    height: 1.45,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 11),
        TextFormField(
          controller: definite,
          enabled: enabled,
          decoration: const InputDecoration(
            labelText: 'Say it with “the” (optional)',
            hintText: 'the boy → …',
            prefixIcon: Icon(Icons.label_important_outline_rounded),
          ),
        ),
        const SizedBox(height: 11),
        TextFormField(
          controller: plural,
          enabled: enabled,
          decoration: const InputDecoration(
            labelText: 'Say it for many (optional)',
            hintText: 'boys → …',
            prefixIcon: Icon(Icons.groups_outlined),
          ),
        ),
      ],
    );
  }
}

/// "Did that sentence actually show the word?"
///
/// ── Why this is here at all ──────────────────────────────────────────────
/// Queue rank 31 is the word *word*, and its sentence is "My teacher put in a
/// good word for me." A fluent speaker knows the Kasem for *word* perfectly
/// well; the sentence is about recommending somebody. Before this control they
/// had three options and all of them were bad — translate the idiom and poison
/// the entry, translate the plain word and leave a reviewer unable to tell
/// which they meant, or skip a word they could answer.
///
/// So this is not a skip. It rides alongside a real answer.
///
/// ── Why it costs nothing when the sentence is fine ───────────────────────
/// Pre-selected on "The sentence fits", which is true of the overwhelming
/// majority of the fifteen thousand rows. A member who never looks at it has
/// still said something true, and the median word costs zero taps. That is the
/// test every addition to this screen has to pass: a queue that grows a field
/// per word is a queue people answer four words in instead of twenty.
class _SentenceFitControl extends StatelessWidget {
  const _SentenceFitControl({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final WordQueueSentenceFit value;
  final bool enabled;
  final ValueChanged<WordQueueSentenceFit> onChanged;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Does that sentence show the plain word?',
          style: TextStyle(
            color: brand.mutedInk,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 7),
        Wrap(
          spacing: 7,
          runSpacing: 7,
          children: [
            for (final fit in WordQueueSentenceFit.values)
              ChoiceChip(
                label: Text(fit.label),
                selected: fit == value,
                onSelected: enabled ? (_) => onChanged(fit) : null,
              ),
          ],
        ),
      ],
    );
  }
}

/// The running total for this sitting.
///
/// This sitting, not this member: the number that makes somebody answer a
/// fourth word is the three they have just done. Their lifetime total lives on
/// the Learn tab, where it belongs and where somebody else owns it.
class _SittingTally extends StatelessWidget {
  const _SittingTally({required this.state});

  final WordQueueState state;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final parts = <String>[
      if (state.answered > 0)
        state.answered == 1 ? '1 word sent' : '${state.answered} words sent',
      if (state.skipped > 0) '${state.skipped} passed',
    ];
    return GlassSurface(
      blur: false,
      lifted: false,
      radius: 14,
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
      child: Row(
        children: [
          Icon(Icons.bolt_rounded, size: 15, color: brand.gold),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              parts.join(' · '),
              style: TextStyle(
                color: brand.ink,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          if (state.answered > 0)
            Text(
              // The conditional is load-bearing. Nothing has been awarded yet.
              '${state.pointsIfApproved} pts if approved',
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
        ],
      ),
    );
  }
}

/// The inline confirmation the queue advances past.
///
/// Deliberately small — see the note on [WordQueueScreen] about why this is
/// not the full-screen tick. It repeats what was sent because that is the one
/// thing a member cannot check any other way once the word has gone: if the
/// chips said something they did not mean, this is where they find out.
class _JustSent extends StatelessWidget {
  const _JustSent({
    required this.receipt,
    required this.onDismiss,
    this.idiomPrompt,
    this.onRecordIdiom,
  });

  final WordTranslationReceipt receipt;
  final VoidCallback onDismiss;

  /// The English sentence the member flagged as a saying, or null.
  ///
  /// Null on every ordinary send, which is almost all of them — the offer
  /// below appears only for the member who has just told us the sentence was
  /// an idiom, and only for as long as this strip is on screen.
  final String? idiomPrompt;

  final ValueChanged<String>? onRecordIdiom;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final answer = receipt.translations.join(', ');
    return GlassSurface(
      blur: false,
      lifted: false,
      radius: 16,
      accent: brand.success,
      padding: const EdgeInsets.fromLTRB(13, 11, 7, 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_circle_rounded, size: 17, color: brand.success),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  answer.isEmpty
                      ? '“${receipt.word}” sent for review'
                      : '“${receipt.word}” → $answer',
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 13,
                    height: 1.35,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'In the review queue. Worth $kApprovedWordPoints points '
                  'once a reviewer approves it.',
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 11,
                    height: 1.4,
                  ),
                ),
                // An idiom nobody writes down is an idiom lost. The member has
                // just proved they recognised one; asking now, while it is
                // still in their head, is the only cheap moment there will be.
                if (idiomPrompt case final prompt?
                    when onRecordIdiom != null) ...[
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () => onRecordIdiom!(prompt),
                      icon: const Icon(Icons.auto_stories_outlined, size: 15),
                      label: const Text('Record that saying too?'),
                    ),
                  ),
                ],
              ],
            ),
          ),
          IconButton(
            tooltip: 'Dismiss',
            visualDensity: VisualDensity.compact,
            onPressed: onDismiss,
            icon: Icon(Icons.close_rounded, size: 17, color: brand.faintInk),
          ),
        ],
      ),
    );
  }
}

/// Two ways to pass, both of them one tap and neither of them an apology.
///
/// ── Why skipping is a first-class control ────────────────────────────────
/// A member who cannot skip has two options: invent a translation, or close
/// the app. The first is worse for the dictionary than the second, and it is
/// the one people pick — nobody likes being the person who could not answer.
/// So the control sits directly under Send, where the thumb already is, and
/// the wording never suggests failure.
///
/// The two reasons are separate because they are different signal, and the
/// backend keeps them apart in aggregate: a word a hundred people marked
/// "don't know" may not exist in Kasem at all, while a hundred "not sure
/// enough" marks say the word is fine and the *sentence* is bad. Neither is
/// ever stored against the member who said it.
class _SkipControls extends StatelessWidget {
  const _SkipControls({required this.enabled, required this.onSkip});

  final bool enabled;
  final ValueChanged<WordQueueSkipReason> onSkip;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Not this one? Pass it on — it costs nothing and helps us just as '
          'much to know.',
          textAlign: TextAlign.center,
          style: TextStyle(color: brand.mutedInk, fontSize: 11.5, height: 1.45),
        ),
        const SizedBox(height: 10),
        for (final reason in WordQueueSkipReason.values) ...[
          OutlinedButton.icon(
            onPressed: enabled ? () => onSkip(reason) : null,
            icon: Icon(
              reason == WordQueueSkipReason.unknown
                  ? Icons.help_outline_rounded
                  : Icons.pending_outlined,
              size: 18,
            ),
            label: Text(reason.label),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

/// What a word is worth, and when.
///
/// The second sentence is the whole reason this widget exists rather than a
/// bare number. Points move in a Firestore trigger when a reviewer accepts the
/// submission; saying "you earned 10 points" at the moment of sending would be
/// a promise this app is not in a position to make, and a total that goes up
/// and then quietly comes back down is how somebody stops believing all of it.
class _PointsNote extends StatelessWidget {
  const _PointsNote();

  @override
  Widget build(BuildContext context) => Text(
    'An approved word is worth $kApprovedWordPoints points. They are added '
    'when a reviewer approves it, not when you send it.',
    textAlign: TextAlign.center,
    style: TextStyle(color: context.brand.mutedInk, fontSize: 11, height: 1.45),
  );
}

class _QueueMessage extends StatelessWidget {
  const _QueueMessage({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: brand.terracotta.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: brand.terracotta.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, color: brand.terracotta),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}

/// The first frame, before any batch has landed.
class _Waiting extends StatelessWidget {
  const _Waiting();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 72),
    child: Column(
      children: [
        const SizedBox.square(
          dimension: 26,
          child: CircularProgressIndicator(strokeWidth: 2.5),
        ),
        const SizedBox(height: 16),
        Text(
          'Fetching words…',
          style: TextStyle(color: context.brand.mutedInk, fontSize: 12.5),
        ),
      ],
    ),
  );
}

/// Every state where there is no word to answer.
///
/// One widget rather than four near-identical ones, because the difference
/// between "you finished the queue", "nothing came back", "you are offline"
/// and "that failed" is entirely in the sentence — and writing the sentences
/// side by side at the call site is what stopped three of them saying the same
/// vague thing. The tally comes along so a sitting that ended at the end of the
/// queue still shows what it was worth.
class _StandingDown extends StatelessWidget {
  const _StandingDown({
    required this.state,
    required this.title,
    required this.detail,
    required this.icon,
    this.onRetry,
  });

  final WordQueueState state;
  final String title;
  final String detail;
  final IconData icon;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 34),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (state.answered > 0 || state.skipped > 0) ...[
            _SittingTally(state: state),
            const SizedBox(height: 18),
          ],
          GlassSurface(
            blur: false,
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
            child: Column(
              children: [
                GlassIconPlate(icon: icon, size: 52),
                const SizedBox(height: 16),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 9),
                Text(
                  detail,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: brand.mutedInk, height: 1.55),
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The queue needs a name on the answer, so it asks for one before it starts.
///
/// Asked here rather than at the send button, which is what the open
/// contribution form does. The difference is that the form is somebody's own
/// work typed over several minutes and interrupting it at the end costs
/// nothing; here, a member would answer a word, be asked to sign in, and land
/// back on a screen that has to re-fetch — having spent their effort on a word
/// the queue may no longer be offering.
class _SignInFirst extends ConsumerWidget {
  const _SignInFirst();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(top: 34),
      child: GlassSurface(
        blur: false,
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
        child: Column(
          children: [
            const GlassIconPlate(icon: Icons.badge_outlined, size: 52),
            const SizedBox(height: 16),
            Text(
              'Sign in to answer words.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 9),
            Text(
              'Every translation is credited to whoever sent it, and the '
              'points for an approved word go to their account — so the queue '
              'needs to know who you are before it hands you one.',
              textAlign: TextAlign.center,
              style: TextStyle(color: brand.mutedInk, height: 1.55),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () => showSignInSheet(context),
              icon: const Icon(Icons.login_rounded),
              label: const Text('Sign in'),
            ),
          ],
        ),
      ),
    );
  }
}
