/** Bounded, optional speaker metadata. Older clients omit it without clearing it. */
export const UNCERTAINTY_REASONS = ['', 'unclear-prompt', 'unfamiliar', 'several-meanings', 'variety', 'other'];
export const VARIANT_LABELS = ['', 'polite', 'informal', 'regional', 'emphasis', 'other'];
export const EMPTY_DETAILS = Object.freeze({ variety: '', speaker: '', listener: '', situation: '', register: '', literalMeaning: '', variantNote: '', uncertainty: '', alternativeNotes: [] });

export function parseContributorDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contribution details must be an object.');
  const out = {};
  for (const [key, max] of Object.entries({ variety: 80, speaker: 160, listener: 160, situation: 300, register: 80, literalMeaning: 300, variantNote: 300 })) {
    const field = value[key] ?? '';
    if (typeof field !== 'string' || field.trim().length > max) throw new Error(`Keep ${key} within ${max} characters.`);
    out[key] = field.trim();
  }
  out.uncertainty = value.uncertainty ?? '';
  if (!UNCERTAINTY_REASONS.includes(out.uncertainty)) throw new Error('Choose one of the uncertainty reasons.');
  const notes = value.alternativeNotes ?? [];
  if (!Array.isArray(notes) || notes.length > 12 || notes.some(note => typeof note !== 'string' || !VARIANT_LABELS.includes(note))) throw new Error('Use a listed label for each alternative.');
  out.alternativeNotes = [...notes];
  return out;
}

export function detailsContext(details, context = '') {
  return [context, ...[['Speaker', 'speaker'], ['Listener', 'listener'], ['Situation', 'situation'], ['Tone', 'register'], ['Literal meaning', 'literalMeaning'], ['Distinct variant', 'variantNote']].map(([label, key]) => details[key] ? `${label}: ${details[key]}` : '')].filter(Boolean).join('\n');
}

/** Unicode-normalised matching is a hint; a reviewer still decides distinctness. */
export function contributionTextKey(text) {
  return String(text).normalize('NFC').toLocaleLowerCase('en').replace(/[\s\p{P}]+/gu, ' ').trim();
}
