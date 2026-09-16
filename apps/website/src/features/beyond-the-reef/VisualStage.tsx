/**
 * The film behind the lyrics.
 *
 * The stage renders only the shot on screen, the one fading out beneath it and
 * the one coming next — so at most three stills and three clips exist at once,
 * and a clip is only fetched when its shot is current or next. On every clock
 * tick each rendered layer is given its opacity, drift and clip position for
 * the song's current time; clips are nudged back into place only when they
 * drift noticeably, so they play smoothly instead of being scrubbed every frame.
 *
 * When motion is reduced, clips are not played at all: each shot shows its
 * still, and shots change with a short crossfade and no drift.
 *
 * A seek can land on a shot whose still has not downloaded yet. Until it has,
 * the last shot that was fully on screen stays beneath it, frozen, so a long
 * jump shows the previous picture for a moment instead of an empty stage.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SongClock } from "./useSongPlayer";
import type { Shot } from "./types";
import { DEFAULT_FADE_SECONDS, activeShotIndex, shotFrame } from "./timeline";

interface VisualStageProps {
  shots: readonly Shot[];
  clock: SongClock;
  playing: boolean;
  reducedMotion: boolean;
}

/** A clip further than this from where the song says it should be is re-seeked. */
const DRIFT_TOLERANCE = 0.35;

interface Layer {
  root: HTMLDivElement | null;
  video: HTMLVideoElement | null;
  hold: HTMLImageElement | null;
  blocked: boolean;
}

export function VisualStage({ shots, clock, playing, reducedMotion }: VisualStageProps) {
  const layers = useRef(new Map<string, Layer>());
  const playingRef = useRef(playing);
  const [current, setCurrent] = useState(() => activeShotIndex(shots, clock.now()));
  const [outgoingVisible, setOutgoingVisible] = useState(false);
  const [backdrop, setBackdrop] = useState<number | null>(null);
  const rendered = useRef({ current, outgoingVisible, backdrop });
  const loadedImages = useRef(new Set<string>());
  const settled = useRef(current);

  const layerFor = useCallback((id: string): Layer => {
    let layer = layers.current.get(id);
    if (!layer) {
      layer = { root: null, video: null, hold: null, blocked: false };
      layers.current.set(id, layer);
    }
    return layer;
  }, []);

  const paint = useCallback(
    (time: number) => {
      const index = activeShotIndex(shots, time);
      const shot = shots[index];
      const outgoing = index > 0 && time < shot.start + (shot.fade ?? DEFAULT_FADE_SECONDS) + 0.05;
      const ready = loadedImages.current.has(shot.id);
      if (ready && shotFrame(shot, time, reducedMotion).opacity >= 0.999) settled.current = index;
      const neighbour = settled.current >= index - 1 && settled.current <= index + 1;
      const hold = !ready && !neighbour ? settled.current : null;
      if (
        rendered.current.current !== index ||
        rendered.current.outgoingVisible !== outgoing ||
        rendered.current.backdrop !== hold
      ) {
        rendered.current = { current: index, outgoingVisible: outgoing, backdrop: hold };
        setCurrent(index);
        setOutgoingVisible(outgoing);
        setBackdrop(hold);
      }

      for (let i = Math.max(0, index - 1); i <= Math.min(shots.length - 1, index + 1); i += 1) {
        const candidate = shots[i];
        const layer = layers.current.get(candidate.id);
        if (!layer?.root) continue;
        const frame = shotFrame(candidate, time, reducedMotion);
        layer.root.style.opacity = frame.opacity.toFixed(3);
        layer.root.style.transform = `translate3d(${frame.x.toFixed(3)}%, ${frame.y.toFixed(3)}%, 0) scale(${frame.scale.toFixed(4)})`;

        const video = layer.video;
        if (layer.hold) layer.hold.style.opacity = frame.holding ? "1" : "0";
        if (!video || frame.clipTime === null) continue;

        const onScreen = i >= index - 1 && time >= candidate.start - 0.05;
        const target = time < candidate.start ? candidate.clipFrom ?? 0 : frame.clipTime;
        if (video.playbackRate !== (candidate.rate ?? 1)) video.playbackRate = candidate.rate ?? 1;

        if (frame.holding || !onScreen || !playingRef.current || layer.blocked) {
          if (!video.paused) video.pause();
          if (!frame.holding && !video.seeking && video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.08) {
            video.currentTime = target;
          }
          continue;
        }
        if (!video.seeking && video.readyState >= 1 && Math.abs(video.currentTime - target) > DRIFT_TOLERANCE) {
          video.currentTime = target;
        }
        if (video.paused) {
          video.play().catch((error: DOMException) => {
            // Low-power modes can refuse even muted inline playback; the still
            // beneath the clip carries the shot instead. An interrupted play()
            // (a pause right after it) is not a refusal and changes nothing.
            if (error?.name !== "NotAllowedError") return;
            layer.blocked = true;
            video.style.visibility = "hidden";
          });
        }
      }
    },
    [shots, reducedMotion]
  );

  useEffect(() => {
    playingRef.current = playing;
    paint(clock.now());
  }, [playing, paint, clock]);

  useEffect(() => clock.subscribe(paint), [clock, paint]);

  // Layers mounted by a shot change start transparent; style them straight
  // away, or a seek while paused would leave the new shot invisible until the
  // next tick — and a paused song has no next tick.
  useLayoutEffect(() => {
    paint(clock.now());
  }, [current, outgoingVisible, backdrop, paint, clock]);

  const first = Math.max(0, current - (outgoingVisible ? 1 : 0));
  const visible = shots.slice(first, Math.min(shots.length, current + 2));
  if (backdrop !== null && shots[backdrop]) visible.unshift(shots[backdrop]);

  return (
    <div className="btr-stage" aria-hidden="true">
      {visible.map((shot) => {
        const layer = layerFor(shot.id);
        const index = shots.indexOf(shot);
        const isBackdrop = index === backdrop;
        return (
          <div
            key={shot.id}
            className="btr-shot"
            // A backdrop keeps the opacity and framing it last had, beneath everything.
            style={isBackdrop ? { zIndex: 0 } : { zIndex: index + 1, opacity: 0 }}
            ref={(element) => {
              layer.root = element;
            }}
          >
            <img
              className="btr-shot__media"
              src={shot.image}
              alt=""
              decoding="async"
              style={shot.focus ? { objectPosition: shot.focus } : undefined}
              onLoad={() => {
                loadedImages.current.add(shot.id);
                paint(clock.now());
              }}
            />
            {shot.clip && !reducedMotion && !isBackdrop ? (
              <video
                className="btr-shot__media"
                ref={(element) => {
                  layer.video = element;
                  if (!element) layer.blocked = false;
                }}
                muted
                playsInline
                preload="auto"
                poster={shot.image}
                disablePictureInPicture
                disableRemotePlayback
                style={shot.focus ? { objectPosition: shot.focus } : undefined}
                onLoadedMetadata={() => paint(clock.now())}
              >
                <source src={shot.clip.webm} type="video/webm" />
                <source src={shot.clip.mp4} type="video/mp4" />
              </video>
            ) : null}
            {shot.hold && !reducedMotion ? (
              <img
                className="btr-shot__media btr-shot__hold"
                ref={(element) => {
                  layer.hold = element;
                }}
                src={shot.hold}
                alt=""
                decoding="async"
                style={{ opacity: 0, ...(shot.focus ? { objectPosition: shot.focus } : {}) }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
