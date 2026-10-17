// Synthetic preview fixtures for every email variant. Names, addresses,
// references and amounts are invented and obviously so. The Kasem samples are
// printed examples from the Kasem grammar guide (Chapter 6 and Chapter 8).
import * as t from '../lib/email-templates.js';
import { renderEmail } from '../lib/email-theme.js';
import { formatGhs } from '../lib/reward-policy.js';

const KASEM = { phrase: 'A na vei sɔŋɔ to', meaning: 'When I went home', short: 'Dé toŋe', shortMeaning: 'We worked' };
const LONG_NAME = 'Akosua Abena Example-Preview Wuntaw Nankani Asantewaa';
const LONG_TITLE = 'A very long synthetic submission title that keeps going to check wrapping on narrow screens, including a Kasem phrase: A na vei sɔŋɔ to';
const STUDIO = 'https://tribestudio.indigenworld.com';

const points = (n) => `${n.toLocaleString('en-GB')} points`;
const redemption = (status, note) => t.redemptionUpdatePreview({
  name: 'Kofi Preview',
  status,
  reference: 'RW-PREVIEW-0042',
  points: points(2500),
  amount: formatGhs(2500),
  reward: 'MTN airtime (synthetic number ending 0000)',
  note,
});

/** [id, group, label, content, notes] */
export const fixtures = [
  ['theme-reference', 'Theme', 'Base theme — every block', renderEmail({
    subject: 'Theme reference — Indigen World',
    preheader: 'Every reusable block in one message.',
    heading: 'The Indigen World email theme',
    product: 'TribeStudio',
    status: { tone: 'info', label: 'Reference' },
    year: 2026,
    blocks: [
      { type: 'greeting', name: 'Ama Example' },
      { type: 'text', text: 'This synthetic message shows each reusable block: copy, details, panels, steps, a primary action and a quiet link.\n\nSingle line breaks are kept.\nLike this one.' },
      { type: 'details', title: 'Submission details', rows: [
        { label: 'Reference', value: 'IW-PREVIEW-0001' },
        { label: 'Kasem phrase', value: KASEM.phrase, lang: 'xsm' },
        { label: 'Meaning', value: KASEM.meaning },
        { label: 'Submitted', value: '14 October 2026' },
      ] },
      { type: 'panel', tone: 'success', title: 'Approved', text: 'Status colours always come with a written label.' },
      { type: 'panel', tone: 'warning', title: 'Changes requested', text: 'Reviewer feedback can run over\nseveral lines.' },
      { type: 'panel', tone: 'danger', title: 'Not accepted', text: 'Used sparingly, and only for a real status.' },
      { type: 'steps', title: 'What happens next', items: ['A reviewer reads your work.', 'You receive their decision by email and in TribeStudio.'] },
      { type: 'action', label: 'Open TribeStudio', url: `${STUDIO}/studio` },
      { type: 'link', label: 'A quiet secondary link', url: 'https://indigenworld.com' },
      { type: 'signoff', text: 'Warm regards,\nThe Indigen World team' },
    ],
    reason: 'Preview only: this message shows the theme and is never sent.',
  }), 'Shows every block, all four status tones and a Kasem detail value.'],

  ['contact-ack', 'Website forms', 'Contact acknowledgement (long name and subject)', t.contactAcknowledgement({ name: LONG_NAME, subject: LONG_TITLE }), 'Greets by first name; long values wrap.'],
  ['contact-team', 'Website forms', 'Contact alert to the team (escaped input)', t.contactTeamAlert({ name: 'Preview <b>Sender</b>', email: 'sender@example.test', subject: 'Question about <script>alert(1)</script> volunteering', message: 'Hello team,\n\nI would like to help record words in Kasem, for example: A na vei sɔŋɔ to.\n\nThanks!' }), 'Markup in the input is shown as text, never rendered.'],
  ['involvement-ack', 'Website forms', 'Get involved acknowledgement', t.involvementAcknowledgement({ name: 'Yaw Sample', route: 'Language contributor' }), ''],
  ['involvement-team', 'Website forms', 'Get involved alert (missing organisation)', t.involvementTeamAlert({ name: 'Yaw Sample', contact: '+233 00 000 0000', country: 'Ghana', organisation: '', route: 'Language contributor', note: '' }), 'Optional fields fall back to a dash.'],
  ['tester-ack', 'Website forms', 'Founding Tester acknowledgement', t.testerRewardAcknowledgement({ name: 'Efua Placeholder' }), ''],
  ['tester-team', 'Website forms', 'Founding Tester alert to the team', t.testerRewardTeamAlert({ certificateName: 'Efua Placeholder', cardName: 'Efua P.', playEmail: 'tester@example.test', contactEmail: 'efua@example.test', country: 'Ghana', recognitionChoice: 'List my name' }), ''],
  ['newsletter-welcome', 'Website forms', 'Newsletter welcome', t.newsletterWelcome(), 'No unsubscribe link: none exists yet (see the guide).'],

  ['application-received', 'TribeStudio notifications', 'Creator application received', t.notificationEmail({ type: 'application_update', title: 'Your founding-creator application was received', body: 'Reference FC-PREVIEW-0007. We will announce when the campaign opens.', link: '/studio', actionUrl: `${STUDIO}/studio` }), ''],
  ['application-approved', 'TribeStudio notifications', 'Creator application approved (default body)', t.notificationEmail({ type: 'application_update', title: 'Application approved', body: 'Your application status is now APPROVED.', link: '/studio', actionUrl: `${STUDIO}/studio` }), 'The raw status code in the default body is said in words.'],
  ['application-rejected', 'TribeStudio notifications', 'Creator application not approved (with reason)', t.notificationEmail({ type: 'application_update', title: 'Application rejected', body: 'Thank you for applying. This campaign is limited to creators recording in the Kasem-speaking area this season.', link: '/studio', actionUrl: `${STUDIO}/studio` }), ''],
  ['submission-approved', 'TribeStudio notifications', 'Submission approved — not published', t.notificationEmail({ type: 'review_decision', title: 'Submission approved', body: `Your submission "${KASEM.short}" is now APPROVED.`, link: '/studio/submissions/PREVIEW', actionUrl: `${STUDIO}/studio/submissions/PREVIEW` }), 'Approval never implies publication.'],
  ['submission-revision', 'TribeStudio notifications', 'Changes requested (multiline feedback)', t.notificationEmail({ type: 'revision_request', title: 'Submission needs revision', body: 'Thank you — the recording is clear.\n\nPlease check the tone mark on the second word, and add the English meaning ("When I went home") so learners can follow.\nThe phrase as submitted: A na vei sɔŋɔ to', link: '/studio/submissions/PREVIEW', actionUrl: `${STUDIO}/studio/submissions/PREVIEW` }), 'Feedback sits in a labelled panel with a revision route.'],
  ['submission-published', 'TribeStudio notifications', 'Submission published', t.notificationEmail({ type: 'publication_notice', title: 'Submission published', body: `Your submission "${KASEM.short}" is now PUBLISHED.`, link: '/studio/submissions/PREVIEW', actionUrl: `${STUDIO}/studio/submissions/PREVIEW` }), ''],
  ['expression-rejected', 'Contributor Portal notifications', 'Expression not accepted (portal)', t.notificationEmail({ type: 'review_decision', title: 'Expression not accepted', body: `“${KASEM.phrase}” was not accepted. The reviewer said: The meaning field repeats the phrase; please add the English meaning. You can correct it and send it again.`, link: '/contributor/PREVIEW/expressions?item=PREVIEW', actionUrl: `${STUDIO}/contributor/PREVIEW/expressions?item=PREVIEW` }), 'Contributor Portal label and help link come from the link.'],
  ['payout-verified', 'Contributor Portal notifications', 'Payout details verified', t.notificationEmail({ type: 'payout_verification', title: 'Your MoMo wallet is verified', body: 'A finance reviewer confirmed your MoMo wallet for contributor payments.', link: '/contributor/account/payments', actionUrl: `${STUDIO}/contributor/account/payments` }), ''],
  ['payout-attention', 'Contributor Portal notifications', 'Payout details need attention', t.notificationEmail({ type: 'payout_verification', title: 'Your bank account needs attention', body: 'The account name on the statement does not match the name on your profile. Please upload a statement that shows the same name.', link: '/contributor/account/payments', actionUrl: `${STUDIO}/contributor/account/payments` }), ''],
  ['ad-paid', 'TribeStudio notifications', 'Advert payment received', t.notificationEmail({ type: 'ad_payment', title: 'Payment received', body: '“Preview Market Day” is paid for and now with our reviewers.', link: '/ads/PREVIEW', actionUrl: `${STUDIO}/ads/PREVIEW` }), ''],
  ['ad-short', 'TribeStudio notifications', 'Advert payment incomplete', t.notificationEmail({ type: 'ad_payment', title: 'Payment came up short', body: '“Preview Market Day” is still waiting: less than the full amount came through.', link: '/ads/PREVIEW', actionUrl: `${STUDIO}/ads/PREVIEW` }), ''],

  ['support-reply', 'Support and account', 'Support reply', t.supportEmail({ kind: 'reply', subject: 'Indigen World support · IW-PREVIEW01', text: 'Hello Ama,\n\nThanks for your patience. Your assignment is now visible on your overview page.\n\nIf anything still looks wrong, reply here and we will take another look.', reference: 'IW-PREVIEW01' }), ''],
  ['support-recovery', 'Support and account', 'Contributor password recovery', t.supportEmail({ kind: 'recovery', subject: 'Reset your Indigen World password', text: '', recoveryUrl: 'https://auth.example.com/__/auth/action?mode=resetPassword&oobCode=PREVIEW-ONLY-NOT-A-CODE&lang=en', reference: 'IW-PREVIEW02' }), 'Fallback link for the account action; the real link is never logged.'],
  ['support-team', 'Support and account', 'Support alert to the team', t.supportEmail({ kind: 'team', subject: 'Indigen World support · IW-PREVIEW03', text: 'Support case IW-PREVIEW03 needs a team reply. Open Admin → Contributors → Issues → Support inbox.', reference: 'IW-PREVIEW03' }), ''],
  ['firebase-reset', 'Support and account', 'Firebase password reset (provider template)', t.firebasePasswordResetEmail(), 'Firebase substitutes %LINK%; the logo is the hosted copy.'],
  ['validator-invitation', 'Support and account', 'Validator invitation', t.validatorInvitationEmail({ name: 'Abena Preview', language: 'Kasem' }), ''],
  ['correspondence', 'Correspondence', 'Admin correspondence email', t.correspondenceEmail({ subject: 'Partnership update', text: 'Dear Preview Partner,\n\nThank you for meeting us last week. Our formal letter with the details we discussed is attached.\n\nKind regards,\nPreview Sender\nProgramme lead' }), 'The Heritage Frame PDF is attached by the sending pipeline.'],

  ['redemption-submitted', 'Preview only — rewards', 'Redemption requested', redemption('submitted'), 'No reward email is sent today.'],
  ['redemption-approved', 'Preview only — rewards', 'Redemption processing', redemption('approved'), ''],
  ['redemption-reconciling', 'Preview only — rewards', 'Redemption being checked', redemption('needs_reconciliation'), ''],
  ['redemption-fulfilled', 'Preview only — rewards', 'Redemption completed', redemption('fulfilled'), ''],
  ['redemption-failed', 'Preview only — rewards', 'Redemption failed', redemption('failed', 'The provider reported that the number could not receive airtime.'), ''],
  ['redemption-rejected', 'Preview only — rewards', 'Redemption declined', redemption('rejected', 'This request duplicated another open request.'), ''],
  ['announcement', 'Preview only — announcements', 'Community announcement', t.announcementPreview({
    heading: 'What is new on Indigen World',
    intro: 'A short synthetic round-up to show the editorial layout. Real announcements need a working unsubscribe first.',
    updates: [
      { title: 'A calmer Contributor Portal', text: 'Your assignments, reviews and rewards now live in one place.', url: `${STUDIO}/contributor`, linkLabel: 'Open the portal' },
      { title: `Phrase of the week: ${KASEM.short}`, text: `“${KASEM.short}” — ${KASEM.shortMeaning}. From the Kasem grammar guide, Chapter 8.` },
      { title: 'Labs', text: 'Try the newest experiments from the team.', url: 'https://indigenworld.com/labs', linkLabel: 'Visit Labs' },
    ],
    action: { label: 'Visit Indigen World', url: 'https://indigenworld.com' },
  }), ''],
];
