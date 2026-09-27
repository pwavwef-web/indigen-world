// Shared by the offline page and Node validation checks.
const ComparisonState = (() => {
  const decisions = ['pending', 'acceptable', 'needs_recording', 'unsure'];
  const candidates = manifest => manifest.entries.flatMap(e => e.candidates.filter(c => c.status === 'pending_review'));
  function clean(saved, manifest) {
    if (saved.schemaVersion !== 2 || saved.batchId !== manifest.batchId || saved.sampleSha256 !== manifest.sampleSha256 || !Array.isArray(saved.reviews)) {
      throw Error('This file belongs to a different comparison pack.');
    }
    const lookup = new Map(candidates(manifest).map(c => [c.candidateId, c]));
    const result = {reviewer: String(saved.reviewer || '').slice(0, 200), variety: String(saved.variety || '').slice(0, 200), reviews: {}};
    for (const review of saved.reviews) {
      const candidate = lookup.get(review.candidateId);
      if (!candidate || candidate.entryId !== review.entryId || candidate.audioSha256 !== review.audioSha256 ||
          !decisions.includes(review.decision) || Object.hasOwn(result.reviews, review.candidateId)) {
        throw Error('A word, recording, duplicate decision or review value does not match this pack.');
      }
      result.reviews[review.candidateId] = {
        decision: review.decision, notes: String(review.notes || '').slice(0, 5000),
        reviewedAt: typeof review.reviewedAt === 'string' ? review.reviewedAt.slice(0, 100) : null,
      };
    }
    return result;
  }
  function reviewFor(state, id) {
    return state.reviews[id] || {decision: 'pending', notes: '', reviewedAt: null};
  }
  function report(state, manifest) {
    const reviews = manifest.entries.flatMap(entry => entry.candidates.filter(c => c.status === 'pending_review').map(c => ({
      candidateId: c.candidateId, entryId: entry.entryId, headword: entry.headword, meaning: entry.meaning,
      dialect: entry.dialect, engine: c.engine, model: manifest.engines[c.engine].id,
      audioFile: c.audioFile, audioSha256: c.audioSha256, ...reviewFor(state, c.candidateId),
    })));
    const counts = rows => Object.fromEntries(decisions.map(d => [d, rows.filter(r => r.decision === d).length]));
    return {schemaVersion: 2, batchId: manifest.batchId, sampleSha256: manifest.sampleSha256,
      purpose: 'local_pronunciation_comparison', exportedAt: new Date().toISOString(),
      published: false, submittedForReview: false, reviewer: state.reviewer, variety: state.variety,
      summary: counts(reviews), byEngine: Object.fromEntries([...new Set(reviews.map(r => r.engine))].map(engine => [engine, counts(reviews.filter(r => r.engine === engine))])), reviews};
  }
  function shortlist(state, manifest) {
    if (!state.reviewer.trim() || !state.variety.trim()) throw Error('Add your name and the Kasem variety you speak before preparing a shortlist.');
    const full = report(state, manifest);
    const reviews = full.reviews.filter(r => r.decision === 'acceptable');
    if (!reviews.length) throw Error('No new recordings have been marked Sounds right yet.');
    return {...full, purpose: 'shortlist_for_formal_review', status: 'not_submitted',
      summary: undefined, byEngine: undefined, shortlistedCount: reviews.length, reviews,
      instructions: 'Speaker precheck only. Recheck the current entry, sense, dialect, rights and existing human audio before formal review or publication.'};
  }
  return {decisions, candidates, clean, reviewFor, report, shortlist};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ComparisonState;
