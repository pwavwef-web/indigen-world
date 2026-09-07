import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/kasem_morphology.dart';

/// Everything an advanced dictionary entry asks for beyond the word and its
/// meaning — the paradigm, the other classes it is used as, and the three
/// pieces of detail that turn a row into an entry.
///
/// ── Why this is one widget used twice ────────────────────────────────────
/// The guided queue and the open contribution form reach the same review desk
/// and produce the same published entry. Written twice they would drift, and
/// the drift would be invisible: a noun contributed through the open form
/// would quietly carry fewer forms than the same noun answered in the queue,
/// and nobody would notice until somebody compared two entries.
///
/// ── The rule every field here has to pass ────────────────────────────────
/// *The median word costs zero extra taps.* A queue that grows a field per
/// word is a queue people answer four words in instead of twenty, and that is
/// not a guess — it is why the whole guided flow exists. So: nothing here is
/// required, nothing here is shown for a class it does not belong to, and the
/// deeper questions appear only once the shallower one has been answered. A
/// member who types a translation, picks "Noun" and sends has seen two extra
/// boxes and been asked for nothing.

/// The set of classes whose paradigm is worth drawing.
///
/// Kept as ids rather than a bool because "is this a noun" and "is this a
/// verb" are asked separately and an entry can be both — which is the case
/// [LexicalFormsSection] exists to handle.
bool takesNounForms(Iterable<String> classes) =>
    classes.any((id) => id == 'noun' || id == 'proper-noun');

bool takesVerbForms(Iterable<String> classes) =>
    classes.any((id) => id == 'verb' || id == 'auxiliary-verb');

/// The classes whose form is chosen by the word they attach to or stand for.
///
/// ── Why this list is short, and what is deliberately off it ──────────────
/// Every class here is covered by a speaker's own statement. Francis gave the
/// quantifier pattern outright — *"everything will be either te maama, ya
/// maama, se maama, de maama etc depending on what you are talking about … it
/// is just like the numbers"* — the numeral series is attested six ways, a Gur
/// determiner and article *are* the class markers, and a pronoun agrees with
/// what it replaces. The adjective is the one short inference, and it sits in
/// the same slot in the phrase as the quantifier and numeral that flank it.
///
/// Off the list until somebody attests otherwise: adverb, preposition,
/// postposition, conjunction, particle, interjection, classifier, prefix,
/// suffix and — the deliberate one — ideophone. Gur ideophones often do carry
/// intensive and reduplicated forms, and inventing a paradigm for this
/// language's largest poorly-described class is exactly the failure the whole
/// module is written to avoid. Mirrors `AGREEING_CLASSES` on the server.
bool takesAgreementForms(Iterable<String> classes) => classes.any(
  (id) => const {
    'adjective',
    'quantifier',
    'numeral',
    'determiner',
    'article',
    'pronoun',
  }.contains(id),
);

/// The other classes a contributor is offered, per declared class.
///
/// ── Deliberately two or three, not the whole list ────────────────────────
/// The full word-class list runs to twenty-five entries, and a picker with
/// twenty-five options attached to an optional question is a picker nobody
/// opens. What is offered instead is the crossing that actually happens: a
/// Kasem noun that is also used as a verb, a verb also used as a noun, and the
/// noun/adjective overlap that Gur languages are full of. Anything rarer is
/// still recordable — through the reviewer, and through the notes box — and
/// does not need to cost every contributor a decision.
List<String> crossClassOffers(String declared) => switch (declared) {
  'noun' || 'proper-noun' => const ['verb', 'adjective'],
  'verb' || 'auxiliary-verb' => const ['noun', 'adjective'],
  'adjective' => const ['noun', 'verb'],
  _ => const <String>[],
};

/// Human labels for the handful of ids [crossClassOffers] hands out.
String crossClassLabel(String id) => switch (id) {
  'noun' => 'a thing',
  'verb' => 'an action',
  'adjective' => 'a describing word',
  _ => id,
};

