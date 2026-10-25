/**
 * Starter templates for Indigen Forms. Each is an ordinary definition: it is
 * copied into a new draft and goes through the same validation as any form an
 * admin builds by hand (firebase/tests/formsContract.test.mjs checks that every
 * template is publishable).
 */

const text = (id, label, extra = {}) => ({ id, type: 'short_text', label, required: false, settings: { maxLength: 300 }, ...extra });
const long = (id, label, extra = {}) => ({ id, type: 'long_text', label, required: false, settings: { maxLength: 5000 }, ...extra });
const choice = (id, type, label, options, extra = {}) => ({
  id, type, label, required: false, ...extra,
  settings: { ...(extra.settings ?? {}), options: options.map(([optionId, optionLabel]) => ({ id: optionId, label: optionLabel })) },
});
const consent = (id, purpose, statement, extra = {}) => ({ id, type: 'consent', label: 'Permission', required: false, settings: { consentPurpose: purpose, statement }, ...extra });
const when = (fieldId, operator, value, match = 'all') => ({ match, conditions: [{ fieldId, operator, ...(value === undefined ? {} : { value }) }] });
const whenAny = (...conditions) => ({ match: 'any', conditions: conditions.map(([fieldId, operator, value]) => ({ fieldId, operator, ...(value === undefined ? {} : { value }) })) });

const base = (overrides) => ({
  schemaVersion: 1,
  description: '',
  instructions: '',
  estimatedMinutes: null,
  languageContext: { languageIds: ['kasem', 'english'], dialectIds: [], note: '' },
  presentation: 'single_page',
  schedule: { opensAt: null, closesAt: null },
  submission: { policy: 'multiple', allowDrafts: true, allowAttachments: true, successMessage: 'Thank you. Your response has been received.', nextSteps: '' },
  audience: { mode: 'all_contributors', dialectIds: [], contributionTypes: [], cohortIds: [] },
  review: { required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 0 },
  destination: { type: 'general_intake', mapping: {} },
  ...overrides,
});

