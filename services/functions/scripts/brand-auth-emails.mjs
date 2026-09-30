// Uses existing Google Application Default Credentials. No email is sent.
// Build Functions first. Preview is the default; --apply requires a backup path.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { firebasePasswordResetEmail } from '../lib/email-templates.js';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const project = args.includes('--project') ? option('--project') : '';
const apply = args.includes('--apply');
const backup = args.includes('--backup') ? option('--backup') : '';
if (!project || (apply && (!backup || backup.startsWith('--')))) {
  throw new Error('Use --project <id>; --apply also requires --backup <private-file-path>.');
}
const reset = firebasePasswordResetEmail();
const allTemplates = {
  resetPasswordTemplate: { senderDisplayName: 'Indigen World', replyTo: 'hi@indigenworld.com', subject: reset.subject, body: reset.html, bodyFormat: 'HTML' },
  verifyEmailTemplate: { senderDisplayName: 'Indigen World', replyTo: 'hi@indigenworld.com', subject: 'Verify your email — Indigen World' },
  changeEmailTemplate: { senderDisplayName: 'Indigen World', replyTo: 'hi@indigenworld.com', subject: 'Your Indigen World sign-in email was changed' },
  revertSecondFactorAdditionTemplate: { senderDisplayName: 'Indigen World', replyTo: 'hi@indigenworld.com', subject: 'Two-step verification added — Indigen World' },
};
const selected = args.includes('--template') ? option('--template') : '';
if (selected && !(selected in allTemplates)) throw new Error('Unknown --template name.');
const templates = selected ? { [selected]: allTemplates[selected] } : allTemplates;
const mask = Object.entries(templates).flatMap(([name, fields]) =>
  Object.keys(fields).map(field => `notification.sendEmail.${name}.${field}`));
console.log(JSON.stringify({ project, apply, fields: mask, resetBodySha256: createHash('sha256').update(reset.html).digest('hex') }));
try { if (apply) {
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const url = `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(project)}/config`;
  const { data: before } = await client.request({ url });
  // Keep only the non-secret template configuration, never SMTP settings or auth config.
  const original = Object.fromEntries(Object.keys(templates).map(name => [name, before.notification.sendEmail[name]]));
  writeFileSync(backup, JSON.stringify({ project, savedAt: new Date().toISOString(), templates: original }, null, 2), { flag: 'wx' });
  await client.request({ url, method: 'PATCH', params: { updateMask: mask.join(',') }, data: { notification: { sendEmail: templates } } });
  const { data: after } = await client.request({ url });
  for (const [name, fields] of Object.entries(templates)) {
    for (const [field, value] of Object.entries(fields)) {
      if (after.notification.sendEmail[name][field] !== value) throw new Error(`Readback mismatch: ${name}.${field}`);
    }
  }
  console.log('Saved and verified all requested email template fields. No emails sent.');
} } catch (error) {
  // Provider errors can contain credential-bearing request objects: never print them.
  console.error('Email template update failed:', error?.response?.data?.error?.message || error.message);
  process.exitCode = 1;
}
