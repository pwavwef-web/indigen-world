// Email theme: rendering, escaping, links, plain text, inline logo, contrast and
// honest status wording. Run with `npm run test:email` (builds Functions first).
import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { EMAIL_TOKENS, EMAIL_LOGO_CID, renderEmail, safeUrl, firstName } from '../../services/functions/lib/email-theme.js';
import * as t from '../../services/functions/lib/email-templates.js';
import { letterMailOptions } from '../../services/functions/lib/correspondence-delivery.js';
import { correspondenceLetters } from '../../services/functions/lib/email.js';
import { fixtures } from '../../services/functions/scripts/email-fixtures.mjs';

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('every text/background pair the theme uses meets WCAG AA', () => {
  for (const scheme of ['light', 'dark']) {
    const c = EMAIL_TOKENS[scheme];
    for (const [fg, bg] of [[c.navy, c.surface], [c.text, c.surface], [c.muted, c.surface], [c.muted, c.page], [c.link, c.surface], [c.link, c.page], [c.onPrimary, c.primary], [c.text, c.soft]]) {
      assert.ok(contrast(fg, bg) >= 4.5, `${scheme} ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}`);
    }
  }
  for (const [name, tone] of Object.entries(EMAIL_TOKENS.tone)) {
    assert.ok(contrast(tone.text, tone.surface) >= 4.5, `${name} light`);
    assert.ok(contrast(EMAIL_TOKENS.light.text, tone.surface) >= 4.5, `${name} body light`);
    assert.ok(contrast(tone.darkText, tone.darkSurface) >= 4.5, `${name} dark`);
    assert.ok(contrast(EMAIL_TOKENS.dark.text, tone.darkSurface) >= 4.5, `${name} body dark`);
  }
});

test('every fixture renders compact, linked, branded HTML with a matching plain text', () => {
  for (const [id, , , content] of fixtures) {
    assert.ok(content.subject && content.html.startsWith('<!DOCTYPE html>'), id);
    assert.ok(Buffer.byteLength(content.html) < 40_000, `${id} stays far below Gmail's 102 KB clip`);
    assert.ok(/<img [^>]*alt="Indigen World logo"/.test(content.html), `${id} shows the logo`);
    assert.ok(content.html.includes('>Indigen World</a>'), `${id} keeps a text wordmark for blocked images`);
    for (const [, href] of content.html.matchAll(/href="([^"]+)"/g)) {
      assert.match(href, /^(https:\/\/|mailto:|%LINK%$)/, `${id} link ${href}`);
      assert.doesNotMatch(href, /localhost|127\.0\.0\.1/, id);
    }
    // Every link and action label in the HTML is readable in the plain text.
    for (const [, href] of content.html.matchAll(/<a href="(https:[^"]+)" class="iw-link"[^>]*>[^<]*<\/a><\/p>/g)) {
      assert.ok(content.text.includes(href.replace(/&amp;/g, '&')), `${id} text carries ${href}`);
    }
    assert.ok(!/<(?:p|a|table|td|div|br|img|span)\b/i.test(content.text), `${id} plain text has no template markup`);
    assert.ok(content.text.includes('Indigen World · https://indigenworld.com'), id);
  }
});

