import { useEffect, useRef } from "react";
import type { Experiment } from "@indigen-world/contracts/labs";
import { drawTrail } from "./runner-art";
import { newTrail, tickTrail, type TrailState } from "./runner-engine";
import { stopIcons, stops } from "./quest";
import { PRACTICE_MODE_LABELS, STORY_FORMATS, STORY_STEPS } from "./workspaces";
import { photo } from "./labs-media";

/** A mid-section frame of the real trail: an obstacle in each lane and sparks to collect. */
function trailFrame(): TrailState {
  const state = newTrail(2);
  state.elapsed = 6.4;
  state.nextSpawn = 7.2;
  state.items = [
    { lane: 0, age: 2.15, kind: "rock", hit: false },
    { lane: 1, age: 1.55, kind: "spark", hit: false },
    { lane: 2, age: 1.05, kind: "log", hit: false },
    { lane: 0, age: 0.55, kind: "spark", hit: false },
  ];
  return state;
}

/** Word Trail drawn by the game's own renderer and engine; it runs only while the card is engaged. */
function WordTrailPreview({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TrailState>(trailFrame());
  useEffect(() => {
    if (canvas.current) drawTrail(canvas.current, engine.current, true);
  }, []);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, previous = 0;
    const loop = (time: number) => {
      const s = engine.current;
      if (!document.hidden) {
        tickTrail(s, previous ? (time - previous) / 1000 : 0);
        // A small autopilot keeps the preview running without pretending to be a score.
        const threat = s.items.find((i) => !i.hit && i.lane === s.lane && i.kind !== "spark" && i.age / 3.6 > 0.55);
        if (threat?.kind === "log" && s.jump <= 0) s.jump = 0.9;
        if (threat?.kind === "rock") s.lane = s.items.find((i) => !i.hit && i.kind === "spark")?.lane ?? (s.lane + 1) % 3;
        s.lives = 3;
        s.invincible = 0;
        if (s.elapsed > 24 || s.status !== "running") {
          s.status = "running";
          s.elapsed = 4;
          s.nextSpawn = 4.6;
        }
        if (canvas.current) drawTrail(canvas.current, s, false);
      }
      previous = time;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return (
    <div className="lab-preview lab-preview--trail">
      <canvas ref={canvas} />
      <span className="lab-preview__hud lab-preview__hud--lives">♥ ♥ ♥</span>
      <span className="lab-preview__hud lab-preview__hud--gate">Gate every 300 m · English → Kasem</span>
    </div>
  );
}

function CultureQuestPreview() {
  return (
    <div className="lab-preview lab-preview--quest">
      <span className="lab-preview__label">YOUR TRAIL TODAY</span>
      <span className="lab-preview__sun">☀</span>
      <ol className="lab-quest-trail">
        {stops.map((stop, i) => (
          <li key={stop} style={{ ["--i" as string]: i }}>
            <span className="lab-quest-island">{stopIcons[i]}</span>
            <strong>{stop}</strong>
            <small>Mission {i + 1}</small>
          </li>
        ))}
      </ol>
      <span className="lab-preview__chip">+20 XP for each clue you share · reviewed before use</span>
    </div>
  );
}

function PracticePreview() {
  const modes = Object.values(PRACTICE_MODE_LABELS);
  return (
    <div className="lab-preview lab-preview--practice">
      <div className="lab-practice-card">
        <div className="lab-practice-card__top">
          <span>Question 2 of 6</span>
          <span className="lab-practice-card__modes">
            {modes.map((m, i) => (
              <span key={m} style={{ ["--i" as string]: i }}>{m}</span>
            ))}
          </span>
        </div>
        <span className="lab-practice-card__progress"><span /></span>
        <span className="lab-practice-card__prompt">Reviewed Kasem entry</span>
        <ul>
          {["A", "B", "C"].map((letter, i) => (
            <li key={letter} className={i === 1 ? "is-match" : undefined}>
              <span>{letter}</span>
              <i />
              {i === 1 && <b>Matched</b>}
            </li>
          ))}
        </ul>
        <span className="lab-practice-card__audio">
          <span className="lab-practice-card__play">▶</span>
          <span className="lab-practice-card__wave">
            {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ["--h" as string]: `${30 + ((i * 37) % 60)}%` }} />)}
          </span>
          Reviewed recording only
        </span>
      </div>
    </div>
  );
}

function StoryPreview() {
  const backdrop = photo("wall-pattern");
  return (
    <div className="lab-preview lab-preview--story">
      <img src={backdrop.src} srcSet={backdrop.srcSet} sizes="420px" alt="" loading="lazy" decoding="async" style={{ objectPosition: backdrop.focus }} />
      <div className="lab-story-paper">
        <span className="lab-story-paper__kicker">Source → Story · private draft</span>
        <ol>
          {STORY_STEPS.map((step, i) => (
            <li key={step}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
        <div className="lab-story-paper__formats">
          {STORY_FORMATS.map((f) => <span key={f}>{f}</span>)}
        </div>
      </div>
      <span className="lab-story-note">Source notes stay separate from your writing</span>
    </div>
  );
}

function GenericPreview({ experiment }: { experiment: Experiment }) {
  return (
    <div className="lab-preview lab-preview--generic">
      <span>{experiment.name}</span>
    </div>
  );
}

/** Decorative, honest previews of each experiment. Card text carries the meaning. */
export function ExperimentPreview({ experiment, active = false }: { experiment: Experiment; active?: boolean }) {
  return (
    <div className="lab-media" aria-hidden="true">
      {experiment.id === "word-trail" ? (
        <WordTrailPreview active={active} />
      ) : experiment.id === "culture-quest" ? (
        <CultureQuestPreview />
      ) : experiment.id === "kasem-practice" ? (
        <PracticePreview />
      ) : experiment.id === "cultural-story" ? (
        <StoryPreview />
      ) : (
        <GenericPreview experiment={experiment} />
      )}
    </div>
  );
}
