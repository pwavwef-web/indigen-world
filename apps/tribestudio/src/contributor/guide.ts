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
    title: 'How assignments work',
    summary: 'What an assignment is, how drafts save, and what happens when you submit.',
    body: [
      'An assignment is a set of English expressions the team has asked you to translate into Kasem. Each one has a title and instructions, and may name a due date, the variety of Kasem expected, a tone, and who to contact for help.',
      'A due date is guidance for planning. The workspace does not lock an assignment when the date passes.',
    ],
    points: [
      'Your work saves automatically about a second after you stop typing. If saving fails, your text stays on the page and a recovery copy is kept in this browser until the save succeeds.',
      'Not sure about an expression? Choose “Skip / I’m not sure”. It is flagged for you, nothing is sent for review, and you can come back to it at any time.',
      'When a translation is ready, review it and confirm. A submitted expression is locked while it waits for a reviewer.',
      'You can hold several assignments at once. Each keeps its own drafts and progress.',
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
    title: 'Alternative expressions and context',
    summary: 'When to add another way of saying it, and what to put in the usage note.',
    body: [
      'Add an alternative when Kasem has more than one natural way to say the expression. Each alternative is a complete way of saying it — not an explanation — and you can add up to twelve. Alternatives are published with your main translation when it is approved.',
      'The usage note is where context goes. Reviewers read it first.',
    ],
    points: [
      'Who says it, and to whom — for example, to an elder, a friend, or a child.',
      'When or where it is said, and whether it is formal or casual.',
      'Where it differs by place, which town or variety you mean.',
      'For a proverb or an idiom: a literal English rendering and what it actually means in use.',
      'Keep English explanations out of the alternatives; put them in the usage note instead.',
    ],
    source: 'Indigen World creator guidelines — “Written submissions”; contributor portal product notes (alternatives)',
  },
  {
    id: 'review',
    title: 'Review, feedback and revisions',
    summary: 'Who reviews your work, what each status means, and how to resubmit.',
    body: [
      'Appointed reviewers — Kasem speakers — check every submission. Nothing is published until a reviewer approves it.',
    ],
    points: [
      'Awaiting review: with the Review Desk. It stays locked until a reviewer decides.',
      'Approved: accepted. If you gave publication permission, it is added to the Kasem dictionary.',
      'Returned: a reviewer rejected this version or asked for changes, with written feedback. Read the feedback, revise the translation and resubmit. Each resubmission is a new review round; the earlier decision stays on record.',
      'Publication permission is required to submit. AI training is optional and separate: an approved translation is used for Kawuri training only if you ticked that box when you submitted it.',
      'Decisions appear in Activity and, if you choose, by email (Account & settings → Notifications).',
    ],
    pending: ['How long review normally takes has not been published yet.'],
    source: 'Contributor portal product notes (review and publication); creator guidelines — “Permissions you grant”, “Revisions and resubmission”',
  },
  {
    id: 'payments',
    title: 'Payment details and eligibility',
    summary: 'How bank and MoMo details are verified, and what verification does and does not prove.',
    body: [
      'Payments are sent only to a bank account or MoMo wallet that a finance reviewer has verified. Add your details under Account & settings → Payment details.',
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
      'In “Community today” you appear anonymously by default. You can show your display name or leave the feed entirely under Account & settings → Notifications & visibility; your work still counts in the day’s totals.',
    ],
    pending: ['How long a statement is kept after verification has not been decided yet.'],
    source: 'Contributor backend rules (statement storage, access and audit); contributor settings',
  },
  {
    id: 'report-problem',
    title: 'Reporting a problem',
    summary: 'How to reach the team about an assignment, an expression, saving or your account.',
    body: [
      'Use “Report a problem” — on any expression, or below. A report includes only the assignment and expression it is about and what you write; replies from the team appear under My reports.',
    ],
    points: [
      'Choose the closest type: translation, assignment, saving, account or other.',
      'Describe what you expected and what happened. For an expression, say which one.',
      'Never include bank details, passwords or verification codes in a report.',
      'For questions about a specific assignment, the help contact named in its instructions is usually quickest.',
    ],
    source: 'Contributor issue reporting; creator guidelines — “Getting help”',
  },
];

export function guideSection(id: string): GuideSection | undefined {
  return GUIDE.find((section) => section.id === id);
}
