import { useCallback, useEffect, useState } from 'react';
import { fetchStudioVideoCapabilities, refreshStudioVideoJob, type StudioVideoCapabilities } from '../data';
import { planAiScene, referenceFor, startAiScene, type AiConsent } from './ai';
import { addAiMedia, errorMessage } from './api';
import { patchScene, type Scene } from './model';
import type { EditorApi } from './useEditor';

/**
 * AI pictures for scenes, from asking to arriving.
 *
 * A generation is written onto its scene the moment the job exists, so a
 * member who leaves and comes back finds the scene still waiting on the same
 * job rather than a second one being paid for. While any scene waits, the job
 * is advanced every twelve seconds; the finished video becomes project media
 * and the scene's picture. A failure stays on the scene with the provider's
 * reason and a Try again — which starts a new attempt, deliberately, since the
 * same request would fail the same way.
 */
export function useAiScenes(editor: EditorApi, projectId: string, enabled: boolean) {
  const [caps, setCaps] = useState<StudioVideoCapabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const project = editor.project;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchStudioVideoCapabilities()
      .then((c) => { if (active) setCaps(c); })
      .catch((e) => { if (active) setCapsError(errorMessage(e, 'AI video is not available right now.')); });
    return () => { active = false; };
  }, [enabled]);

  const pending = (project?.timeline.scenes ?? []).filter((s) => s.generation && (s.generation.status === 'queued' || s.generation.status === 'running'));
  const pendingKey = pending.map((s) => `${s.id}:${s.generation!.jobId}`).join('|');

  useEffect(() => {
    if (!pendingKey || !enabled) return;
    let active = true;
    const advance = async () => {
      for (const scene of pending) {
        const gen = scene.generation!;
        try {
          const job = await refreshStudioVideoJob(gen.jobId);
          if (!active) return;
          if (job.status === 'SUCCEEDED' && job.outputStoragePath) {
            const media = await addAiMedia(projectId, { id: job.id, outputStoragePath: job.outputStoragePath, durationSec: scene.duration, prompt: gen.prompt });
            editor.apply(patchScene(scene.id, { media: { kind: 'video', mediaId: media.id }, sourceIn: 0, generation: { ...gen, status: 'succeeded', error: null } }));
          } else if (job.status === 'FAILED' || job.status === 'CANCELLED') {
            editor.apply(patchScene(scene.id, { generation: { ...gen, status: 'failed', error: job.failureReason || 'The video could not be made.' } }));
          } else if (job.status === 'RUNNING' && gen.status !== 'running') {
            editor.apply(patchScene(scene.id, { generation: { ...gen, status: 'running' } }));
          }
        } catch {
          // A missed poll is not a failure; the next one will try again.
        }
      }
    };
    const timer = window.setInterval(() => void advance(), 12_000);
    void advance();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // The pending list is keyed by pendingKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, enabled, projectId]);

  const generate = useCallback(async (scene: Scene, consent: AiConsent): Promise<string | null> => {
    if (!project || !caps) return 'AI video is not available right now.';
    const plan = planAiScene(caps, scene, project.aspect, Boolean(referenceFor(scene, project)));
    if (!plan) return 'No AI video model is available for this scene. Add a reference image in Continuity, or upload a clip.';
    setStarting((s) => new Set(s).add(scene.id));
    try {
      const attempt = (scene.generation?.attempt ?? 0) + 1;
      const job = await startAiScene({ scene, project, plan, consent, attempt });
      editor.apply(patchScene(scene.id, {
        fit: project.aspect === '1:1' ? 'cover' : scene.fit,
        generation: { jobId: job.id, status: job.status === 'RUNNING' ? 'running' : 'queued', prompt: scene.plan.visual || scene.title, error: null, attempt, estimateUsd: plan.estimateUsd },
      }));
      return null;
    } catch (e) {
      return errorMessage(e, 'The AI video could not be started.');
    } finally {
      setStarting((s) => {
        const next = new Set(s);
        next.delete(scene.id);
        return next;
      });
    }
  }, [caps, editor, project]);

  return { caps, capsError, generate, starting };
}
