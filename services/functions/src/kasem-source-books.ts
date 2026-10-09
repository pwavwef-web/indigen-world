/** Explicitly authorised source imports. A client cannot add a new book by
 * writing a projection or by presenting another book's completed manifest. */
export const DIRECT_SOURCE_BOOK_IDS = ['bgl-kasem-orthography-1997', 'gillbt-basic-grammar-1983-2014'] as const;
export function publishedSourceManifest(importId: unknown, manifest: Record<string, unknown>): boolean {
  return DIRECT_SOURCE_BOOK_IDS.some(id => id === importId)
    && (manifest.importId ?? DIRECT_SOURCE_BOOK_IDS[0]) === importId
    && manifest.status === 'published' && manifest.publicationMode === 'owner-direct-source'
    && manifest.providerRetrieval === true;
}
