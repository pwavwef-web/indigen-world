import { sha256 } from './correspondence-render.js';
import { EMAIL_LOGO_CID, emailLogoPng } from './email-theme.js';
import type { CorrespondenceLetter } from '@indigen-world/contracts/correspondence';

export type DeliveryStatus = 'preparing' | 'preparation_failed' | 'sending' | 'accepted' | 'unknown' | 'not_configured';
export interface DeliveryRecord { status: DeliveryStatus; fingerprint: string; pdfSha256?: string; path?: string; messageId?: string }
export interface DeliveryStore {
  /** Atomic claim. Only preparation_failed is retryable; never reclaim a sending lease. */
  claim(id: string, fingerprint: string): Promise<boolean>;
  get(id: string): Promise<DeliveryRecord>;
  set(id: string, record: Partial<DeliveryRecord>): Promise<void>;
  archive(id: string, pdf: Buffer, filename: string): Promise<string>;
}
export interface LetterEmail { to: string; subject: string; text: string; html: string; from: string; replyTo?: string; letter: CorrespondenceLetter; filename: string }
export interface PreparedAttachment { pdf: Buffer; path?: string; pdfSha256?: string }
/** The production SMTP payload, also used with Nodemailer's offline test transport. */
export function letterMailOptions(email:LetterEmail,pdf:Buffer,messageId:string) {
  // Themed bodies reference the logo by Content-ID; it travels inline with the
  // message, so it shows without a remote image fetch.
  const logo = email.html.includes(`cid:${EMAIL_LOGO_CID}`)
    ? [{filename:'indigen-world-logo.png',content:emailLogoPng(),contentType:'image/png',cid:EMAIL_LOGO_CID,contentDisposition:'inline' as const}]
    : [];
  return {from:email.from,to:email.to,subject:email.subject,text:email.text,html:email.html,replyTo:email.replyTo,messageId,attachments:[{filename:`${email.filename}.pdf`,content:pdf,contentType:'application/pdf'},...logo]};
}
export async function deliverLetterEmail(input: {
  id: string; fingerprint: string; email: LetterEmail; store: DeliveryStore;
  prepare: (letter: CorrespondenceLetter) => Promise<PreparedAttachment>;
  transport: (email: LetterEmail, pdf: Buffer, messageId: string) => Promise<void>;
}): Promise<DeliveryRecord> {
  const { id, fingerprint, email, store } = input;
  if (!await store.claim(id,fingerprint)) {
    const current = await store.get(id);
    if (current.fingerprint !== fingerprint) throw new Error('This delivery key belongs to another message.');
    return current;
  }
  let pdf: Buffer, path: string, pdfSha256: string;
  try {
    const prepared = await input.prepare(email.letter); pdf = prepared.pdf;
    if (pdf.length < 100 || !pdf.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('PDF generation failed.');
    pdfSha256 = sha256(pdf);
    if (prepared.pdfSha256 && prepared.pdfSha256 !== pdfSha256) throw new Error('The saved PDF failed its integrity check.');
    path = prepared.path || await store.archive(id,pdf,email.filename);
    await store.set(id,{path,pdfSha256});
  } catch {
    // No SMTP call has happened. The durable draft/message remains available for retry.
    await store.set(id,{status:'preparation_failed'});
    return store.get(id);
  }
  const messageId = `<iw-${id}@indigenworld.com>`;
  // Persist before crossing SMTP. Any crash or ambiguous response must stop a resend.
  await store.set(id,{status:'sending',messageId});
  try { await input.transport(email,pdf,messageId); }
  catch { await store.set(id,{status:'unknown'}); return store.get(id); }
  await store.set(id,{status:'accepted'});
  return store.get(id);
}
