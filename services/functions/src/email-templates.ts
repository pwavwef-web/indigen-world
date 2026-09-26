/**
 * Plain, brand-consistent email templates. Each builder returns the `subject`,
 * an HTML body and a plaintext alternative. Styling is inlined and table-based
 * so it survives the major mail clients; colours come from the approved brand
 * palette (see packages/design-tokens/colors.json).
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  indigo: '#1E365D',
  terracotta: '#B65A3A',
  gold: '#C58A00',
  cream: '#FFF8E7',
  paper: '#FFFDF8',
  ink: '#172033',
  muted: '#4C5568',
  border: '#D8D2C6',
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  title: string;
  /** Inner HTML for the message body (already escaped where needed). */
  bodyHtml: string;
  cta?: { label: string; url: string };
  preheader?: string;
}

/** Wrap message content in the shared Indigen World email shell. */
function layout({ title, bodyHtml, cta, preheader }: LayoutOptions): string {
  const year = new Date().getUTCFullYear();
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px;">
         <tr><td style="border-radius:8px;background:${BRAND.terracotta};">
           <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .email-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .email-title { font-size: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.paper};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
        <tr><td class="email-padding" style="background:${BRAND.indigo};padding:26px 32px;border-bottom:4px solid ${BRAND.gold};">
          <a href="https://indigenworld.com" style="font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Indigen&nbsp;World</a>
          <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#F0D99C;letter-spacing:1px;">OUR LANGUAGES. OUR STORIES. OUR FUTURE.</p>
        </td></tr>
        <tr><td class="email-padding" style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};overflow-wrap:anywhere;word-break:break-word;">
          <h1 class="email-title" style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.3;color:${BRAND.indigo};">${escapeHtml(title)}</h1>
          <div style="font-size:16px;line-height:1.65;color:${BRAND.ink};">${bodyHtml}</div>
          ${button}
        </td></tr>
        <tr><td class="email-padding" style="padding:22px 32px;border-top:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted};">
          Preserving and celebrating indigenous languages, together.<br>
          Need a hand? Reply to this email or write to <a href="mailto:hi@indigenworld.com" style="color:${BRAND.indigo};text-decoration:underline;">hi@indigenworld.com</a>.<br>
          &copy; ${year} Indigen World &nbsp;&middot;&nbsp; <a href="https://indigenworld.com" style="color:${BRAND.indigo};text-decoration:underline;">indigenworld.com</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Public website forms
// ---------------------------------------------------------------------------

export function contactAcknowledgement(input: { name: string; subject: string }): EmailContent {
  const first = input.name.split(/\s+/)[0] || 'there';
  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 14px;">Thank you for reaching out to Indigen World. We have received your message about
      <strong>&ldquo;${escapeHtml(input.subject)}&rdquo;</strong> and a member of our team will get back to you soon.</p>
    <p style="margin:0 0 14px;">If you need to add anything, simply reply to this email.</p>
    <p style="margin:0;">Warm regards,<br>The Indigen World team</p>`;
  return {
    subject: 'We received your message — Indigen World',
    html: layout({ title: 'Thanks for contacting us', bodyHtml, preheader: 'We received your message and will reply soon.' }),
    text: `Hi ${first},\n\nThank you for reaching out to Indigen World. We have received your message about "${input.subject}" and a member of our team will get back to you soon.\n\nIf you need to add anything, simply reply to this email.\n\nWarm regards,\nThe Indigen World team`,
  };
}

export function contactTeamAlert(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 14px;">A new contact form submission has arrived.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
      <tr><td style="padding:4px 0;color:${BRAND.muted};width:90px;">Name</td><td style="padding:4px 0;">${escapeHtml(input.name)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Email</td><td style="padding:4px 0;">${escapeHtml(input.email)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Subject</td><td style="padding:4px 0;">${escapeHtml(input.subject)}</td></tr>
    </table>
    <div style="margin:16px 0 0;padding:14px 16px;background:${BRAND.cream};border-radius:8px;">${paragraphs(input.message)}</div>`;
  return {
    subject: `[Contact] ${input.subject}`,
    html: layout({ title: 'New contact submission', bodyHtml, preheader: `${input.name}: ${input.subject}` }),
    text: `New contact form submission\n\nName: ${input.name}\nEmail: ${input.email}\nSubject: ${input.subject}\n\nMessage:\n${input.message}`,
  };
}

