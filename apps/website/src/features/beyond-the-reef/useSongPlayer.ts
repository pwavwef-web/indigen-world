/**
 * The song's player: one <audio> element and the clock everything else reads.
 *
 * The audio element's `currentTime` is the only source of truth for position.
 * Lyrics and visuals subscribe to `clock` and are handed that position on every
 * animation frame while the song plays, and once more after any pause, seek or
 * restart — so nothing on the page can run ahead of, or behind, the sound.
 *
 * Between two of the browser's own `currentTime` updates the clock extrapolates
 * by the frame time (capped at 200 ms), which keeps motion smooth in browsers
 * that update the position in coarse steps; it re-anchors to the real value the
 * moment that value moves.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "./timeline";

export type PlayerStatus = "idle" | "playing" | "paused" | "ended";

export interface SongClock {
  now(): number;
  subscribe(listener: (time: number) => void): () => void;
}

const VOLUME_KEY = "beyond-the-reef:volume";

function readStoredVolume(): number {
  try {
    const stored = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored > 0 && stored <= 1 ? stored : 0.9;
  } catch {
    return 0.9;
  }
}

function storeVolume(value: number): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(value));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the
    // volume simply is not remembered.
  }
}

export function useSongPlayer(fallbackDuration: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listeners = useRef(new Set<(time: number) => void>());
  const position = useRef(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState(fallbackDuration);
  const [volume, setVolumeState] = useState(readStoredVolume);
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emit = useCallback((time: number) => {
    position.current = time;
    for (const listener of listeners.current) listener(time);
  }, []);

  const clock = useMemo<SongClock>(
    () => ({
      now: () => position.current,
      subscribe(listener) {
        listeners.current.add(listener);
        listener(position.current);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
    []
  );

  // Frame loop while playing.
  useEffect(() => {
    if (status !== "playing") return;
    const audio = audioRef.current;
    if (!audio) return;
    let frame = 0;
    let reported = audio.currentTime;
    let reportedAt = performance.now();
    const tick = (now: number) => {
      const current = audio.currentTime;
      let estimate = current;
      if (current !== reported) {
        reported = current;
        reportedAt = now;
      } else if (!audio.paused && !audio.seeking && audio.readyState >= 3) {
        estimate = current + Math.min(0.2, (now - reportedAt) / 1000) * audio.playbackRate;
      }
      emit(estimate);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, emit]);

  // Element events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    const syncOnce = () => emit(audio.currentTime);
    const onDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onPlay = () => {
      setStatus("playing");
      setError(null);
    };
    const onPause = () => {
      if (!audio.ended) setStatus("paused");
      syncOnce();
    };
    const onEnded = () => {
      setStatus("ended");
      setBuffering(false);
      emit(audio.duration || audio.currentTime);
    };
    const onSeeking = () => {
      syncOnce();
      setStatus((current) => (current === "ended" ? "paused" : current));
    };
    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    const onVolume = () => {
      setVolumeState(audio.volume);
      setMuted(audio.muted);
    };
    const onError = () => {
      setBuffering(false);
      setStatus((current) => (current === "playing" ? "paused" : current));
      setError("The song could not be loaded. Check your connection and try again.");
    };

    const handlers: [string, EventListener][] = [
      ["loadedmetadata", onDuration],
      ["durationchange", onDuration],
      ["play", onPlay],
      ["pause", onPause],
      ["ended", onEnded],
      ["seeking", onSeeking],
      ["seeked", syncOnce],
      ["timeupdate", () => audio.paused && syncOnce()],
      ["waiting", onWaiting],
      ["stalled", onWaiting],
      ["playing", onReady],
      ["canplay", onReady],
      ["volumechange", onVolume],
      ["error", onError],
    ];
    for (const [name, handler] of handlers) audio.addEventListener(name, handler);
    onDuration();
    return () => {
      for (const [name, handler] of handlers) audio.removeEventListener(name, handler);
    };
    // Volume is applied once on mount; later changes go through setVolume.
  }, [emit]);

  const play = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;
    if (audio.ended) audio.currentTime = 0;
    try {
      setStarted(true);
      await audio.play();
      return true;
    } catch (cause) {
      if ((cause as DOMException)?.name === "AbortError") return false;
      setError(
        (cause as DOMException)?.name === "NotAllowedError"
          ? "Your browser blocked playback. Press play to start the song."
          : "The song could not start. Check your connection and try again."
      );
      return false;
    }
  }, []);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const end = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      audio.currentTime = clamp(seconds, 0, Math.max(0, end - 0.05));
      emit(audio.currentTime);
    },
    [duration, emit]
  );

  const seekBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (audio) seek(audio.currentTime + delta);
  }, [seek]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused || audio.ended) void play();
    else audio.pause();
  }, [play]);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    emit(0);
    void play();
  }, [emit, play]);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    const next = clamp(value, 0, 1);
    if (audio) {
      audio.volume = next;
      audio.muted = next === 0;
    }
    if (next > 0) storeVolume(next);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.muted || audio.volume === 0) {
      audio.muted = false;
      if (audio.volume === 0) audio.volume = readStoredVolume();
    } else {
      audio.muted = true;
    }
  }, []);

  return {
    audioRef,
    clock,
    status,
    started,
    duration,
    volume,
    muted,
    buffering,
    error,
    play,
    pause,
    toggle,
    seek,
    seekBy,
    replay,
    setVolume,
    toggleMute,
  };
}

export type SongPlayer = ReturnType<typeof useSongPlayer>;
