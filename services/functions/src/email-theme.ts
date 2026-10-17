import { readFileSync } from 'node:fs';

/**
 * The Indigen World email theme: one shared layout and a small set of content
 * blocks. Every template describes its message as blocks; this module renders
 * the same blocks to email-safe HTML (tables, inline styles, a VML button for
 * desktop Outlook) and to a matching plain-text alternative, so the two can
 * never drift apart.
 *
 * Tokens follow TribeStudio's blue language (see apps/tribestudio/src/ui/
 * tokens.css): deep navy ink, one rich blue action, pale blue washes. Every
 * text/background pair below is contrast-checked in firebase/tests/emailTheme.
 * Guide: docs/architecture/email-theme.md.
 */

export const EMAIL_TOKENS = {
  light: {
    page: '#F4F7FC',
    surface: '#FFFFFF',
    navy: '#102A56',
    text: '#243247',
    muted: '#536176',
    divider: '#DBE4F0',
    primary: '#1D4ED8',
    onPrimary: '#FFFFFF',
    soft: '#EFF6FF',
    link: '#1D4ED8',
  },
  dark: {
    page: '#0B1225',
    surface: '#131D35',
    navy: '#F1F5FF',
    text: '#D5DDEA',
    muted: '#AEB9CC',
    divider: '#2A3A5C',
    primary: '#1D4ED8',
    onPrimary: '#FFFFFF',
    soft: '#1B2A4A',
    link: '#93B4FF',
  },
  /** Status colours support a written label; they never carry meaning alone. */
  tone: {
    info: { text: '#1D4ED8', surface: '#EFF6FF', line: '#BFDBFE', darkText: '#93B4FF', darkSurface: '#1B2A4A' },
    success: { text: '#047857', surface: '#ECFDF5', line: '#A7F3D0', darkText: '#6EE7B7', darkSurface: '#0F2A24' },
    warning: { text: '#92400E', surface: '#FFFBEB', line: '#FDE68A', darkText: '#FCD34D', darkSurface: '#2E2410' },
    danger: { text: '#B91C1C', surface: '#FEF2F2', line: '#FECACA', darkText: '#FCA5A5', darkSurface: '#331818' },
    neutral: { text: '#536176', surface: '#F4F7FC', line: '#DBE4F0', darkText: '#AEB9CC', darkSurface: '#1B2A4A' },
  },
  /** The logo tile colour, shown behind the image while it loads or is blocked. */
  logoTile: '#101C36',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
} as const;

export type Tone = keyof typeof EMAIL_TOKENS.tone;

/** Verified public destinations. Nothing else is linked from the shell. */
export const EMAIL_LINKS = {
  website: 'https://indigenworld.com',
  supportEmail: 'hi@indigenworld.com',
  contributorSupport: 'https://tribestudio.indigenworld.com/contributor/support',
  /** Hosted copy for provider-managed templates that cannot carry attachments. */
  hostedLogo: 'https://indigenworld.com/email/indigen-world-logo.png',
} as const;

/** Content-ID of the inline logo attached by `letterMailOptions`. */
export const EMAIL_LOGO_CID = 'indigen-world-logo';