export function involvementAcknowledgement(input: { name: string; route: string }): EmailContent {
  const first = input.name.split(/\s+/)[0] || 'there';
  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 14px;">Thank you for your interest in getting involved with Indigen World as
      <strong>${escapeHtml(input.route)}</strong>. We have received your details and will be in touch about next steps.</p>
    <p style="margin:0;">With gratitude,<br>The Indigen World team</p>`;
  return {
    subject: 'Thanks for getting involved — Indigen World',
    html: layout({ title: 'Thanks for getting involved', bodyHtml, preheader: 'We received your details and will be in touch.' }),
    text: `Hi ${first},\n\nThank you for your interest in getting involved with Indigen World as ${input.route}. We have received your details and will be in touch about next steps.\n\nWith gratitude,\nThe Indigen World team`,
  };
}

export function involvementTeamAlert(input: {
  name: string;
  contact: string;
  country: string;
  organisation: string;
  route: string;
  note: string;
}): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 14px;">A new &ldquo;get involved&rdquo; submission has arrived.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
      <tr><td style="padding:4px 0;color:${BRAND.muted};width:110px;">Name</td><td style="padding:4px 0;">${escapeHtml(input.name)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Contact</td><td style="padding:4px 0;">${escapeHtml(input.contact)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Country</td><td style="padding:4px 0;">${escapeHtml(input.country)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Organisation</td><td style="padding:4px 0;">${escapeHtml(input.organisation || '—')}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Route</td><td style="padding:4px 0;">${escapeHtml(input.route)}</td></tr>
    </table>
    <div style="margin:16px 0 0;padding:14px 16px;background:${BRAND.cream};border-radius:8px;">${paragraphs(input.note)}</div>`;
  return {
    subject: `[Get involved] ${input.route} — ${input.name}`,
    html: layout({ title: 'New “get involved” submission', bodyHtml, preheader: `${input.name} · ${input.route}` }),
    text: `New "get involved" submission\n\nName: ${input.name}\nContact: ${input.contact}\nCountry: ${input.country}\nOrganisation: ${input.organisation || '—'}\nRoute: ${input.route}\n\nNote:\n${input.note}`,
  };
}

export function testerRewardAcknowledgement(input: { name: string }): EmailContent {
  const first = input.name.split(/\s+/)[0] || 'there';
  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 14px;">Thank you for completing your Founding Tester reward details. We will verify your participation before preparing your certificate and numbered tester card.</p>
    <p style="margin:0 0 14px;">Critical feedback is welcome and never affects eligibility. If you need to correct these details, submit the form again using the same Google Play testing email.</p>
    <p style="margin:0;">With gratitude,<br>The Indigen World team</p>`;
  return {
    subject: 'We received your Founding Tester details — Indigen World',
    html: layout({ title: 'Founding Tester details received', bodyHtml, preheader: 'Your reward details are ready for verification.' }),
    text: `Hi ${first},\n\nThank you for completing your Founding Tester reward details. We will verify your participation before preparing your certificate and numbered tester card.\n\nCritical feedback is welcome and never affects eligibility. If you need to correct these details, submit the form again using the same Google Play testing email.\n\nWith gratitude,\nThe Indigen World team`,
  };
}

export function testerRewardTeamAlert(input: {
  certificateName: string;
  cardName: string;
  playEmail: string;
  contactEmail: string;
  country: string;
  recognitionChoice: string;
}): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 14px;">A Founding Tester reward claim is ready for verification.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;">
      <tr><td style="padding:4px 0;color:${BRAND.muted};width:130px;">Certificate</td><td style="padding:4px 0;">${escapeHtml(input.certificateName)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Tester card</td><td style="padding:4px 0;">${escapeHtml(input.cardName)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Play email</td><td style="padding:4px 0;">${escapeHtml(input.playEmail)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Contact email</td><td style="padding:4px 0;">${escapeHtml(input.contactEmail)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Country</td><td style="padding:4px 0;">${escapeHtml(input.country)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.muted};">Public listing</td><td style="padding:4px 0;">${escapeHtml(input.recognitionChoice)}</td></tr>
    </table>`;
  return {
    subject: `[Tester reward] ${input.certificateName}`,
    html: layout({ title: 'New Founding Tester reward claim', bodyHtml, preheader: `${input.certificateName} · ${input.country}` }),
    text: `New Founding Tester reward claim\n\nCertificate: ${input.certificateName}\nTester card: ${input.cardName}\nPlay email: ${input.playEmail}\nContact email: ${input.contactEmail}\nCountry: ${input.country}\nPublic listing: ${input.recognitionChoice}`,
  };
}

