import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { applicationDefault } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Kawuri — the assistant behind the Learn tab's floating button.
 *
 * Runs on **Vertex AI**, reached with the function's own Application Default
 * Credentials. There is no API key anywhere in this codebase or in Secret
 * Manager: the deployed service account is the credential, so there is nothing
 * to rotate, nothing to leak, and nothing a contributor has to be handed before
 * they can run the backend.
 *
 * Two things still have to be true on the project:
 *   1. `aiplatform.googleapis.com` is enabled.
 *   2. The functions runtime service account can call it
 *      (`roles/aiplatform.user`; the default compute service account's Editor
 *      role already covers this).
 *
 * When either is missing the callable returns `{ configured: false }` rather
 * than an error, and the app falls back to its on-device guide — so a fresh
 * checkout and the emulator suite both behave sensibly with no setup at all.
 */

const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/** Turns accepted from the client. Older context is dropped by the app. */
const MAX_TURNS = 12;
const MAX_CHARS_PER_TURN = 4000;

/** Requests per member per minute. Generous for a person, useless for a script. */
const RATE_LIMIT_PER_MINUTE = 20;

const MODEL = process.env.KAWURI_MODEL || 'gemini-2.5-flash';

/**
 * Vertex region. Kept separate from the functions region so the model can be
 * moved without redeploying anything else.
 */
const LOCATION = process.env.KAWURI_LOCATION || 'us-central1';

/** Hard ceiling on one answer, so a runaway generation cannot bill forever. */
const MAX_OUTPUT_TOKENS = 1200;

const SYSTEM_INSTRUCTION = `You are Kawuri, the guide inside Indigen World — a
platform for keeping living languages and cultures alive, starting with Kasem
and the Kasena people of the Upper East Region of Ghana and southern Burkina
Faso (Navrongo, Paga, Chiana and the towns around them).

Who you are talking to: members of the Kasena community at home and in the
diaspora, and respectful visitors learning about the culture. Some are elders.
Some are teenagers. Write for all of them.

How you answer:
- Warm, direct, unhurried. Short paragraphs. No corporate filler, no emoji.
- Plain text only. For structure use a short heading line, then "• " bullets or
  "1. " numbered steps. Never use markdown symbols like ** or ##.
- Lead with the answer. Context after, if it earns its place.
- Aim for under 200 words unless the person asks for depth.

What you must not do:
- Never invent Kasem words, spellings, translations or proverbs. Language in
  this project is confirmed by appointed speakers before it counts as guidance,
  and a confident guess is worse than no answer — it gets copied, taught and
  repeated. If you are not certain a form is attested, say so plainly and point
  the person at the in-app dictionary, at the Community tab, or at contributing
  the word once they have learned it from a speaker.
- Never present contested cultural practice as settled fact. Practice varies by
  town, clan and family; say which variation you mean, or say that it varies.
- Never speak for the Kasena as a single voice. You are a guide, not an
  authority on anyone's own culture.
- Do not answer questions about individual members, their accounts or their
  private data.

What you know about the app:
- Explore is the vertical feed of published cultural reels. Anyone with an
  account can publish there from TribeStudio without verification or approval;
  they must hold the rights to the work and have the consent of anyone in it.
  Campaigns are the exception. They are managed separately in TribeStudio, so
  campaign entries are reviewed and are open to approved creators.
- Learn is the Kasem lesson path. Its content in the current build is a preview
  and is not yet validated guidance.
- Community is the Kasem-only feed: posts, replies, follows, saved posts.
  Taking part needs an account and a community handle.
- Collection holds saved words, places, songs and symbols.
- Contribute is where a member submits a word or a correction. Appointed
  validators review it before it joins the collection.
- Notifications live behind the bell on the Community tab.

If somebody asks something you genuinely cannot answer, say what you do not
know, then name the one next step that would actually get them the answer.`;

export interface Turn {
  role: 'user' | 'model';
  text: string;
}

/** What a model call produced, or why it produced nothing. */
export interface KawuriAnswer {
  /** False when Vertex AI is unreachable for this deployment rather than for
   * this request — the caller should fall back rather than apologise. */
  configured: boolean;
  reply: string;
}