test('dynamic values are escaped and Kasem text survives intact', () => {
  const mail = t.contactTeamAlert({ name: '<img src=x onerror=alert(1)>', email: 'a@example.test', subject: '"quoted" & <b>bold</b>', message: 'A na vei sɔŋɔ to\nDé toŋe' });
  assert.ok(!mail.html.includes('<img src=x'));
  assert.ok(mail.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(mail.html.includes('&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(mail.html.includes('A na vei sɔŋɔ to<br>Dé toŋe'));
  assert.ok(mail.text.includes('A na vei sɔŋɔ to\nDé toŋe'));
  assert.ok(mail.html.includes('<meta charset="utf-8">'));
});

test('greetings fall back naturally and links must be safe', () => {
  assert.equal(firstName('Ama Example'), 'Ama');
  assert.equal(firstName('  '), '');
  assert.equal(firstName('someone@example.test'), '');
  assert.ok(t.newsletterWelcome().html.includes('Welcome aboard'));
  const anonymous = renderEmail({ subject: 's', preheader: 'p', heading: 'h', reason: 'r', blocks: [{ type: 'greeting' }] });
  assert.ok(anonymous.text.includes('Hello,'));
  assert.throws(() => safeUrl('http://indigenworld.com'), /HTTPS/);
  assert.throws(() => safeUrl('https://localhost:5199/studio'), /local development/);
  assert.throws(() => safeUrl('https://studio.test/x'), /local development/);
  assert.throws(() => safeUrl('javascript:alert(1)'), /HTTPS/);
  assert.equal(safeUrl('%LINK%'), '%LINK%');
});

test('preheader is distinct from the subject and hidden', () => {
  const mail = t.contactAcknowledgement({ name: 'Ama', subject: 'Hello' });
  assert.match(mail.html, /<div style="display:none;[^"]*">A member of our team/);
  assert.notEqual(mail.subject, 'A member of our team will read it and reply to this address.');
});

test('status wording is honest: approval is not publication, redemption requested is not paid', () => {
  const approved = t.notificationEmail({ type: 'review_decision', title: 'Submission approved', body: 'Your submission "Dé toŋe" is now APPROVED.', link: '/studio/submissions/x', actionUrl: 'https://tribestudio.indigenworld.com/studio/submissions/x' });
  assert.ok(approved.text.startsWith('[Approved]'));
  assert.ok(approved.text.includes('Your submission "Dé toŋe" has been approved.'));
  assert.doesNotMatch(approved.text, /publish/i);
  const published = t.notificationEmail({ type: 'publication_notice', title: 'Submission published', body: 'x', link: '/studio' });
  assert.ok(published.text.startsWith('[Published]'));
  const unknown = t.notificationEmail({ type: 'something_new', title: 'A new kind of notice', body: 'Body' });
  assert.ok(!unknown.text.startsWith('['), 'unknown titles get no invented status');
  const requested = t.redemptionUpdatePreview({ status: 'submitted', reference: 'R', points: '2,500 points', amount: 'GH₵25.00', reward: 'Airtime' });
  assert.ok(requested.text.startsWith('[Requested]'));
  assert.match(requested.text, /nothing has been paid yet/);
  assert.ok(requested.text.includes('Points: 2,500 points') && requested.text.includes('Reward value: GH₵25.00'), 'points and money stay separately labelled');
  assert.throws(() => t.redemptionUpdatePreview({ status: 'paid', reference: 'R', points: '1', amount: '1', reward: 'x' }), /Unknown redemption status/);
});

test('contributor notifications carry the portal label, settings reason and feedback panel', () => {
  const mail = t.notificationEmail({ type: 'revision_request', title: 'Submission needs revision', body: 'Please add the meaning.', link: '/contributor/c1/expressions?item=i1', actionUrl: 'https://tribestudio.indigenworld.com/contributor/c1/expressions?item=i1' });
  assert.ok(mail.html.includes('Contributor Portal'));
  assert.ok(mail.text.includes('Reviewer feedback:\nPlease add the meaning.'));
  assert.ok(mail.text.includes('Review the feedback: https://tribestudio.indigenworld.com/contributor/c1/expressions?item=i1'));
  assert.ok(mail.text.includes('review emails are switched on in your Contributor Portal settings'));
});

test('account recovery prints a fallback link; the Firebase template keeps %LINK% and a hosted logo', () => {
  const url = 'https://auth.example.com/__/auth/action?mode=resetPassword&oobCode=TEST';
  const mail = t.supportEmail({ kind: 'recovery', subject: 'Reset', text: '', recoveryUrl: url, reference: 'IW-1' });
  assert.equal(mail.html.split(url.replace(/&/g, '&amp;')).length - 1, 4, 'VML button, anchor button, fallback href and fallback text');
  assert.ok(mail.text.includes(`Choose a new password: ${url}`));
  const reset = t.firebasePasswordResetEmail();
  assert.ok(reset.html.includes('href="%LINK%"') && reset.html.includes('>%LINK%</a>'));
  assert.ok(reset.html.includes('src="https://indigenworld.com/email/indigen-world-logo.png"'));
  assert.ok(!reset.html.includes(`cid:${EMAIL_LOGO_CID}`));
});

test('the SMTP payload embeds the logo inline and keeps the PDF attachment', async () => {
  const content = t.contactAcknowledgement({ name: 'Ama', subject: 'Hi' });
  const [{ letter }] = correspondenceLetters({ to: 'ama@example.test', ...content }, 'Indigen World <hi@indigenworld.com>', '2026-10-14');
  assert.equal(letter.body.map((block) => block.runs.map((run) => run.text).join('')).join('\n\n'), content.letterText, 'the PDF letter omits the inbox footer');
  const options = letterMailOptions({ to: 'ama@example.test', from: 'Indigen World <hi@indigenworld.com>', subject: content.subject, text: content.text, html: content.html, letter, filename: 'Test' }, Buffer.from('%PDF-1.7 test'), '<t@indigenworld.com>');
  assert.equal(options.attachments.length, 2);
  const logo = options.attachments.find((item) => item.cid === EMAIL_LOGO_CID);
  assert.equal(logo.contentType, 'image/png');
  assert.ok(logo.content.subarray(1, 4).equals(Buffer.from('PNG')));
  const info = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(options);
  const mime = info.message.toString();
  assert.match(mime, /multipart\/related/);
  assert.match(mime, /Content-ID: <indigen-world-logo>/);
  assert.match(mime, /filename=Test\.pdf/);
  const plain = letterMailOptions({ to: 'a@example.test', from: 'x', subject: 's', text: 't', html: '<p>t</p>', letter, filename: 'P' }, Buffer.from('%PDF-1.7'), '<p@x>');
  assert.equal(plain.attachments.length, 1, 'no logo without a CID reference');
});
