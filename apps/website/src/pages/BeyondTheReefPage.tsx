/**
 * src/pages/BeyondTheReefPage.tsx
 *
 * "Beyond the Reef" — the song as an interactive music film.
 *
 * The page is a single full-screen stage (the route is `immersive`, so the
 * site header and footer step aside). The MP3 is the only clock: the visuals
 * behind (features/beyond-the-reef/VisualStage) and the rising lyrics in front
 * (LyricStream) are both redrawn from the audio element's position, so pausing,
 * seeking and restarting can never leave them out of step with the song.
 *
 * Nothing plays until the visitor chooses to begin. All imagery and footage was
 * generated in advance and ships as static files; visitors never touch an AI
 * service.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "../app/router";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";
import { ROUTES_BY_PATH } from "../content/navigation";
import { LyricStream } from "../features/beyond-the-reef/LyricStream";
import { PlayerControls } from "../features/beyond-the-reef/PlayerControls";
import { VisualStage } from "../features/beyond-the-reef/VisualStage";
import { LYRICS, SONG_DURATION } from "../features/beyond-the-reef/lyrics";
import { AUDIO_SOURCES, CHAPTERS, INTRO_MEDIA, MEDIA_ROOT, SHOTS } from "../features/beyond-the-reef/scenes";
import { lastStartedIndex, spokenTime } from "../features/beyond-the-reef/timeline";
import { usePrefersReducedMotion } from "../features/beyond-the-reef/usePrefersReducedMotion";
import { useSongPlayer } from "../features/beyond-the-reef/useSongPlayer";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const route = ROUTES_BY_PATH["beyond-the-reef"];
const IDLE_MS = 3200;
const STAGE_THEME_COLOR = "#030814";

/** Stanzas for the plain-text lyrics offered to assistive technology. */
const STANZAS = LYRICS.reduce<string[][]>((groups, line, index) => {
  if (index === 0 || LYRICS[index - 1].stanza !== line.stanza) groups.push([]);
  groups[groups.length - 1].push(line.text);
  return groups;
}, []);

function useStageThemeColor() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = STAGE_THEME_COLOR;
    return () => {
      meta.content = previous;
    };
  }, []);
}

function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