const wordCollection = base({
  title: 'Kasem word collection',
  description: 'Share a Kasem word, what it means and how people use it.',
  category: 'word_collection',
  instructions: 'Write the word the way you would spell it, including tone marks if you use them. One word per response.',
  estimatedMinutes: 5,
  languageContext: { languageIds: ['kasem', 'english'], dialectIds: [], note: 'Answers are in Kasem with English meanings.' },
  presentation: 'paged',
  sections: [
    {
      id: 'word_section', title: 'The word', description: '', visibleWhen: null,
      fields: [
        text('word', 'Kasem word', { required: true, description: 'Spell it as you say it. Tone marks are kept exactly as you type them.', settings: { maxLength: 120, kasemKeyboard: true, dictionarySuggestions: true } }),
        text('meaning', 'English meaning', { required: true, example: 'water (for drinking)' }),
        { id: 'dialect', type: 'dialect', label: 'Kasem variety', required: true, settings: {} },
        choice('part_of_speech', 'dropdown', 'Kind of word', [['noun', 'Noun'], ['verb', 'Verb'], ['adjective', 'Describing word'], ['adverb', 'Adverb'], ['other', 'Other or not sure']]),
      ],
    },
    {
      id: 'usage_section', title: 'How it is used', description: 'Examples help reviewers confirm the meaning.', visibleWhen: null,
      fields: [
        {
          id: 'examples', type: 'group', label: 'Usage examples', required: true,
          description: 'Add a sentence that uses the word, and what it means in English.',
          settings: { minItems: 1, maxItems: 5, itemLabel: 'Example' },
          fields: [
            long('example_kasem', 'Example in Kasem', { required: true, settings: { maxLength: 500, kasemKeyboard: true } }),
            long('example_english', 'English translation', { settings: { maxLength: 500 } }),
          ],
        },
        { id: 'pronunciation', type: 'audio', label: 'Pronunciation recording', required: false, description: 'Optional. Say the word clearly once or twice.', settings: { formats: ['mp3', 'wav', 'm4a', 'ogg', 'webm_audio'], maxSizeMb: 10, maxFiles: 1, allowRecording: true } },
        choice('source', 'single_choice', 'Where does this word come from?', [['own_knowledge', 'I speak it'], ['family_elder', 'A family member or elder'], ['published', 'A book or publication'], ['other', 'Somewhere else']], { required: true }),
        text('source_detail', 'Name the source', {
          description: 'Give the title, author or person so reviewers can trace it.',
          visibleWhen: whenAny(['source', 'equals', 'published'], ['source', 'equals', 'other']),
          requiredWhen: whenAny(['source', 'equals', 'published'], ['source', 'equals', 'other']),
        }),
      ],
    },
    {
      id: 'permissions_section', title: 'Permissions', description: 'Each permission is separate. Approval of your word does not grant any of them.', visibleWhen: null,
      fields: [
        // Recorded with the dictionary candidate as the contributor's own statements; without them the desk shows "not asked".
        { id: 'rights_confirmed', type: 'checkbox', label: 'I have permission to share this word, its examples and any recording, and nothing in them is private, sacred, disputed or copyrighted.', required: false, settings: {} },
        { id: 'speaker_permission', type: 'checkbox', label: 'The people heard in the recording agreed to share it.', required: false, settings: {}, visibleWhen: when('pronunciation', 'answered'), requiredWhen: when('pronunciation', 'answered') },
        consent('consent_review', 'review', 'I agree that Indigen World reviewers may assess this word, its examples and any recording.', { required: true }),
        consent('consent_storage', 'storage', 'I give permission for my pronunciation recording to be kept in Indigen World’s private archive.', { visibleWhen: when('pronunciation', 'answered'), requiredWhen: when('pronunciation', 'answered') }),
        consent('consent_public', 'public', 'After review, the word and examples may be published in the Kasem dictionary.'),
        consent('consent_training', 'training', 'The word and examples may be used to build Kasem language datasets, including AI training.'),
      ],
    },
  ],
  review: {
    required: true, reviewerGroup: 'reviewers', points: 5,
    instructions: 'Check the spelling and tone marks against the contributor’s variety. Request changes rather than correcting the spelling yourself.',
    checks: [{ id: 'spelling', label: 'Spelling and tone marks checked' }, { id: 'meaning', label: 'Meaning is accurate' }, { id: 'example', label: 'Examples use the word correctly' }],
  },
  destination: { type: 'dictionary_candidate', mapping: { headword: 'word', meaning: 'meaning', partOfSpeech: 'part_of_speech', dialect: 'dialect', source: 'source_detail', pronunciation: 'pronunciation', speakerPermission: 'speaker_permission', rightsConfirmed: 'rights_confirmed' } },
});

const sentenceTranslation = base({
  title: 'Sentence translation',
  description: 'Translate a sentence and explain how it is said in everyday Kasem.',
  category: 'translation',
  instructions: 'Translate the meaning, not word for word. Add other ways of saying it when more than one is common.',
  estimatedMinutes: 4,
  sections: [{
    id: 'translation_section', title: '', description: '', visibleWhen: null,
    fields: [
      { id: 'source_language', type: 'language', label: 'Language of the source sentence', required: true, settings: { allowedIds: ['english', 'kasem', 'french', 'twi'] } },
      long('source_sentence', 'Source sentence', { required: true, settings: { maxLength: 1000 } }),
      long('translation', 'Your translation', { required: true, settings: { maxLength: 1000, kasemKeyboard: true } }),
      { id: 'dialect', type: 'dialect', label: 'Kasem variety of your translation', required: true, settings: {} },
      choice('context', 'single_choice', 'Where would you say this?', [['everyday', 'Everyday conversation'], ['formal', 'Formal or public speech'], ['elders', 'Speaking to elders'], ['children', 'Speaking to children'], ['other', 'Somewhere else']]),
      {
        id: 'alternatives', type: 'group', label: 'Other ways of saying it', required: false,
        settings: { minItems: 0, maxItems: 5, itemLabel: 'Alternative' },
        fields: [text('alternative', 'Alternative phrasing', { required: true, settings: { maxLength: 500, kasemKeyboard: true } })],
      },
      long('notes', 'Notes for reviewers', { description: 'Explain word choices, idioms or anything that does not translate directly.', settings: { maxLength: 2000 } }),
      consent('consent_review', 'review', 'I agree that Indigen World reviewers may assess this translation.', { required: true }),
      consent('consent_training', 'training', 'This translation may be used to build Kasem language datasets, including AI training.'),
    ],
  }],
  review: {
    required: true, reviewerGroup: 'reviewers', points: 3,
    instructions: 'Check that the meaning is preserved and the phrasing is natural for the stated variety.',
    checks: [{ id: 'meaning_preserved', label: 'Meaning preserved' }, { id: 'natural', label: 'Phrasing is natural' }],
  },
  destination: { type: 'translation_review', mapping: { sourceText: 'source_sentence', translation: 'translation', sourceLanguage: 'source_language', dialect: 'dialect', notes: 'notes' } },
});

