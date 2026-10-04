/**
 * src/features/progress/progressConfig.ts
 *
 * Configurable category definitions, counting units, launch targets,
 * and contribution CTAs for the Indigen World progress page.
 *
 * Distinguishes genuine production configuration from development fixtures.
 * In production, missing targets honestly render as "Target being set" rather
 * than fabricating arbitrary numbers or confirmed launch dates.
 */

import type { CategoryDefinition, ContributionCategoryId, LaunchProgressConfig } from './progressTypes';

export const CONTRIBUTION_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'lexicon',
    title: 'Words & Meanings',
    shortLabel: 'Lexicon',
    unit: 'word',
    unitPlural: 'words',
    description: 'Distinct Kasem words with validated senses, parts of speech, and attributions.',
    explanation: 'Counts individual published headwords in the Kasem Dictionary. Excludes merged, unapproved, and duplicate entries. Expressions are kept separate and not split into words.',
    countingRule: 'dictionaryEntries where isPublished == true and not merged',
    ctaLabel: 'Suggest a word',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/dictionary',
    iconName: 'book',
    accentHue: '#0284c7', // vibrant cyan-blue
  },
  {
    id: 'expressions',
    title: 'Everyday Expressions',
    shortLabel: 'Expressions',
    unit: 'expression',
    unitPlural: 'expressions',
    description: 'Greetings, blessings, idioms, and everyday sayings preserved whole with context.',
    explanation: 'Captured in full social context with speaker relationship, situation, and source consent. Published to expressionEntries after reviewer approval.',
    countingRule: 'expressionEntries where isPublished == true and authenticationStatus == "reviewed"',
    ctaLabel: 'Share an expression',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/expressions',
    iconName: 'chat',
    accentHue: '#0ea5e9', // cerulean blue
  },
  {
    id: 'sentences',
    title: 'Kasem Sentences',
    shortLabel: 'Sentences',
    unit: 'sentence',
    unitPlural: 'sentences',
    description: 'Full sentence pairs demonstrating authentic grammar order, dialogue, and syntax.',
    explanation: 'Essential for conversational understanding and language modeling. Only confirmed sentences with verified linguistic structure and unexpired consent count.',
    countingRule: 'kasemSentences where status == "confirmed"',
    ctaLabel: 'Add a sentence',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=sentences',
    iconName: 'context',
    accentHue: '#2563eb', // deep royal blue
  },
  {
    id: 'literature',
    title: 'Stories & Folklore',
    shortLabel: 'Literature',
    unit: 'story',
    unitPlural: 'stories',
    description: 'Written oral histories, folklore, poetry, and cultural tales with storyteller attribution.',
    explanation: 'Documents traditional storytelling and historical accounts. Published after community review to preserve authorial credit and cultural protocols.',
    countingRule: 'publishedContent where collectionKind == "literature" and publicationStatus == "published"',
    ctaLabel: 'Write a story',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=writing&category=storytelling',
    iconName: 'bookmark',
    accentHue: '#3b82f6', // sky-sapphire
  },
  {
    id: 'music',
    title: 'Songs & Lyrics',
    shortLabel: 'Music',
    unit: 'song',
    unitPlural: 'songs',
    description: 'Traditional and contemporary Kasem songs with master audio recordings and lyrics.',
    explanation: 'Preserves melodies, traditional rhythms, and poetic phrasing. Audio upload and rights verification required before publication.',
    countingRule: 'publishedContent where collectionKind == "music" and publicationStatus == "published"',
    ctaLabel: 'Share a song',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=audio&category=song',
    iconName: 'volume',
    accentHue: '#06b6d4', // turquoise-blue
  },
  {
    id: 'audiobooks',
    title: 'Oral Narrations',
    shortLabel: 'Audiobooks',
    unit: 'narration',
    unitPlural: 'narrations',
    description: 'Spoken-word recordings, recited traditions, and audio readings by native speakers.',
    explanation: 'High-fidelity audio recordings bringing living voices to our heritage library. Must pass audio clarity and consent verification.',
    countingRule: 'publishedContent where collectionKind == "audiobooks" and publicationStatus == "published"',
    ctaLabel: 'Record a narration',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=audio&category=oral-history',
    iconName: 'source',
    accentHue: '#0369a1', // ocean blue
  },
  {
    id: 'video',
    title: 'Cultural Videos',
    shortLabel: 'Video',
    unit: 'video',
    unitPlural: 'videos',
    description: 'Documentaries, craft demonstrations, festivals, and cultural explanations on film.',
    explanation: 'Captures visual cultural heritage such as ceremonies, weaving, and elder conversations. Verified for participant consent and age safety.',
    countingRule: 'publishedContent where collectionKind == "video" and publicationStatus == "published"',
    ctaLabel: 'Share a video',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/submissions/new?type=video&category=culture',
    iconName: 'play',
    accentHue: '#1d4ed8', // cobalt blue
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
    accentHue: '#1e40af', // deep navy
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
    accentHue: '#0284c7', // cyan
  },
  {
    id: 'pronunciation',
    title: 'Pronunciation Takes',
    shortLabel: 'Pronunciation',
    unit: 'recording',
    unitPlural: 'recordings',
    description: 'Attested audio recordings and tone markings attached to published dictionary entries.',
    explanation: 'Gives learners authentic speaker audio for vocabulary. Linked directly to headwords with speaker consent and dialect metadata.',
    countingRule: 'dictionaryEntries where isPublished == true and audioUrl != ""',
    ctaLabel: 'Record audio',
    ctaUrl: 'https://tribestudio.indigenworld.com/studio/knowledge?category=pronunciation',
    iconName: 'volume',
    accentHue: '#0284c7', // aqua-blue
  },
];

export const CATEGORIES_BY_ID = Object.fromEntries(
  CONTRIBUTION_CATEGORIES.map((cat) => [cat.id, cat])
) as Record<ContributionCategoryId, CategoryDefinition>;

/**
 * Production launch configuration baseline.
 *
 * Category targets are deliberately `null` when not configured in Firestore
 * `platformConfiguration/launch`, ensuring the site honestly presents
 * "Target being set" rather than fabricating arbitrary numbers.
 * The launch window is honestly labeled as planned for December/January.
 */
export const DEFAULT_PRODUCTION_CONFIG: LaunchProgressConfig = {
  launchWindowLabel: 'Planned: December 2026 / January 2027',
  launchTargetDate: null,
  categoryTargets: {
    lexicon: null,
    expressions: null,
    sentences: null,
    literature: null,
    music: null,
    audiobooks: null,
    video: null,
    grammar: null,
    proverbs: null,
    pronunciation: null,
  },
  notes: 'Targets are established collaboratively with community leads and elders before publication.',
};

/**
 * Development & fixture targets used ONLY in development fixtures or verification preview.
 * Allows UI and calculation verification across all states (0%, 25%, 50%, 100%, and >100%).
 */
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

/** Sample approved counts for fixture testing when backend is offline or empty */
export const FIXTURE_APPROVED_COUNTS: Record<ContributionCategoryId, number> = {
  lexicon: 840,
  expressions: 265, // >100% target exceeded
  sentences: 240,
  literature: 18,
  music: 30, // 100% target reached
  audiobooks: 12,
  video: 7,
  grammar: 19,
  proverbs: 45,
  pronunciation: 180,
};