export function BeyondTheReefPage() {
  useDocumentMeta(route.title, route.description);
  useStageThemeColor();
  const reducedMotion = usePrefersReducedMotion();
  const player = useSongPlayer(SONG_DURATION);
  const { status, started, clock, duration } = player;
  const playing = status === "playing";
  const ended = status === "ended";

  const experienceRef = useRef<HTMLDivElement>(null);
  const beginRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const [chapter, setChapter] = useState(0);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [introFaded, setIntroFaded] = useState(false);
  const idleTimer = useRef(0);

  // The opening loop stops decoding once the opening screen has faded out.
  useEffect(() => {
    if (!started) return;
    const timer = window.setTimeout(() => setIntroFaded(true), 2000);
    return () => window.clearTimeout(timer);
  }, [started]);

  // Chapter caption follows the clock.
  useEffect(
    () =>
      clock.subscribe((time) => {
        setChapter(Math.max(0, lastStartedIndex(CHAPTERS, time)));
      }),
    [clock]
  );

  // Controls fade away while the film plays untouched, and return on any input.
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      const focusInControls = experienceRef.current?.querySelector(".btr-controls")?.contains(document.activeElement);
      if (!focusInControls) setIdle(true);
    }, IDLE_MS);
  }, []);

  useEffect(() => {
    if (!playing) {
      window.clearTimeout(idleTimer.current);
      setIdle(false);
      return;
    }
    wake();
    return () => window.clearTimeout(idleTimer.current);
  }, [playing, wake]);

  // Full screen, where the browser allows it on an element.
  useEffect(() => {
    const element = experienceRef.current;
    setCanFullscreen(Boolean(document.fullscreenEnabled && element?.requestFullscreen));
    const onChange = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = experienceRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void element.requestFullscreen?.().catch(() => {});
  }, []);

  const begin = useCallback(() => {
    void player.play();
  }, [player]);

  // Move focus somewhere sensible as the opening and closing screens come and go:
  // a screen that turns inert must not take the keyboard user's place with it.
  const wasEnded = useRef(false);
  useEffect(() => {
    const experience = experienceRef.current;
    const playButton = experience?.querySelector<HTMLButtonElement>(".btr-control--primary");
    const focusLost = () => {
      const active = document.activeElement;
      return !active || active === document.body || Boolean(active.closest("[inert]"));
    };
    if (ended) {
      replayRef.current?.focus({ preventScroll: true });
    } else if (started && (wasEnded.current || focusLost())) {
      window.requestAnimationFrame(() => {
        if (focusLost() || wasEnded.current) playButton?.focus({ preventScroll: true });
        wasEnded.current = false;
      });
    }
    if (ended) wasEnded.current = true;
  }, [started, ended]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
      const onControl = (event.target as HTMLElement | null)?.closest("button, a") !== null;
      const key = event.key;
      let handled = true;

      if (key === " " || key === "k" || key === "K") {
        if (key === " " && onControl) return;
        player.toggle();
      } else if (!started) {
        handled = false;
      } else if (key === "ArrowLeft") {
        player.seekBy(-5);
      } else if (key === "ArrowRight") {
        player.seekBy(5);
      } else if (key === "j" || key === "J") {
        player.seekBy(-10);
      } else if (key === "l" || key === "L") {
        player.seekBy(10);
      } else if (key === "ArrowUp") {
        player.setVolume((player.muted ? 0 : player.volume) + 0.1);
      } else if (key === "ArrowDown") {
        player.setVolume((player.muted ? 0 : player.volume) - 0.1);
      } else if (key === "m" || key === "M") {
        player.toggleMute();
      } else if (key === "r" || key === "R") {
        player.replay();
      } else if (key === "f" || key === "F") {
        toggleFullscreen();
      } else if (key === "Home") {
        player.seek(0);
      } else if (/^[0-9]$/.test(key)) {
        player.seek((duration * Number(key)) / 10);
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        wake();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, started, duration, toggleFullscreen, wake]);

  // Lock-screen and headset controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: "Beyond the Reef",
      artist: "Indigen World",
      artwork: [{ src: `${MEDIA_ROOT}/images/cover-512.jpg`, sizes: "512x512", type: "image/jpeg" }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void player.play()],
      ["pause", () => player.pause()],
      ["seekbackward", (details) => player.seekBy(-(details.seekOffset ?? 10))],
      ["seekforward", (details) => player.seekBy(details.seekOffset ?? 10)],
      ["seekto", (details) => details.seekTime !== undefined && player.seek(details.seekTime)],
      ["previoustrack", () => player.seek(0)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser supports every action.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignored for the same reason.
        }
      }
      session.metadata = null;
    };
  }, [player]);

  const onActiveLineChange = useCallback((index: number) => setActiveLine(index), []);

  return (
    <div
      ref={experienceRef}
      className="btr-experience"
      data-started={started}
      data-playing={playing}
      data-ended={ended}
      data-idle={idle && playing}
      onPointerMove={started ? wake : undefined}
      onPointerDown={started ? wake : undefined}
    >
      <audio ref={player.audioRef} preload="metadata">
        {AUDIO_SOURCES.map((source) => (
          <source key={source.src} src={source.src} type={source.type} />
        ))}
      </audio>

      <h1 className="sr-only">Beyond the Reef</h1>

      {started ? (
        <VisualStage shots={SHOTS} clock={clock} playing={playing} reducedMotion={reducedMotion} />
      ) : null}
      <div className="btr-veil" aria-hidden="true" />

      {started ? (
        <LyricStream
          lines={LYRICS}
          clock={clock}
          duration={duration}
          reducedMotion={reducedMotion}
          onActiveLineChange={onActiveLineChange}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {started && !ended && activeLine >= 0 ? LYRICS[activeLine].text : ""}
      </p>

      <header className="btr-topbar">
        <Link to="home" className="btr-brand" aria-label="Indigen World home">
          <BrandMark />
          <span>Indigen World</span>
        </Link>
        {started ? (
          <p className="btr-chapter" key={chapter}>
            <span className="btr-chapter__number">{String(chapter + 1).padStart(2, "0")}</span>
            <span>{CHAPTERS[chapter].title}</span>
          </p>
        ) : null}
      </header>

      <div className="btr-dock" inert={!started}>
        {player.error ? (
          <p className="btr-error" role="alert">
            {player.error}
          </p>
        ) : null}
        <PlayerControls
          player={player}
          chapters={CHAPTERS}
          fullscreen={fullscreen}
          canFullscreen={canFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>

      <section className="btr-intro" aria-labelledby="btr-intro-title" inert={started}>
        {introFaded ? null : reducedMotion ? (
          <img className="btr-intro__media" src={INTRO_MEDIA.image} alt="" />
        ) : (
          <video
            className="btr-intro__media"
            poster={INTRO_MEDIA.image}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
          >
            <source src={INTRO_MEDIA.clip.webm} type="video/webm" />
            <source src={INTRO_MEDIA.clip.mp4} type="video/mp4" />
          </video>
        )}
        <div className="btr-intro__content">
          <p className="btr-eyebrow">An interactive music film</p>
          <h2 id="btr-intro-title" className="btr-title">
            Beyond the Reef
          </h2>
          <p className="btr-subtitle">There is safety before the reef. Possibility lives beyond it.</p>
          <button ref={beginRef} type="button" className="btr-begin" onClick={begin}>
            <span className="btr-begin__icon" aria-hidden="true">
              <Icon name="play" size={20} />
            </span>
            <span>Begin the Journey</span>
          </button>
          <p className="btr-meta">
            <span aria-label={spokenTime(SONG_DURATION)}>5:16</span>
            <span aria-hidden="true">·</span>
            <span>Sound on</span>
            <span aria-hidden="true">·</span>
            <span>Headphones recommended</span>
          </p>
          <p className="btr-keys" aria-hidden="true">
            <kbd>Space</kbd> play · <kbd>←</kbd> <kbd>→</kbd> seek · <kbd>M</kbd> mute · <kbd>F</kbd> full screen
          </p>
        </div>
      </section>

      <section className="btr-finale" aria-labelledby="btr-finale-title" inert={!ended}>
        <div className="btr-finale__card">
          <p className="btr-eyebrow">The journey continues</p>
          <h2 id="btr-finale-title" className="btr-title btr-title--finale">
            Beyond the Reef
          </h2>
          <div className="btr-finale__actions">
            <button ref={replayRef} type="button" className="btr-begin" onClick={player.replay}>
              <span className="btr-begin__icon" aria-hidden="true">
                <Icon name="replay" size={18} />
              </span>
              <span>Replay</span>
            </button>
            <Link to="home" className="btr-return">
              <span aria-hidden="true">←</span> Return to site
            </Link>
          </div>
          <p className="btr-credit">
            Imagery and film generated with Google’s Gemini and Veo models for Indigen World.
          </p>
        </div>
      </section>

      <section className="sr-only" aria-labelledby="btr-lyrics-title">
        <h2 id="btr-lyrics-title">Lyrics</h2>
        {STANZAS.map((stanza, index) => (
          <p key={index}>
            {stanza.map((text, lineIndex) => (
              <span key={lineIndex}>
                {text}
                {lineIndex < stanza.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        ))}
      </section>
    </div>
  );
}
