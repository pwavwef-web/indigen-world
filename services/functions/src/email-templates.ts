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
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.paper};border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
        <tr><td style="background:${BRAND.indigo};padding:22px 28px;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:0.3px;">Indigen&nbsp;World</span>
        </td></tr>
        <tr><td style="padding:30px 28px 34px;font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
          <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${BRAND.indigo};">${escapeHtml(title)}</h1>
          <div style="font-size:15px;line-height:1.65;color:${BRAND.ink};">${bodyHtml}</div>
          ${button}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
          Indigen World — a cultural-technology ecosystem preserving and celebrating indigenous languages.<br>
          &copy; ${year} Indigen World. This is an automated message; you can reply to reach a person.
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
