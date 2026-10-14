import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { randomUUID, createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { normalizeLetter, letterFilename, type CorrespondenceLetter } from '@indigen-world/contracts/correspondence';
import { renderLetterPdf, letterVersion, sha256 } from './correspondence-render.js';
import { deliverLetterEmail, letterMailOptions, type DeliveryRecord, type DeliveryStore, type PreparedAttachment } from './correspondence-delivery.js';

/**
 * Transactional email for the Indigen World backend.
 *
 * Sending goes through an authenticated SMTP relay (Gmail / Google Workspace by
 * default). The only true secret is the SMTP password (a Google *app password*),
 * which lives in Secret Manager as `SMTP_PASSWORD`; every function that sends
 * mail must declare it in its `secrets: [SMTP_PASSWORD]` option. All other
 * settings are non-secret and read from the environment with safe defaults so a
 * fresh checkout needs no configuration to build, typecheck or run the emulator.
 *
 * `sendMail` retains the best-effort boolean API for existing event handlers.
 * The shared boundary requires a Heritage Frame PDF before any SMTP call.
 * `sendMailWithLetter` exposes exact failure and delivery states to the composer.
 */
export const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');

/** Address the ecosystem sends *from* and that receives operational alerts. */
export function mailFrom(): string {
  const address = process.env.MAIL_FROM || process.env.SMTP_USER || 'hi@indigenworld.com';
  return process.env.MAIL_FROM_NAME ? `${process.env.MAIL_FROM_NAME} <${address}>` : `Indigen World <${address}>`;
}

/** Internal inbox that receives contact / get-involved alerts. */
export function teamInbox(): string {
  return process.env.MAIL_TEAM || process.env.SMTP_USER || 'hi@indigenworld.com';
}

function smtpUser(): string {
  return process.env.SMTP_USER || 'hi@indigenworld.com';
}

function smtpPassword(): string {
  // Prefer the Secret Manager value; fall back to a plain env var for local
  // scripts. `.value()` returns '' when the secret is not bound to the function.
  try {
    const secret = SMTP_PASSWORD.value();
    if (secret) return secret;
  } catch {
    // Secret not available in this context (e.g. a plain Node script).
  }
  return process.env.SMTP_PASSWORD || '';
}

/** Whether enough configuration exists to actually deliver mail. */
export function isEmailConfigured(): boolean {
  return Boolean(smtpUser() && smtpPassword());
}

let transporter: Transporter | undefined;

function getTransport(): Transporter | undefined {
  if (!isEmailConfigured()) return undefined;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465, // implicit TLS on 465; STARTTLS on 587
      auth: { user: smtpUser(), pass: smtpPassword() },
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Body for the automatic PDF letter; defaults to `text`. Themed templates omit the inbox footer here. */
  letterText?: string;
  replyTo?: string;
  /** Optional override; defaults to the operational team inbox. */
  from?: string;
  /** Stable source event/draft version key. Retries MUST reuse this key. */
  deliveryKey?: string;
  /** A separately supplied formal letter; the email body stays independent. */
  letter?: CorrespondenceLetter;
  /** Supplied identity for an automatic letter; default is the configured From display name. */
  sender?: { name: string; role?: string };
  recipient?: { name?: string; organisation?: string; address?: string[] };
}

/** Pure recipient-specific preparation, shared with offline bulk tests. */
export function correspondenceLetters(message:MailMessage,from=mailFrom(),date=new Date().toISOString().slice(0,10)) {
  const recipients=Array.isArray(message.to)?message.to:[message.to];
  if (!recipients.length || recipients.length>500) throw new Error('Supply between one and 500 recipients.');
  if (message.letter && recipients.length!==1) throw new Error('Supply one formal letter per recipient.');
  if (recipients.length>1 && message.recipient?.name) throw new Error('Send named, personalised messages individually so every recipient gets the correct letter.');
  const sender=message.sender || {name:from.includes('<')?from.slice(0,from.indexOf('<')).trim():from};
  return [...new Set(recipients)].map(to=>{
    const letter=normalizeLetter(message.letter || {date,recipient:{...message.recipient,email:to},subject:message.subject,body:(message.letterText || message.text).split(/\n\n+/).filter(Boolean).map(text=>({runs:[{text}]})),sender});
    if (message.letter && letter.recipient.email && letter.recipient.email!==to) throw new Error('The formal letter recipient does not match the email.');
    // Even an explicitly supplied letter without an email field is addressed
    // correctly when it becomes an email attachment.
    if (message.letter && !letter.recipient.email) letter.recipient.email=to;
    return {to,letter};
  });
}

/**
 * Deliver one message. Returns `true` on success, `false` on any failure or when
 * email is not configured. Never throws — callers stay simple and resilient.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  try {
    const results = await sendMailWithLetter(message);
    return results.every(result => result.status === 'accepted');
  } catch (error) {
    logger.error('Email send failed', {
      subject: message.subject,
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** All application email goes through this attachment-enforcing boundary. */
export async function sendMailWithLetter(message: MailMessage, saved?: PreparedAttachment): Promise<DeliveryRecord[]> {
  const transport = getTransport();
  if (!transport) return [{status:'not_configured',fingerprint:''}];
  const from = message.from || mailFrom();
  const key = message.deliveryKey || randomUUID();
  const results: DeliveryRecord[] = [];
  const db = getFirestore();
  const store: DeliveryStore = {
    claim: (id,fingerprint) => db.runTransaction(async tx => {
      const ref = db.doc(`_correspondenceDelivery/${id}`), snap = await tx.get(ref);
      if (snap.exists && (snap.get('fingerprint') !== fingerprint || snap.get('status') !== 'preparation_failed')) return false;
      tx.set(ref,{status:'preparing',fingerprint,updatedAt:new Date().toISOString()}); return true;
    }),
    get: async id => (await db.doc(`_correspondenceDelivery/${id}`).get()).data() as DeliveryRecord,
    set: async (id,record) => { await db.doc(`_correspondenceDelivery/${id}`).update({...record,updatedAt:new Date().toISOString()}); },
    archive: async (id,pdf,filename) => {
      const path = `correspondence/system/${id}/${sha256(pdf)}/${filename}.pdf`;
      await getStorage().bucket().file(path).save(pdf,{resumable:false,contentType:'application/pdf',preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, no-store'}}).catch(async error => {
        if (Number(error.code) !== 412) throw error;
        const [existing] = await getStorage().bucket().file(path).download(); if (sha256(existing) !== sha256(pdf)) throw error;
      });
      return path;
    },
  };
  const letters = correspondenceLetters(message,from);
  // Preflight the entire bulk batch before the first send, keeping every
  // recipient's attachment distinct and avoiding partial sends on render failure.
  const prepared = new Map<string,PreparedAttachment>();
  for (const {to,letter} of letters) prepared.set(to,saved || {pdf:await renderLetterPdf(letter)});
  for (const {to,letter} of letters) {
    const id = createHash('sha256').update(`${key}:${to}`).digest('hex');
    // Date is omitted for automatic emails so a next-day retry has the same fingerprint.
    const fingerprint = createHash('sha256').update(JSON.stringify({to,from,replyTo:message.replyTo,subject:message.subject,text:message.text,html:message.html,letter:message.letter ? letterVersion(letter) : {...letter,date:''}})).digest('hex');
    results.push(await deliverLetterEmail({id,fingerprint,store,email:{to,from,subject:message.subject,text:message.text,html:message.html,replyTo:message.replyTo,letter,filename:letterFilename(letter)},
      prepare: async () => prepared.get(to)!,
      transport: async (email,pdf,messageId) => {
        const info = await transport.sendMail(letterMailOptions(email,pdf,messageId));
        if (!info.accepted?.length || info.rejected?.length) throw new Error('SMTP did not confirm acceptance.');
      },
    }));
  }
  return results;
}

/** Authenticate against the relay without sending mail. Used by health checks. */
export async function verifyTransport(): Promise<boolean> {
  const transport = getTransport();
  if (!transport) return false;
  try {
    await transport.verify();
    return true;
  } catch (error) {
    logger.error('SMTP verification failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