/// Every text field this section owns, in one place that can be disposed.
///
/// A plain holder rather than a `ChangeNotifier`: the controllers already
/// notify, and the only state above them is which chips are selected, which
/// the host screen owns because it also decides what to send.
class LexicalFormsControllers {
  LexicalFormsControllers();

  // The noun paradigm.
  final definite = TextEditingController();
  final plural = TextEditingController();
  final pluralDefinite = TextEditingController();
  final counted = TextEditingController();
  final pronoun = TextEditingController();

  // The verb paradigm.
  final present = TextEditingController();
  final past = TextEditingController();
  final future = TextEditingController();
  final pluralSubject = TextEditingController();
  final imperative = TextEditingController();

  // Concord, for the words that change with what they go with.
  final agreeingOne = TextEditingController();
  final agreeingTwo = TextEditingController();

  // The three that make an entry rather than a row.
  final ipa = TextEditingController();
  final kasemDefinition = TextEditingController();
  final etymology = TextEditingController();

  List<TextEditingController> get _all => [
    definite,
    plural,
    pluralDefinite,
    counted,
    pronoun,
    present,
    past,
    future,
    pluralSubject,
    imperative,
    agreeingOne,
    agreeingTwo,
    ipa,
    kasemDefinition,
    etymology,
  ];

  void clear() {
    for (final controller in _all) {
      controller.clear();
    }
  }

  void dispose() {
    for (final controller in _all) {
      controller.dispose();
    }
  }

  String get definiteText => definite.text.trim();
  String get pluralText => plural.text.trim();
  String get pluralDefiniteText => pluralDefinite.text.trim();
  String get countedText => counted.text.trim();
  String get pronounText => pronoun.text.trim();
  String get presentText => present.text.trim();
  String get pastText => past.text.trim();
  String get futureText => future.text.trim();
  String get pluralSubjectText => pluralSubject.text.trim();
  String get imperativeText => imperative.text.trim();
  String get agreeingOneText => agreeingOne.text.trim();
  String get agreeingTwoText => agreeingTwo.text.trim();
  String get ipaText => ipa.text.trim();
  String get kasemDefinitionText => kasemDefinition.text.trim();
  String get etymologyText => etymology.text.trim();
}

/// The paradigm, drawn for whichever classes this word claims.
class LexicalFormsSection extends StatelessWidget {
  const LexicalFormsSection({
    required this.controllers,
    required this.declaredClass,
    required this.alsoUsedAs,
    required this.onAlsoUsedAsChanged,
    required this.enabled,
    super.key,
  });

  final LexicalFormsControllers controllers;

  /// The class the contributor chose from the picker, as a stable id.
  final String declaredClass;

  /// The other classes they have said it is also used as.
  final Set<String> alsoUsedAs;

  final ValueChanged<Set<String>> onAlsoUsedAsChanged;
  final bool enabled;

  List<String> get _classes => [declaredClass, ...alsoUsedAs];

  @override
  Widget build(BuildContext context) {
    final offers = crossClassOffers(declaredClass);
    final showNoun = takesNounForms(_classes);
    final showVerb = takesVerbForms(_classes);
    final showAgreement = takesAgreementForms(_classes);
    if (!showNoun && !showVerb && !showAgreement && offers.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showNoun) ...[
          const SizedBox(height: 13),
          _NounParadigm(controllers: controllers, enabled: enabled),
        ],
        // The offer sits between the two paradigms rather than at the end,
        // because on a noun it is the control that *reveals* the second one.
        // Below the tenses it would be a switch under the thing it switches
        // on.
        if (offers.isNotEmpty) ...[
          const SizedBox(height: 13),
          _CrossClassOffer(
            offers: offers,
            selected: alsoUsedAs,
            enabled: enabled,
            onChanged: onAlsoUsedAsChanged,
          ),
        ],
        if (showVerb) ...[
          const SizedBox(height: 13),
          _VerbParadigm(controllers: controllers, enabled: enabled),
        ],
        if (showAgreement) ...[
          const SizedBox(height: 13),
          _AgreementParadigm(controllers: controllers, enabled: enabled),
        ],
      ],
    );
  }
}

