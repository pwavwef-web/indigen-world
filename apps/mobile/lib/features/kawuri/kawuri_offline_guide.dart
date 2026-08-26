/// Kawuri's on-device guide.
///
/// Used whenever the model cannot be reached — no signal, or a build whose
/// deployment has no model key bound yet. It answers only what this app can
/// answer for certain: how Indigen World works, and where to go next.
///
/// It deliberately does **not** invent Kasem. Language in this project is
/// validated by appointed speakers before it counts as guidance, and a
/// plausible-sounding guess from a fallback would be exactly the kind of
/// unverified content the whole governance model exists to keep out. So a
/// language question offline gets pointed at the dictionary, the community, or
/// a contribution — never at a made-up translation.
library;

/// One topic the guide can answer, matched on any of its [keywords].
class _GuideEntry {
  const _GuideEntry({required this.keywords, required this.answer});

  final List<String> keywords;
  final String answer;
}

const _entries = <_GuideEntry>[
  _GuideEntry(
    keywords: [
      'contribute',
      'contribution',
      'add a word',
      'submit a word',
      'record',
      'elder',
    ],
    answer:
        'Contributing a word\n'
        '\n'
        '1. Open the Contribute tab and write the English or source text, then '
        'the Kasem exactly as it is said — spelling and diacritics matter.\n'
        '2. Say which dialect it belongs to (Navrongo, Paga, Chiana, or "Not '
        'sure" — that is a real answer, not a failure).\n'
        '3. Tell us how you know it. "An elder or community member" carries '
        'more weight than a guess, and it is what a validator looks at first.\n'
        '4. Add context: a sentence you have actually heard it in is worth more '
        'than a definition.\n'
        '\n'
        'Before you record anyone, ask them plainly what it is for and whether '
        'they are happy for it to be public. Consent is part of the record, not '
        'a formality around it.\n'
        '\n'
        'Your draft stays on your phone until you submit it. It joins the '
        'collection only after a validator approves it.',
  ),
  _GuideEntry(
    keywords: [
      'community',
      'post',
      'posting',
      'reply',
      'handle',
      'username',
      'follow',
    ],
    answer:
        'The Community tab\n'
        '\n'
        'This room stays in Kasem — that is the whole point of it. To take '
        'part you need an account and a community handle, which you choose '
        'once; after that you can post, reply, follow people and save posts.\n'
        '\n'
        'A post can carry up to four photos or short videos and 500 characters. '
        'Anything you save is private to you.\n'
        '\n'
        'If something in the feed is disrespectful or is not Kasem, use the '
        '"…" menu on the post and report it. Moderators read those.',
  ),
  _GuideEntry(
    keywords: ['explore', 'reel', 'video', 'tribestudio', 'creator', 'publish'],
    answer:
        'Explore and TribeStudio\n'
        '\n'
        'Explore is the vertical feed of cultural reels — video, photo and '
        'story work published by creators through TribeStudio.\n'
        '\n'
        'Anyone with an account can publish to Explore from TribeStudio; you '
        'do not need to be verified or wait for approval. What you do need is '
        'to hold the rights to what you post and to have the consent of anyone '
        'in it.\n'
        '\n'
        'Campaigns are the exception. They are managed separately in '
        'TribeStudio, so campaign entries are reviewed before they are '
        'published and are open to approved creators.',
  ),
  _GuideEntry(
    keywords: ['learn', 'lesson', 'xp', 'streak', 'practice', 'quest'],
    answer:
        'The Learn tab\n'
        '\n'
        'Learning is a path, not a test. Each lesson is two to four minutes and '
        'worth 15 XP, and the daily quest is simply three of them.\n'
        '\n'
        'A gentle way to start: one lesson in the morning, one in the evening, '
        'and once a week say one phrase out loud to somebody who speaks Kasem. '
        'Being corrected by a person is worth more than ten perfect scores.\n'
        '\n'
        'The lesson content in this build is a preview and is not yet validated '
        'guidance — treat it as a shape of the thing, not the final word.',
  ),
  _GuideEntry(
    keywords: [
      'offline',
      'no connection',
      'not working',
      'cannot sign in',
      "can't sign in",
      'error',
      'sign in',
      'login',
    ],
    answer:
        'When things will not connect\n'
        '\n'
        'Reading works offline: the dictionary, your collection and lessons you '
        'have already opened stay available. Signing in, posting and the live '
        'feeds need a connection.\n'
        '\n'
        'If the app says it cannot reach Indigen World even though your signal '
        'is fine, close it fully and reopen it — the connection to our servers '
        'is made once at launch, and reopening remakes it.',
  ),
  _GuideEntry(
    keywords: ['collection', 'saved', 'bookmark', 'dictionary', 'word'],
    answer:
        'Your collection\n'
        '\n'
        'The Collection tab holds what you have kept: saved words, places, '
        'songs and symbols. Saved items live on your device and sync to your '
        'account when you sign in, so they follow you to a new phone.',
  ),
  _GuideEntry(
    keywords: ['notification', 'alert', 'push'],
    answer:
        'Notifications\n'
        '\n'
        'You get an alert when somebody likes or replies to your post, follows '
        'you, mentions you, or when new work is published. They are all in the '
        'bell on the Community tab.\n'
        '\n'
        'Push alerts to your lock screen are optional — turn them on from the '
        'settings icon inside Notifications. Everything appears in the app '
        'either way.',
  ),
  _GuideEntry(
    keywords: ['kasena', 'kasem', 'who are', 'culture', 'people', 'paga'],
    answer:
        'The Kasena and Kasem\n'
        '\n'
        'Kasem is the language of the Kasena people of the Upper East Region of '
        'Ghana and southern Burkina Faso — Navrongo, Paga, Chiana and the towns '
        'around them. Project Kasena is the first language cell in Indigen '
        'World, which is why this app starts here.\n'
        '\n'
        'For anything specific in the language, I would rather point you at a '
        'speaker than guess: the dictionary holds what validators have '
        'confirmed, and the Community tab is full of people who use it daily.',
  ),
];

