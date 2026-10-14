/**
 * Indigen World email templates. Each builder describes its message as theme
 * blocks (see email-theme.ts) and returns the subject, themed HTML, a matching
 * plaintext alternative and the body used for the automatic PDF letter.
 * Variables are escaped by the theme; builders never concatenate raw HTML.
 */
import { EMAIL_LINKS, renderEmail, type EmailBlock, type EmailContent, type Tone } from './email-theme.js';

export { escapeHtml, type EmailContent } from './email-theme.js';

const TEAM_SIGNOFF = 'Warm regards,\nThe Indigen World team';

// ---------------------------------------------------------------------------
// Public website forms
// ---------------------------------------------------------------------------

export function contactAcknowledgement(input: { name: string; subject: string }): EmailContent {
  return renderEmail({
    subject: 'We received your message — Indigen World',
    preheader: 'A member of our team will read it and reply to this address.',
    heading: 'Thanks for getting in touch',
    blocks: [
      { type: 'greeting', name: input.name },
      { type: 'text', text: 'Thank you for reaching out to Indigen World. We have received your message, and a member of our team will get back to you soon.' },
      { type: 'details', rows: [{ label: 'Your subject', value: input.subject }] },
      { type: 'text', text: 'If you need to add anything, simply reply to this email.' },
      { type: 'signoff', text: TEAM_SIGNOFF },
    ],
    reason: 'You received this because you sent a message through the contact form on indigenworld.com.',
  });
}

export function contactTeamAlert(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): EmailContent {
  return renderEmail({
    subject: `[Contact] ${input.subject}`,
    preheader: `${input.name}: ${input.subject}`,
    heading: 'New contact submission',
    product: 'Website forms',
    audience: 'team',
    blocks: [
      { type: 'details', rows: [
        { label: 'Name', value: input.name },
        { label: 'Email', value: input.email },
        { label: 'Subject', value: input.subject },
      ] },
      { type: 'panel', tone: 'neutral', title: 'Message', text: input.message },
      { type: 'note', text: 'Replying to this email answers the sender directly.' },
    ],
    reason: 'Internal alert for the Indigen World team from the indigenworld.com contact form.',
  });
}

export function involvementAcknowledgement(input: { name: string; route: string }): EmailContent {
  return renderEmail({
    subject: 'Thanks for getting involved — Indigen World',
    preheader: 'We have your details and will be in touch about next steps.',
    heading: 'Thanks for getting involved',
    blocks: [
      { type: 'greeting', name: input.name },
      { type: 'text', text: 'Thank you for your interest in getting involved with Indigen World. We have received your details and will be in touch about next steps.' },
      { type: 'details', rows: [{ label: 'How you would like to take part', value: input.route }] },
      { type: 'signoff', text: 'With gratitude,\nThe Indigen World team' },
    ],
    reason: 'You received this because you completed the “Get involved” form on indigenworld.com.',
  });
}

export function involvementTeamAlert(input: {
  name: string;
  contact: string;
  country: string;
  organisation: string;
  route: string;
  note: string;
}): EmailContent {
  return renderEmail({
    subject: `[Get involved] ${input.route} — ${input.name}`,
    preheader: `${input.name} · ${input.route}`,
    heading: 'New “get involved” submission',
    product: 'Website forms',
    audience: 'team',
    blocks: [
      { type: 'details', rows: [
        { label: 'Name', value: input.name },
        { label: 'Contact', value: input.contact },
        { label: 'Country', value: input.country },
        { label: 'Organisation', value: input.organisation || '—' },
        { label: 'Route', value: input.route },
      ] },
      { type: 'panel', tone: 'neutral', title: 'Note', text: input.note || '—' },
    ],
    reason: 'Internal alert for the Indigen World team from the indigenworld.com “Get involved” form.',
  });
}

export function testerRewardAcknowledgement(input: { name: string }): EmailContent {
  return renderEmail({
    subject: 'We received your Founding Tester details — Indigen World',
    preheader: 'Your reward details are ready for verification.',
    heading: 'Founding Tester details received',
    status: { tone: 'info', label: 'Received' },
    blocks: [
      { type: 'greeting', name: input.name },
      { type: 'text', text: 'Thank you for completing your Founding Tester reward details.' },
      { type: 'steps', title: 'What happens next', items: [
        'We verify your participation in the testing programme.',
        'Once verified, we prepare your certificate and numbered tester card.',
      ] },
      { type: 'text', text: 'Critical feedback is welcome and never affects eligibility. If you need to correct these details, submit the form again using the same Google Play testing email.' },
      { type: 'signoff', text: 'With gratitude,\nThe Indigen World team' },
    ],
    reason: 'You received this because you submitted the Founding Tester reward form.',
  });
}