/// "Use it with one word, then with a different word."
///
/// ── The question that covers five word classes at once ───────────────────
/// An adjective, a quantifier, a numeral, a determiner and a pronoun all change
/// with the noun they attach to or stand for, and until this section existed
/// the dictionary asked none of them anything — a quantifier got exactly what a
/// preposition got, which was nothing at all. That is a large hole: it is most
/// of the words a learner needs in order to say anything *about* a noun.
///
/// ── Why two examples rather than a set of named cells ────────────────────
/// Because naming the cells would mean naming the classes, and nobody has
/// written the inventory down. An adjective paradigm with invented cells would
/// be this project publishing a structure it made up, on entries a learner has
/// no reason to doubt — the same failure `NOUN_CLASSES` is empty to avoid, one
/// level out.
///
/// Two rather than one for the same reason the counted form sits beside the
/// definite: one form is a form, and two forms of the same word either carry
/// the same marker or they do not. The pair is the evidence.
class _AgreementParadigm extends StatelessWidget {
  const _AgreementParadigm({required this.controllers, required this.enabled});

  final LexicalFormsControllers controllers;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHint(
          icon: Icons.compare_arrows_rounded,
          text:
              'In Kasem a word like this often changes to match what it goes '
              'with. Two short examples, using two different words, is what '
              'shows whether yours does — and which form goes with which.',
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.agreeingOne,
          enabled: enabled,
          label: 'Use it with one word',
          hint: 'a short phrase — “… bakeira”',
          icon: Icons.looks_one_outlined,
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.agreeingTwo,
          enabled: enabled,
          label: 'Now with a different word',
          hint: 'the same word, something else after it',
          icon: Icons.looks_two_outlined,
        ),
        const SizedBox(height: 8),
        // Said here rather than in a help screen, because this is the question
        // on the form whose *point* is invisible. Somebody who does not know
        // that Kasem has several words for "all" reads this as being asked for
        // two example sentences.
        Text(
          'The word for “all” is one of these: te maama, ya maama, se maama, '
          'de maama — the thing you are talking about decides which. Numbers '
          'work the same way. Yours may too.',
          style: TextStyle(color: brand.faintInk, fontSize: 11, height: 1.45),
        ),
      ],
    );
  }
}

/// The forms that make "the" answerable, and the ones that check it.
///
/// ── Why this asks for words and not for a noun class ─────────────────────
/// The obvious design was a noun-class picker. It would have been far less
/// work and it would have collected almost nothing: most fluent speakers of
/// any language cannot name their own noun classes, and a picker somebody
/// cannot answer is a picker they set to the first item. So this asks
/// questions any Kasem speaker answers without thinking — say it with *the*,
/// say it for many, what do you call it afterwards — and the class is worked
/// out from the answers on the server. Nobody using this app ever sees the
/// phrase "noun class".
///
/// ── Three questions, then two more only if the plural is answered ────────
/// The definite, the plural and the pronoun are the three cheapest reads on
/// the same marker, and a speaker produces all three without stopping. The
/// plural definite and the counted form appear only once the plural has
/// something in it, because both start from the plural: somebody who has just
/// typed "boys" says "the boys" and "two boys" without thinking, and somebody
/// who skipped the plural would be being asked to invent it.
///
/// ── Why the plural needs its own definite ────────────────────────────────
/// Because the singular and the plural may sit in different classes — `dɛ dem`
/// "the day" beside `da yam` "the days" — and without this form the pairing is
/// invisible: the singular definite reads one class and the numeral agrees
/// with the other, and nothing on the entry says they are different halves of
/// the word.
class _NounParadigm extends StatelessWidget {
  const _NounParadigm({required this.controllers, required this.enabled});