const oralHistory = base({
  title: 'Oral history',
  description: 'Record or write down a story, account or tradition, with the narrator’s permission.',
  category: 'oral_history',
  instructions: 'Ask the narrator before recording. Say how they would like to be credited, and note anything that should not be shared.',
  estimatedMinutes: 15,
  presentation: 'paged',
  sections: [
    {
      id: 'story_section', title: 'The story', description: '', visibleWhen: null,
      fields: [
        text('title', 'Title', { required: true, settings: { maxLength: 150 } }),
        text('narrator_name', 'Narrator’s name', { description: 'Only if they agree to be named.', settings: { maxLength: 150 } }),
        choice('attribution', 'single_choice', 'How should the narrator be credited?', [['named', 'Use their name'], ['initials', 'Initials only'], ['anonymous', 'Do not name them']], { required: true }),
        { id: 'language', type: 'language', label: 'Language of the story', required: true, settings: {} },
        { id: 'dialect', type: 'dialect', label: 'Kasem variety', required: false, settings: {}, visibleWhen: when('language', 'equals', 'kasem') },
        choice('format', 'single_choice', 'How are you sharing it?', [['audio_recording', 'Audio recording'], ['written', 'Written account'], ['both', 'Both']], { required: true }),
      ],
    },
    {
      id: 'recording_section', title: 'Recording', description: '',
      visibleWhen: whenAny(['format', 'equals', 'audio_recording'], ['format', 'equals', 'both']),
      fields: [
        { id: 'recording_tips', type: 'instruction', label: '', settings: { body: 'Record somewhere quiet. Start by saying the date and, if the narrator agrees, their name. You can upload up to three parts.' } },
        { id: 'recording', type: 'audio', label: 'Recording', required: true, settings: { formats: ['mp3', 'wav', 'm4a', 'ogg', 'webm_audio', 'flac'], maxSizeMb: 100, maxFiles: 3, allowRecording: true } },
        long('transcript', 'Transcript', { description: 'Optional. Write down what was said, in the language it was said.', settings: { maxLength: 20000, kasemKeyboard: true } }),
      ],
    },
    {
      id: 'written_section', title: 'Written account', description: '',
      visibleWhen: whenAny(['format', 'equals', 'written'], ['format', 'equals', 'both']),
      fields: [
        long('account', 'The account', { required: true, settings: { maxLength: 20000, kasemKeyboard: true } }),
        { id: 'document', type: 'file', label: 'Supporting document', required: false, settings: { formats: ['pdf', 'docx', 'txt', 'jpeg', 'png'], maxSizeMb: 20, maxFiles: 3 } },
      ],
    },
    {
      id: 'context_section', title: 'Context', description: '', visibleWhen: null,
      fields: [
        long('context', 'When and where was this told?', { settings: { maxLength: 3000 } }),
        { id: 'told_on', type: 'date', label: 'Date it was told or recorded', required: false, settings: {} },
        long('restrictions', 'Anything that should not be shared?', { description: 'For example names, places or parts of the story meant only for the family.', settings: { maxLength: 2000 } }),
      ],
    },
    {
      id: 'permissions_section', title: 'Permissions', description: 'Each permission is separate. Approval does not grant any of them.', visibleWhen: null,
      fields: [
        { id: 'narrator_agreed', type: 'checkbox', label: 'The narrator agreed to share this story with Indigen World.', required: true, settings: {} },
        consent('consent_storage', 'storage', 'I give permission for this story and any recording to be kept in Indigen World’s private archive.', { required: true }),
        consent('consent_review', 'review', 'Indigen World reviewers may assess this story.', { required: true }),
        consent('consent_public', 'public', 'After review, the story may be shared publicly, credited as chosen above.'),
        consent('consent_training', 'training', 'The story may be used to build Kasem language datasets, including AI training.'),
      ],
    },
  ],
  review: {
    required: true, reviewerGroup: 'reviewers', points: 10,
    instructions: 'Confirm the narrator’s permission and the credit preference before approving. Flag sensitive material.',
    checks: [{ id: 'permission_confirmed', label: 'Narrator permission is clear' }, { id: 'sensitive_checked', label: 'Checked for sensitive content' }],
  },
});

