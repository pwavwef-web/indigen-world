// The canonical Founding Creators guidelines.
//
// This is the single source of the guideline text. It is written to
// `platformConfiguration/creators.guidelines` by the seed scripts and imported
// by TribeStudio as the offline fallback, so the published page and the seeded
// document can never say different things.
//
// Every statement here must match what the platform actually does. The file
// limits come from `mediaRestrictions`, the scores from `reviewCriteria`, the
// refusal wording from `rejectionReasons`, and the permission scopes from
// `CreatorConsentScope` — all in the same platform configuration document.
//
// Shape: { group, heading, body, points } per `GuidelineSection`. `group` is a
// display heading only; sections are rendered in array order.

/** @type {import('../creator-models.js').GuidelineSection[]} */
export const creatorGuidelines = [
  // ---- Before you create -------------------------------------------------
  {
    group: 'Before you create',
    heading: 'Who this is for',
    body:
      'These guidelines apply to everyone in the Indigen World Founding Creators programme, and to every '
      + 'submission made through TribeStudio. You do not need to be a professional creator. If you speak, sing, '
      + 'write, teach or remember Kasem, there is a place for your work here.',
    points: [
      'Joining the programme is free, and it stays free.',
      'Reading these guidelines before you record saves you the most common reason for a revision request.',
      'If anything here is unclear, ask us before you submit rather than after.',
    ],
  },
  {
    group: 'Before you create',
    heading: 'Eligible content',
    body:
      'We accept original Kasem-language work across sixteen categories: storytelling, language teaching, '
      + 'translation, interviews, oral history, music, food, fashion, games, tourism, community reporting, '
      + 'photography, short-form video, long-form video, audio, and written content.',
    points: [
      'Everyday life counts. A market conversation, a cooking method, a children’s game or a farming term is as '
        + 'valuable to the archive as a formal performance.',
      'Elders’ knowledge is especially welcome — proverbs, praise names, histories, riddles and songs that are not '
        + 'written down anywhere.',
      'Pick the category that best fits the work. If it sits between two, choose the closer one and explain the rest '
        + 'in your description.',
      'Some campaigns ask for a specific category or theme. A strong piece submitted to the wrong brief is still '
        + 'off-brief, so read the campaign page first.',
    ],
  },
  {
    group: 'Before you create',
    heading: 'Formats we accept',
    body:
      'Five formats: short video, long video, audio, image and written. Choose the format that carries the meaning '
      + 'best rather than the one that is easiest to film.',
    points: [
      'Short video suits demonstrations, single proverbs, vocabulary and moments of daily life.',
      'Long video suits interviews, full stories, performances and teaching sessions.',
      'Audio suits songs, oral history and pronunciation work where a picture adds nothing.',
      'Image suits objects, dress, food, places and craft, and always needs a caption and alt text.',
      'Written suits proverbs, transcriptions, translations, poetry and explanatory pieces, typed straight into the '
        + 'submission form.',
    ],
  },
  {
    group: 'Before you create',
    heading: 'Language expectations',
    body:
      'Content should be primarily in Kasem. Kasem is the point of the archive — a beautifully made piece that is '
      + 'mostly in English does not serve it, however good it is.',
    points: [
      'Speak naturally. We are not collecting a formal register; we are collecting the language as it is really used.',
      'Tell us which dialect you speak — Navrongo, Paga or Chiana. "Other" and "Not sure" are both valid answers and '
        + 'neither counts against you.',
      'Add an English summary or translation wherever you can. It roughly doubles the number of people who can learn '
        + 'from your work, and it helps reviewers who do not share your dialect.',
      'Mixing in English or Twi where a speaker would naturally do so is fine. Switching to English because it feels '
        + 'more correct is not what we are after.',
    ],
  },
  {
    group: 'Before you create',
    heading: 'What we cannot accept',
    body:
      'A short list of things that are refused regardless of quality, and which may end a membership if repeated.',
    points: [
      'Hate speech, or content that demeans a person or group by ethnicity, religion, gender, disability or origin.',
      'Sexual content, graphic violence, and anything that sexualises a minor in any way.',
      'Harassment of a named person, or private information about someone shared without their permission.',
      'Content that incites violence or unrest, or that presents a serious falsehood as community fact.',
      'Work generated by AI and presented as your own recording, and work re-uploaded from someone else’s channel.',
    ],
  },

  // ---- Rights, consent and people ---------------------------------------
  {
    group: 'Rights, consent and people',
    heading: 'Originality requirements',
    body:
      'Your submission must be your own work, or work you use with documented permission. You confirm this with an '
      + 'attestation when you submit, and "not original work" is a refusal reason a reviewer can select.',
    points: [
      'Recording an elder or a performer is original work — the recording is yours, and their permission covers what '
        + 'they contributed. Name them in the participants list.',
      'A traditional story belongs to the community, not to you. Your telling of it is yours. Say where you learned '
        + 'it in the cultural context field.',
      'Do not submit the same piece twice, and do not submit work that another creator has already published here.',
      'Work published on your own social channels is welcome. Work taken from someone else’s channel is not, even '
        + 'with credit.',
    ],
  },
  {
    group: 'Rights, consent and people',
    heading: 'Copyright, music and third-party material',
    body:
      'Do not use copyrighted music, images, video or text unless you hold the right to do so. This is the fastest '
      + 'way to lose otherwise excellent work: "copyright concerns" is a standing refusal reason, and it blocks '
      + 'publication even when the content itself is strong.',
    points: [
      'Commercial or radio music behind a video will be refused. Record your own music, use a traditional piece '
        + 'performed by you or by someone who agreed, or use no music at all.',
      'Tick the third-party material disclosure and fill in the source field whenever anything in your submission '
        + 'came from somewhere else.',
      'Traditional songs are not automatically free to use. The performance and the arrangement can still belong to '
        + 'someone, and some songs are restricted by custom.',
      'Screenshots, stock photos and clips pulled from the internet are third-party material. Say so.',
    ],
  },
  {
    group: 'Rights, consent and people',
    heading: 'Featuring other people',
    body:
      'Anyone who appears or is heard in your submission must have agreed to it. You attest to this when you submit, '
      + 'and "missing consent" is a refusal reason.',
    points: [
      'Explain before you record: what the recording is for, that it may be published on Indigen World, and that it '
        + 'may stay online. Explain it in Kasem if that is the language they are comfortable in.',
      'Record the agreement where you can — a few seconds of them saying yes at the top of the file is enough, and '
        + 'you can trim it before publication.',
      'List everyone who appears, with their role, in the participants field.',
      'Anyone may change their mind. If a participant later asks to be removed, tell us and we will act on it.',
      'Crowds at a public event are different from an individual you film up close. Anyone who is the subject of the '
        + 'recording needs to have agreed.',
    ],
  },
  {
    group: 'Rights, consent and people',
    heading: 'Content involving minors',
    body:
      'A parent or guardian must give permission before anyone under 18 appears in a submission. Tick the minors '
      + 'disclosure and the guardian-permission attestation; a submission that features a child without both will be '
      + 'refused for missing consent.',
    points: [
      'The child should also be willing. A guardian’s permission does not override a child who does not want to be '
        + 'recorded.',
      'Never include a child’s school, home location, full name or contact details.',
      'Children’s games, songs, counting rhymes and classroom Kasem are wonderful material — this is a rule about '
        + 'how to collect them, not a reason to avoid them.',
      'If you are under 18 yourself, a guardian must agree to your participation in the programme.',
    ],
  },
  {
    group: 'Rights, consent and people',
    heading: 'Sacred, restricted and sensitive material',
    body:
      'Some knowledge is not meant to be recorded, or is meant only for certain people, certain places or certain '
      + 'times of year. The archive must respect that, and a permanent public record is exactly the kind of thing '
      + 'custom often forbids.',
    points: [
      'Ask the custodians of the knowledge before you record, not after. Their answer is final, including when they '
        + 'say a thing may be recorded but not published.',
      'Shrines, funerals, initiations and festival rites usually need permission from the people who hold them, not '
        + 'only from the people you can see.',
      'When you are unsure, submit the piece with a note in the cultural context field and let the reviewers weigh '
        + 'it with you. Flagging a doubt never counts against you.',
      'We would rather lose a good recording than publish one that should not exist.',
    ],
  },

  // ---- Making it well ----------------------------------------------------
  {
    group: 'Making it well',
    heading: 'Video quality',
    body:
      'Technical quality is one of the five things reviewers score, and "quality below threshold" is a refusal '
      + 'reason. A phone camera is entirely sufficient — steadiness, light and sound matter far more than the device.',
    points: [
      'Hold the phone horizontally for interviews and performances, vertically for short-form video.',
      'Brace the phone against a wall, a chair or a stack of blocks. A still frame reads as professional; a shaking '
        + 'one does not.',
      'Face the light. Put the sun or the window behind you and your subject becomes a silhouette.',
      'Get close enough to hear. Wind, traffic, a running generator and a crowing cockerel each cost you more than '
        + 'poor picture would.',
      'Film in the highest quality your phone offers, and send the original file rather than one that has been sent '
        + 'through WhatsApp.',
    ],
  },
  {
    group: 'Making it well',
    heading: 'Audio and music quality',
    body:
      'For audio submissions, the recording is the whole work. A clean, quiet recording of an ordinary song beats a '
      + 'noisy recording of an extraordinary one.',
    points: [
      'Record indoors, in a small room with cloth or thatch rather than bare concrete, with doors and windows shut.',
      'Keep the microphone about a hand’s width from the speaker’s mouth, slightly off to the side so breaths do not '
        + 'hit it.',
      'Record a few seconds of silence before you begin and after you finish.',
      'Turn off notifications and put the phone in flight mode — a message alert in the middle of a take is the most '
        + 'common reason an otherwise good recording has to be made again.',
      'Listen back with headphones before you submit. It takes two minutes and catches most problems.',
    ],
  },
  {
    group: 'Making it well',
    heading: 'Photography and images',
    body:
      'Images carry material culture — cloth, tools, food, architecture, landscape. They need context to be useful, '
      + 'so an image submission is the picture plus the words around it.',
    points: [
      'Shoot in daylight, avoid the flash, and photograph the object against a plain background where you can.',
      'Give the Kasem name for what is shown, and the English name if there is one.',
      'Write a caption that says what, where and when, and alt text that describes the image for someone who cannot '
        + 'see it.',
      'Include a sense of scale — a hand, a coin or a familiar object beside the subject.',
    ],
  },
  {
    group: 'Making it well',
    heading: 'Written submissions',
    body:
      'Written work is typed straight into the submission form. It is the right format for proverbs, transcriptions, '
      + 'poetry, explanation and translation.',
    points: [
      'Write the Kasem exactly as you would say it. Do not straighten it into English word order.',
      'Use the Kasem orthography consistently within a piece, including tone marks and special characters if you '
        + 'use them at all.',
      'For a proverb or an idiom, give three things: the Kasem, a literal English rendering, and what it actually '
        + 'means in use.',
      'For a transcription of a recording, say who spoke, when, and where.',
    ],
  },
  {
    group: 'Making it well',
    heading: 'Translations and captions',
    body:
      'Translations and captions are not decoration — they are how your work reaches learners, the diaspora, and '
      + 'people who speak a different dialect.',
    points: [
      'A translation should carry the meaning, not the words. Where a phrase cannot cross over, translate the sense '
        + 'and explain the phrase in the translator’s notes.',
      'Mark anything you are unsure of rather than guessing silently. An honest uncertainty is useful data.',
      'An English summary of two or three sentences is enough to make a long video findable and teachable.',
      'If you can add a caption file for a video, do. If you cannot, a written transcript in the description does '
        + 'most of the same work.',
    ],
  },
  {
    group: 'Making it well',
    heading: 'Titles, descriptions and tags',
    body:
      'These fields are how your work is found, years from now, by someone who does not know it exists. Treat them '
      + 'as part of the submission rather than as paperwork.',
    points: [
      'Title it for what it contains, not for attention. "Kasem names for the parts of a hoe" is a better title than '
        + '"You won’t believe this".',
      'Say in the description what happens, who is in it, and where and when it was recorded.',
      'Use the cultural context field for what an outsider would need to know: the occasion, the custom, the history '
        + 'behind it, and where you learned it.',
      'Tag with real terms — the place, the occasion, the craft, the Kasem keywords — and skip generic tags.',
    ],
  },

  // ---- Submitting --------------------------------------------------------
  {
    group: 'Submitting your work',
    heading: 'What a complete submission contains',
    body:
      'You can save a draft and return to it. A submission leaves your hands only when you send it for review, and '
      + 'it is worth checking these before you do.',
    points: [
      'A title, a category and a format; the dialect and primary language of the piece.',
      'The media file itself, or the written body for a written submission.',
      'A description, and an English summary or translation wherever you can give one.',
      'Cultural context, and the participants who appear in the work.',
      'Your disclosures, your attestations, and the permissions you choose to grant.',
    ],
  },
  {
    group: 'Submitting your work',
    heading: 'File types and size limits',
    body:
      'Uploads accept MP4 video, MP3 audio, and JPEG or PNG images, up to 500 MB per file. Anything outside that is '
      + 'rejected by the uploader before a reviewer ever sees it.',
    points: [
      'Most phones already record MP4 video and JPEG images, so no conversion is usually needed.',
      'If a long video is over the limit, submit it in parts and say so in the title, or reduce the resolution '
        + 'rather than re-compressing it repeatedly.',
      'Upload on Wi-Fi where you can, and keep the app open until the upload finishes.',
      'Keep your original file until the submission is published. If a reviewer needs a cleaner copy, you will still '
        + 'have one.',
    ],
  },
  {
    group: 'Submitting your work',
    heading: 'Disclosures and attestations',
    body:
      'Two disclosures and four attestations sit at the end of the form. They are the legal and ethical spine of the '
      + 'archive, and answering them honestly protects you as much as it protects us.',
    points: [
      'Disclose whether the submission involves anyone under 18.',
      'Disclose whether it uses third-party material, and say what and whose in the source field.',
      'Attest that you own the work or hold the rights to use it, and that it breaks no copyright.',
      'Attest that everyone appearing in it agreed, and that a guardian agreed for any minor.',
      'A wrong answer given in good faith is fixable. A false attestation can end a membership.',
    ],
  },
  {
    group: 'Submitting your work',
    heading: 'Permissions you grant',
    body:
      'Permissions are always requested separately, per submission, and each one is recorded with the version of the '
      + 'terms you agreed to and the moment you agreed. Granting one never implies the next.',
    points: [
      'Review — required. It lets our reviewers watch, read and assess the work. Nothing is published on this alone.',
      'Publication — optional. It lets approved work appear in Indigen World products with your name on it.',
      'Promotion — optional. It lets us use your work to promote the programme and the campaign.',
      'AI training — optional, and separate on purpose. It lets the work be used to build Kasem language technology, '
        + 'such as translation and speech tools.',
      'You may withhold any optional permission and still submit, still be reviewed, and still be eligible for a '
        + 'campaign. You may change your mind later by contacting us.',
    ],
  },

  // ---- Review and decisions ---------------------------------------------
  {
    group: 'Review and decisions',
    heading: 'How review works',
    body:
      'Submissions move through a fixed set of states, and you can see the current one on your submission at any '
      + 'time: draft, submitted, under review, needs revision, resubmitted, approved, scheduled, then published.',
    points: [
      'Reviewers are Kasem speakers and cultural validators, not an automated filter.',
      'Review takes as long as it takes. Volume varies with each campaign, and a careful decision is worth more than '
        + 'a fast one.',
      'You are notified in the app when a decision is made, and by email if you have enabled it.',
      'You may withdraw a submission before a decision. A withdrawn or rejected submission does not count against '
        + 'future ones.',
    ],
  },
  {
    group: 'Review and decisions',
    heading: 'What reviewers score',
    body:
      'Every reviewed submission is scored on the same five criteria: Kasem-language quality, creativity, cultural '
      + 'value, originality, and technical quality.',
    points: [
      'Kasem-language quality — is the language clear, natural and substantial enough to be useful?',
      'Creativity — is there craft in how it is told, shot, performed or explained?',
      'Cultural value — does it preserve or teach something that matters, and is it handled respectfully?',
      'Originality — is it genuinely yours, and does it add something the archive does not already have?',
      'Technical quality — can it be seen, heard and understood?',
      'A piece can score modestly on craft and still be approved for its cultural value. The criteria are weighed '
        + 'together, not summed blindly.',
    ],
  },
  {
    group: 'Review and decisions',
    heading: 'Why submissions are turned down',
    body:
      'When work is refused, the reason is recorded from a fixed list, and the reviewer’s feedback is shown to you '
      + 'with it. The list is short and every entry is avoidable.',
    points: [
      'Not original work — it is not yours, or it has been published here before.',
      'Copyright concerns — usually music, footage or images you did not have the right to use.',
      'Missing consent — someone who appears in the work, or a guardian, did not agree.',
      'Off-brief — good work, but not what this campaign asked for.',
      'Quality below threshold — it cannot be heard, seen or followed well enough to publish.',
    ],
  },
  {
    group: 'Review and decisions',
    heading: 'Revisions and resubmission',
    body:
      'A reviewer who sees promise in a submission asks for a revision rather than refusing it. The request comes '
      + 'with written feedback and, where one applies, a deadline.',
    points: [
      'Read the feedback carefully — it tells you exactly what stands between the work and publication.',
      'Fix what was asked, keep the rest, and resubmit from the same submission so the history stays together.',
      'If the deadline is not workable for you, say so before it passes rather than after.',
      'You may ask a reviewer a question through the Help section if the feedback is unclear. Asking is expected, '
        + 'not a nuisance.',
    ],
  },

  // ---- After publication -------------------------------------------------
  {
    group: 'After publication',
    heading: 'Publication and attribution',
    body:
      'Approved work is published with your permission and always carries your name. It may appear in the Indigen '
      + 'World app, on the website and in the collections built from the archive.',
    points: [
      'Your creator name and picture appear with the work, alongside the language, dialect and category.',
      'Some work joins a named collection — music, dictionary, literature or audiobooks — which has its own '
        + 'additional review.',
      'The licence under which a piece is published, and any source attribution, are shown on the published item.',
      'Publication may be scheduled for a date rather than happening immediately, particularly during a campaign.',
      'You remain free to publish the same work on your own channels.',
    ],
  },
  {
    group: 'After publication',
    heading: 'Corrections, takedown and removal',
    body:
      'The archive is meant to be accurate, and a public record of a living language will need fixing over time. '
      + 'Published work can be corrected, taken down at your request, or removed.',
    points: [
      'Ask for a correction whenever a translation, name, date or attribution is wrong. Corrections are welcome at '
        + 'any time, from you or from anyone who knows better.',
      'You may request the removal of your own published content. So may a participant who appears in it, and so may '
        + 'a custodian of the knowledge it contains.',
      'We may unpublish content ourselves if a rights, consent or cultural-restriction problem comes to light, and '
        + 'we will tell you why.',
      'Removal takes the work out of public view. Records of the decision are kept so the archive’s history stays '
        + 'honest.',
    ],
  },
  {
    group: 'After publication',
    heading: 'Rewards and payment eligibility',
    body:
      'Registering, submitting and being published never guarantee payment. Reward eligibility is confirmed per '
      + 'campaign, against the terms published on that campaign’s page.',
    points: [
      'Each campaign states its own rewards, deadlines and eligibility rules. Read them before you enter.',
      'Eligibility normally requires an approved submission, a complete profile, and verified payment details.',
      'Payment runs through its own states after approval — pending verification, approved, processing, then paid — '
        + 'and you can see where yours stands.',
      'We never ask you to pay to enter, to be reviewed, to be published, or to receive a reward. Anyone who does is '
        + 'not us — report it.',
    ],
  },
  {
    group: 'After publication',
    heading: 'Your account and your data',
    body:
      'Your profile, submissions, consents and decisions are kept under the privacy terms in force when you agreed '
      + 'to them, and every consent is stored with its version and timestamp.',
    points: [
      'Keep your contact details current, or you will miss decisions, revision deadlines and payment requests.',
      'Your account is yours alone. Do not submit on another person’s behalf through it — add them as a participant '
        + 'instead.',
      'You may ask for a copy of your data, or ask us to correct it, at any time.',
      'Serious or repeated breaches of these guidelines can end a membership, and we will say why.',
    ],
  },
  {
    group: 'After publication',
    heading: 'Changes to these guidelines',
    body:
      'These guidelines change as the programme grows. The terms and privacy versions you agreed to are recorded '
      + 'with each submission, so a later change never retroactively alters what you consented to.',
    points: [
      'Material changes are announced in the app and on the WhatsApp channel.',
      'Campaign-specific rules sit on top of these guidelines. Where they differ, the campaign page governs that '
        + 'campaign.',
    ],
  },
  {
    group: 'After publication',
    heading: 'Getting help',
    body:
      'Ask before you submit rather than after — almost every revision request we send could have been a two-minute '
      + 'conversation beforehand.',
    points: [
      'Use the Help section of your workspace for anything about a specific submission or decision.',
      'Email creators@indigen.world for account, payment and permission questions.',
      'Follow the Indigen World Creators WhatsApp channel for campaign openings, deadlines, resources and winner '
        + 'announcements.',
    ],
  },
];

export default creatorGuidelines;
