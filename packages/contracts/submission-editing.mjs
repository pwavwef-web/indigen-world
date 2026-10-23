/** Content fields a reviewer may correct. Identity, rights and routing stay immutable. */
export const EDITABLE_SUBMISSION_STATUSES = ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION', 'APPROVED', 'SCHEDULED', 'PUBLISHED'];

const field = (path, label, maxLength = 2000, required = false) => ({ path, label, maxLength, required });
const forms = {
  definite: 'With the definite article', plural: 'Plural', pluralDefinite: 'Definite plural', counted: 'Counted form', pronoun: 'Pronoun', article: 'Article',
  present: 'Present', past: 'Past', future: 'Future', pluralSubject: 'Plural subject', imperative: 'Imperative', agreeingOne: 'Agreement example 1', agreeingTwo: 'Agreement example 2',
};

export function submissionEditFields(s) {
  const expression = s.collectionKind === 'expressions' || Boolean(s.expression) || s.contentKind === 'expression'
    || (s.collectionKind === 'dictionary' && ['phrase', 'idiom', 'proverb'].includes(s.lexicalKind));
  const fields = expression ? [
    field('body', 'Expression (Kasem)', 300, true), field('title', 'Meaning (English)', 1000, true),
    field('literalTranslation', 'Word for word', 1000), field('usageContext', 'When it is used', 1500, true),
    field('alternativeExpressions', 'Other ways of saying it (one per line)', 12000),
  ] : [field('title', 'Title / English meaning', 180, true), field('body', s.collectionKind === 'dictionary' ? 'Word (Kasem)' : 'Content', 12000, s.collectionKind === 'dictionary')];
  fields.push(field('dialect', 'Dialect', 80, expression), field('description', 'Description', 4000), field('englishSummary', 'English summary', 4000),
    field('kasemExample', 'Kasem example', 4000), field('englishExample', 'English example', 4000),
    field('culturalContext', 'Cultural context', 4000), field('sourceReferences', 'Source / attribution', expression ? 600 : 1200, expression), field('translationNotes', 'Reviewer context', 4000));
  if (s.translation && typeof s.translation === 'object') fields.push(field('translation.translatedContent', 'Translation', 12000), field('translation.translatorNotes', 'Translator notes', 4000));
  if (s.media) fields.push(field('caption', 'Caption'), field('altText', 'Image description'));
  if (s.collectionKind === 'dictionary' && !expression) {
    fields.push(field('format', 'Part of speech', 80), field('ipa', 'Pronunciation (IPA)', 200), field('kasemDefinition', 'Definition in Kasem', 2000), field('etymology', 'Word origin', 2000));
    for (const [slot, label] of Object.entries(forms)) fields.push(field(`forms.${slot}`, label, 120));
    for (const [i, sense] of (Array.isArray(s.senses) ? s.senses : []).entries()) {
      fields.push(field(`senses.${i}.definition`, `Meaning ${i + 1}: English definition`, 300, true), field(`senses.${i}.kasemDefinition`, `Meaning ${i + 1}: Kasem definition`, 2000), field(`senses.${i}.usageNote`, `Meaning ${i + 1}: usage note`, 600));
      for (const [j] of (Array.isArray(sense.examples) ? sense.examples : []).entries()) {
        fields.push(field(`senses.${i}.examples.${j}.kasem`, `Meaning ${i + 1}, example ${j + 1}: Kasem`, 400), field(`senses.${i}.examples.${j}.english`, `Meaning ${i + 1}, example ${j + 1}: English`, 400));
      }
    }
  }
  return fields.filter(f => !(f.path === 'title' && !expression && s.collectionKind === 'dictionary' && s.senses?.length));
}

export function submissionEditValue(s, path) {
  const aliases = { body: 'phrase', title: 'meaning', dialect: 'dialect', literalTranslation: 'literalTranslation', usageContext: 'context', alternativeExpressions: 'alternatives' };
  const value = s.expression && aliases[path] ? s.expression[aliases[path]] ?? s[path] : path.split('.').reduce((v, key) => v?.[key], s);
  if (path === 'sourceReferences' && s.expression?.source) return s.expression.source.detail ?? '';
  return Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '';
}

export function applySubmissionEdits(original, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new Error('Edits must be a content field map.');
  const allowed = new Map(submissionEditFields(original).map(f => [f.path, f]));
  const result = structuredClone(original);
  const changed = {};
  const before = {};
  for (const [path, raw] of Object.entries(edits)) {
    const spec = allowed.get(path);
    if (!spec || typeof raw !== 'string') throw new Error(`Cannot edit ${path}.`);
    const value = raw.trim();
    if (value.length > spec.maxLength || (spec.required && !value)) throw new Error(`${spec.label} ${!value ? 'is required' : 'is too long'}.`);
    if (value === submissionEditValue(original, path)) continue;
    before[path] = submissionEditValue(original, path);
    changed[path] = value;
    const keys = path.split('.');
    let parent = result;
    for (const key of keys.slice(0, -1)) parent = parent[key] ??= {};
    parent[keys.at(-1)] = path === 'alternativeExpressions' ? value.split('\n').map(v => v.trim()).filter(Boolean) : value;
  }
  const aliases = { body: 'phrase', title: 'meaning', dialect: 'dialect', literalTranslation: 'literalTranslation', usageContext: 'context', alternativeExpressions: 'alternatives' };
  if (result.expression) for (const [path, alias] of Object.entries(aliases)) if (path in changed) result.expression[alias] = result[path];
  if ('sourceReferences' in changed && result.expression?.source) result.expression.source.detail = result.sourceReferences;
  if (('body' in changed || 'title' in changed) && result.expression
    && String(result.expression.phrase).normalize('NFC').toLowerCase() === String(result.expression.meaning).normalize('NFC').toLowerCase()) {
    throw new Error('Write the expression in Kasem and its meaning in English.');
  }
  if (original.collectionKind === 'dictionary' && !result.expression) {
    if ('body' in changed) {
      result.translations = [result.body, ...(Array.isArray(original.translations) ? original.translations.slice(1) : [])];
    }
    if ('format' in changed) result.partOfSpeechId = result.format;
    if (Object.keys(changed).some(path => path.startsWith('senses.')) || ('title' in changed && result.senses?.length)) {
      if ('title' in changed && !('senses.0.definition' in changed)) throw new Error('Edit the individual meanings below instead of the title for a word with recorded meanings.');
      result.title = result.senses.map(sense => sense.definition).join(', ');
    }
  }
  if (result.alternativeExpressions?.some(value => value.length > 300)) throw new Error('Each alternative must be at most 300 characters.');
  if (result.expression?.alternatives?.length > 12 || result.alternativeExpressions?.length > 12) throw new Error('Use at most twelve alternatives.');
  return { submission: result, changed, before };
}