export function testerRewardTeamAlert(input: {
  certificateName: string;
  cardName: string;
  playEmail: string;
  contactEmail: string;
  country: string;
  recognitionChoice: string;
}): EmailContent {
  return renderEmail({
    subject: `[Tester reward] ${input.certificateName}`,
    preheader: `${input.certificateName} · ${input.country}`,
    heading: 'New Founding Tester reward claim',
    product: 'Website forms',
    audience: 'team',
    blocks: [
      { type: 'text', text: 'A Founding Tester reward claim is ready for verification.' },
      { type: 'details', rows: [
        { label: 'Certificate', value: input.certificateName },
        { label: 'Tester card', value: input.cardName },
        { label: 'Play email', value: input.playEmail },
        { label: 'Contact email', value: input.contactEmail },
        { label: 'Country', value: input.country },
        { label: 'Public listing', value: input.recognitionChoice },
      ] },
    ],
    reason: 'Internal alert for the Indigen World team from the Founding Tester reward form.',
  });
}

export function newsletterWelcome(): EmailContent {
  return renderEmail({
    subject: 'Welcome to the Indigen World newsletter',
    preheader: 'New stories, language milestones and ways to take part.',
    heading: 'Welcome aboard',
    blocks: [
      { type: 'text', text: 'Thank you for subscribing to the Indigen World newsletter.' },
      { type: 'text', text: 'You will hear from us when there are new stories, language-cell milestones and ways to take part in preserving indigenous languages. We send thoughtfully and never share your address.' },
      { type: 'action', label: 'Visit Indigen World', url: EMAIL_LINKS.website },
      { type: 'signoff', text: 'Akpe / Thank you,\nThe Indigen World team' },
    ],
    reason: 'You received this because this address was subscribed to the newsletter on indigenworld.com. If that was not you, reply to this email and we will remove it.',
  });
}

// ---------------------------------------------------------------------------
// Queued notifications (creator applications, review & submission decisions,
// adverts, payout verification) — rendered by onNotificationCreated
// ---------------------------------------------------------------------------

/** Statuses are only shown for titles the backend actually writes. */
const NOTIFICATION_STATUS: Record<string, { tone: Tone; label: string }> = {
  'Your founding-creator application was received': { tone: 'info', label: 'Received' },
  'Application approved': { tone: 'success', label: 'Approved' },
  'Application waitlisted': { tone: 'info', label: 'Waitlisted' },
  'Application rejected': { tone: 'danger', label: 'Not approved' },
  'Application needs info': { tone: 'warning', label: 'More information needed' },
  'Application suspended': { tone: 'danger', label: 'Suspended' },
  'Submission approved': { tone: 'success', label: 'Approved' },
  'Submission needs revision': { tone: 'warning', label: 'Changes requested' },
  'Submission rejected': { tone: 'danger', label: 'Not accepted' },
  'Submission archived': { tone: 'neutral', label: 'Archived' },
  'Submission published': { tone: 'success', label: 'Published' },
  'Submission under review': { tone: 'info', label: 'With a specialist reviewer' },
  'Expression approved': { tone: 'success', label: 'Approved' },
  'Expression published': { tone: 'success', label: 'Published' },
  'Expression unpublished': { tone: 'warning', label: 'Unpublished' },
  'Expression not accepted': { tone: 'danger', label: 'Not accepted' },
  'Expression archived': { tone: 'neutral', label: 'Archived' },
  'Expression with a specialist reviewer': { tone: 'info', label: 'With a specialist reviewer' },
  'Payment received': { tone: 'success', label: 'Payment received' },
  'Payment came up short': { tone: 'warning', label: 'Payment incomplete' },
  'Advert approved': { tone: 'success', label: 'Approved' },
  'Advert not approved': { tone: 'danger', label: 'Not approved' },
  'Advert paused': { tone: 'warning', label: 'Paused' },
  'Advert running again': { tone: 'success', label: 'Running' },
};

const PAYOUT_STATUS: [RegExp, { tone: Tone; label: string }][] = [
  [/ is verified$/, { tone: 'success', label: 'Verified' }],
  [/ needs attention$/, { tone: 'warning', label: 'Action needed' }],
  [/ could not be verified$/, { tone: 'danger', label: 'Not verified' }],
  [/ is waiting for review$/, { tone: 'info', label: 'Waiting for review' }],
];