export function newsletterWelcome(): EmailContent {
  const bodyHtml = `
    <p style="margin:0 0 14px;">Thank you for subscribing to the Indigen World newsletter.</p>
    <p style="margin:0 0 14px;">You will hear from us when there are new stories, language-cell milestones and ways to
      take part in preserving indigenous languages. We send thoughtfully and never share your address.</p>
    <p style="margin:0;">Akpe / Thank you,<br>The Indigen World team</p>`;
  return {
    subject: 'Welcome to the Indigen World newsletter',
    html: layout({ title: 'Welcome aboard', bodyHtml, preheader: 'Thank you for subscribing to Indigen World.' }),
    text: 'Thank you for subscribing to the Indigen World newsletter.\n\nYou will hear from us when there are new stories, language-cell milestones and ways to take part in preserving indigenous languages. We send thoughtfully and never share your address.\n\nAkpe / Thank you,\nThe Indigen World team',
  };
}

// ---------------------------------------------------------------------------
// Queued notifications (creator applications, review & submission decisions)
// ---------------------------------------------------------------------------

export function notificationEmail(input: {
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
}): EmailContent {
  const bodyHtml = paragraphs(input.body);
  return {
    subject: input.title,
    html: layout({
      title: input.title,
      bodyHtml,
      preheader: input.body.slice(0, 120),
      cta: input.actionUrl ? { label: input.actionLabel || 'Open Indigen World', url: input.actionUrl } : undefined,
    }),
    text: `${input.title}\n\n${input.body}${input.actionUrl ? `\n\n${input.actionLabel || 'Open'}: ${input.actionUrl}` : ''}`,
  };
}

/** Support replies and recovery share the same shell as other operational mail. */
export function supportEmail(input: {
  subject: string;
  text: string;
  recoveryUrl?: string;
}): EmailContent {
  return {
    subject: input.subject,
    text: input.text,
    html: layout({
      title: input.recoveryUrl ? 'Choose a new password' : 'Your support update',
      bodyHtml: paragraphs(input.text),
      preheader: input.recoveryUrl
        ? 'Use your private link to reset your Indigen World password.'
        : 'A message from the Indigen World support team.',
      cta: input.recoveryUrl ? { label: 'Choose a new password', url: input.recoveryUrl } : undefined,
    }),
  };
}

/** An invitation to discuss the role; this message does not grant account access. */
export function validatorInvitationEmail(input: { name: string; language: string }): EmailContent {
  const text = `Dear ${input.name},\n\nWe would like to invite you to join Indigen World as a ${input.language} validator.\n\nYou would help review contributors' translations for meaning, spelling and natural usage, and flag anything that needs correction or more context. Your guidance would help us preserve accurate ${input.language} for learners.\n\nIf you would like to take part, please reply to this email. We can discuss your availability, explain the review process and arrange your access before you begin.\n\nThank you for considering the invitation.\nFrancis and the Indigen World team`;
  return {
    subject: `An invitation to be a ${input.language} validator — Indigen World`,
    text,
    html: layout({
      title: 'Help give every word a careful review',
      bodyHtml: paragraphs(text),
      preheader: `An invitation to support ${input.language} contributors as a validator.`,
      cta: { label: 'Reply to the invitation', url: 'mailto:hi@indigenworld.com?subject=Validator%20invitation' },
    }),
  };
}

/** Firebase replaces %LINK% at send time; no live action code belongs in this template. */
export function firebasePasswordResetEmail(): EmailContent {
  return supportEmail({
    subject: 'Reset your Indigen World password',
    text: 'Hello,\n\nA password reset was requested for your Indigen World account. Use the button below to choose a new password.\n\nIf you did not request this, you can ignore this email. Your password has not changed. Keep this link private and never share it.\n\nIf the button does not work, copy this link into your browser:\n%LINK%\n\nNeed help? Reply to this email to reach the Indigen World team.',
    recoveryUrl: '%LINK%',
  });
}