let logoBytes: Buffer | undefined;
/** The existing roof/bars/sun mark (blue variant), rendered to PNG at 3× for 40 px. */
export function emailLogoPng(): Buffer {
  logoBytes ??= readFileSync(new URL('../assets/email/indigen-world-logo.png', import.meta.url));
  return logoBytes;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
  /** Message body without the inbox chrome; used for the automatic PDF letter. */
  letterText?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export interface DetailRow {
  label: string;
  value: string;
  /** BCP 47 tag for language-specific values, e.g. `xsm` for Kasem. */
  lang?: string;
}

export type EmailBlock =
  /** "Hi Ama," — falls back to "Hello," when no usable name is supplied. */
  | { type: 'greeting'; name?: string }
  /** Plain copy. Blank lines start new paragraphs; single newlines are kept. */
  | { type: 'text'; text: string }
  /** Labelled facts: references, titles, dates, balances. */
  | { type: 'details'; title?: string; rows: DetailRow[] }
  /** A tinted note such as reviewer feedback or a status explanation. */
  | { type: 'panel'; tone?: Tone; title: string; text: string; lang?: string }
  /** An ordered "what happens next" list. */
  | { type: 'steps'; title: string; items: string[] }
  /** Editorial updates for announcements. */
  | { type: 'updates'; items: { title: string; text: string; url?: string; linkLabel?: string }[] }
  /** The one primary call to action. `fallback` prints the URL for account actions. */
  | { type: 'action'; label: string; url: string; fallback?: boolean }
  /** A quiet secondary link. */
  | { type: 'link'; label: string; url: string }
  | { type: 'signoff'; text: string }
  /** Small print inside the card, e.g. security advice. */
  | { type: 'note'; text: string };

export interface EmailOptions {
  subject: string;
  /** Inbox preview line; distinct from the subject. */
  preheader: string;
  heading: string;
  /** Product context shown beside the parent identity, e.g. TribeStudio. */
  product?: string;
  /** A written status pill above the heading. */
  status?: { tone: Tone; label: string };
  blocks: EmailBlock[];
  /** Why the recipient got this message, in one sentence. */
  reason: string;
  /** `team` alerts drop the member-facing reply line. */
  audience?: 'member' | 'team';
  /** Link to contributor help; shown in the footer when supplied. */
  helpUrl?: string;
  /** Promotional mail only, and only when a working mechanism exists. */
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  /** Defaults to the inline CID logo; provider templates pass a hosted URL. */
  logoSrc?: string;
  /** Fixed for previews and tests; defaults to the current year. */
  year?: number;
}

const T = EMAIL_TOKENS;
const L = T.light;
const FONT = T.font;

export function firstName(name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  // An email address or a stray symbol is not a name to greet somebody by.
  return first && !first.includes('@') && /\p{L}/u.test(first) ? first : '';
}

/** Only absolute HTTPS links, mailto, and provider placeholders leave the template. */
export function safeUrl(url: string): string {
  const value = url.trim();
  if (/^%[A-Z_]+%$/.test(value) || /^mailto:[^\s<>"]+$/i.test(value)) return value;
  // Emulator action links are local by design; production never sets these variables.
  if ((process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/[^\s<>"]*$/i.test(value)) return value;
  if (!/^https:\/\/[^\s<>"]+$/i.test(value)) throw new Error('Email links must be absolute HTTPS URLs.');
  if (/^https:\/\/(?:localhost|127\.|0\.0\.0\.0|\[::1\]|[^/]*\.(?:localhost|test)(?:[:/]|$))/i.test(value)) {
    throw new Error('Email links must not point at a local development host.');
  }
  return value;
}

function paragraphsHtml(text: string, style: string, lang?: string, cls = 'iw-text'): string {
  const langAttr = lang ? ` lang="${escapeHtml(lang)}"` : '';
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p${langAttr} class="${cls}" style="${style}">${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const P = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${L.text};`;
const SMALL = `font-family:${FONT};font-size:13px;line-height:1.6;color:${L.muted};`;
const EYEBROW = `font-family:${FONT};font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${L.muted};`;

function toneStyles(tone: Tone) {
  return T.tone[tone];
}

function statusPill(status: { tone: Tone; label: string }): string {
  const tone = toneStyles(status.tone);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td class="iw-pill-${status.tone}" style="background:${tone.surface};border:1px solid ${tone.line};border-radius:999px;padding:4px 12px;font-family:${FONT};font-size:13px;line-height:1.4;font-weight:700;color:${tone.text};">${escapeHtml(status.label)}</td></tr></table>`;
}

function buttonHtml(label: string, url: string): string {
  const href = escapeHtml(safeUrl(url));
  const text = escapeHtml(label);
  // VML needs a fixed width; size it to the label so long labels never clip.
  const width = Math.min(520, Math.max(200, Math.round(label.length * 9.5 + 64)));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="iw-btn-wrap" style="margin:8px 0 8px;"><tr><td align="center" bgcolor="${L.primary}" class="iw-btn" style="border-radius:10px;background:${L.primary};">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:${width}px;" arcsize="20%" stroke="f" fillcolor="${L.primary}"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:bold;">${text}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" class="iw-btn-a" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:${L.onPrimary};text-decoration:none;border-radius:10px;mso-hide:all;">${text}</a><!--<![endif]-->
</td></tr></table>`;
}

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'greeting': {
      const name = firstName(block.name);
      return `<p class="iw-text" style="${P}">${name ? `Hi ${escapeHtml(name)},` : 'Hello,'}</p>`;
    }
    case 'text':
      return paragraphsHtml(block.text, P);
    case 'details': {
      const rows = block.rows
        .filter((row) => row.value.trim())
        .map((row, index) => `<tr><td class="iw-rule" style="padding:12px 18px;${index ? `border-top:1px solid ${L.divider};` : ''}">
<div class="iw-muted" style="${SMALL}">${escapeHtml(row.label)}</div>
<div class="iw-text"${row.lang ? ` lang="${escapeHtml(row.lang)}"` : ''} style="font-family:${FONT};font-size:16px;line-height:1.5;color:${L.text};font-weight:600;">${escapeHtml(row.value.trim()).replace(/\n/g, '<br>')}</div></td></tr>`)
        .join('');
      if (!rows) return '';
      const title = block.title
        ? `<tr><td class="iw-rule" style="padding:12px 18px 0;"><div class="iw-muted" style="${EYEBROW}">${escapeHtml(block.title)}</div></td></tr>`
        : '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="iw-box" style="margin:8px 0 24px;border:1px solid ${L.divider};border-radius:12px;border-collapse:separate;">${title}${rows}</table>`;
    }
    case 'panel': {
      const tone = toneStyles(block.tone ?? 'info');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td class="iw-panel-${block.tone ?? 'info'}" style="background:${tone.surface};border-left:4px solid ${tone.text};border-radius:4px 12px 12px 4px;padding:16px 18px;">
<div class="iw-tone-${block.tone ?? 'info'}" style="font-family:${FONT};font-size:14px;line-height:1.4;font-weight:700;color:${tone.text};margin:0 0 6px;">${escapeHtml(block.title)}</div>
${paragraphsHtml(block.text, `margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.6;color:${L.text};`, block.lang)}</td></tr></table>`;
    }
    case 'steps': {
      const items = block.items
        .map((item, index) => `<tr><td valign="top" class="iw-step" style="width:28px;padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.6;font-weight:700;color:${L.primary};">${index + 1}.</td><td class="iw-text" style="padding:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.6;color:${L.text};">${escapeHtml(item)}</td></tr>`)
        .join('');
      return `<div class="iw-muted" style="${EYEBROW}margin:8px 0 10px;">${escapeHtml(block.title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">${items}</table>`;
    }
    case 'updates':
      return block.items
        .map((item) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;"><tr><td class="iw-rule" style="padding:18px 0;border-top:1px solid ${L.divider};">
<div class="iw-h" style="font-family:${FONT};font-size:18px;line-height:1.35;font-weight:700;color:${L.navy};margin:0 0 6px;">${escapeHtml(item.title)}</div>
${paragraphsHtml(item.text, `margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:1.6;color:${L.text};`)}${item.url ? `<a href="${escapeHtml(safeUrl(item.url))}" class="iw-link" style="font-family:${FONT};font-size:15px;font-weight:600;color:${L.link};text-decoration:underline;">${escapeHtml(item.linkLabel || 'Read more')}</a>` : ''}</td></tr></table>`)
        .join('');
    case 'action':
      return `${buttonHtml(block.label, block.url)}${block.fallback
        ? `<p class="iw-muted" style="${SMALL}margin:12px 0 20px;">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(safeUrl(block.url))}" class="iw-link" style="color:${L.link};text-decoration:underline;word-break:break-all;font-family:${T.mono};font-size:13px;">${escapeHtml(block.url)}</a></p>`
        : '<div style="height:16px;line-height:16px;font-size:16px;">&nbsp;</div>'}`;
    case 'link':
      return `<p class="iw-text" style="${P}"><a href="${escapeHtml(safeUrl(block.url))}" class="iw-link" style="color:${L.link};text-decoration:underline;font-weight:600;">${escapeHtml(block.label)}</a></p>`;
    case 'signoff':
      return paragraphsHtml(block.text, `${P}margin:24px 0 0;`);
    case 'note':
      return paragraphsHtml(block.text, `${SMALL}margin:0 0 12px;`, undefined, 'iw-muted');
  }
}

function blockText(block: EmailBlock): string {
  switch (block.type) {
    case 'greeting': {
      const name = firstName(block.name);
      return name ? `Hi ${name},` : 'Hello,';
    }
    case 'text':
    case 'signoff':
    case 'note':
      return block.text.trim();
    case 'details': {
      const rows = block.rows.filter((row) => row.value.trim()).map((row) => `${row.label}: ${row.value.trim()}`);
      if (!rows.length) return '';
      return [block.title ? block.title.toUpperCase() : '', ...rows].filter(Boolean).join('\n');
    }
    case 'panel':
      return `${block.title}:\n${block.text.trim()}`;
    case 'steps':
      return `${block.title.toUpperCase()}\n${block.items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
    case 'updates':
      return block.items.map((item) => `${item.title}\n${item.text.trim()}${item.url ? `\n${item.linkLabel || 'Read more'}: ${item.url}` : ''}`).join('\n\n');
    case 'action':
      return `${block.label}: ${block.url}`;
    case 'link':
      return `${block.label}: ${block.url}`;
  }
}

const STYLE = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { -ms-interpolation-mode: bicubic; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
@media only screen and (max-width: 520px) {
  .iw-outer { padding: 20px 10px !important; }
  .iw-inner { padding: 28px 22px 26px !important; }
  .iw-title { font-size: 24px !important; }
  .iw-btn-wrap { width: 100% !important; }
  .iw-btn-a { display: block !important; text-align: center !important; }
}
@media (prefers-color-scheme: dark) {
  .iw-bg { background: ${T.dark.page} !important; }
  .iw-card { background: ${T.dark.surface} !important; border-color: ${T.dark.divider} !important; }
  .iw-h, .iw-word { color: ${T.dark.navy} !important; }
  .iw-text { color: ${T.dark.text} !important; }
  .iw-muted { color: ${T.dark.muted} !important; }
  .iw-rule { border-color: ${T.dark.divider} !important; }
  .iw-box { border-color: ${T.dark.divider} !important; }
  .iw-link { color: ${T.dark.link} !important; }
  .iw-step { color: ${T.dark.link} !important; }
${(Object.keys(T.tone) as Tone[]).map((tone) => `  .iw-pill-${tone}, .iw-panel-${tone} { background: ${T.tone[tone].darkSurface} !important; border-color: ${T.tone[tone].darkText} !important; color: ${T.tone[tone].darkText} !important; }
  .iw-tone-${tone} { color: ${T.tone[tone].darkText} !important; }`).join('\n')}
}
[data-ogsc] .iw-h, [data-ogsc] .iw-word { color: ${T.dark.navy} !important; }
[data-ogsc] .iw-text { color: ${T.dark.text} !important; }
[data-ogsc] .iw-muted { color: ${T.dark.muted} !important; }
[data-ogsc] .iw-link { color: ${T.dark.link} !important; }
`.replace(/\n\s*/g, '\n').trim();

/** Render one message to themed HTML and its plain-text alternative. */
export function renderEmail(options: EmailOptions): EmailContent {
  const year = options.year ?? new Date().getUTCFullYear();
  const member = (options.audience ?? 'member') === 'member';
  const logoSrc = options.logoSrc ?? `cid:${EMAIL_LOGO_CID}`;
  const product = options.product?.trim();

  const header = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding:0 12px 0 0;"><a href="${EMAIL_LINKS.website}" style="text-decoration:none;"><img src="${escapeHtml(logoSrc)}" width="40" height="40" alt="Indigen World logo" style="display:block;width:40px;height:40px;border:0;outline:none;border-radius:10px;background:${T.logoTile};color:#FFFFFF;font-family:${FONT};font-size:10px;"></a></td>
<td valign="middle"><a href="${EMAIL_LINKS.website}" class="iw-word" style="font-family:${FONT};font-size:18px;line-height:1.2;font-weight:800;letter-spacing:-0.01em;color:${L.navy};text-decoration:none;">Indigen World</a>${product ? `<div class="iw-muted" style="${SMALL}font-weight:600;">${escapeHtml(product)}</div>` : ''}</td>
</tr></table>`;

  const body = options.blocks.map(blockHtml).join('\n');
  const support = member
    ? `Questions? Reply to this email or write to <a href="mailto:${EMAIL_LINKS.supportEmail}" class="iw-link" style="color:${L.link};text-decoration:underline;">${EMAIL_LINKS.supportEmail}</a>.${options.helpUrl ? ` Contributors can also use <a href="${escapeHtml(safeUrl(options.helpUrl))}" class="iw-link" style="color:${L.link};text-decoration:underline;">contributor support</a>.` : ''}<br>`
    : '';
  const controls = [
    options.preferencesUrl ? `<a href="${escapeHtml(safeUrl(options.preferencesUrl))}" class="iw-link" style="color:${L.link};text-decoration:underline;">Email preferences</a>` : '',
    options.unsubscribeUrl ? `<a href="${escapeHtml(safeUrl(options.unsubscribeUrl))}" class="iw-link" style="color:${L.link};text-decoration:underline;">Unsubscribe</a>` : '',
  ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(options.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
${STYLE}
</style>
</head>
<body class="iw-bg" style="margin:0;padding:0;width:100%;background:${L.page};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${L.page};">${escapeHtml(options.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="iw-bg" bgcolor="${L.page}" style="background:${L.page};">
<tr><td align="center" class="iw-outer" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 4px 18px;">${header}</td></tr>
<tr><td class="iw-card" bgcolor="${L.surface}" style="background:${L.surface};border:1px solid ${L.divider};border-top:4px solid ${L.primary};border-radius:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="iw-inner" style="padding:36px 40px 32px;overflow-wrap:anywhere;word-break:break-word;">
${options.status ? statusPill(options.status) : ''}<h1 class="iw-h iw-title" style="margin:0 0 20px;font-family:${FONT};font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.015em;color:${L.navy};">${escapeHtml(options.heading)}</h1>
${body}
</td></tr></table>
</td></tr>
<tr><td class="iw-muted" style="padding:24px 8px 8px;${SMALL}">
${support}${escapeHtml(options.reason)}<br>
${controls ? `${controls}<br>` : ''}<a href="${EMAIL_LINKS.website}" class="iw-link" style="color:${L.link};text-decoration:underline;">indigenworld.com</a> &nbsp;&middot;&nbsp; &copy; ${year} Indigen World
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const letterText = options.blocks.map(blockText).filter(Boolean).join('\n\n');
  const footer = [
    member ? `Questions? Reply to this email or write to ${EMAIL_LINKS.supportEmail}.` : '',
    member && options.helpUrl ? `Contributor support: ${options.helpUrl}` : '',
    options.reason,
    options.preferencesUrl ? `Email preferences: ${options.preferencesUrl}` : '',
    options.unsubscribeUrl ? `Unsubscribe: ${options.unsubscribeUrl}` : '',
    `Indigen World · ${EMAIL_LINKS.website}`,
  ].filter(Boolean).join('\n');
  const statusLine = options.status ? `[${options.status.label}]\n` : '';
  const text = `${statusLine}${options.heading}\n\n${letterText}\n\n--\n${footer}\n`;

  return { subject: options.subject, html, text, letterText: `${options.heading}\n\n${letterText}` };
}