/** The plain wording for status codes that default notification bodies carry. */
const STATUS_WORDS: Record<string, string> = {
  APPROVED: 'has been approved',
  NEEDS_REVISION: 'needs some changes',
  REJECTED: 'was not accepted',
  ARCHIVED: 'has been archived',
  PUBLISHED: 'has been published',
  UNDER_REVIEW: 'is with a specialist reviewer',
  WAITLISTED: 'is on the waitlist',
  NEEDS_INFO: 'needs more information',
  SUSPENDED: 'is suspended',
};

export interface NotificationEmailInput {
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  /** The notification document's `type`. */
  type?: string;
  /** The notification document's relative or absolute `link`. */
  link?: string;
}

/** How a queued notification is framed. Pure, so previews and tests share it. */
export function notificationPresentation(input: NotificationEmailInput) {
  const type = input.type ?? '';
  const link = input.link ?? input.actionUrl ?? '';
  const contributor = /^(?:https:\/\/[^/]+)?\/contributor(?:\/|$)/.test(link) || type === 'payout_verification';
  const status = NOTIFICATION_STATUS[input.title]
    ?? (type === 'payout_verification' ? PAYOUT_STATUS.find(([pattern]) => pattern.test(input.title))?.[1] : undefined);

  // Default bodies end with a raw status code; say it in words instead.
  const body = input.body
    .replace(/^Your submission (“.*”|".*") is now ([A-Z_]+)\.$/s, (match, title: string, code: string) =>
      STATUS_WORDS[code] ? `Your submission ${title} ${STATUS_WORDS[code]}.` : match)
    .replace(/^Your application status is now ([A-Z_]+)\.$/, (match, code: string) =>
      STATUS_WORDS[code] ? `Your application ${STATUS_WORDS[code]}.` : match);
  const isDefaultBody = body !== input.body || /^Your submission .* is now [A-Z_]+\.$/s.test(input.body);

  let actionLabel = input.actionLabel;
  let reason = 'You received this because of activity on your Indigen World account.';
  let feedbackTitle = '';
  if (type === 'application_update') {
    actionLabel ??= 'Open TribeStudio';
    reason = 'You received this because you applied to a TribeStudio creator campaign.';
  } else if (['review_decision', 'revision_request', 'publication_notice'].includes(type)) {
    actionLabel ??= type === 'revision_request' ? 'Review the feedback' : contributor ? 'Open your work' : 'View your submission';
    reason = contributor
      ? 'You received this because review emails are switched on in your Contributor Portal settings.'
      : 'You received this because you submitted work for review on Indigen World.';
    if (!isDefaultBody && input.title.startsWith('Submission ')) {
      feedbackTitle = type === 'revision_request' ? 'Reviewer feedback' : 'Note from the reviewer';
    }
  } else if (type.startsWith('ad_')) {
    actionLabel ??= 'View your advert';
    reason = 'You received this because you placed an advert with Indigen World.';
  } else if (type === 'payout_verification') {
    actionLabel ??= 'Open payment details';
    reason = 'You received this because payment emails are switched on in your Contributor Portal settings.';
  }
  return {
    product: contributor ? 'Contributor Portal' : 'TribeStudio',
    status,
    body,
    feedbackTitle,
    actionLabel: actionLabel ?? 'Open Indigen World',
    reason,
    helpUrl: contributor ? EMAIL_LINKS.contributorSupport : undefined,
  };
}

export function notificationEmail(input: NotificationEmailInput): EmailContent {
  const view = notificationPresentation(input);
  const blocks: EmailBlock[] = view.feedbackTitle
    ? [{ type: 'panel', tone: view.status?.tone === 'warning' ? 'warning' : 'info', title: view.feedbackTitle, text: view.body }]
    : [{ type: 'text', text: view.body || input.title }];
  if (input.actionUrl) blocks.push({ type: 'action', label: view.actionLabel, url: input.actionUrl });
  const preheader = (view.body || input.title).replace(/\s+/g, ' ').trim();
  return renderEmail({
    subject: input.title,
    preheader: preheader.length > 110 ? `${preheader.slice(0, 107)}…` : preheader,
    heading: input.title,
    product: view.product,
    status: view.status,
    blocks,
    reason: view.reason,
    helpUrl: view.helpUrl,
  });
}