  final LexicalFormsControllers controllers;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHint(
          icon: Icons.lightbulb_outline_rounded,
          text:
              'These are the forms a learner needs and a dictionary cannot '
              'work out on its own. Every one of them is optional — answer the '
              'ones you say without thinking and leave the rest.',
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.definite,
          enabled: enabled,
          label: 'Say it with “the”',
          hint: 'the boy → …',
          icon: Icons.label_important_outline_rounded,
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.plural,
          enabled: enabled,
          label: 'Say it for many',
          hint: 'boys → …',
          icon: Icons.groups_outlined,
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.pronoun,
          enabled: enabled,
          label: 'What you call it afterwards',
          // Written as the sentence somebody would actually say. "Third person
          // singular animate pronoun" is a question about grammar; this is a
          // question about talking, and it is the one people can answer.
          hint: 'the boy came, then … came again',
          icon: Icons.person_outline_rounded,
        ),
        // Listens to the plural rather than asking the screen to rebuild, so
        // the follow-ups appear as the member types and no state above this
        // widget has to know that these fields are related.
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: controllers.plural,
          builder: (context, value, child) =>
              value.text.trim().isEmpty ? const SizedBox.shrink() : child!,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 11),
              _FormField(
                controller: controllers.pluralDefinite,
                enabled: enabled,
                label: 'Say the many with “the”',
                hint: 'the boys → …',
                icon: Icons.label_outline_rounded,
              ),
              const SizedBox(height: 11),
              _FormField(
                controller: controllers.counted,
                enabled: enabled,
                label: 'Say it for two',
                hint: 'two boys → …',
                icon: Icons.looks_two_outlined,
              ),
              const SizedBox(height: 8),
              // Said here rather than in a help screen, because this is the
              // one question on the form whose *point* is invisible. A member
              // who does not know that Kasem has six words for "two" reads
              // "say it for two" as a strange thing to ask about a boy.
              Text(
                'Kasem has more than one word for “two” — '
                '${kNumeralTwoForms.map((series) => series.form).take(3).join(', ')} '
                'and others — and the thing being counted decides which. '
                'Yours is the evidence for which goes with which.',
                style: TextStyle(
                  color: brand.faintInk,
                  fontSize: 11,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Now, yesterday, tomorrow — and two more for anybody who wants them.
///
/// ── Why three tenses and not a tense system ──────────────────────────────
/// Because three is what a speaker can answer and a tense system is not. Kasem
/// marks aspect as well as time, and the full picture is a research question;
/// "say it for now / for yesterday / for tomorrow" are three questions anybody
/// who speaks the language answers in seconds. Three filled boxes per verb is
/// a paradigm this dictionary has never had a single row of, and it is worth
/// far more than a fourth box nobody fills.
///
/// The other two sit behind a toggle for the same reason the counted form sits
/// behind the plural: they are the ones that make somebody stop and think, and
/// a form that makes people stop is a form that ends the sitting.
class _VerbParadigm extends StatefulWidget {
  const _VerbParadigm({required this.controllers, required this.enabled});

  final LexicalFormsControllers controllers;
  final bool enabled;

  @override
  State<_VerbParadigm> createState() => _VerbParadigmState();
}

class _VerbParadigmState extends State<_VerbParadigm> {
  var _showRest = false;

  @override
  Widget build(BuildContext context) {
    final controllers = widget.controllers;
    // Opened automatically for anybody who has already answered one of them —
    // a controller restored from a draft, or a member who filled them in and
    // then collapsed the section by accident.
    final rest = _showRest ||
        controllers.pluralSubjectText.isNotEmpty ||
        controllers.imperativeText.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SectionHint(
          icon: Icons.schedule_rounded,
          text:
              'How the action is said at three different times. Optional, like '
              'everything else here — but three filled boxes is more than this '
              'dictionary holds for any verb today.',
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.present,
          enabled: widget.enabled,
          label: 'Say it for now',
          hint: 'he eats → …',
          icon: Icons.play_circle_outline_rounded,
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.past,
          enabled: widget.enabled,
          label: 'Say it for yesterday',
          hint: 'he ate → …',
          icon: Icons.history_rounded,
        ),
        const SizedBox(height: 11),
        _FormField(
          controller: controllers.future,
          enabled: widget.enabled,
          label: 'Say it for tomorrow',
          hint: 'he will eat → …',
          icon: Icons.update_rounded,
        ),
        if (rest) ...[
          const SizedBox(height: 11),
          _FormField(
            controller: controllers.pluralSubject,
            enabled: widget.enabled,
            label: 'Say it for several people doing it',
            hint: 'they eat → …',
            icon: Icons.groups_2_outlined,
          ),
          const SizedBox(height: 11),
          _FormField(
            controller: controllers.imperative,
            enabled: widget.enabled,
            label: 'Say it as an instruction',
            hint: 'eat! → …',
            icon: Icons.campaign_outlined,
          ),
        ] else
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: widget.enabled
                  ? () => setState(() => _showRest = true)
                  : null,
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Two more forms'),
            ),
          ),
      ],
    );
  }
}

