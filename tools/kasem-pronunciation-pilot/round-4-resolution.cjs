// Sense routing for the exact September 28 owner review. No outbound messages.
const S = require('./comparison-state.cjs');
const reviewSha256 = '1715b6e2cafbd5ba22648df50ef00623f75a70bc061e5edc7ac2abe48cbfe5b3';
const noteRules = {
  'swɛ:gemini25': {decision:'acceptable', notes:'but this is a kinda fruit, email emma for the english name of it.'},
  'gaale:gemini38': {decision:'acceptable', notes:"right when you mean 'skip'"},
  'gaale:gemini25': {decision:'acceptable', notes:'right for exceed'},
  'Nae:gemini25': {decision:'pending', notes:'a is too prolonged'},
  'Dian:gemini38': {decision:'pending', notes:'remove this word'},
};
function resolveReview(manifest, review) {
  const canonical = S.report(S.clean(review, manifest), manifest);
  if (canonical.reviews.length !== review.reviews.length) throw Error('Complete review required');
  const source = word => {
    const matches = manifest.entries.filter(e => e.headword === word);
    if (matches.length !== 1) throw Error(`Ambiguous source: ${word}`);
    return matches[0];
  };
  const seenNotes = new Set();
  for (const r of canonical.reviews) {
    const key = `${r.headword}:${r.engine}`, rule = noteRules[key];
    if (rule) {
      if (r.decision !== rule.decision || r.notes.trim() !== rule.notes) throw Error(`Resolution note changed: ${key}`);
      seenNotes.add(key);
    } else if (r.notes.trim()) throw Error(`Unresolved note: ${key}`);
  }
  if (seenNotes.size !== Object.keys(noteRules).length) throw Error('Required note missing');
  const destinations = new Map(), held = [];
  const destination = (s, meaning = s.meaning, create = false) => {
    const id = create ? `review_20260928_${s.entryId}_skip` : s.entryId;
    if (!destinations.has(id)) destinations.set(id, {entryId:id,sourceEntryId:s.entryId,create,
      headword:s.headword,meaning,dialect:s.dialect,patch:create?{partOfSpeech:'Verb'}:{},candidates:[]});
    return destinations.get(id);
  };
  const accepted = canonical.reviews.filter(r => r.decision === 'acceptable');
  for (const r of accepted) {
    if (!r.reviewedAt || !Number.isFinite(Date.parse(r.reviewedAt)) || !['gemini38','gemini25'].includes(r.engine)) throw Error('Invalid approval');
    const s = source(r.headword), c = s.candidates.find(c => c.candidateId === r.candidateId);
    if (r.headword === 'swɛ' && r.engine === 'gemini25') {
      held.push({...c,reviewedAt:r.reviewedAt,headword:s.headword,sourceMeaning:s.meaning,
        reason:'Approved for a fruit sense; precise English fruit name is unconfirmed. Do not attach to bathed.',
        status:'awaiting_meaning_confirmation'});
      continue;
    }
    const target = r.headword === 'gaale' && r.engine === 'gemini38'
      ? destination(s,'skip',true) : destination(s);
    target.candidates.push({...c,reviewedAt:r.reviewedAt,sourceMeaning:s.meaning,
      reviewNotes:`Owner approved this recording for “${target.meaning}”. Meaning checked before publication.`});
  }
  for (const d of destinations.values()) d.candidates.sort((a,b)=>['gemini38','gemini25'].indexOf(a.engine)-['gemini38','gemini25'].indexOf(b.engine));
  const dian = source('Dian');
  if (destinations.has(dian.entryId)) throw Error('Withdrawn entry cannot receive audio');
  destinations.set(dian.entryId,{entryId:dian.entryId,sourceEntryId:dian.entryId,create:false,
    headword:dian.headword,meaning:dian.meaning,dialect:dian.dialect,patch:{isPublished:false},
    candidates:[],withdraw:true,reason:'Owner requested this word removed in the listening notes; preserve the document.'});
  const entries = [...destinations.values()];
  if (accepted.length !== 24 || held.length !== 1 || entries.filter(e=>e.candidates.length).length !== 21 ||
      entries.reduce((n,e)=>n+e.candidates.length,0) !== 23 || entries.filter(e=>e.create).length !== 1) throw Error('Unexpected resolved counts');
  return {reviewSha256,summary:canonical.summary,byEngine:canonical.byEngine,entries,held,
    approvedDecisions:accepted.length,approvedClips:23,audioEntries:21,newEntries:1,withdrawnEntries:1,
    followUp:[
      {headword:'swɛ',action:'Confirm the fruit’s English name with the contributor Emma before creating its entry or publishing its approved Pro take. Contact lookup and a local draft do not send a message.'},
      {headword:'Nae',action:'Pro remains pending: the a vowel is too prolonged. Obtain a shorter-vowel take for review; Flash was rejected.'},
      {headword:'Dian',action:'Unpublish only the reviewed food entry. Preserve the document, existing source and before-state backup.'},
    ]};
}
module.exports = {resolveReview,reviewSha256};