/// The offline answer for [question].
///
/// Falls back to an honest capability statement when nothing matches, rather
/// than improvising — the point of this guide is that everything it says is
/// something the app actually knows.
String offlineGuideAnswer(String question) {
  final asked = question.toLowerCase();

  if (asked.trim().isEmpty) return _capabilities;

  // Checked before the topic keywords, not after. "How do you say thank you in
  // Kasem?" contains the word "kasem" and would otherwise match the culture
  // entry and answer something adjacent — which reads as evading the question
  // rather than as the deliberate refusal it needs to be.
  if (_looksLikeATranslationRequest(asked)) {
    return '$_offlinePreamble\n\n$_translationRefusal';
  }

  for (final entry in _entries) {
    if (entry.keywords.any(asked.contains)) {
      return '$_offlinePreamble\n\n${entry.answer}';
    }
  }

  return '$_offlinePreamble\n\n$_capabilities';
}

/// Whether the member is asking "how do I say X in Kasem?".
bool _looksLikeATranslationRequest(String asked) => const [
  'how do you say',
  'how do i say',
  'translate',
  'in kasem',
  'word for',
  'mean in',
  'what does',
].any(asked.contains);

const _offlinePreamble =
    'I cannot reach my full knowledge right now, so this is what I can tell '
    'you from what lives on your phone.';

const _translationRefusal =
    'I will not guess at Kasem. A translation that sounds right but is not is '
    'worse than no answer — it can end up copied, taught and repeated.\n'
    '\n'
    'Two better routes:\n'
    '• Search the dictionary from the Learn tab. Everything in it has been '
    'confirmed by an appointed speaker.\n'
    '• Ask in the Community tab. People there use Kasem every day and will '
    'tell you how it is actually said where they are — and dialect genuinely '
    'changes the answer.\n'
    '\n'
    'If you find out and it is not in the dictionary yet, please contribute '
    'it. That is exactly how this grows.';

const _capabilities =
    'I am Kawuri — your guide through Indigen World and Kasena culture.\n'
    '\n'
    'Right now I can help with:\n'
    '• Contributing a word well, and recording elders respectfully\n'
    '• How Community, Explore, Learn and your Collection work\n'
    '• Getting the app connected again when it will not\n'
    '• Who the Kasena are and where Kasem is spoken\n'
    '\n'
    'Ask me any of those, or reconnect and ask me anything at all.';
