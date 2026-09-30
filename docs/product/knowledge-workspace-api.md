# Kasem knowledge workspace API

Implementation contract, 2026-09-27. These callables run in `us-central1` and require authentication. They collect private, reviewable records; no callable publishes content or enrolls it in training. Existing dictionary, grammar-evidence and collection records remain intact.

## Catalogue and records

`listKnowledgeRecords({scope: 'mine' | 'review', cursor?: string})` returns `{records, catalog, canReview, nextCursor}`. Pages contain at most 30 records; pass the returned opaque cursor to continue. `mine` contains the current contributor's records. `review` requires validator/reviewer/admin access and contains submitted and reviewed records, including records requiring changes or with disputes. The catalogue is an array of `{id, label, description, fields: [{key, label, hint, required?, multiline?}]}`. IDs: `lexicon`, `grammar`, `expressions`, `sentences`, `proverbs`, `literature`, `dialogue`, `pronunciation`, `culture`, `qa`.

`getKnowledgeRecord({id})` returns `{record, reviews, history}` to its owner or a qualified reviewer. History lists revision number, timestamp and status, not other contributors' private records. During independent review, reviewers see only their own review events; owners see the feedback on their record. No content is publicly readable.

Editable record shape:

```ts
{
  datasetType: 'lexicon' | 'grammar' | 'expressions' | 'sentences' | 'proverbs' |
    'literature' | 'dialogue' | 'pronunciation' | 'culture' | 'qa',
  language: 'xsm', title: string, original: string, english: string, french: string,
  context: string, region: string, source: string,
  sourceType: 'speaker' | 'literature' | 'recording' | 'other', sourceReference: string,
  details: Record<string, string>, // keys come from the selected catalogue entry
  variants: Array<{form: string, context: string, note: string}>,
  relatedRecordIds: string[], // links only; never copies another record or its permission
  permissions: {
    review: boolean, sourceConfirmed: boolean, publication: boolean,
    providerRetrieval: boolean, modelTraining: boolean, evaluation: boolean, audio: boolean,
    licence: string, culturalAccess: 'open' | 'restricted' | 'sensitive'
  },
  audio: Array<{
    path: string, label: string, transcript: string, speakerId: string, region: string,
    kind: 'isolated' | 'in_context', environment: string, quality: string
  }>
}
```

Server fields: `id` (`KSM-<datasetType>-<opaque suffix>`), `schemaVersion: 1`, `revision`, `authorUid`, `createdAt`, `updatedAt`, `status`, `warnings: string[]`, `reviewCount`, `approvalCount`. Statuses: `draft`, `submitted`, `reviewed`, `gold`, `changes_requested`, `disputed`, `withdrawn`. An approval is a human quality review, never a grant of rights. Gold needs two distinct, non-author reviewers on the exact revision; each affirms language competence. Proverbs, literature, culture and restricted/sensitive material additionally require cultural competence. A dispute blocks Gold regardless of positive votes.

Drafts may be incomplete. Submission requires title, original Kasem, natural English meaning, context, region/dialect, source attribution, source reference for written/recorded sources, the catalogue's required fields, confirmed source rights and community review permission. Unknown analyses can be recorded explicitly as unknown; the interface must not invent them. French and recordings are optional except that pronunciation submissions need at least one recording. Original text is preserved exactly, including diacritics and spacing. Long original/translation fields support up to 30,000 characters.

## Writes and review

`saveKnowledgeRecord({id?, revision?, requestId, record, submit: boolean}) => {record}`. A stable `requestId` makes retries idempotent. New records begin at revision 1. Updating requires the current revision and increments it; prior content and reviews remain in immutable history. Only the author edits. Dataset type cannot change on an existing record. A revision starts fresh review and removes any prior Gold status.

`reviewKnowledgeRecord({id, revision, decision: 'approve' | 'changes_requested' | 'dispute', languageCompetent: boolean, culturalCompetent: boolean, note: string}) => {record}`. A validator/reviewer/admin may review a submitted record, but not their own. The current revision must match. One review per person per revision is immutable. Requests for changes and disputes need an explanation. The first approval yields `reviewed`; two qualified independent approvals yield `gold`. Change requests and disputes keep the record out of Gold until the author submits a new revision.

`withdrawKnowledgeRecord({id, revision}) => {record}`. Only the author may withdraw; the current revision must match. Withdrawal blocks further review and audio access through the workspace. A withdrawn record is final; create a new record to contribute again.

## Audio

Upload a new private recording to `grammarAudio/<authenticated uid>/<unique filename>` using the existing Storage rules (audio MIME, less than 20 MB, no overwrite). Submit its path in `audio`, with audio permission checked. The server verifies ownership, metadata and immutable object generation; it never creates a public URL.

`readKnowledgeAudio({id, revision, index}) => {audio: string, contentType: string}` returns base64 bytes only to the owner or eligible reviewer while permissions and revision remain current. It rechecks generation and permission after downloading. The UI should release local playback URLs when finished.

## Availability

Deploy the new Functions before releasing connected clients. The feature is additive and requires no direct client Firestore writes. Contributor and review results are always obtained through these authenticated callables. No deployment or production data collection is established by committing these files.