// ---------------------------------------------------------------------------
// Support and account recovery
// ---------------------------------------------------------------------------

export interface SupportEmailInput {
  subject: string;
  /** The message: a team reply, an internal alert, or (legacy) recovery copy. */
  text: string;
  /** A Firebase action link. Only ever placed in the message, never logged. */
  recoveryUrl?: string;
  kind?: 'reply' | 'team' | 'recovery';
  reference?: string;
}

/** Support replies, team alerts and contributor recovery share one shell. */
export function supportEmail(input: SupportEmailInput): EmailContent {
  const kind = input.kind ?? (input.recoveryUrl ? 'recovery' : 'reply');
  const caseRow = input.reference ? [{ type: 'details' as const, rows: [{ label: 'Case reference', value: input.reference }] }] : [];
  if (kind === 'recovery' && input.recoveryUrl) {
    return renderEmail({
      subject: input.subject,
      preheader: 'Use your private link to choose a new password.',
      heading: 'Choose a new password',
      product: 'Contributor Portal',
      blocks: [
        { type: 'text', text: 'A password reset was requested for your Indigen World contributor account. Use the button below to choose a new password.' },
        { type: 'action', label: 'Choose a new password', url: input.recoveryUrl, fallback: true },
        { type: 'panel', tone: 'neutral', title: 'Did not ask for this?', text: 'You can ignore this email. Your password has not changed. Keep this link private and never share it.' },
        ...caseRow,
      ],
      reason: 'You received this because a password reset was requested through Indigen World contributor support.',
      helpUrl: EMAIL_LINKS.contributorSupport,
    });
  }
  if (kind === 'team') {
    return renderEmail({
      subject: input.subject,
      preheader: input.text.slice(0, 110),
      heading: 'Support inbox update',
      product: 'Contributor support',
      audience: 'team',
      blocks: [{ type: 'text', text: input.text }, ...caseRow],
      reason: 'Internal alert for the Indigen World support team.',
    });
  }
  return renderEmail({
    subject: input.subject,
    preheader: 'A reply from the Indigen World support team.',
    heading: 'A reply from our support team',
    product: 'Contributor support',
    blocks: [
      { type: 'panel', tone: 'info', title: 'Our reply', text: input.text },
      ...caseRow,
      { type: 'text', text: 'To continue the conversation, reply to this email or open your support case.' },
      { type: 'action', label: 'Open contributor support', url: EMAIL_LINKS.contributorSupport },
    ],
    reason: 'You received this because you opened a case with Indigen World contributor support.',
  });
}

/** An invitation to discuss the role; this message does not grant account access. */
export function validatorInvitationEmail(input: { name: string; language: string }): EmailContent {
  return renderEmail({
    subject: `An invitation to be a ${input.language} validator — Indigen World`,
    preheader: `An invitation to support ${input.language} contributors as a validator.`,
    heading: 'Help give every word a careful review',
    blocks: [
      { type: 'text', text: `Dear ${input.name},` },
      { type: 'text', text: `We would like to invite you to join Indigen World as a ${input.language} validator.\n\nYou would help review contributors' translations for meaning, spelling and natural usage, and flag anything that needs correction or more context. Your guidance would help us preserve accurate ${input.language} for learners.\n\nIf you would like to take part, please reply to this email. We can discuss your availability, explain the review process and arrange your access before you begin.` },
      { type: 'action', label: 'Reply to the invitation', url: 'mailto:hi@indigenworld.com?subject=Validator%20invitation' },
      { type: 'signoff', text: 'Thank you for considering the invitation.\nFrancis and the Indigen World team' },
    ],
    reason: 'You received this invitation from the Indigen World team. This email does not create an account.',
  });
}

/** Firebase replaces %LINK% at send time; no live action code belongs in this template. */
export function firebasePasswordResetEmail(): EmailContent {
  return renderEmail({
    subject: 'Reset your Indigen World password',
    preheader: 'Use your private link to choose a new password.',
    heading: 'Reset your password',
    // Provider-managed mail cannot carry an inline attachment.
    logoSrc: EMAIL_LINKS.hostedLogo,
    blocks: [
      { type: 'greeting' },
      { type: 'text', text: 'A password reset was requested for your Indigen World account. Use the button below to choose a new password.' },
      { type: 'action', label: 'Choose a new password', url: '%LINK%', fallback: true },
      { type: 'panel', tone: 'neutral', title: 'Did not ask for this?', text: 'You can ignore this email. Your password has not changed. Keep this link private and never share it.' },
    ],
    reason: 'You received this because a password reset was requested for this address on Indigen World.',
  });
}

