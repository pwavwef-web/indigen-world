const reviewState = require('./comparison-state.cjs');

function approvedPlan(manifest, review) {
  const clean = reviewState.clean(review, manifest);
  const canonical = reviewState.report(clean, manifest);
  if (canonical.reviews.some(r => r.notes.trim())) throw Error('Review notes require an explicit sense-resolution plan before publication');
  if (review.reviews.length !== canonical.reviews.length) throw Error('The complete review is required');
  const accepted = canonical.reviews.filter(r => r.decision === 'acceptable');
  if (!accepted.length) throw Error('No approved recordings');
  const groups = new Map();
  for (const row of accepted) {
    if (!['gemini38', 'gemini25'].includes(row.engine)) throw Error('Only reviewed Google output can be published by this importer');
    if (!row.reviewedAt) throw Error('Approved recording has no review time');
    const source = manifest.entries.find(e => e.entryId === row.entryId);
    const candidate = source.candidates.find(c => c.candidateId === row.candidateId);
    if (!groups.has(row.entryId)) groups.set(row.entryId, {entryId: row.entryId,
      headword: source.headword, meaning: source.meaning, dialect: source.dialect, candidates: []});
    groups.get(row.entryId).candidates.push({...candidate, review: row});
  }
  for (const group of groups.values()) {
    group.candidates.sort((a, b) => ['gemini38', 'gemini25'].indexOf(a.engine) - ['gemini38', 'gemini25'].indexOf(b.engine));
  }
  return {summary: canonical.summary, byEngine: canonical.byEngine, entries: [...groups.values()], approvedClips: accepted.length};
}

function assertCurrent(entry, data, releaseId) {
  if (!data || data.isPublished !== true || data.mergedIntoId) throw Error(`Entry is missing, unpublished or merged: ${entry.entryId}`);
  if ((data.kasemText || data.headword || '') !== entry.headword ||
      (data.englishText || data.translation || '') !== entry.meaning ||
      (data.dialect || 'Not recorded') !== entry.dialect) throw Error(`Word, meaning or dialect changed: ${entry.entryId}`);
  const sameRelease = data.pronunciationAudioProvenance?.releaseId === releaseId;
  if (sameRelease) {
    const expected = entry.candidates.map(c => c.audioSha256).sort();
    const actual = (data.pronunciationAudioVariants || []).map(c => c.audioSha256).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected) ||
        data.pronunciationAudioProvenance.audioSha256 !== entry.candidates[0].audioSha256 ||
        !data.audioUrl || data.audioUrl !== data.pronunciationAudioVariants.find(c => c.isPrimary)?.audioUrl) {
      throw Error(`Existing release metadata differs: ${entry.entryId}`);
    }
    return 'already_published';
  }
  if (data.audioUrl || data.pronunciationAudioUrl || data.pronunciationAudioVariants?.length) {
    throw Error(`Existing pronunciation must be preserved: ${entry.entryId}`);
  }
  return 'attach';
}

function attributionWithAudioNotice(data, approvedBy) {
  const source = [data.attribution, data.source, data.contributorName].find(v => typeof v === 'string' && v.trim());
  return [source?.trim(), `Pronunciation audio: AI-generated with Google Gemini; reviewed and approved for publication by ${approvedBy}.`].filter(Boolean).join('\n\n');
}

module.exports = {approvedPlan, assertCurrent, attributionWithAudioNotice};
