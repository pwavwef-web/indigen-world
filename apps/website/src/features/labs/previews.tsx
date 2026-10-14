
import type { Experiment } from "@indigen-world/contracts/labs";


import { stopIcons, stops } from "./quest";
import { PRACTICE_MODE_LABELS, STORY_FORMATS, STORY_STEPS } from "./workspaces";
import { photo } from "./labs-media";

/** An unretouched frame captured from the actual 3D game. The launch page has the live scene. */
function WordTrailPreview({ active }: { active: boolean }) {
  return <div className="lab-preview lab-preview--trail" data-active={active}>
    <img src="/assets/word-trail/gameplay.png" alt="" loading="lazy" decoding="async" />
    <span className="lab-preview__hud lab-preview__hud--gate">3D gameplay · Language opens the way</span>
  </div>;
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
