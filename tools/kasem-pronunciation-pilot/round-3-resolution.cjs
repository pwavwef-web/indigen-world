// Explicit interpretation of the owner's September 27 listening notes.
// The publisher binds this plan to the exact review file, including its notes.
const S = require('./comparison-state.cjs');
const reviewSha256 = 'dd8fbb60adf4fdea7c39a634f9f6a4c50fa0a842519c37da76b75071f6b47f40';
function resolveReview(manifest, review) {
  const canonical = S.report(S.clean(review, manifest), manifest);
  if (canonical.reviews.length !== review.reviews.length) throw Error('Complete review required');
  const destinations = new Map();
  const source = word => {
    const matches = manifest.entries.filter(e => e.headword === word);
    if (matches.length !== 1) throw Error(`Ambiguous source: ${word}`);
    return matches[0];
  };
  const destination = (word, meaning, create = false, patch = {}) => {
    const s = source(word);
    const id = create ? `review_20260927_${s.entryId}_${meaning.replace(/[^a-z]+/g, '_')}` : s.entryId;
    if (!destinations.has(id)) destinations.set(id, {entryId:id, sourceEntryId:s.entryId, create,
      headword:word, meaning:meaning || s.meaning, dialect:s.dialect, patch, candidates:[]});
    return destinations.get(id);
  };
  const corrected = (meaning, extra = {}) => ({englishText:meaning, senses:[], ...extra});
  const route = (word, meaning, create, patch) => destination(word, meaning, create, patch);
  const resolution = {
    'kuri:gemini25': () => [route('kuri','choose',true,{partOfSpeech:'Verb'})],
    'tega:gemini25': () => [route('tega','dead',true,{partOfSpeech:'Adjective',kasemExample:'chworo kom tega.',englishExample:'The hen is dead.'})],
    'bwoŋi:gemini25': () => [route('bwoŋi','call',true,{partOfSpeech:'Verb',forms:{imperative:'bwoŋi',future:'bwoŋi'},kasemExample:'Bwoŋi o',englishExample:'Call him.',culturalNote:'This pronunciation is used for the command and future usage. The past-tense reading has a separate recording.'})],
    'woli:gemini25': () => [route('woli','added',false),route('woli','help',true,{partOfSpeech:'Verb'})],
    'jaana:gemini25': () => [route('jaana','flying',false,corrected('flying',{partOfSpeech:'Verb'}))],
    'ŋwe:gemini38': () => [route('ŋwe','pay',true,{partOfSpeech:'Verb'})],
    'yi:gemini38': () => [route('yi','reach',false,corrected('reach',{partOfSpeech:'Verb',forms:{past:'yia'}}))],
    'yi:gemini25': () => [route('yi','eye',true,{partOfSpeech:'Noun',forms:{plural:'yia'}})],
    'su:gemini25': () => [route('su','shake',true,{partOfSpeech:'Verb',forms:{past:'suga'}})],
    'fɔge:gemini25': () => [route('fɔge','plaster',false,corrected('plaster',{partOfSpeech:'Verb',kasemExample:'',englishExample:''}))],
  };
  const sameSenseNotes = new Set(['nabiina:gemini38','nabiina:gemini25','bwoŋi:gemini38','memaŋa:gemini38']);
  const used = new Set();
  for (const r of canonical.reviews.filter(r => r.decision === 'acceptable')) {
    if (!r.reviewedAt || !['gemini38','gemini25'].includes(r.engine)) throw Error('Invalid approval');
    const s = source(r.headword), c = s.candidates.find(c => c.candidateId === r.candidateId);
    const key = `${r.headword}:${r.engine}`;
    if (r.notes.trim() && !resolution[key] && !sameSenseNotes.has(key)) throw Error(`Unresolved note: ${key}`);
    const targets = resolution[key] ? resolution[key]() : [destination(s.headword,s.meaning)];
    for (const target of targets) target.candidates.push({...c, reviewedAt:r.reviewedAt,
      reviewNotes:`Owner approved this recording for “${target.meaning}”. Notes resolved before publication.`,
      sourceMeaning:s.meaning});
    used.add(key);
  }
  for (const key of Object.keys(resolution)) if (!used.has(key)) throw Error(`Required approval missing: ${key}`);
  for (const d of destinations.values()) d.candidates.sort((a,b)=>['gemini38','gemini25'].indexOf(a.engine)-['gemini38','gemini25'].indexOf(b.engine));
  destinations.set('collection_4LbHGPSrpBz4n9hRNDry',{entryId:'collection_4LbHGPSrpBz4n9hRNDry',sourceEntryId:null,
    create:false,headword:'jaane',meaning:'to fly / fly',dialect:'Ghana Kasem',candidates:[],
    patch:corrected('to fly / fly',{partOfSpeech:'Verb'})});
  const carefully = destination('fɔge','carefully',true,{partOfSpeech:'Adverb'});
  carefully.headword = 'fɔŋe';
  return {reviewSha256, summary:canonical.summary, entries:[...destinations.values()],
    approvedClips:canonical.reviews.filter(r=>r.decision==='acceptable').length,
    queue:{headword:'memaŋa',meaning:'proverbs',sourceEntryId:source('memaŋa').entryId,
      accountUid:'fjnCDzK5lPZnEGHRYkarL5vqpzq1',accountName:'Francis Pwavwe'},
    followUp:[
      {headword:'laŋa',action:'Both takes withheld. Final vowel should sound á; keep the written headword unchanged.'},
      {headword:'beera',action:'Gemini 2.5 remains pending. Final vowel should sound à; keep the written headword unchanged.'},
      {headword:'naane',action:'Both takes rejected. Cows and create have distinct pronunciations; obtain new recordings before either is published.'},
      {headword:'jaane',action:'Owner clarification: to fly / fly. No new future spelling supplied; no future form or audio inferred.'},
      {headword:'memaŋa',action:'Signs audio approved. Proverbs is uncertain and goes to the review queue under the specified account, without publication.'},
    ]};
}
module.exports = {resolveReview,reviewSha256};
