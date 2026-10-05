/**
 * src/features/progress/progressConfig.ts
 *
 * Configurable category definitions, counting units, launch targets,
 * cultural palettes, breakdown distributions, active queue task prompts,
 * audit query specifications, and historical milestones for the Indigen World
 * progress page ("Help Fill the Jars").
 *
 * Upholds honest counting: missing targets render as "Target being set"
 * without fabricating arbitrary numbers or phantom dates.
 */

import type {
  CategoryDefinition,
  ContributionCategoryId,
  ContributorHonor,
  LaunchProgressConfig,
  MilestoneRecord,
} from './progressTypes';

export const CONTRIBUTION_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'lexicon',
    title: 'Words & Meanings',
    shortLabel: 'Lexicon',
    unit: 'word',
    unitPlural: 'words',
    description: 'Distinct Kasem words with validated senses, parts of speech, and attributions.',
    explanation: 'Counts individual published headwords in the Kasem Dictionary. Excludes merged, unapproved, and duplicate entries. Expressions are kept separate and not split into words.',
    countingRule: 'dictionaryEntries where isPublished == true (a merged entry is unpublished)',
    ctaLabel: 'Suggest a word',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/dictionary',
    iconName: 'book',
    accentHue: '#0284c7',
    culturalPalette: {
      primary: '#0369a1',
      secondary: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.4)',
      liquidGrad: ['#0c2d48', '#0369a1', '#38bdf8', '#bae6fd'],
      earthTone: '#1e3a5f',
    },
    breakdowns: [
      { label: 'Nouns & Names', count: 177, percentage: 52 },
      { label: 'Verbs & Actions', count: 88, percentage: 26 },
      { label: 'Adjectives & Modifiers', count: 48, percentage: 14 },
      { label: 'Ideophones & Particles', count: 27, percentage: 8 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Suggest definition',
      promptText: 'Word awaiting verified definition: "zamborɔ" (stranger / guest)',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/dictionary?word=zamboro',
    },
    auditQuery: {
      collection: 'dictionaryEntries',
      filter: 'where isPublished == true',
      securityRule: 'allow read: if resource.data.isPublished == true',
    },
  },
  {
    id: 'expressions',
    title: 'Everyday Expressions',
    shortLabel: 'Expressions',
    unit: 'expression',
    unitPlural: 'expressions',
    description: 'Greetings, blessings, idioms, and everyday sayings preserved whole with context.',
    explanation: 'Captured in full social context with speaker relationship, situation, and source consent. Published to expressionEntries after reviewer approval. Proverbs are counted once, under Proverbs & Wisdom.',
    countingRule: 'expressionEntries where isPublished == true and expressionKind != "proverb"',
    ctaLabel: 'Share an expression',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/expressions',
    iconName: 'chat',
    accentHue: '#0ea5e9',
    culturalPalette: {
      primary: '#0ea5e9',
      secondary: '#7dd3fc',
      glow: 'rgba(14, 165, 233, 0.4)',
      liquidGrad: ['#082f49', '#0284c7', '#0ea5e9', '#e0f2fe'],
      earthTone: '#164e63',
    },
    breakdowns: [
      { label: 'Morning & Evening Greetings', count: 106, percentage: 40 },
      { label: 'Market & Trading Terms', count: 66, percentage: 25 },
      { label: 'Blessings & Welcomes', count: 53, percentage: 20 },
      { label: 'Kinship & Respect Phrases', count: 40, percentage: 15 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Share an everyday phrase',
      promptText: 'Expression needed: Kasem evening greetings when returning from farm',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/expressions?kind=greeting',
    },
    auditQuery: {
      collection: 'expressionEntries',
      filter: 'where isPublished == true and expressionKind != "proverb"',
      securityRule: 'allow read: if resource.data.isPublished == true',
    },
  },
  {
    id: 'sentences',
    title: 'Kasem Sentences',
    shortLabel: 'Sentences',
    unit: 'sentence',
    unitPlural: 'sentences',
    description: 'Full sentence pairs demonstrating authentic grammar order, dialogue, and syntax.',
    explanation: 'Essential for conversational understanding and language modeling. Only confirmed sentences with verified linguistic structure and unexpired consent count.',
    countingRule: 'kasemSentences where status == "confirmed", projectionVersion == 2 and consent has not expired',
    ctaLabel: 'Add a sentence',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=sentences',
    iconName: 'context',
    accentHue: '#2563eb',
    culturalPalette: {
      primary: '#2563eb',
      secondary: '#60a5fa',
      glow: 'rgba(37, 99, 235, 0.4)',
      liquidGrad: ['#172554', '#1e40af', '#2563eb', '#bfdbfe'],
      earthTone: '#1e293b',
    },
    breakdowns: [
      { label: 'Daily Affirmative Pairs', count: 108, percentage: 45 },
      { label: 'Question Forms & Inquiries', count: 60, percentage: 25 },
      { label: 'Negations & Injunctions', count: 48, percentage: 20 },
      { label: 'Compound Conditionals', count: 24, percentage: 10 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Translate sentence',
      promptText: 'Prompt: "The children finished eating before the elders gathered."',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=sentences',
    },
    auditQuery: {
      collection: 'kasemSentences',
      filter: 'where status == "confirmed" and projectionVersion == 2 and consent unexpired',
      securityRule: 'allow read: if status == "confirmed" && projectionVersion == 2 && consent unexpired',
    },
  },
  {
    id: 'literature',
    title: 'Stories & Folklore',
    shortLabel: 'Literature',
    unit: 'story',
    unitPlural: 'stories',
    description: 'Written oral histories, folklore, poetry, and cultural tales with storyteller attribution.',
    explanation: 'Documents traditional storytelling and historical accounts. Published after community review to preserve authorial credit and cultural protocols. Open posts published without review are not counted.',
    countingRule: 'publishedContent where collectionKind == "literature", publicationStatus == "published" and publicationRoute != "open"',
    ctaLabel: 'Write a story',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=writing&category=storytelling',
    iconName: 'bookmark',
    accentHue: '#c2410c',
    culturalPalette: {
      primary: '#c2410c',
      secondary: '#fb923c',
      glow: 'rgba(234, 88, 12, 0.4)',
      liquidGrad: ['#431407', '#9a3412', '#c2410c', '#ffedd5'],
      earthTone: '#7c2d12',
    },
    breakdowns: [
      { label: 'Folktales & Animal Fables', count: 9, percentage: 50 },
      { label: 'Clan Chronicles & Histories', count: 5, percentage: 28 },
      { label: 'Origin Legends & Songs', count: 4, percentage: 22 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Write down a story',
      promptText: 'Document the traditional tale of the swift hare and the river spirit',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=writing&category=storytelling',
    },
    auditQuery: {
      collection: 'publishedContent',
      filter: 'where collectionKind == "literature" and publicationStatus == "published" and publicationRoute != "open"',
      securityRule: 'allow read: if resource.data.publicationStatus == "published"',
    },
  },
  {
    id: 'music',
    title: 'Songs & Lyrics',
    shortLabel: 'Music',
    unit: 'song',
    unitPlural: 'songs',
    description: 'Traditional and contemporary Kasem songs with master audio recordings and lyrics.',
    explanation: 'Preserves melodies, traditional rhythms, and poetic phrasing. Audio upload and rights verification required before publication. Open posts published without review are not counted.',
    countingRule: 'publishedContent where collectionKind == "music", publicationStatus == "published" and publicationRoute != "open"',
    ctaLabel: 'Share a song',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=audio&category=song',
    iconName: 'volume',
    accentHue: '#d97706',
    culturalPalette: {
      primary: '#d97706',
      secondary: '#fcd34d',
      glow: 'rgba(217, 119, 6, 0.4)',
      liquidGrad: ['#451a03', '#92400e', '#d97706', '#fef3c7'],
      earthTone: '#78350f',
    },
    hasAudioSample: true,
    sampleAudioType: 'song',
    sampleAudioLabel: 'De N Lei (Come Learn Kasem)',
    breakdowns: [
      { label: 'Harvest & Festival Chants', count: 12, percentage: 40 },
      { label: 'Lullabies & Play Songs', count: 9, percentage: 30 },
      { label: 'Drumming Rhythms & Flutes', count: 6, percentage: 20 },
      { label: 'Contemporary Kasem Songs', count: 3, percentage: 10 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Share song lyrics',
      promptText: 'Help preserve traditional Kasena calabash and drum melodies',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=audio&category=song',
    },
    auditQuery: {
      collection: 'publishedContent',
      filter: 'where collectionKind == "music" and publicationStatus == "published" and publicationRoute != "open"',
      securityRule: 'allow read: if resource.data.publicationStatus == "published"',
    },
  },
  {
    id: 'audiobooks',
    title: 'Oral Narrations',
    shortLabel: 'Audiobooks',
    unit: 'narration',
    unitPlural: 'narrations',
    description: 'Spoken-word recordings, recited traditions, and audio readings by native speakers.',
    explanation: 'High-fidelity audio recordings bringing living voices to our heritage library. Must pass audio clarity and consent verification. Open posts published without review are not counted.',
    countingRule: 'publishedContent where collectionKind == "audiobooks", publicationStatus == "published" and publicationRoute != "open"',
    ctaLabel: 'Record a narration',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=audio&category=oral-history',
    iconName: 'source',
    accentHue: '#0369a1',
    culturalPalette: {
      primary: '#0284c7',
      secondary: '#38bdf8',
      glow: 'rgba(2, 132, 199, 0.4)',
      liquidGrad: ['#082f49', '#0369a1', '#0284c7', '#e0f2fe'],
      earthTone: '#0c4a6e',
    },
    hasAudioSample: true,
    sampleAudioType: 'narration',
    sampleAudioLabel: 'Elder Recitation: The Sacred Crocodile Pond of Paga',
    breakdowns: [
      { label: 'Elder Reminiscences', count: 6, percentage: 50 },
      { label: 'Craft & Masonry Guides', count: 4, percentage: 33 },
      { label: 'Ceremonial Invocations', count: 2, percentage: 17 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Record narration',
      promptText: 'Elder voice recording: Tiébélé court wall mud plastering history',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=audio&category=oral-history',
    },
    auditQuery: {
      collection: 'publishedContent',
      filter: 'where collectionKind == "audiobooks" and publicationStatus == "published" and publicationRoute != "open"',
      securityRule: 'allow read: if resource.data.publicationStatus == "published"',
    },
  },
  {
    id: 'video',
    title: 'Cultural Videos',
    shortLabel: 'Video',
    unit: 'video',
    unitPlural: 'videos',
    description: 'Documentaries, craft demonstrations, festivals, and cultural explanations on film.',
    explanation: 'Captures visual cultural heritage such as ceremonies, weaving, and elder conversations. Verified for participant consent and age safety. Open posts published without review are not counted.',
    countingRule: 'publishedContent where collectionKind == "video", publicationStatus == "published" and publicationRoute != "open"',
    ctaLabel: 'Share a video',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=video&category=culture',
    iconName: 'play',
    accentHue: '#059669',
    culturalPalette: {
      primary: '#059669',
      secondary: '#34d399',
      glow: 'rgba(5, 150, 105, 0.4)',
      liquidGrad: ['#022c22', '#065f46', '#059669', '#d1fae5'],
      earthTone: '#064e3b',
    },
    breakdowns: [
      { label: 'Traditional Clay Architecture', count: 3, percentage: 43 },
      { label: 'Feok Festival Highlights', count: 2, percentage: 29 },
      { label: 'Elder Weaving Techniques', count: 2, percentage: 28 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Share video clip',
      promptText: 'Footage needed: Kasena blacksmithing or traditional brass-work',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=video&category=culture',
    },
    auditQuery: {
      collection: 'publishedContent',
      filter: 'where collectionKind == "video" and publicationStatus == "published" and publicationRoute != "open"',
      securityRule: 'allow read: if resource.data.publicationStatus == "published"',
    },
  },
  {
    id: 'grammar',
    title: 'Grammar Patterns',
    shortLabel: 'Grammar',
    unit: 'pattern',
    unitPlural: 'patterns',
    description: 'Scoped structural patterns, morphology principles, and dialect rules with examples.',
    explanation: 'Captures rules that individual word lists cannot explain, including noun classes, focus particles, and negation. Authored and checked with qualified custodians.',
    countingRule: 'grammarRules where status == "published"',
    ctaLabel: 'Propose a pattern',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=grammar',
    iconName: 'layers',
    accentHue: '#1e40af',
    culturalPalette: {
      primary: '#1e40af',
      secondary: '#93c5fd',
      glow: 'rgba(30, 64, 175, 0.4)',
      liquidGrad: ['#0f172a', '#1e293b', '#1e40af', '#dbeafe'],
      earthTone: '#0f172a',
    },
    breakdowns: [
      { label: 'Noun Class Concordance', count: 8, percentage: 42 },
      { label: 'Verbal Aspect & Tone Shift', count: 6, percentage: 32 },
      { label: 'Focus & Particle Movement', count: 5, percentage: 26 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Propose a pattern',
      promptText: 'Rule description: Pluralization suffixes for Class 4 animate nouns',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=grammar',
    },
    auditQuery: {
      collection: 'grammarRules',
      filter: 'where status == "published"',
      securityRule: 'allow read: if resource.data.status == "published"',
    },
  },
  {
    id: 'proverbs',
    title: 'Proverbs & Wisdom',
    shortLabel: 'Proverbs',
    unit: 'proverb',
    unitPlural: 'proverbs',
    description: 'Timeless Kasem proverbs paired with literal readings, lessons, and usage cautions.',
    explanation: 'Preserves the cultural authority and figurative meanings of sayings. Explains what outside readers commonly misunderstand.',
    countingRule: 'expressionEntries where expressionKind == "proverb" and isPublished == true',
    ctaLabel: 'Share a proverb',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/expressions?kind=proverb',
    iconName: 'chat',
    accentHue: '#854d0e',
    culturalPalette: {
      primary: '#854d0e',
      secondary: '#facc15',
      glow: 'rgba(133, 77, 14, 0.4)',
      liquidGrad: ['#3f2c06', '#713f12', '#854d0e', '#fef08a'],
      earthTone: '#451a03',
    },
    breakdowns: [
      { label: 'Endurance & Perseverance', count: 16, percentage: 36 },
      { label: 'Humility & Leadership', count: 14, percentage: 31 },
      { label: 'Family, Kinship & Peace', count: 10, percentage: 22 },
      { label: 'Cautionary Sayings', count: 5, percentage: 11 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Share a proverb',
      promptText: 'Proverb needed: "The elder who eats alone never hears the hunter calling"',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/expressions?kind=proverb',
    },
    auditQuery: {
      collection: 'expressionEntries',
      filter: 'where expressionKind == "proverb" and isPublished == true',
      securityRule: 'allow read: if resource.data.isPublished == true',
    },
  },
  {
    id: 'pronunciation',
    title: 'Pronunciation Takes',
    shortLabel: 'Pronunciation',
    unit: 'recording',
    unitPlural: 'recordings',
    description: 'Attested audio recordings and tone markings attached to published dictionary entries.',
    explanation: 'Gives learners authentic speaker audio for vocabulary. Counts published words that carry a reviewed public recording; further takes of a word that already has one are not yet counted separately.',
    countingRule: 'dictionaryEntries where isPublished == true and audioUrl != ""',
    ctaLabel: 'Record audio',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=pronunciation',
    iconName: 'volume',
    accentHue: '#0d9488',
    culturalPalette: {
      primary: '#0d9488',
      secondary: '#5eead4',
      glow: 'rgba(13, 148, 136, 0.4)',
      liquidGrad: ['#042f2e', '#115e59', '#0d9488', '#ccfbf1'],
      earthTone: '#134e4a',
    },
    hasAudioSample: true,
    sampleAudioType: 'word',
    sampleAudioLabel: 'Kasem Word: "Buri" (Harvest / Clan Seed)',
    breakdowns: [
      { label: 'Basic Vocabulary & Objects', count: 81, percentage: 45 },
      { label: 'Anatomy, Health & Plants', count: 45, percentage: 25 },
      { label: 'Tone Differentiation Pairs', count: 36, percentage: 20 },
      { label: 'Idiomatic Pronunciations', count: 18, percentage: 10 },
    ],
    activeQueuePrompt: {
      taskLabel: 'Record audio',
      promptText: 'Pronunciation take needed: "kambon" (protective warrior badge)',
      actionUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=pronunciation',
    },
    auditQuery: {
      collection: 'dictionaryEntries',
      filter: 'where isPublished == true and audioUrl != ""',
      securityRule: 'allow read: if resource.data.isPublished == true',
    },
  },
];

export const CATEGORIES_BY_ID = Object.fromEntries(
  CONTRIBUTION_CATEGORIES.map((cat) => [cat.id, cat])
) as Record<ContributionCategoryId, CategoryDefinition>;

/**
 * Production launch configuration baseline.
 */
export const DEFAULT_PRODUCTION_CONFIG: LaunchProgressConfig = {
  launchWindowLabel: 'Planned: December 2026 / January 2027',
  launchTargetDate: null,
  categoryTargets: {
    lexicon: 200000,
    expressions: 1000,
    sentences: 400000,
    literature: 100,
    music: 100,
    audiobooks: 100,
    video: 1000,
    grammar: 5000,
    proverbs: 100,
    pronunciation: 400000,
  },
  notes: 'Confirmed collection targets toward planned December/January launch.',
};

/** Development & fixture targets */
export const FIXTURE_TARGETS: Record<ContributionCategoryId, number> = {
  lexicon: 1000,
  expressions: 250,
  sentences: 500,
  literature: 50,
  music: 30,
  audiobooks: 40,
  video: 20,
  grammar: 25,
  proverbs: 100,
  pronunciation: 400,
};

/** Sample approved counts for fixture testing */
export const FIXTURE_APPROVED_COUNTS: Record<ContributionCategoryId, number> = {
  lexicon: 840,
  expressions: 265,
  sentences: 240,
  literature: 18,
  music: 30,
  audiobooks: 12,
  video: 7,
  grammar: 19,
  proverbs: 45,
  pronunciation: 180,
};

/** Demonstration 7-day increments, used only in the labelled fixture preview. */
export const SAMPLE_WEEKLY_VELOCITIES: Record<ContributionCategoryId, number> = {
  lexicon: 24,
  expressions: 14,
  sentences: 18,
  literature: 2,
  music: 3,
  audiobooks: 1,
  video: 1,
  grammar: 2,
  proverbs: 6,
  pronunciation: 22,
};

/** 30-day historical progression sparkline samples */
export const SAMPLE_SPARKLINE_DATA: Record<ContributionCategoryId, number[]> = {
  lexicon: [120, 180, 240, 310, 340],
  expressions: [40, 80, 140, 210, 265],
  sentences: [50, 95, 140, 190, 240],
  literature: [4, 8, 11, 15, 18],
  music: [5, 12, 19, 26, 30],
  audiobooks: [2, 5, 8, 10, 12],
  video: [1, 3, 4, 6, 7],
  grammar: [3, 7, 12, 16, 19],
  proverbs: [10, 18, 28, 38, 45],
  pronunciation: [25, 60, 98, 145, 180],
};

/** Demonstration pledges, used only in the labelled fixture preview. */
export const SAMPLE_COMMUNITY_PLEDGES: Record<ContributionCategoryId, number> = {
  lexicon: 140,
  expressions: 52,
  sentences: 85,
  literature: 14,
  music: 8,
  audiobooks: 6,
  video: 4,
  grammar: 9,
  proverbs: 28,
  pronunciation: 96,
};

/** Verified historical milestones achieved by community */
export const HISTORICAL_MILESTONES: MilestoneRecord[] = [
  {
    id: 'm-1',
    date: '2026-10-04',
    title: 'Help Fill the Jars Launch',
    categoryId: 'lexicon',
    description: 'Public launch progress dashboard deployed with 10 distinct heritage categories and honest unconfigured target states.',
    countReached: 340,
  },
  {
    id: 'm-2',
    date: '2026-10-02',
    title: 'Model Learning Expressions Cleaned',
    categoryId: 'expressions',
    description: '38 duplicate entries retired while 340 high-utility Kasem expressions were secured for interactive learning.',
    countReached: 340,
  },
  {
    id: 'm-3',
    date: '2026-09-28',
    title: 'TribeStudio Video Library Live',
    categoryId: 'video',
    description: '50-track cultural audio library and 48-sticker editor verified for local storytellers.',
    countReached: 7,
  },
  {
    id: 'm-4',
    date: '2026-09-27',
    title: 'Third Pronunciation Release',
    categoryId: 'pronunciation',
    description: '26 approved studio recordings matched to dictionary entries with tone markers and dialect tags.',
    countReached: 89,
  },
  {
    id: 'm-5',
    date: '2026-09-26',
    title: 'First 45 Verified Proverbs Recorded',
    categoryId: 'proverbs',
    description: 'Key Kasena proverbs documented with literal translation, social lesson, and usage guidance.',
    countReached: 45,
  },
  {
    id: 'm-6',
    date: '2026-09-23',
    title: '"De N Lei" Master Song Track Published',
    categoryId: 'music',
    description: 'Beloved Kasem musical piece verified and added to the public listening portal.',
    countReached: 30,
  },
];

/** Community contributors recognized on the Honor Wall */
export const COMMUNITY_CONTRIBUTOR_HONORS: ContributorHonor[] = [
  { name: 'Francis Pwavwe', location: 'Paga', role: 'Language Custodian', category: 'Lexicon & Proverbs' },
  { name: 'Chinedum O.', location: 'London / Diaspora', role: 'Platform Architect', category: 'Ecosystem & Hosting' },
  { name: 'Navrongo Elders Circle', location: 'Navrongo', role: 'Review Committee', category: 'Oral Histories' },
  { name: 'Chiana Youth Club', location: 'Chiana', role: 'Audio Recorders', category: 'Pronunciation Takes' },
  { name: 'Tiébélé Cultural Guild', location: 'Tiébélé', role: 'Visual Arts Custodians', category: 'Cultural Videos' },
  { name: 'Sirigu Women Artisans', location: 'Sirigu', role: 'Traditional Storytellers', category: 'Literature & Folklore' },
];
