/** Source reimports must follow merge redirects rather than republish duplicates. */
const norm = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const key = (collection, kasem, english) => JSON.stringify([collection, norm(kasem), norm(english)]);

export function sourceEntryIndex(documents) {
  const byPath = new Map(documents.map(doc => [doc.ref.path, doc]));
  const byText = new Map();
  for (const doc of documents) {
    if (doc.get('mergedInto')) continue;
    byText.set(key(doc.ref.parent.id, doc.get('kasemText') || doc.get('headword'),
      doc.get('englishText') || doc.get('translation')), doc);
  }
  return { byPath, byText };
}

export function matchSourceEntry(index, collection, entry) {
  let candidate = index.byPath.get(`${collection}/${entry.id}`);
  const seen = new Set();
  while (candidate?.get('mergedInto')) {
    if (seen.has(candidate.ref.path)) throw new Error('Cycle in source entry merge redirects.');
    seen.add(candidate.ref.path);
    const redirect = candidate.get('mergedInto');
    if (redirect.collection !== collection || !redirect.id || redirect.id.includes('/')) {
      throw new Error('Invalid source entry merge redirect; cannot safely reimport.');
    }
    candidate = index.byPath.get(`${collection}/${redirect.id}`);
    if (!candidate) throw new Error('Merge target is missing; cannot republish the retired source.');
  }
  return candidate || index.byText.get(key(collection, entry.headword, entry.translation));
}