const researchDocuments = base({
  title: 'Research and documents',
  description: 'Share field notes, research, documents or datasets for review.',
  category: 'research',
  instructions: 'Tell us where the material comes from and who may share it. Working drafts are welcome.',
  estimatedMinutes: 8,
  languageContext: { languageIds: ['kasem', 'english', 'french'], dialectIds: [], note: '' },
  sections: [{
    id: 'document_section', title: '', description: '', visibleWhen: null,
    fields: [
      text('title', 'Title', { required: true, settings: { maxLength: 200 } }),
      long('description', 'What is it?', { required: true, settings: { maxLength: 3000 } }),
      text('source', 'Source or publication', { required: true, example: 'Field notes, Paga, March 2024' }),
      choice('authorship', 'single_choice', 'Who wrote or owns this material?', [['me', 'I wrote it'], ['permission', 'I have permission from the author or owner'], ['public_domain', 'It is in the public domain'], ['unsure', 'I am not sure']], { required: true }),
      long('permission_statement', 'Describe the permission', {
        settings: { maxLength: 2000 },
        visibleWhen: when('authorship', 'equals', 'permission'),
        requiredWhen: when('authorship', 'equals', 'permission'),
      }),
      { id: 'language', type: 'language', label: 'Main language', required: true, settings: {} },
      { id: 'attachments', type: 'file', label: 'Documents', required: true, settings: { formats: ['pdf', 'docx', 'txt', 'jpeg', 'png'], maxSizeMb: 20, maxFiles: 5 } },
      consent('consent_review', 'review', 'Indigen World reviewers may assess this material.', { required: true }),
      consent('consent_retrieval', 'retrieval', 'This material may be selected for Indigen World’s reference collection.'),
    ],
  }],
  review: {
    required: true, reviewerGroup: 'reviewers', points: 5,
    instructions: 'Check that the rights are documented before approving.',
    checks: [{ id: 'rights_documented', label: 'Rights or permission documented' }, { id: 'relevant', label: 'Relevant to Indigen World' }],
  },
  destination: { type: 'document_intake', mapping: { title: 'title', description: 'description', files: 'attachments', source: 'source', rights: 'permission_statement' } },
});

const generalFeedback = base({
  title: 'General feedback',
  description: 'Tell us what works, what does not and what you would like to see.',
  category: 'feedback',
  estimatedMinutes: 3,
  languageContext: { languageIds: ['english'], dialectIds: [], note: '' },
  sections: [{
    id: 'feedback_section', title: '', description: '', visibleWhen: null,
    fields: [
      choice('topic', 'dropdown', 'What is this about?', [['app', 'The mobile app'], ['website', 'The website'], ['dictionary', 'The dictionary'], ['contributor_portal', 'The contributor portal'], ['other', 'Something else']], { required: true }),
      long('feedback', 'Your feedback', { required: true, settings: { maxLength: 3000 } }),
      { id: 'attachment', type: 'file', label: 'Screenshot or file', required: false, description: 'Optional.', settings: { formats: ['jpeg', 'png', 'pdf'], maxSizeMb: 10, maxFiles: 2 } },
    ],
  }],
  review: { required: true, reviewerGroup: 'admins', instructions: 'Read and route to the right team.', checks: [], points: 0 },
});

export const FORM_TEMPLATES = [
  { id: 'kasem_word_collection', name: 'Kasem word collection', description: 'Word, meaning, variety, usage examples, optional pronunciation recording, source and consent.', definition: wordCollection },
  { id: 'sentence_translation', name: 'Sentence translation', description: 'Source sentence, translation, language context, alternative phrasing and notes.', definition: sentenceTranslation },
  { id: 'oral_history', name: 'Oral history', description: 'Title, narrator credit, language, recording or written account, context and usage permissions.', definition: oralHistory },
  { id: 'research_documents', name: 'Research and documents', description: 'Title, description, source, authorship or permission, language and attachments.', definition: researchDocuments },
  { id: 'general_feedback', name: 'General feedback', description: 'Topic, feedback and an optional attachment.', definition: generalFeedback },
];