/** Admin correspondence: the supplied message, with the formal letter attached. */
export function correspondenceEmail(input: { subject: string; text: string }): EmailContent {
  return renderEmail({
    subject: input.subject,
    preheader: input.text.replace(/\s+/g, ' ').trim().slice(0, 110),
    heading: input.subject,
    blocks: [
      { type: 'text', text: input.text },
      { type: 'note', text: 'The complete letter is attached as a PDF.' },
    ],
    reason: 'You received this letter from the Indigen World team.',
  });
}

// ---------------------------------------------------------------------------
// Preview-only variants. No trigger sends these today; they exist so the
// gallery shows the intended treatment before a flow is built.
// ---------------------------------------------------------------------------

/** Labels for the backend's own redemption states (contributor-rewards.ts). */
export const REDEMPTION_STATE_COPY: Record<string, { tone: Tone; label: string; heading: string; text: string }> = {
  submitted: { tone: 'info', label: 'Requested', heading: 'We received your reward request', text: 'Your request is waiting for a Finance reviewer. The points are reserved while it is open; nothing has been paid yet.' },
  approved: { tone: 'info', label: 'Processing', heading: 'Your reward request is being processed', text: 'A Finance reviewer approved your request and it is being processed. It is not complete until it shows as delivered.' },
  needs_reconciliation: { tone: 'warning', label: 'Being checked', heading: 'We are checking your reward', text: 'The provider has not yet confirmed the outcome. Your points stay reserved until Finance confirms what happened.' },
  fulfilled: { tone: 'success', label: 'Completed', heading: 'Your reward has been delivered', text: 'Finance recorded this reward as delivered.' },
  failed: { tone: 'danger', label: 'Failed', heading: 'Your reward could not be delivered', text: 'The reward could not be delivered, so the reserved points have been returned to your balance.' },
  rejected: { tone: 'danger', label: 'Declined', heading: 'Your reward request was declined', text: 'The request was declined, so the reserved points have been returned to your balance.' },
  cancelled: { tone: 'neutral', label: 'Cancelled', heading: 'Your reward request was cancelled', text: 'The request was cancelled, so the reserved points have been returned to your balance.' },
};

/**
 * PREVIEW ONLY. `points` and `amount` are passed in already formatted by the
 * authoritative ledger helpers; this template never calculates either.
 */
export function redemptionUpdatePreview(input: {
  name?: string;
  status: string;
  reference: string;
  points: string;
  amount: string;
  reward: string;
  note?: string;
}): EmailContent {
  const state = REDEMPTION_STATE_COPY[input.status];
  if (!state) throw new Error(`Unknown redemption status: ${input.status}`);
  return renderEmail({
    subject: `${state.heading} — Indigen World`,
    preheader: `${state.label}: ${input.reward}`,
    heading: state.heading,
    product: 'Contributor Portal',
    status: { tone: state.tone, label: state.label },
    blocks: [
      { type: 'greeting', name: input.name },
      { type: 'text', text: state.text },
      { type: 'details', title: 'Request', rows: [
        { label: 'Reference', value: input.reference },
        { label: 'Reward', value: input.reward },
        { label: 'Points', value: input.points },
        { label: 'Reward value', value: input.amount },
      ] },
      ...(input.note ? [{ type: 'panel' as const, tone: 'neutral' as const, title: 'Note from Finance', text: input.note }] : []),
      { type: 'action', label: 'Open your rewards', url: 'https://tribestudio.indigenworld.com/contributor' },
    ],
    reason: 'Preview only: no reward email is sent today.',
    helpUrl: EMAIL_LINKS.contributorSupport,
  });
}

/** PREVIEW ONLY. The editorial variant for community or product announcements. */
export function announcementPreview(input: {
  heading: string;
  intro: string;
  updates: { title: string; text: string; url?: string; linkLabel?: string }[];
  action: { label: string; url: string };
}): EmailContent {
  return renderEmail({
    subject: input.heading,
    preheader: input.intro.slice(0, 110),
    heading: input.heading,
    blocks: [
      { type: 'text', text: input.intro },
      { type: 'updates', items: input.updates },
      { type: 'action', label: input.action.label, url: input.action.url },
    ],
    reason: 'Preview only: announcements need a working unsubscribe mechanism before they are sent.',
  });
}
