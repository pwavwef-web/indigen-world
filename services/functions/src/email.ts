import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

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
 * Email is always *best effort*: `sendMail` never throws and quietly no-ops when
 * no password is configured, so a mail outage can never fail a form submission,
 * a review decision, or the emulator test suite.
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
  replyTo?: string;
  /** Optional override; defaults to the operational team inbox. */
  from?: string;
}

/**
 * Deliver one message. Returns `true` on success, `false` on any failure or when
 * email is not configured. Never throws — callers stay simple and resilient.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    logger.info('Email skipped: SMTP is not configured', { subject: message.subject });
    return false;
  }
  try {
    const info = await transport.sendMail({
      from: message.from || mailFrom(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    });
    logger.info('Email sent', { messageId: info.messageId, subject: message.subject });
    return true;
  } catch (error) {
    logger.error('Email send failed', {
      subject: message.subject,
      errorType: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
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