/** Validates and trims the conversation the client sent. */
export function normaliseTurns(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns: Turn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text.trim().slice(0, MAX_CHARS_PER_TURN) : '';
    if (!text) continue;
    turns.push({ role: record.role === 'model' ? 'model' : 'user', text });
  }
  // Keep the tail: the most recent turns are the ones that carry the thread.
  const tail = turns.slice(-MAX_TURNS);
  // Gemini rejects a history that does not end on a user turn, and there is
  // nothing to answer in that case anyway.
  while (tail.length > 0 && tail[tail.length - 1].role !== 'user') tail.pop();
  return tail;
}

/** The project the function is deployed into. */
export function projectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT ||
    ''
  );
}

/**
 * A cached OAuth access token for the runtime service account.
 *
 * Tokens last about an hour. Minting one per request would add a round trip to
 * every question a member asks, so it is reused until shortly before it
 * expires — the 60-second margin keeps a token from being handed out and then
 * rejected mid-flight.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const credential = applicationDefault();
  const token = await credential.getAccessToken();
  cachedToken = {
    value: token.access_token,
    expiresAt: now + Math.max(0, (token.expires_in - 60)) * 1000,
  };
  return cachedToken.value;
}

/** Pulls the answer text out of a `generateContent` response. */
export function replyFromGemini(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const content = (candidates[0] as Record<string, unknown>)?.content;
  const parts = content && typeof content === 'object'
    ? (content as Record<string, unknown>).parts
    : undefined;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : ''))
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim();
}

/** The Vertex AI `generateContent` endpoint for this project and model. */
export function vertexEndpoint(project: string): string {
  return (
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`
  );
}

/**
 * One turn of Kawuri, as a plain function.
 *
 * Extracted from the callable so the community trigger that answers an
 * `@kawuri` mention speaks with exactly the same voice and the same
 * guardrails. Two copies of a system instruction is two sets of rules about
 * inventing Kasem words, and only one of them would get updated.
 *
 * [extraInstruction] is appended to the shared instruction — the trigger uses
 * it to explain that the answer is a public reply in somebody's thread rather
 * than a private chat.
 */
export async function askKawuri(
  turns: Turn[],
  extraInstruction?: string,
): Promise<KawuriAnswer> {
  if (turns.length === 0) return { configured: true, reply: '' };

  const project = projectId();
  if (!project) return { configured: false, reply: '' };

  const instruction = extraInstruction
    ? `${SYSTEM_INSTRUCTION}

${extraInstruction}`
    : SYSTEM_INSTRUCTION;

  try {
    const response = await fetch(vertexEndpoint(project), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    });

    if (!response.ok) {
      // 403 here almost always means the Vertex AI API is not enabled, or the
      // runtime service account lacks roles/aiplatform.user. Both are a
      // deployment state rather than a fault the member caused, so hand back
      // "not configured" and let the caller use its fallback.
      if (response.status === 403 || response.status === 404) {
        logger.warn('Vertex AI is not available to this deployment', {
          status: response.status,
          location: LOCATION,
          model: MODEL,
        });
        return { configured: false, reply: '' };
      }
      // Log the status, never the member's question.
      logger.error('Kawuri model call failed', { status: response.status });
      return { configured: true, reply: '' };
    }

    return { configured: true, reply: replyFromGemini(await response.json()) };
  } catch (error) {
    logger.error('Kawuri request threw', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return { configured: false, reply: '' };
  }
}

export const kawuriChat = onCall(
  {
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    region: 'us-central1',
    timeoutSeconds: 60,
  },
  async (req) => {
    // Deliberately open to guests: Kawuri sits on the Learn tab, which works
    // without an account, and forcing a sign-in to ask a question would be a
    // poor trade. Anonymous callers are rate-limited by App Check instance id
    // where available, and share a bucket otherwise.
    const actor = req.auth?.uid ?? req.app?.appId ?? 'anonymous';
    await consumeRateLimit('kawuriChat', actor, RATE_LIMIT_PER_MINUTE);

    const turns = normaliseTurns((req.data as Record<string, unknown> | undefined)?.messages);
    if (turns.length === 0) {
      throw new HttpsError('invalid-argument', 'Ask a question first.');
    }

    const answer = await askKawuri(turns);
    if (!answer.configured) return answer;
    if (!answer.reply) {
      // A blocked or empty generation. Say so rather than returning silence.
      return {
        configured: true,
        reply:
          'I could not put an answer together for that one. Try asking it a '
          + 'different way, or ask me something else.',
      };
    }
    return answer;
  },
);
