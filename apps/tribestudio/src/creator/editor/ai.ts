import { createStudioVideoJob, type StudioVideoCapabilities, type StudioVideoGovernanceInput, type StudioVideoJob, type StudioVideoModelCapability } from '../data';
import type { Aspect, ContinuityElement, EditorProject, Scene } from './model';

/**
 * Making one scene's picture with the Studio's AI video.
 *
 * It goes through the same callable, consent statements, spending limits and
 * job records as the AI Video page — the editor adds no second route to a
 * provider. What it adds is the scene: its planned visual, its length, the
 * project's shape, and the continuity notes for whatever recurs in it, so a
 * person, a place or a logo is described the same way in every scene that
 * shows it (and, where the member gave one, shown to the model as a picture).
 */

export const AI_CONSENT_VERSION = 'studio-video-r1-2026-09-01';

export interface AiConsent {
  governance: StudioVideoGovernanceInput;
  dialect: string;
  confirmedAt: string;
}

type Ratio = '1280:720' | '720:1280' | '960:960';

export interface AiScenePlan {
  model: StudioVideoModelCapability;
  durationSeconds: number;
  ratio: Ratio;
  estimateUsd: number;
  /** Said to the member when the model cannot make the project's shape. */
  note: string | null;
}

const WANT: Record<Aspect, Ratio> = { '9:16': '720:1280', '16:9': '1280:720', '1:1': '960:960' };

/** The model, length and shape a scene would be generated with, and its price. */
export function planAiScene(caps: StudioVideoCapabilities, scene: Scene, aspect: Aspect, hasReference: boolean): AiScenePlan | null {
  const models = caps.operations.find((o) => o.operation === 'generate_visual')?.models ?? [];
  const usable = models.filter((m) => hasReference || !m.requiresReferenceImage);
  // The Studio's own default: Gemini where it is offered.
  const model = usable.find((m) => m.provider === 'gemini') ?? usable[0];
  if (!model) return null;
  const durations = [...(model.durationsSeconds ?? caps.limits.durationsSeconds)].sort((a, b) => a - b);
  const durationSeconds = durations.find((d) => d >= scene.duration - 0.05) ?? durations[durations.length - 1]!;
  const ratios = ((hasReference ? model.imageRatios : model.textRatios) ?? caps.limits.ratios) as string[];
  let ratio = WANT[aspect];
  let note: string | null = null;
  if (!ratios.includes(ratio)) {
    ratio = ratios.includes('1280:720') ? '1280:720' : (ratios[0] as Ratio);
    note = 'This model does not make square video; it will make landscape and the scene will be cropped to square.';
  }
  if (durationSeconds < scene.duration - 0.05) {
    note = `${note ? `${note} ` : ''}The longest this model makes is ${durationSeconds} seconds; the last frame will be held for the rest of the scene.`;
  }
  return { model, durationSeconds, ratio, estimateUsd: Math.round(durationSeconds * model.estimatedUsdPerSecond * 100) / 100, note };
}

/** The elements a scene shows, plus any branding, which belongs in every scene. */
export function sceneElements(scene: Scene, continuity: ContinuityElement[]): ContinuityElement[] {
  return continuity.filter((e) => e.kind === 'brand' || scene.elements.includes(e.id));
}

/** The prompt for a scene, within the Studio's 1,000-character limit. */
export function composeScenePrompt(scene: Scene, project: EditorProject): string {
  const parts: string[] = [];
  parts.push((scene.plan.visual || scene.title || 'An establishing shot').trim());
  const elements = sceneElements(scene, project.continuity);
  if (elements.length) {
    parts.push(`Keep these exactly as described, as in the other scenes: ${elements.map((e) => `${e.name} (${e.kind}): ${e.description}`).join('; ')}.`);
  }
  parts.push('Natural, grounded look; no on-screen text or captions.');
  const prompt = parts.join(' ');
  return prompt.length > 1000 ? `${prompt.slice(0, 997)}...` : prompt;
}

export function referenceFor(scene: Scene, project: EditorProject): string | null {
  return sceneElements(scene, project.continuity).find((e) => e.referencePath)?.referencePath ?? null;
}

export async function startAiScene(input: {
  scene: Scene;
  project: EditorProject;
  plan: AiScenePlan;
  consent: AiConsent;
  attempt: number;
}): Promise<StudioVideoJob> {
  const { scene, project, plan, consent } = input;
  const reference = referenceFor(scene, project);
  return createStudioVideoJob({
    // Stable per scene and attempt: a double click, or a retry over a bad
    // connection, reaches the same job instead of paying for a second one.
    clientRequestId: `vx_${scene.id.replace(/[^A-Za-z0-9]/g, '')}_a${input.attempt}`.slice(0, 80),
    durationSeconds: plan.durationSeconds,
    governance: consent.governance,
    kasem: { languageCode: 'xsm', dialect: consent.dialect || 'Unspecified', transcript: '', validationRef: '' },
    operation: 'generate_visual',
    provider: plan.model.provider === 'gemini' ? 'gemini' : 'runway',
    model: plan.model.id,
    prompt: composeScenePrompt(scene, project),
    ratio: plan.ratio,
    referenceImageStoragePath: reference,
  });
}