/// "Is this word also used as an action?"
///
/// ── The question the dropdown could not ask ──────────────────────────────
/// A word class picker asks which one thing a word is. Kasem words routinely
/// are more than one, and every contributor who knew that had to pick one and
/// throw the rest away. This costs a tap only for the people who have
/// something to say, and what it unlocks is the second paradigm — tap "an
/// action" on a noun and the tenses appear underneath.
class _CrossClassOffer extends StatelessWidget {
  const _CrossClassOffer({
    required this.offers,
    required this.selected,
    required this.enabled,
    required this.onChanged,
  });

  final List<String> offers;
  final Set<String> selected;
  final bool enabled;
  final ValueChanged<Set<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Is this word also used as something else?',
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
            for (final id in offers)
              FilterChip(
                label: Text(crossClassLabel(id)),
                selected: selected.contains(id),
                onSelected: enabled
                    ? (on) {
                        final next = {...selected};
                        if (on) {
                          next.add(id);
                        } else {
                          next.remove(id);
                        }
                        onChanged(next);
                      }
                    : null,
              ),
          ],
        ),
      ],
    );
  }
}

/// The three fields that turn a dictionary row into a dictionary entry.
///
/// Collapsed by default and stated as an offer rather than a section, because
/// none of the three is answerable in the rhythm the queue runs at — they are
/// for the member who has stopped on a word they care about.
///
/// ── Why the Kasem meaning is here at all ─────────────────────────────────
/// A dictionary that explains Kasem only in English treats English as the
/// language you think in. The meaning stated in Kasem is the only text on the
/// record written *in* the language rather than about it, and it carries the
/// usage, register and collocation that a one-word English gloss throws away.
/// It is the single most valuable string this project can collect, and until
/// now there was nowhere to put it.
class AdvancedDetailSection extends StatelessWidget {
  const AdvancedDetailSection({
    required this.controllers,
    required this.enabled,
    super.key,
  });

