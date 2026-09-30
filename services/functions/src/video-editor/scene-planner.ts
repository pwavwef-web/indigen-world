/**
 * Turning a prompt or a script into a scene plan.
 *
 * ── The script is the creator's ──────────────────────────────────────────────
 * From a prompt, the model proposes everything: scenes, what each shows, a
 * narration line, a short caption, a transition. From a script, it only
 * decides where the scene breaks go and what each scene shows — the words are
 * the creator's and must come back unchanged. That is checked word for word;
 * a plan that rewords the script is thrown away and the script is split
 * deterministically instead.
 *
 * ── No invented Kasem ───────────────────────────────────────────────────────
 * The model is told to write narration and captions only in English, or in
 * the words it was given. A plan never contains Kasem the creator did not
 * write, because a plausible-looking invented line is exactly what gets
 * recorded, published and repeated.
 */

export const PLAN_TRANSITIONS = ['cut', 'fade', 'flash', 'slide', 'wipe'] as const;
export const CONTINUITY_KINDS = ['character', 'location', 'object', 'brand'] as const;

export interface PlannedScene {
  title: string;
  visual: string;
  narration: string;
  caption: string;
  durationSec: number;
  transition: (typeof PLAN_TRANSITIONS)[number];
}

export interface ScenePlan {
  title: string;
  scenes: PlannedScene[];
  musicMoods: string[];
  continuity: { name: string; kind: (typeof CONTINUITY_KINDS)[number]; description: string }[];
  method: 'model' | 'script-split';
}

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Two to five words naming the scene.' },
          visual: { type: 'string', description: 'What the picture shows, concretely enough to film or generate: subject, setting, action, framing.' },
          narration: { type: 'string', description: 'What is spoken over this scene. From a script: the exact consecutive words of the script, unchanged.' },
          caption: { type: 'string', description: 'Short on-screen text, at most eight words, or empty.' },
          durationSec: { type: 'number' },
          transition: { type: 'string', enum: [...PLAN_TRANSITIONS] },
        },
        required: ['title', 'visual', 'narration', 'caption', 'durationSec', 'transition'],
      },
    },
    musicMoods: { type: 'array', items: { type: 'string' } },
    continuity: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: [...CONTINUITY_KINDS] },
          description: { type: 'string', description: 'How it looks, so every scene shows it the same way.' },
        },
        required: ['name', 'kind', 'description'],
      },
    },
  },
  required: ['title', 'scenes', 'musicMoods', 'continuity'],
} as const;

export function planInstruction(source: 'prompt' | 'script', aspect: string, targetSeconds: number, moods: readonly string[]): string {
  return [
    'You plan short videos for Indigen World, a platform for Kasem language and culture from northern Ghana and southern Burkina Faso.',
    `Plan a ${aspect} video of about ${targetSeconds} seconds as a list of scenes in order.`,
    source === 'script'
      ? 'You are given a script. Split it into scenes at natural pauses. Each scene\'s narration must be the next consecutive words of the script, exactly as written — never reword, translate, shorten, add or drop anything. Every word of the script appears once, in order.'
      : 'You are given an idea. Write the scenes, a short narration line for each and an optional short caption.',
    'Write narration and captions only in English, or only with words you were given. Never write words in Kasem or any other language you were not given, even as an example.',
    'Each scene lasts 2 to 12 seconds; allow about 2.5 spoken words per second plus a moment of breathing room.',
    'The visual says what to film or generate: subject, setting, action and framing. People are adults unless the idea says otherwise. No logos, brands or real public figures unless the idea names them.',
    'List recurring characters, locations, objects or branding in continuity with a description of how they look, so every scene can show them the same way.',
    `Suggest up to three music moods from this list: ${moods.join(', ')}.`,
    'Use cut for most joins; use fade, flash, slide or wipe only where a change of time, place or mood deserves it.',
  ].join('\n');
}

const words = (text: string) => text.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s'’-]/gu, ' ').split(/\s+/).filter(Boolean);

/** True when the scenes' narration is the script, word for word, in order. */
export function narrationMatchesScript(scenes: { narration: string }[], script: string): boolean {
  const planned = words(scenes.map((s) => s.narration).join(' '));
  const original = words(script);
  return planned.length === original.length && planned.every((w, i) => w === original[i]);
}

/** Seconds a line takes to say at an unhurried pace, plus room to breathe. */
export function speakingSeconds(text: string): number {
  return Math.min(12, Math.max(2.5, words(text).length / 2.5 + 0.8));
}

/**
 * The deterministic plan: the script split at paragraph and sentence breaks
 * into scenes of about [maxWords] words, each timed by how long it takes to say.
 */
export function splitScript(script: string, maxWords = 22): PlannedScene[] {
  const chunks: string[] = [];
  for (const paragraph of script.replace(/\r/g, '').split(/\n\s*\n|\n/)) {
    const sentences = paragraph.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    let current = '';
    for (const sentence of sentences) {
      const joined = current ? `${current} ${sentence}` : sentence;
      if (current && words(joined).length > maxWords) {
        chunks.push(current);
        current = sentence;
      } else {
        current = joined;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.map((narration, i) => ({
    title: `Scene ${i + 1}`,
    visual: '',
    narration,
    caption: '',
    durationSec: Math.round(speakingSeconds(narration) * 10) / 10,
    transition: 'cut' as const,
  }));
}

const clip = (text: unknown, max: number) => (typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Cleans a model reply into a plan, or returns null when it is unusable. */
export function readPlan(raw: Record<string, unknown> | null, opts: { source: 'prompt' | 'script'; script: string; moods: readonly string[] }): ScenePlan | null {
  if (!raw || !Array.isArray(raw.scenes) || raw.scenes.length === 0) return null;
  const scenes: PlannedScene[] = (raw.scenes as Record<string, unknown>[]).slice(0, 40).map((s, i) => ({
    title: clip(s.title, 60) || `Scene ${i + 1}`,
    visual: clip(s.visual, 600),
    narration: opts.source === 'script' ? (typeof s.narration === 'string' ? s.narration.trim() : '') : clip(s.narration, 400),
    caption: clip(s.caption, 80),
    durationSec: Math.min(12, Math.max(2, Number(s.durationSec) || speakingSeconds(String(s.narration ?? '')))),
    transition: (PLAN_TRANSITIONS as readonly string[]).includes(String(s.transition)) ? (s.transition as PlannedScene['transition']) : 'cut',
  }));
  if (opts.source === 'script' && !narrationMatchesScript(scenes, opts.script)) return null;
  const moods = Array.isArray(raw.musicMoods) ? (raw.musicMoods as unknown[]).map((m) => String(m).toLowerCase().trim()).filter((m) => opts.moods.includes(m)).slice(0, 3) : [];
  const continuity = Array.isArray(raw.continuity)
    ? (raw.continuity as Record<string, unknown>[]).slice(0, 12).map((c) => ({
        name: clip(c.name, 60),
        kind: (CONTINUITY_KINDS as readonly string[]).includes(String(c.kind)) ? (c.kind as ScenePlan['continuity'][number]['kind']) : 'object',
        description: clip(c.description, 400),
      })).filter((c) => c.name && c.description)
    : [];
  return { title: clip(raw.title, 80) || 'Untitled video', scenes, musicMoods: moods, continuity, method: 'model' };
}
