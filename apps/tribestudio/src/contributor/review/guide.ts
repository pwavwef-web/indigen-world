import type { GuideSection } from '../guide';

/**
 * Guidance for reviewers. Each statement describes what the decision
 * callables actually do (decideSubmission, decidePronunciationRecording,
 * decideGrammarNote, decideKasemNameRequest, decideAdCampaign) or what the
 * published creator guidelines say; where no policy exists the section says
 * so with a `pending` note rather than inventing one.
 */
export const REVIEW_GUIDE: GuideSection[] = [
  {
    id: 'decisions',
    title: 'What each decision does',
    summary: 'Approval, publication, sending work back and escalation are different steps.',
    body: [
      'Every decision is recorded with your account and the time, and the contributor is told in the app (and by email if they chose that). The decision panel only offers what is possible for the item’s current status.',
    ],
    points: [
      'Approve — accepts the work as reviewed. Approval is not publication. An approved assigned translation earns the contributor points; nothing else does.',
      'Publish — a separate step after approval, offered only when the contributor allowed publication. Expressions are published to Expressions, dictionary words to the dictionary.',
      'Keep, do not publish — for approved work whose contributor did not allow publication. It is kept for the archive and is never made public.',
      'Return with feedback (assigned translations) — the contributor revises it and resubmits. Each resubmission is a new review round; your decision stays on record.',
      'Reject — declines the work with your reason. A declined everyday expression can be corrected once and sent again.',
      'Ask for changes — offered for creator submissions and answers to word requests, which can be revised from the contributor’s own list.',
      'Escalate to a specialist — moves the item to the Escalated queue for an elder, a teacher or a rights reviewer. Use it when the meaning, a restricted subject or the rights are beyond what you can judge.',
    ],
    source: 'Decision rules enforced by the review service; creator guidelines — “How review works”',
  },
  {
    id: 'checks',
    title: 'What to check',
    summary: 'Read the source and the contribution side by side, then use the checklist.',
    body: [
      'The quality checks beside each decision are optional and are saved with your decision. They inform the decision; they never make it, and nothing is scored automatically.',
    ],
    points: [
      'Meaning — the Kasem carries the sense of the source, not a word-for-word copy.',
      'Spelling — standard Kasem letters (ɛ, ɔ, ŋ, ɩ, ʋ, ə) where they belong.',
      'Naturalness — how people actually say it, not formal or written Kasem.',
      'Context — the usage note makes clear who says it, to whom and when.',
      'For dictionary words — the example uses the word correctly and the source is credible. Use “Check the dictionary” to see whether the spelling is already published; a match may be the same word or a different word spelled alike.',
      'For creator submissions — Kasem-language quality, creativity, cultural value, originality and technical quality, weighed together rather than summed.',
    ],
    source: 'Creator guidelines — “What reviewers score”; the review checklist in this workspace',
  },
  {
    id: 'feedback',
    title: 'Writing feedback',
    summary: 'The contributor reads exactly what you write.',
    body: [
      'Returning or rejecting work needs a written reason of at least 15 characters. Say what to change, specifically and kindly, so the contributor can act on it without guessing.',
    ],
    points: [
      'Name the problem and the fix: “ɛ, not e, in the second word” helps; “spelling” alone does not.',
      'The reusable reasons are starting points. Edit them to the case in front of you.',
      'Review the work, not the person.',
      'If a difference may be regional rather than wrong, say so — or escalate it to someone who knows that variety.',
      'A short note on approval helps the contributor learn what worked. It is optional.',
    ],
    source: 'Review workspace guidance; creator guidelines — “Revisions and resubmission”',
  },
  {
    id: 'rules',
    title: 'Rules the system enforces',
    summary: 'These are checked on the server, not only on this screen.',
    body: [
      'The workspace hides actions you cannot take, but the review service checks every decision again before recording it.',
    ],
    points: [
      'Review access is needed for every queue and every decision.',
      'You cannot decide your own submission, recording or sentence. Another reviewer must.',
      'A decision carries the status and version you saw. If someone else decided first, yours is refused and nothing is overwritten; the page shows the latest state.',
      'Publishing needs the contributor’s publication permission.',
      'Sending work back or rejecting it needs written feedback.',
      'Withdrawn work cannot be reviewed.',
    ],
    source: 'Decision rules enforced by the review service',
  },
  {
    id: 'recordings',
    title: 'Pronunciation recordings',
    summary: 'Listen to the whole take. A person decides; nothing scores speech.',
    body: [
      'Recordings belong to a word that is already in the dictionary, so approving one never creates a new word.',
    ],
    points: [
      'Approve — if the speaker allowed publication and the word has no recording, it becomes the word’s pronunciation. If the word already has one, the new take is kept as an additional recording. A published recording is never replaced.',
      'Without publication permission, approval keeps the recording unpublished.',
      'Not accepted — say why, so the speaker can record it again. A reason is required.',
    ],
    source: 'Pronunciation recording rules in the review service',
  },
  {
    id: 'sentences',
    title: 'Sentences',
    summary: 'Two independent speakers must agree before a sentence is confirmed.',
    body: [
      'Each version of a sentence is judged on four questions: meaning, grammar, naturalness and fit with the situation. Disagreement is kept, not averaged away.',
    ],
    points: [
      'Confirm you can judge the dialect, or leave the sentence for another speaker.',
      'Any concern needs an explanation of at least 10 characters.',
      'A sentence is confirmed when two independent speakers judge every version correct. If reviewers disagree, it is marked “Reviewers disagree” for discussion.',
      'A confirmed sentence appears publicly only if the contributor allowed publication. You can judge each revision once.',
    ],
    source: 'Sentence review rules in the review service',
  },
  {
    id: 'destinations',
    title: 'Where approved work goes',
    summary: 'Words, expressions and sentences each keep their own home.',
    body: [
      'Contribution type and credit travel with the work. An expression is never filed as a dictionary word.',
    ],
    points: [
      'Assigned translations and everyday expressions — published to Expressions as whole phrases, with any other ways to say them.',
      'Dictionary words and answers to word requests — published to the Kasem dictionary as word entries.',
      'Pronunciations — attached to their dictionary word, as above.',
      'Sentences — confirmed sentences, kept separately from words and expressions.',
      'AI training — only work whose contributor ticked training permission, and only after approval.',
      'Portal expressions published before 27 September 2026 remain in the dictionary until they are unpublished or published again.',
    ],
    source: 'Contributor portal and everyday-expressions product notes',
  },
  {
    id: 'limits',
    title: 'What this workspace does not do yet',
    summary: 'Known gaps, stated plainly.',
    body: [
      'Items are not assigned to individual reviewers: anyone with review access can open any item. If two reviewers decide the same item, the second decision is refused.',
      'There are no bulk decisions. Each item is decided on its own.',
    ],
    pending: ['Review turnaround targets have not been published.'],
    source: 'Review workspace',
  },
];
