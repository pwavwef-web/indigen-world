/** Shared text-model defaults for Kawuri, Labs and community automation.
 * Media generation and transcription keep their own specialist models.
 */
export const DEFAULT_TEXT_MODEL = 'gemini-4-argon';
export const DEFAULT_TEXT_LOCATION = 'global';

export function readTextModelConfig(
  env: Record<string, string | undefined> = process.env,
  scope: 'KAWURI' | 'COMMUNITY_AUTOMATION' = 'KAWURI',
): { model: string; location: string } {
  return {
    model: env[`${scope}_MODEL`]?.trim() || DEFAULT_TEXT_MODEL,
    location: env[`${scope}_LOCATION`]?.trim() || DEFAULT_TEXT_LOCATION,
  };
}

/** The global API has no location prefix in its hostname. */
export function textModelEndpoint(project: string, model: string, location: string): string {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

export function isGemini4(model: string): boolean {
  return /^gemini-4(?:[.-]|$)/.test(model);
}
