/**
 * Platform guide for invited contributors.
 *
 * Every statement here is derived from something the repository already says
 * or does, and the source is named on each section:
 *   - packages/contracts/content/creator-guidelines.mjs — the published
 *     Founding Creators guidelines (language, translation, permissions,
 *     rewards and payment eligibility, getting help);
 *   - docs/product/contributor-portal.md — how assignments, drafts, skipping,
 *     review rounds and resubmission work;
 *   - the backend's own rules (services/functions/src/contributor-*.ts) for
 *     payment verification, what is checked automatically and who can see a
 *     statement.
 * Where the repository has no policy — pay rates, review turnaround, how long
 * a statement is kept after verification — the guide says so with a
 * `pending` note instead of inventing one. Those gaps are listed for the team
 * in docs/product/contributor-portal.md ("Policy copy still needed").
 */

export interface GuideSection {
  id: string;
  title: string;
  summary: string;
  body: string[];
  points?: string[];
  pending?: string[];
  source: string;
}

export const GUIDE: GuideSection[] = [
  {
    id: 'assignments',
    title: 'How tasks work',
    summary: 'What a task is, how drafts save, and what happens when you submit.',
    body: [
      'A task is a set of English expressions the team has asked you to translate into Kasem. Each one has a title and instructions, and may name a due date, the variety of Kasem expected, a tone, and who to contact for help.',
      'A due date is guidance for planning. The workspace does not lock a task when the date passes.',
    ],
    points: [
      'Your work saves automatically about a second after you stop typing. If saving fails, your text stays on the page and a recovery copy is kept in this browser until the save succeeds.',
      'Not sure about an expression? Choose “Flag as unsure and skip”. It is flagged for you, nothing is sent for review, and you can come back to it at any time.',
      'When a translation is ready, tick the required sharing permission if you agree. AI training is optional. Choose “Submit for review”, check the summary, then choose “Confirm submission”. A submitted expression is locked while it waits for a reviewer.',
      'You can hold several tasks at once. Each keeps its own drafts and progress.',
    ],
    source: 'Contributor portal product notes (assignments, drafts and skipping)',
  },
  {
    id: 'good-contribution',
    title: 'What makes a good Kasem contribution',
    summary: 'Translate the meaning, write it the way you say it, and mark what you are unsure of.',
    body: [
      'A translation should carry the meaning, not the words. Where a phrase cannot cross over word for word, translate the sense and explain it in the usage note.',
    ],
    points: [
      'Write the Kasem exactly as you would say it. Do not straighten it into English word order.',
      'Speak naturally. The archive is collecting the language as it is really used, not a formal register.',
      'Use Kasem spelling consistently, including the special letters (ɛ, ə, ɣ, ɩ, ŋ, ɔ, ʋ). The character buttons in the editor insert them.',
      'If the assignment names a variety of Kasem — Navrongo, Paga or Chiana — use it. Otherwise tell reviewers which one you speak in your profile; “Other” and “Not sure” are both valid answers.',
      'Mark anything you are unsure of rather than guessing silently. An honest uncertainty is useful to reviewers.',
    ],
    source: 'Indigen World creator guidelines — “Language expectations”, “Written submissions”, “Translations and captions”',
  },
  {
    id: 'alternatives-context',
    title: 'Other ways to say it, and when it is said',
    summary: 'When to add another way of saying it, and what to write under “When would someone say this?”.',
    body: [
      'Add another way to say it when Kasem has more than one natural way to say the expression. Each one is a complete way of saying it — not an explanation — and you can add up to twelve. They are published with your main translation when it is approved.',
      'The note under “When would someone say this?” is where context goes. Reviewers read it first.',
    ],
    points: [
      'Who says it, and to whom — for example, to an elder, a friend, or a child.',
      'When or where it is said, and whether it is formal or casual.',
      'Where it differs by place, which town or variety you mean.',
      'For a proverb or an idiom: a literal English rendering and what it actually means in use.',
      'Keep English explanations out of “Other ways to say it”; put them in the note instead.',
    ],
    source: 'Indigen World creator guidelines — “Written submissions”; contributor portal product notes (alternatives)',
  },
  {
    id: 'contribution-types',
    title: 'Kinds of contribution, and where each one goes',
    summary: 'Tasks, expressions, words and recordings keep their own identity all the way to publication.',
    body: [
      'Each kind of contribution keeps its identity from the moment you send it until it is published. Reviewers see what kind it is, and it is published only to the place that kind belongs.',
    ],
    points: [
      'Assigned translations: English expressions from the team, translated into Kasem. They are filed as whole expressions — never split into dictionary words — and published to Expressions after approval and a separate publication step.',
      'Everyday expressions: greetings, idioms and sayings you share yourself, with their meaning, when they are said and where you learned them. Published to Expressions, never as dictionary words.',
      'Dictionary words: one word with its meaning and, if you have them, an example and a recording. Published to the Kasem dictionary as a word entry, or linked by the reviewer to a word it already has.',
      'Pronunciations: your recording of a word already in the dictionary. Attached to that word if it has no recording yet; a published recording is never replaced.',
      'Complete sentences and longer texts are collected through assigned tasks for now.',
    ],
    source: 'Everyday expressions product notes; publication routing in the review backend (decideSubmission); pronunciation recording rules',
  },
  {
    id: 'review',
    title: 'Review, feedback and revisions',
    summary: 'Who reviews your work, what each status means, and how to resubmit.',
    body: [
      'Appointed reviewers — Kasem speakers — check every submission. Nothing is published until a reviewer approves it.',
    ],
    points: [
      'Awaiting review: with the review team. It stays locked until a reviewer decides.',
      'Approved: accepted by a reviewer. Publication is a separate step: an approved expression becomes public only when a reviewer publishes it, and only if you gave publication permission.',
      'Published: public on Indigen World, credited to you.',
      'Returned for revision: a reviewer did not accept this version of an assigned translation and wrote what to change. Revise it and resubmit; each resubmission is a new review round and the earlier decision stays on record. Every returned item is listed under Revisions.',
      'Not accepted: a reviewer declined an everyday expression, a word or a recording and gave a reason. You can correct a declined expression once, and record a pronunciation again.',
      'Publication permission is required to submit. AI training is optional and separate: an approved translation is used for Kawuri training only if you ticked that box when you submitted it.',
      'Decisions appear in My submissions and Updates and, if you choose, by email (Profile and settings → Notifications).',
    ],
    pending: ['How long review normally takes has not been published yet.'],
    source: 'Contributor portal product notes (review and publication); creator guidelines — “Permissions you grant”, “Revisions and resubmission”',
  },
  {
    id: 'point-rewards',
    title: 'Points and airtime or data rewards',
    summary: 'Points follow approval; reward delivery is a separate manual step.',
    body: ['Approved assigned translations earn points at the configured rate, up to a daily limit. A revision does not earn a second award for the same task item. Everyday expressions, words and recordings are reviewed and credited, but do not add points to this balance.', 'Open Rewards to see your balance, request airtime or data under “Use your points”, and follow each request in Points activity. Enter the recipient phone number when requesting airtime or data. No bank statement is required.', 'Waiting for review means the team has not decided yet. Approved means accepted for delivery. Delivered means the team has recorded it as sent. A request that is not approved shows a reason, and its points return to your balance. Points are not money, and delivery is not instant.'],
    source: 'Contributor rewards workflow',
  },
  {
    id: 'payments',
    title: 'Bank and MoMo payments — separate from points',
    summary: 'How bank and MoMo details are verified, and what verification does and does not prove.',
    body: [
      'Point rewards are separate: request airtime or data in Rewards using the recipient phone number. No bank statement or MoMo verification is required for those rewards.',
      'Payments are sent only to a bank account or MoMo wallet that a finance reviewer has verified. Add your details under Profile and settings → Payment details.',
    ],
    points: [
      'Bank account: enter the details and upload a recent statement or bank letter showing your name, the bank and the account number. A finance reviewer compares them. You may cover transactions and balances; they are not needed.',
      'MoMo wallet: a six-digit code sent by SMS confirms you control the phone number. It does not prove the wallet is registered in your name, so a finance reviewer checks the wallet and its registered name separately.',
      'Changing verified details sends them back for review, and they cannot be used for payment until they are verified again.',
      'Submitting an expression, or having it approved, does not by itself guarantee a payment.',
      'Indigen World never asks you to pay to take part, and never asks for your password or a verification code by phone, SMS or WhatsApp. Anyone who does is not us — report it.',
    ],
    pending: ['Rates, amounts and payment schedules for invited contributors have not been published yet. Until they are, ask the help contact named on your assignment.'],
    source: 'Creator guidelines — “Rewards and payment eligibility”; payment verification rules in the contributor backend',
  },
  {
    id: 'privacy',
    title: 'Privacy and what others see',
    summary: 'Who can see your payment details, and how you appear in community activity.',
    body: [
      'Your bank statement and full account or wallet numbers are visible only to authorised finance reviewers. After you save them, this workspace shows them to you masked.',
    ],
    points: [
      'A finance reviewer opens a statement through a link that expires after five minutes, and every opening is recorded.',
      'A statement is deleted when you replace it or remove your bank details.',
      'If automated statement checks are switched on, the name, bank and account number on the statement are compared with what you typed. The check never approves anything; a person decides.',
      'In “Community today” you appear anonymously by default. You can show your display name or leave the feed entirely under Profile and settings → Notifications & visibility; your work still counts in the day’s totals.',
    ],
    pending: ['How long a statement is kept after verification has not been decided yet.'],
    source: 'Contributor backend rules (statement storage, access and audit); contributor settings',
  },
  {
    id: 'report-problem',
    title: 'Reporting a problem',
    summary: 'How to reach the team about an assignment, an expression, saving or your account.',
    body: [
      'Use “Report a problem” — on any expression, or below. A report includes only the task and expression it is about and what you write; replies from the team appear under My reports.',
    ],
    points: [
      'Choose the closest type: translation, task, saving, account or other.',
      'Describe what you expected and what happened. For an expression, say which one.',
      'Never include bank details, passwords or verification codes in a report.',
      'For questions about a specific task, the help contact named in its instructions is usually quickest.',
    ],
    source: 'Contributor issue reporting; creator guidelines — “Getting help”',
  },
];

export function guideSection(id: string): GuideSection | undefined {
  return GUIDE.find((section) => section.id === id);
}
