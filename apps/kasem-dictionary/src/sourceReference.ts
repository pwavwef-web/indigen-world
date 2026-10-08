export interface SourceReference { title: string; references: string[]; href: string | null }
/** Only the two already published guides are linked; metadata is never guessed. */
export function sourceReference(data: Record<string, unknown>): SourceReference {
  const importId = String(data.importId ?? data.importBatch ?? '');
  const grammar = importId === 'gillbt-basic-grammar-1983-2014';
  const spelling = importId === 'bgl-kasem-orthography-1997';
  const references = Array.isArray(data.sourceRefs) ? data.sourceRefs.filter((value): value is string => typeof value === 'string') : [];
  const block = references.join(' ').match(/block\s+(\d+)/i)?.[1];
  return { title: typeof data.sourceDocumentName === 'string' ? data.sourceDocumentName : grammar ? 'A Basic Grammar of Kasem · P. L. Hewer, GILLBT' : spelling ? 'Kasem orthography · BGL, 1997' : 'Book title not recorded',
    references, href: grammar ? '/grammar-guide.html' + (block ? '#block-' + block : '#chapters') : spelling ? '/spelling-guide.html' : null };
}