  final LexicalFormsControllers controllers;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final filled = controllers.ipaText.isNotEmpty ||
        controllers.kasemDefinitionText.isNotEmpty ||
        controllers.etymologyText.isNotEmpty;
    return Theme(
      // The divider an ExpansionTile draws above and below itself makes a
      // single optional offer look like a section boundary in a form that has
      // no other sections.
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        // ── Not optional, and not cosmetic ────────────────────────────────
        // An ExpansionTile writes its open/shut state into the enclosing
        // PageStorage bucket, and with no key of its own it writes under a key
        // derived from where it sits in the tree. The queue's list already has
        // a PageStorageKey, and the multi-line fields *inside* this tile keep
        // their own scroll offsets in the same bucket — so without this the
        // tile's `bool` and a text field's `double` land on one key and the
        // first rebuild after opening it throws
        // `type 'bool' is not a subtype of type 'double?'`, taking the whole
        // screen down.
        key: const PageStorageKey('contribute-more-detail'),
        initiallyExpanded: filled,
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(top: 4, bottom: 8),
        leading: Icon(Icons.auto_stories_outlined, color: brand.accent),
        title: Text(
          'Tell us more about this word',
          style: TextStyle(
            color: brand.ink,
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
        subtitle: Text(
          'How it sounds, what it means in Kasem, where it comes from',
          style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
        ),
        children: [
          _FormField(
            controller: controllers.kasemDefinition,
            enabled: enabled,
            label: 'What it means, said in Kasem',
            hint: 'How you would explain it to a child who asked',
            icon: Icons.translate_rounded,
            minLines: 2,
            maxLines: 5,
          ),
          const SizedBox(height: 11),
          _FormField(
            controller: controllers.etymology,
            enabled: enabled,
            label: 'Where the word comes from',
            hint: 'Borrowed, built from other words, or a story behind it',
            icon: Icons.history_edu_outlined,
            minLines: 2,
            maxLines: 4,
          ),
          const SizedBox(height: 11),
          _FormField(
            controller: controllers.ipa,
            enabled: enabled,
            label: 'Written in the phonetic alphabet',
            // Named as what it is for rather than as what it is, because
            // almost nobody filling this form has met the phrase "IPA" and
            // the people who have will recognise it from the hint.
            hint: 'IPA, if you write it — the slashes are added for you',
            icon: Icons.record_voice_over_outlined,
          ),
          const SizedBox(height: 6),
          Text(
            'All three are optional and any one of them helps. Leave them '
            'blank and the word is still a good contribution.',
            style: TextStyle(
              color: brand.faintInk,
              fontSize: 11,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

/// One optional form box, with the same shape everywhere it appears.
class _FormField extends StatelessWidget {
  const _FormField({
    required this.controller,
    required this.enabled,
    required this.label,
    required this.hint,
    required this.icon,
    this.minLines,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final bool enabled;
  final String label;
  final String hint;
  final IconData icon;
  final int? minLines;
  final int? maxLines;

  @override
  Widget build(BuildContext context) => TextFormField(
    // ── Not cosmetic: this is what stops the screen crashing ───────────────
    // Every text field keeps its own scroll offset in the enclosing
    // PageStorage bucket, and the identifier it stores under is built from the
    // PageStorageKeys above it — nothing else. The queue's list has one, so
    // without a key here every field in this section shares one identifier
    // with every other field *and* with the ExpansionTile they sit inside,
    // which stores a bool. The first rebuild after opening the section then
    // reads that bool where a scroll offset is expected and throws
    // `type 'bool' is not a subtype of type 'double?'`, taking down the whole
    // form.
    //
    // The label is the key because it is the one thing already unique per
    // field, and it is the thing that would have to change for two fields to
    // become genuinely interchangeable.
    key: PageStorageKey<String>('lexical-field-$label'),
    controller: controller,
    enabled: enabled,
    minLines: minLines,
    maxLines: maxLines,
    decoration: InputDecoration(
      // "(optional)" on the label of every one of eleven boxes is eleven
      // repetitions of a word. The section says it once, above them.
      labelText: label,
      hintText: hint,
      alignLabelWithHint: minLines != null,
      prefixIcon: Icon(icon),
    ),
  );
}

/// A tinted line above a group of boxes, saying what the group is for.
class _SectionHint extends StatelessWidget {
  const _SectionHint({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(11, 9, 11, 9),
      decoration: BoxDecoration(
        color: brand.accent.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: brand.accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 11.5,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
